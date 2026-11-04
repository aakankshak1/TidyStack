/* TidyStack themes
   Spring / Summer / Autumn / Winter pixel-art scenes, plus clean Light / Dark.
   Everything is drawn at runtime onto tiny canvases, so there are no image files
   to ship and no build step. Plain JS, loaded before popup.js. */
(function () {
  "use strict";

  const PX = 2;                 // CSS pixels per art pixel
  const W = 198, H = 56;        // scene size in art pixels (396 x 112 css px)
  const PAD = 8;                // extra art pixels each side so parallax never shows an edge
  const KEY = "tidystack-theme";
  const DEFAULT = "spring";
  const LIST = [
    { id: "spring", label: "Spring" },
    { id: "summer", label: "Summer" },
    { id: "autumn", label: "Autumn" },
    { id: "winter", label: "Winter" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" }
  ];

  // ---------------------------------------------------------------- utils

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[((y & 3) << 2) + (x & 3)];

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mk(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return { canvas, ctx };
  }

  function dot(ctx, x, y, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  function box(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function line(ctx, x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      dot(ctx, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ------------------------------------------------------- drawing primitives

  // Vertical gradient between palette colours, dithered with an ordered (Bayer) pattern.
  function sky(ctx, x0, x1, h, cols) {
    for (let y = 0; y < h; y++) {
      const pos = (y / (h - 1)) * (cols.length - 1);
      const i = Math.min(cols.length - 2, Math.floor(pos));
      const f = pos - i;
      for (let x = x0; x < x1; x++) dot(ctx, x, y, f > bayer(x, y) ? cols[i + 1] : cols[i]);
    }
  }

  function hillY(o, x) {
    const n = Math.sin(x * o.freq + o.phase) * 0.6 + Math.sin(x * o.freq * 2.3 + o.phase * 1.7) * 0.4;
    return Math.round(o.base + n * o.amp);
  }

  function hills(ctx, x0, x1, h, o) {
    for (let x = x0; x < x1; x++) {
      const y = hillY(o, x);
      for (let yy = y; yy < h; yy++) {
        const d = yy - y;
        let c = o.body;
        if (d === 0) c = o.top;
        else if (d === 1 && bayer(x, yy) < 0.5) c = o.top;
        else if (o.shade && bayer(x, yy) < (d / (h - y)) * 0.9 - 0.2) c = o.shade;
        dot(ctx, x, yy, c);
      }
    }
  }

  // Shaded round blob, lit from the top-left. cols = [shadow, mid, light, highlight]
  function blob(ctx, cx, cy, r, cols) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r + 0.3) continue;
        const lit = (-x * 0.55 - y * 0.85) / r;
        const v = lit * 0.85 - (d / r) * 0.3 + (bayer(cx + x, cy + y) - 0.5) * 0.45;
        const c = v < -0.4 ? cols[0] : v < 0.1 ? cols[1] : v < 0.5 ? cols[2] : cols[3];
        dot(ctx, cx + x, cy + y, c);
      }
    }
  }

  function roundTree(ctx, x, baseY, o) {
    const r = rng(o.seed || x);
    const th = o.trunkH;
    box(ctx, x - 1, baseY - th, 3, th, o.trunk[0]);
    box(ctx, x + 1, baseY - th, 1, th, o.trunk[1]);
    dot(ctx, x - 2, baseY - th + 2, o.trunk[0]);
    dot(ctx, x + 2, baseY - th + 3, o.trunk[1]);
    const cy = baseY - th - Math.round(o.r * 0.6);
    const spots = [[0, 0, 1], [-0.75, 0.35, 0.72], [0.75, 0.3, 0.74], [-0.25, -0.65, 0.7], [0.45, -0.55, 0.62], [-0.95, -0.1, 0.5]];
    for (const [dx, dy, k] of spots) {
      blob(ctx, Math.round(x + dx * o.r), Math.round(cy + dy * o.r), Math.max(3, Math.round(o.r * k)), o.cols);
    }
    if (o.speck) {
      for (let i = 0; i < o.speck.n; i++) {
        const a = r() * 6.283, d = Math.sqrt(r()) * o.r * 1.1;
        dot(ctx, x + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.8, o.speck.cols[Math.floor(r() * o.speck.cols.length)]);
      }
    }
  }

  function pine(ctx, x, baseY, h, o) {
    const tiers = h > 18 ? 4 : 3;
    const maxHalf = Math.round(h * 0.34);
    const th = Math.ceil(h / tiers) + 2;
    box(ctx, x - 1, baseY - 3, 2, 3, o.trunk || "#5a3b24");
    for (let t = 0; t < tiers; t++) {
      const top = baseY - h + Math.round((t * (h - 3)) / tiers);
      const hw = Math.round(maxHalf * (0.45 + (0.55 * (t + 1)) / tiers));
      for (let rr = 0; rr < th; rr++) {
        const half = Math.max(0, Math.round((hw * (rr + 0.5)) / th));
        for (let dx = -half; dx <= half; dx++) {
          const px = x + dx, py = top + rr;
          let c = o.body;
          if (dx > half * 0.3 && rr > 1) c = o.shade;
          if (rr === th - 1) c = o.shade;
          if (o.snow && (rr < 2 || (dx <= -half + 1 && rr < th - 2 && bayer(px, py) < 0.6))) c = dx > half * 0.3 && rr > 0 ? o.snowShade || o.snow : o.snow;
          dot(ctx, px, py, c);
        }
      }
    }
  }

  function mountains(ctx, x0, x1, base, h, peaks, o) {
    for (let x = x0; x < x1; x++) {
      let top = base, pk = null;
      for (const p of peaks) {
        const y = base - Math.max(0, p[1] - Math.abs(x - p[0]));
        if (y < top) { top = y; pk = p; }
      }
      for (let y = top; y < h; y++) {
        const right = pk && x >= pk[0];
        let c = right ? o.shade : o.body;
        const depth = y - top;
        if (pk && depth < o.snowDepth - (bayer(x, y) < 0.5 ? 1 : 0) && base - top > pk[1] * 0.4) {
          c = right ? o.snowShade : o.snow;
        }
        dot(ctx, x, y, c);
      }
    }
  }

  function cottage(ctx, x, y, o) {
    box(ctx, x + 2, y + 9, 18, 9, o.wall);
    for (let i = 2; i < 18; i += 3) box(ctx, x + 2 + i, y + 9, 1, 9, o.wallShade);
    box(ctx, x + 2, y + 17, 18, 1, o.wallShade);
    // snowy roof
    for (let r = 0; r < 8; r++) {
      const half = Math.min(11, Math.round(1 + r * 1.45));
      for (let dx = -half; dx <= half; dx++) {
        let c = o.snow;
        if (dx > half * 0.3 && r > 1) c = o.snowShade;
        if (r === 7) c = o.roof;
        dot(ctx, x + 11 + dx, y + 1 + r, c);
      }
    }
    box(ctx, x + 0, y + 9, 22, 1, o.roofShade);
    // chimney
    box(ctx, x + 15, y + 1, 3, 5, o.brick);
    box(ctx, x + 14, y, 5, 1, o.snow);
    // door + windows
    box(ctx, x + 9, y + 13, 4, 5, o.door);
    dot(ctx, x + 12, y + 15, "#f4c542");
    for (const wx of [x + 4, x + 15]) {
      box(ctx, wx, y + 11, 4, 4, o.frame);
      box(ctx, wx + 1, y + 12, 2, 2, o.glow);
    }
    // warm light spilling onto the snow
    for (let i = 0; i < 6; i++) dot(ctx, x + 10 + (i % 3) - 1, y + 18 + (i >> 2), o.glow);
  }

  function palm(ctx, x, baseY) {
    const pts = [[0, 0], [-1, -5], [-1, -10], [0, -15], [2, -19], [4, -22]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      line(ctx, x + ax, baseY + ay, x + bx, baseY + by, "#b9793c");
      line(ctx, x + ax + 1, baseY + ay, x + bx + 1, baseY + by, "#8b5524");
    }
    for (let i = 1; i < pts.length; i++) dot(ctx, x + pts[i][0], baseY + pts[i][1] + 2, "#d79a5c");
    const tx = x + 4, ty = baseY - 22;
    const fronds = [[-17, 9, 7], [-11, 4, 10], [-5, -1, 8], [16, 9, 7], [10, 4, 10], [4, -1, 8]];
    for (const [dx, dy, lift] of fronds) {
      const n = Math.round(Math.abs(dx) * 1.3) + 2;
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const fx = tx + dx * t;
        const fy = ty - lift * 4 * t * (1 - t) * 0.6 + dy * t * t;
        dot(ctx, fx, fy, "#35a853");
        dot(ctx, fx, fy + 1, "#237a3b");
        if (s % 2 === 0) dot(ctx, fx, fy - 1, "#5ccb74");
        if (s % 3 === 1) dot(ctx, fx, fy + 2, "#237a3b");
      }
    }
    dot(ctx, tx - 1, ty + 2, "#6b4423");
    dot(ctx, tx + 1, ty + 2, "#6b4423");
    dot(ctx, tx, ty + 3, "#52341a");
  }

  function umbrella(ctx, x, baseY) {
    const cx = x + 2, cy = baseY - 15;
    line(ctx, x, baseY, cx, cy, "#8b6a4a");
    const halves = [3, 6, 8, 9, 9];
    for (let r = 0; r < 5; r++) {
      for (let dx = -halves[r]; dx <= halves[r]; dx++) {
        if (r === 4 && (dx + 9) % 3 === 1) continue;
        const stripe = Math.floor((dx + 9) / 3) % 2;
        const shade = dx > 2;
        const c = stripe ? (shade ? "#e4e8f0" : "#ffffff") : shade ? "#d33b3b" : "#f05353";
        dot(ctx, cx + dx, cy - 4 + r, c);
      }
    }
    dot(ctx, cx, cy - 5, "#f5c542");
  }

  function cloudSheet(w, h, seed, cols) {
    const r = rng(seed), { canvas, ctx } = mk(w, h);
    const base = h - 3;
    const maxR = Math.floor((h - 1) / 2);
    const n = Math.max(3, Math.round(w / 7));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const rad = Math.min(maxR, Math.round(2 + Math.sin(t * Math.PI) * 3.5 + r()));
      blob(ctx, Math.round(rad + t * (w - rad * 2)), base - rad + 2, rad, cols);
    }
    ctx.clearRect(0, base + 1, w, h);
    for (let x = 0; x < w; x++) if (ctx.getImageData(x, base, 1, 1).data[3]) dot(ctx, x, base, cols[0]);
    return { url: canvas.toDataURL(), w, h, n: 1 };
  }

  // ---------------------------------------------------------------- sprites

  function paint(ctx, rows, pal, ox, oy) {
    for (let j = 0; j < rows.length; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const c = pal[rows[j][i]];
        if (c) dot(ctx, ox + i, oy + j, c);
      }
    }
  }
  function sheet(frames, pal, ft) {
    const w = Math.max(...frames.flat().map((r) => r.length));
    const h = Math.max(...frames.map((f) => f.length));
    const { canvas, ctx } = mk(w * frames.length, h);
    frames.forEach((f, i) => paint(ctx, f, pal, i * w, 0));
    return { url: canvas.toDataURL(), w, h, n: frames.length, ft };
  }
  const one = (rows, pal) => sheet([rows], pal);

  const cache = {};
  const get = (k, f) => cache[k] || (cache[k] = f());

  const DAISY = ['.ww.ww.', 'wwwwwww', 'wwyyyww', 'wwyYyww', 'wwwwwsw', '.wsssw.', '...g...', '..gg...', '.gGg...', '...gg..', '...gG..', '...g...'];
  const TULIP = ['p.p.p', 'ppppp', 'ppPpp', '.ppp.', '..g..', '.gg..', '.gGg.', '..g..', '..g..', '..g..'];
  const BLOOM = ['.p.', 'pyp', '.p.', '.g.'];
  const GREEN = { g: "#4f9f4f", G: "#2f7a3f" };
  const daisy = () => get("daisy", () => one(DAISY, { w: "#ffffff", s: "#dfe7ee", y: "#ffd23f", Y: "#e39b1b", ...GREEN }));
  const tulipPink = () => get("tp", () => one(TULIP, { p: "#ff7aa8", P: "#d94d82", ...GREEN }));
  const tulipGold = () => get("tg", () => one(TULIP, { p: "#ffd23f", P: "#e0a21f", ...GREEN }));
  const tulipLilac = () => get("tl", () => one(TULIP, { p: "#b79cff", P: "#8a6ee0", ...GREEN }));
  const bloomPink = () => get("bp", () => one(BLOOM, { p: "#ff9ec0", y: "#ffd23f", g: "#4f9f4f" }));
  const bloomWhite = () => get("bw", () => one(BLOOM, { p: "#ffffff", y: "#ffb02e", g: "#4f9f4f" }));

  const BFLY_OPEN = ['.oo.d.oo.', 'oyyodoyyo', 'oyooDooyo', 'ooooDoooo', '.ooodooo.', '.oo.d.oo.', '..o...o..'];
  const BFLY_SHUT = ['....d....', '...odo...', '..oyDyo..', '..ooDoo..', '...odo...', '....d....', '.........'];
  const bfly = (k, o, y) => get(k, () => sheet([BFLY_OPEN, BFLY_SHUT], { o, y, d: "#4a2f2f", D: "#2d1b1b" }, 0.7));

  const petalA = () => get("pa", () => one(['.pp', 'ppp', 'pP.'], { p: "#ffc2d8", P: "#f58fb4" }));
  const petalB = () => get("pb", () => one(['pp.', 'ppp', '.pP'], { p: "#ffd7e6", P: "#f7a0c0" }));
  const petalC = () => get("pc", () => one(['pp', 'pP'], { p: "#ffe0ec", P: "#f7a0c0" }));
  const leafG = () => get("lg", () => one(['..gg', '.ggG', 'gGg.', 'Gg..'], { g: "#6cc467", G: "#3f9a4f" }));

  const sparkBig = () => get("sb", () => one(['..w..', '..w..', 'wwWww', '..w..', '..w..'], { w: "#ffffff", W: "#fff6b0" }));
  const sparkSm = () => get("ss", () => one(['.w.', 'www', '.w.'], { w: "#ffffff" }));
  const boat = () => get("boat", () => one(
    ['....f....', '....dw...', '...wdws..', '..wwdwss.', '.wwwdwsss', 'wwwwdwsss', '....d....', 'hhhhhhhhh', '.hhhhhhh.', '..HHHHH..'],
    { f: "#e8433a", d: "#5b3a22", w: "#ffffff", s: "#c9d8e8", h: "#b9702f", H: "#8a4f20" }));
  const gull = () => get("gull", () => sheet([['d.....d', '.dd.dd.', '..ddd..'], ['.......', 'ddd.ddd', '...d...']], { d: "#ffffff" }, 0.9));

  const SHROOM = ['..rrrrr..', '.rwrrrrr.', 'rrrrrrwrr', 'rrwrrrrrr', 'RRRRRRRRR', '..ssSss..', '..ssSss..', '.sssSsss.'];
  const shroomRed = () => get("mr", () => one(SHROOM, { r: "#d8362f", R: "#9e241f", w: "#fff4e0", s: "#f2e2c4", S: "#d3bd98" }));
  const shroomBrown = () => get("mb", () => one(SHROOM, { r: "#b9783f", R: "#855026", w: "#f3dcb0", s: "#f2e2c4", S: "#d3bd98" }));
  const leafMaple = (c, l) => get("lm" + c, () => one(['..s..', '.lLl.', 'lllLl', '.lLl.', '..l..'], { l: c, L: l, s: "#6b3d1f" }));
  const leafOval = (c, l) => get("lo" + c, () => one(['.ll.', 'lLll', '.ls.'], { l: c, L: l, s: "#6b3d1f" }));
  const firefly = () => get("ff", () => one(['.y.', 'yWy', '.y.'], { y: "#ffcf6a", W: "#fff4c0" }));

  const flakeDot = () => get("fd", () => one(['w'], { w: "#dbe8ff" }));
  const flakePlus = () => get("fp", () => one(['.w.', 'www', '.w.'], { w: "#ffffff" }));
  const flakeBig = () => get("fb", () => one(['..w..', '.wWw.', 'wWWWw', '.wWw.', '..w..'], { w: "#dbe9ff", W: "#ffffff" }));
  const puff = () => get("puff", () => one(['.pp.', 'pppp', '.pp.'], { p: "#d3dcea" }));
  const starPlus = () => get("sp", () => one(['.w.', 'www', '.w.'], { w: "#e6efff" }));

  function sunSheet() {
    return get("sun", () => {
      const S = 27, c = 13;
      const { canvas, ctx } = mk(S * 2, S);
      for (let f = 0; f < 2; f++) {
        ctx.save();
        ctx.translate(f * S, 0);
        const ray = "#ffd54a", hi = "#fff0a0";
        const cardinal = f === 0 ? 5 : 3;
        box(ctx, c - 1, 1 + (5 - cardinal), 2, cardinal, ray);
        box(ctx, c - 1, 21, 2, cardinal, ray);
        box(ctx, 1 + (5 - cardinal), c - 1, cardinal, 2, ray);
        box(ctx, 21, c - 1, cardinal, 2, ray);
        dot(ctx, c - 1, 1 + (5 - cardinal), hi);
        const diag = f === 1 ? [8, 10, 12] : [8];
        for (const d of diag) {
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            box(ctx, c + sx * d - (sx > 0 ? 0 : 1), c + sy * d - (sy > 0 ? 0 : 1), 2, 2, d === 8 ? hi : ray);
          }
        }
        blob(ctx, c, c, 6, ["#f2992a", "#ffbd3d", "#ffd966", "#fff0a8"]);
        ctx.restore();
      }
      return { url: canvas.toDataURL(), w: S, h: S, n: 2, ft: 1.6 };
    });
  }

  function moonSprite() {
    return get("moon", () => {
      const S = 11, { canvas, ctx } = mk(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - 5, dy = y - 5;
        const a = dx * dx + dy * dy <= 25;
        const b = (dx - 2.5) * (dx - 2.5) + (dy + 1.5) * (dy + 1.5) <= 21;
        if (a && !b) dot(ctx, x, y, dx < -3 || dy > 3 ? "#d6cfa6" : "#f6f1d4");
      }
      dot(ctx, 3, 6, "#d6cfa6"); dot(ctx, 4, 7, "#d6cfa6"); dot(ctx, 2, 4, "#e4ddb8");
      return { url: canvas.toDataURL(), w: S, h: S, n: 1 };
    });
  }

  // -------------------------------------------------------------- DOM helpers

  function sprEl(s, cls) {
    const e = document.createElement("i");
    e.className = "spr" + (cls ? " " + cls : "");
    e.style.width = s.w * PX + "px";
    e.style.height = s.h * PX + "px";
    e.style.backgroundImage = `url(${s.url})`;
    e.style.backgroundSize = `${s.n * 100}% 100%`;
    if (s.n > 1) {
      e.classList.add("sheet");
      e.style.setProperty("--sw", s.w * s.n * PX + "px");
      e.style.animationTimingFunction = `steps(${s.n})`;
      if (s.ft) e.style.animationDuration = s.ft + "s";
    }
    return e;
  }
  function at(el, x, y) {
    el.style.left = x * PX + "px";
    el.style.top = y * PX + "px";
    return el;
  }
  function wrap(cls, css, child) {
    const d = document.createElement("div");
    d.className = cls;
    d.style.cssText = css;
    if (child) d.appendChild(child);
    return d;
  }

  function fallers(layer, sheets, n, o) {
    const r = o.rand;
    for (let i = 0; i < n; i++) {
      const s = sheets[Math.floor(r() * sheets.length)];
      const dur = o.dur[0] + r() * (o.dur[1] - o.dur[0]);
      const sw = (o.sway[0] + Math.floor(r() * (o.sway[1] - o.sway[0] + 1))) * PX;
      const inner = wrap("sway", `--sw:${sw}px;--sd:${(2.4 + r() * 3).toFixed(1)}s;--sl:-${(r() * 4).toFixed(1)}s`, sprEl(s));
      layer.appendChild(wrap("fall", `left:${Math.round(r() * W) * PX}px;--d:${dur.toFixed(1)}s;--dl:-${(r() * dur).toFixed(1)}s;--fy:${H * PX + 24}px`, inner));
    }
  }

  function flutter(layer, s, x, y, o) {
    const bob = wrap("bob", `--ay:${o.ay * PX}px;--bd:${o.bd || 1.3}s;--bl:${o.delay || 0}s`, sprEl(s));
    layer.appendChild(wrap("wander", `left:${x * PX}px;top:${y * PX}px;--ax:${o.ax * PX}px;--d:${o.dur}s;--dl:${o.delay || 0}s`, bob));
  }

  function driftSprite(layer, s, y, dur, delay) {
    layer.appendChild(wrap("drift", `top:${y * PX}px;--d:${dur}s;--dl:${delay}s`, sprEl(s)));
  }

  function twinkle(layer, s, x, y, dur, delay) {
    const e = at(sprEl(s, "twinkle"), x, y);
    e.style.setProperty("--d", dur + "s");
    e.style.setProperty("--dl", delay + "s");
    layer.appendChild(e);
  }

  // ------------------------------------------------------------------ toolkit

  let host = null;
  let layers = [];

  const T = {
    layer(depth, cls) {
      const d = document.createElement("div");
      d.className = "layer" + (cls ? " " + cls : "");
      d.dataset.depth = depth;
      host.appendChild(d);
      layers.push(d);
      return d;
    },
    canvas(layer, draw, opt) {
      opt = opt || {};
      const cw = W + PAD * 2 + (opt.extra || 0);
      const { canvas, ctx } = mk(cw, H);
      ctx.translate(PAD, 0);
      draw(ctx, -PAD, cw - PAD, H);
      canvas.className = "cv" + (opt.cls ? " " + opt.cls : "");
      canvas.style.width = cw * PX + "px";
      canvas.style.height = H * PX + "px";
      canvas.style.left = -PAD * PX + "px";
      if (opt.css) canvas.style.cssText += opt.css;
      layer.appendChild(canvas);
      return canvas;
    },
    div(layer, cls, css) {
      const d = document.createElement("div");
      d.className = cls;
      d.style.cssText = css || "";
      layer.appendChild(d);
      return d;
    }
  };

  // ------------------------------------------------------------------- scenes

  function spring() {
    const r = rng(7);
    T.canvas(T.layer(0.04), (c, x0, x1, h) => sky(c, x0, x1, h, ["#8ed4f2", "#b3e3f4", "#d9f0e8", "#fbf0d0"]));

    const clouds = T.layer(0.12);
    [[5, 38, 15, 1, 80, -10], [16, 28, 12, 2, 105, -58], [9, 22, 10, 3, 130, -96]].forEach(([y, w, h, seed, dur, dl]) => {
      driftSprite(clouds, cloudSheet(w, h, seed, ["#bcd9ea", "#dcedf7", "#ffffff", "#ffffff"]), y, dur, dl);
    });

    const fh = { base: 34, amp: 3.5, freq: 0.045, phase: 1.3, top: "#bfe6ae", body: "#a6d99f", shade: "#93cf98" };
    T.canvas(T.layer(0.2), (c, x0, x1, h) => {
      hills(c, x0, x1, h, fh);
      for (const x of [14, 46, 77, 112, 141, 178]) {
        const y = hillY(fh, x);
        box(c, x, y - 2, 1, 3, "#8a6a58");
        blob(c, x, y - 4, 3, ["#e08fb0", "#f2a9c5", "#ffc9de", "#fff0f6"]);
      }
    });

    const mh = { base: 40, amp: 2.6, freq: 0.06, phase: 4.1, top: "#9ee08a", body: "#74c871", shade: "#5aae62" };
    T.canvas(T.layer(0.38), (c, x0, x1, h) => {
      hills(c, x0, x1, h, mh);
      for (const [x, rad] of [[22, 5], [58, 4], [96, 6], [124, 4], [192, 5]]) {
        blob(c, x, hillY(mh, x) - 1, rad, ["#2f7d46", "#43975a", "#5eb36a", "#86cf80"]);
        for (let i = 0; i < 6; i++) dot(c, x - rad + r() * rad * 2, hillY(mh, x) - 1 - rad * 0.6 + r() * rad * 1.2, r() > 0.5 ? "#ffffff" : "#ffd23f");
      }
    });

    T.canvas(T.layer(0.55), (c) => {
      roundTree(c, 158, 47, { trunkH: 17, r: 12, seed: 5, trunk: ["#8b5a44", "#5e3a2c"], cols: ["#e0719b", "#f398b9", "#ffbad3", "#ffe3ee"], speck: { n: 28, cols: ["#ffffff", "#ffe3ee", "#ff8fb3"] } });
      roundTree(c, 189, 46, { trunkH: 11, r: 8, seed: 9, trunk: ["#8b5a44", "#5e3a2c"], cols: ["#e0719b", "#f398b9", "#ffbad3", "#ffe3ee"], speck: { n: 12, cols: ["#ffffff", "#ffe3ee"] } });
    });

    const gh = { base: 49, amp: 1.4, freq: 0.08, phase: 2.2, top: "#a6e38a", body: "#62bb5e", shade: "#479a50" };
    const fg = T.layer(0.85);
    T.canvas(fg, (c, x0, x1, h) => {
      hills(c, x0, x1, h, gh);
      for (let i = 0; i < 46; i++) {
        const x = Math.round(x0 + r() * (x1 - x0)), y = hillY(gh, x), hh = 2 + Math.floor(r() * 3);
        for (let k = 0; k < hh; k++) dot(c, x, y - k, k === hh - 1 ? "#c6f5a0" : "#3f9a4f");
      }
    });
    const flowers = [daisy, tulipPink, tulipGold, tulipLilac, bloomPink, bloomWhite, daisy, tulipPink];
    [8, 22, 38, 54, 69, 86, 102, 122, 138, 150, 166, 178, 191].forEach((x, i) => {
      const s = flowers[Math.floor(r() * flowers.length)]();
      const e = at(sprEl(s, "nod"), x, hillY(gh, x) - s.h + 2);
      e.style.setProperty("--d", (2.6 + r() * 2).toFixed(1) + "s");
      e.style.setProperty("--dl", "-" + (r() * 4).toFixed(1) + "s");
      fg.appendChild(e);
    });

    const fx = T.layer(0.7);
    fallers(fx, [petalA(), petalB(), petalC()], 14, { rand: r, dur: [9, 15], sway: [4, 9] });
    fallers(fx, [leafG()], 3, { rand: r, dur: [11, 16], sway: [6, 10] });
    flutter(fx, bfly("b1", "#ff9b3d", "#ffd04d"), 112, 24, { ax: 30, ay: 5, dur: 7, delay: -2 });
    flutter(fx, bfly("b2", "#5aa9ff", "#d4e9ff"), 60, 31, { ax: 24, ay: 4, dur: 9, delay: -5, bd: 1.6 });
    flutter(fx, bfly("b3", "#ff8fb8", "#ffe0ec"), 168, 33, { ax: 18, ay: 6, dur: 6, delay: -1, bd: 1.1 });
  }

  function summer() {
    const r = rng(21);
    T.canvas(T.layer(0.04), (c, x0, x1, h) => sky(c, x0, x1, h, ["#3fb0f2", "#66c4f6", "#9fdbf8", "#fde4ae"]));

    const sunL = T.layer(0.08);
    T.div(sunL, "glow", `left:${(157 - 60) * PX}px;top:${(14 - 60) * PX}px;width:${120 * PX}px;height:${120 * PX}px;--g:rgba(255,226,120,.8)`);
    sunL.appendChild(at(sprEl(sunSheet()), 144, 1));

    const clouds = T.layer(0.12);
    [[6, 36, 14, 4, 90, -12], [17, 26, 11, 5, 120, -64], [11, 20, 10, 6, 150, -104]].forEach(([y, w, h, seed, dur, dl]) => {
      driftSprite(clouds, cloudSheet(w, h, seed, ["#cfe6f5", "#e9f4fb", "#ffffff", "#ffffff"]), y, dur, dl);
    });

    // far island on the horizon
    T.canvas(T.layer(0.18), (c) => {
      for (let x = 14; x < 66; x++) {
        const y = 36 - Math.round(7 * Math.sin((Math.PI * (x - 14)) / 52));
        for (let yy = y; yy < 38; yy++) dot(c, x, yy, yy === y ? "#8ad8bc" : x > 42 ? "#46a088" : "#5db99f");
      }
      for (const [px, py] of [[28, 30], [38, 28]]) {
        line(c, px, py + 5, px + 1, py, "#2f8a64");
        for (const d of [-3, -2, 2, 3]) dot(c, px + 1 + d, py + (Math.abs(d) > 2 ? 2 : 0), "#2f8a64");
      }
    });

    const wave = (y0, y1, cols, shift, dur) => T.canvas(T.layer(0.3), (c, x0, x1) => {
      sea(c, x0, x1, y0, y1, cols, shift);
    }, { extra: 60, cls: "wave", css: `--wd:${dur}s;` });

    wave(34, 40, ["#6fcdf5", "#4db8ee", "#3aa6e6"], 3, 16);
    const sail = T.layer(0.32);
    sail.appendChild(wrap("bob", "position:absolute;left:176px;top:50px;--ay:4px;--bd:2.4s;--bl:0s", sprEl(boat())));
    wave(39, 44, ["#3aa6e6", "#2d96dc", "#2388cf"], 11, 11);
    wave(43, 48, ["#2388cf", "#1d7cc4", "#1971b8"], 19, 8);

    const sp = T.layer(0.45);
    for (let i = 0; i < 13; i++) {
      twinkle(sp, i % 4 === 0 ? sparkBig() : sparkSm(), Math.round(6 + r() * 186), 35 + Math.floor(r() * 12), (2.2 + r() * 2.4).toFixed(1), "-" + (r() * 4).toFixed(1));
    }

    T.canvas(T.layer(0.55), (c, x0, x1) => {
      for (let x = x0; x < x1; x++) {
        const wy = 46 + Math.round(Math.sin(x * 0.22) * 0.9);
        dot(c, x, wy, "#f4fcff");
        if (bayer(x, wy + 1) < 0.7) dot(c, x, wy + 1, "#c9efff");
      }
    }, { cls: "foam" });

    const sh = { base: 49, amp: 1, freq: 0.07, phase: 0.8, top: "#fff2c0", body: "#f7db92", shade: "#e9c377" };
    T.canvas(T.layer(0.85), (c, x0, x1, h) => {
      hills(c, x0, x1, h, sh);
      for (let i = 0; i < 34; i++) dot(c, x0 + r() * (x1 - x0), 50 + r() * 6, "#e0b462");
      palm(c, 128, hillY(sh, 128) + 1);
      umbrella(c, 44, hillY(sh, 44) + 1);
    });

    // heat shimmer just above the horizon
    T.canvas(T.layer(0.35), (c, x0, x1) => {
      for (let y = 29; y <= 35; y += 2) {
        let x = x0 + Math.floor(r() * 10);
        while (x < x1) {
          const len = 8 + Math.floor(r() * 14);
          for (let i = 0; i < len && x + i < x1; i++) dot(c, x + i, y, "#ffffff");
          x += len + 8 + Math.floor(r() * 16);
        }
      }
    }, { cls: "shimmer" });

    const fx = T.layer(0.6);
    driftSprite(fx, gull(), 10, 34, -6);
    driftSprite(fx, gull(), 20, 46, -30);
  }

  function autumn() {
    const r = rng(33);
    T.canvas(T.layer(0.04), (c, x0, x1, h) => {
      sky(c, x0, x1, h, ["#f08f4e", "#f5a95f", "#f9c47f", "#fcdca6"]);
      for (let y = 12; y < 56; y++) for (let x = 120; x < 182; x++) {
        const d = Math.hypot(x - 150, y - 35);
        if (d <= 9) dot(c, x, y, d > 7.5 ? "#ffcf85" : "#ffe6b0");
        else if (d < 20 && (1 - (d - 9) / 11) * 0.55 > bayer(x, y)) dot(c, x, y, "#ffd9a0");
      }
    });
    T.div(T.layer(0.06), "glow", `left:${(150 - 70) * PX}px;top:${(35 - 70) * PX}px;width:${140 * PX}px;height:${140 * PX}px;--g:rgba(255,168,64,.55)`);

    const clouds = T.layer(0.12);
    [[9, 44, 12, 11, 120, -20], [19, 34, 10, 12, 150, -90]].forEach(([y, w, h, seed, dur, dl]) => {
      driftSprite(clouds, cloudSheet(w, h, seed, ["#e0834d", "#ee9a5f", "#f9bb80", "#ffd9a6"]), y, dur, dl);
    });

    T.canvas(T.layer(0.2), (c, x0, x1, h) => {
      for (let x = x0; x < x1; x += 5) blob(c, x, 37 - Math.floor(r() * 3), 5 + Math.floor(r() * 3), ["#b9683a", "#cc7d45", "#dd9150", "#ecab6c"]);
      box(c, x0, 40, x1 - x0, h - 40, "#b8683a");
      for (const x of [10, 33, 70, 95, 118, 160, 182]) pine(c, x, 42, 13, { body: "#a8643a", shade: "#8f5232" });
    });

    const orange = ["#b8561f", "#d96f26", "#f0903a", "#ffb866"];
    const red = ["#8f2e1f", "#b53a26", "#d4553a", "#f08460"];
    const gold = ["#c4881f", "#e0a62a", "#f2c443", "#ffe27a"];
    const trunk = ["#6b4a2a", "#4a321c"];
    const mg = { base: 47, amp: 1.5, freq: 0.05, phase: 3.1, top: "#a8742f", body: "#8a5a28", shade: "#704520" };
    T.canvas(T.layer(0.4), (c, x0, x1, h) => {
      for (const x of [8, 52, 126, 192]) pine(c, x, 47, 19, { body: "#3f5d3a", shade: "#2c4430" });
      roundTree(c, 30, 47, { trunkH: 10, r: 8, seed: 2, trunk, cols: orange });
      roundTree(c, 78, 47, { trunkH: 12, r: 9, seed: 3, trunk, cols: red });
      roundTree(c, 104, 47, { trunkH: 9, r: 8, seed: 4, trunk, cols: gold });
      roundTree(c, 148, 47, { trunkH: 15, r: 11, seed: 5, trunk, cols: orange, speck: { n: 14, cols: ["#ffb866", "#f0903a"] } });
      roundTree(c, 174, 47, { trunkH: 12, r: 9, seed: 6, trunk, cols: red, speck: { n: 8, cols: ["#f08460"] } });
      hills(c, x0, x1, h, mg);
    });

    const gh = { base: 50, amp: 1, freq: 0.07, phase: 1.9, top: "#7d8f33", body: "#6f4a24", shade: "#573a1c" };
    const fg = T.layer(0.85);
    T.canvas(fg, (c, x0, x1, h) => {
      hills(c, x0, x1, h, gh);
      const litter = ["#d9822b", "#b5472a", "#e8b13a", "#c96a2b"];
      for (let i = 0; i < 70; i++) {
        const x = Math.round(x0 + r() * (x1 - x0));
        dot(c, x, hillY(gh, x) + Math.floor(r() * 5), litter[Math.floor(r() * 4)]);
      }
      for (let i = 0; i < 30; i++) {
        const x = Math.round(x0 + r() * (x1 - x0)), y = hillY(gh, x), hh = 2 + Math.floor(r() * 2);
        for (let k = 0; k < hh; k++) dot(c, x, y - k, k === hh - 1 ? "#b6c14a" : "#6b7a2a");
      }
    });
    [[26, shroomRed], [58, shroomBrown], [67, shroomRed], [112, shroomBrown], [140, shroomRed], [176, shroomBrown]].forEach(([x, f]) => {
      const s = f();
      fg.appendChild(at(sprEl(s), x, hillY(gh, x) - s.h + 3));
    });

    const fx = T.layer(0.7);
    const leaves = [leafMaple("#d9822b", "#f2a94a"), leafMaple("#b5472a", "#d96a45"), leafOval("#e8b13a", "#ffd470"), leafOval("#c96a2b", "#e8924a")];
    fallers(fx, leaves, 14, { rand: r, dur: [8, 14], sway: [5, 11] });
    for (let i = 0; i < 8; i++) {
      const m = wrap("mote", `left:${Math.round(10 + r() * 180) * PX}px;top:${Math.round(22 + r() * 24) * PX}px;--d:${(5 + r() * 4).toFixed(1)}s;--dl:-${(r() * 6).toFixed(1)}s;--rx:${Math.round(r() * 8 - 4) * PX}px`, sprEl(firefly()));
      fx.appendChild(m);
    }
    T.div(host, "tint warm", "");
  }

  function aurora(ctx, x0, x1, o) {
    for (let x = x0; x < x1; x++) {
      const mid = o.y + Math.sin(x * 0.045 + o.ph) * o.amp + Math.sin(x * 0.1 + o.ph * 2.1) * o.amp * 0.35;
      const hgt = o.hgt + Math.sin(x * 0.06 + o.ph * 1.3) * 4;
      const bot = mid + hgt * 0.35, top = mid - hgt * 0.65;
      const stri = 0.6 + 0.4 * Math.sin(x * 0.5 + o.ph * 3);
      for (let y = Math.floor(top); y <= bot; y++) {
        const t = (y - top) / (bot - top);
        if (Math.pow(t, 1.5) * stri > bayer(x, y) * 0.95) dot(ctx, x, y, t < 0.35 ? o.cols[0] : t < 0.75 ? o.cols[1] : o.cols[2]);
      }
    }
  }

  function winter() {
    const r = rng(45);
    T.canvas(T.layer(0.04), (c, x0, x1, h) => {
      sky(c, x0, x1, h, ["#0b1736", "#142a57", "#24467f", "#4a74a8", "#8fb2d0"]);
      for (let i = 0; i < 30; i++) dot(c, x0 + r() * (x1 - x0), r() * 24, r() > 0.6 ? "#ffffff" : "#9db8e0");
    });

    const au = T.layer(0.1);
    T.canvas(au, (c, x0, x1) => aurora(c, x0, x1, { y: 16, amp: 5, hgt: 20, ph: 0.6, cols: ["#8f7bff", "#4fe8c0", "#a6ffb8"] }), { extra: 20, cls: "aurora a1" });
    T.canvas(au, (c, x0, x1) => aurora(c, x0, x1, { y: 21, amp: 4, hgt: 15, ph: 3.2, cols: ["#6fd2ff", "#6cf5a0", "#d2ffc0"] }), { extra: 20, cls: "aurora a2" });
    T.div(T.layer(0.08), "glow", `left:${20 * PX}px;top:${-50 * PX}px;width:${160 * PX}px;height:${110 * PX}px;--g:rgba(110,255,190,.3)`);

    const sky2 = T.layer(0.06);
    sky2.appendChild(at(sprEl(moonSprite()), 168, 6));
    for (let i = 0; i < 8; i++) twinkle(sky2, i % 2 ? starPlus() : flakeDot(), Math.round(50 + r() * 140), 3 + Math.floor(r() * 20), (2 + r() * 3).toFixed(1), "-" + (r() * 4).toFixed(1));

    T.canvas(T.layer(0.2), (c, x0, x1, h) => mountains(c, x0, x1, 40, h, [[30, 18], [82, 23], [136, 17], [186, 22]], { body: "#6c8fbe", shade: "#4f729f", snow: "#eef6ff", snowShade: "#bcd2ee", snowDepth: 6 }));

    T.canvas(T.layer(0.38), (c) => {
      for (const [x, hh] of [[5, 15], [19, 18], [36, 14], [57, 17], [112, 16], [158, 19], [172, 14], [192, 17]]) {
        pine(c, x, 47, hh, { body: "#1f5260", shade: "#143a46", snow: "#f4f9ff", snowShade: "#c4d8ee" });
      }
    });

    const vil = T.layer(0.55);
    const wood = { wall: "#8c5a3a", wallShade: "#6e4529", roof: "#a63d2f", roofShade: "#7a2c22", snow: "#f4f9ff", snowShade: "#c8dcf0", brick: "#8b4a3a", door: "#5a3822", frame: "#4a2f1c", glow: "#ffd36b" };
    T.canvas(vil, (c) => {
      cottage(c, 82, 31, wood);
      cottage(c, 122, 32, { ...wood, wall: "#9b6b45", wallShade: "#7a5232", roof: "#2f6f8f", roofShade: "#1f5470" });
    });
    [0, 1, 2].forEach((i) => vil.appendChild(wrap("mote smoke", `left:${(82 + 15) * PX}px;top:${27 * PX}px;--d:6s;--dl:-${i * 2}s;--rx:${6}px`, sprEl(puff()))));

    const gh = { base: 50, amp: 1.2, freq: 0.06, phase: 0.4, top: "#ffffff", body: "#e9f2fc", shade: "#c4d8ee" };
    const fg = T.layer(0.9);
    T.canvas(fg, (c, x0, x1, h) => {
      hills(c, x0, x1, h, gh);
      pine(c, 14, 54, 26, { body: "#1f5260", shade: "#143a46", snow: "#f4f9ff", snowShade: "#c4d8ee" });
      pine(c, 186, 54, 22, { body: "#1f5260", shade: "#143a46", snow: "#f4f9ff", snowShade: "#c4d8ee" });
      for (let i = 0; i < 18; i++) dot(c, x0 + r() * (x1 - x0), 51 + r() * 4, "#b4cbe6");
    });
    for (let i = 0; i < 6; i++) twinkle(fg, i % 2 ? sparkSm() : flakeDot(), Math.round(30 + r() * 140), 50 + Math.floor(r() * 5), (2 + r() * 2).toFixed(1), "-" + (r() * 3).toFixed(1));

    // icicles along the top edge and a little frost in the corners
    T.canvas(T.layer(1), (c, x0, x1, h) => {
      for (let x = x0 + 3; x < x1; x += 4 + Math.floor(r() * 6)) {
        const len = 3 + Math.floor(r() * 6);
        for (let k = 0; k < len; k++) {
          const wdt = k < 2 ? 2 : 1;
          for (let j = 0; j < wdt; j++) dot(c, x + j, k, j === 0 ? "#eaf7ff" : "#a9d4f0");
        }
      }
      for (const [cx, cy] of [[x1 - PAD, 0], [x0 + PAD, h], [x1 - PAD, h]]) {
        for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
          const d = Math.hypot(x - cx, (y - cy) * 1.6);
          if (d < 24 && (1 - d / 24) * 0.8 > bayer(x, y)) dot(c, x, y, bayer(x + 1, y) < 0.5 ? "#ffffff" : "#d2e8fb");
        }
      }
    });

    const fx = T.layer(0.75);
    fallers(fx, [flakeDot()], 22, { rand: r, dur: [14, 22], sway: [1, 3] });
    fallers(fx, [flakePlus()], 12, { rand: r, dur: [9, 14], sway: [3, 5] });
    fallers(fx, [flakeBig()], 6, { rand: r, dur: [6, 9], sway: [5, 8] });
  }

  function sea(ctx, x0, x1, y0, y1, cols, shift) {
    const n = cols.length, hh = y1 - y0;
    for (let y = y0; y < y1; y++) {
      const pos = ((y - y0) / hh) * (n - 1);
      const i = Math.min(n - 2, Math.floor(pos));
      const f = pos - i;
      for (let x = x0; x < x1; x++) dot(ctx, x, y, f > bayer(x, y) ? cols[i + 1] : cols[i]);
    }
    const m = (v) => ((v % 30) + 30) % 30;
    for (let x = x0; x < x1; x++) {
      if (m(x + shift) < 5) { dot(ctx, x, y0 + 1, "#c9efff"); dot(ctx, x, y0 + 2, cols[n - 1]); }
      if (m(x + shift + 14) < 3 && y0 + 3 < y1) dot(ctx, x, y0 + 3, "#a9e2fb");
    }
  }

  const BUILD = { spring, summer, autumn, winter };

  // ------------------------------------------------------------------ parallax

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const snap = (v) => Math.round(v / PX) * PX;

  function frame() {
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    if (Math.abs(tx - cx) < 0.01 && Math.abs(ty - cy) < 0.01) { cx = tx; cy = ty; raf = 0; }
    else raf = requestAnimationFrame(frame);
    for (const l of layers) {
      const d = +l.dataset.depth;
      l.style.transform = `translate(${snap(-cx * d * 7)}px, ${snap(-cy * d * 3)}px)`;
    }
  }
  function nudge(nx, ny) {
    if (!layers.length || reduce.matches) return;
    tx = nx; ty = ny;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  document.addEventListener("mousemove", (e) => {
    nudge((e.clientX / window.innerWidth) * 2 - 1, Math.min(1, Math.max(0, e.clientY / 200)) * 2 - 1);
  });
  document.addEventListener("mouseleave", () => nudge(0, 0));

  // When the pointer is still, the world breathes slowly, so the depth is visible even without moving the mouse.
  let lastMove = 0;
  document.addEventListener("mousemove", () => { lastMove = performance.now(); });
  setInterval(() => {
    if (reduce.matches || !layers.length || performance.now() - lastMove < 2500) return;
    const t = performance.now() / 1000;
    nudge(Math.sin(t * 0.45) * 0.5, Math.sin(t * 0.3) * 0.25);
  }, 120);

  // --------------------------------------------------------------------- thumbs

  const THUMBS = {
    spring: { sky: ["#8ed4f2", "#d9f0e8"], far: ["#bfe6ae", "#a6d99f"], gr: ["#a6e38a", "#62bb5e"], deco: (c) => { dot(c, 7, 17, "#ff7aa8"); dot(c, 13, 18, "#ffffff"); dot(c, 24, 17, "#ffd23f"); dot(c, 29, 18, "#b79cff"); dot(c, 22, 6, "#ffc2d8"); dot(c, 10, 9, "#ffc2d8"); } },
    summer: { sky: ["#3fb0f2", "#9fdbf8"], far: ["#3aa6e6", "#2388cf"], gr: ["#fff2c0", "#f7db92"], deco: (c) => { blob(c, 27, 6, 3, ["#f2992a", "#ffbd3d", "#ffd966", "#fff0a8"]); box(c, 4, 15, 8, 1, "#c9efff"); } },
    autumn: { sky: ["#f08f4e", "#fcdca6"], far: ["#cc7d45", "#b8683a"], gr: ["#a8742f", "#7a4f26"], deco: (c) => { blob(c, 8, 12, 4, ["#b8561f", "#d96f26", "#f0903a", "#ffb866"]); blob(c, 26, 13, 3, ["#8f2e1f", "#b53a26", "#d4553a", "#f08460"]); dot(c, 17, 5, "#d9822b"); dot(c, 30, 8, "#e8b13a"); } },
    winter: { sky: ["#0b1736", "#4a74a8"], far: ["#6c8fbe", "#4f729f"], gr: ["#ffffff", "#e9f2fc"], deco: (c) => { dot(c, 6, 4, "#ffffff"); dot(c, 17, 7, "#ffffff"); dot(c, 29, 3, "#ffffff"); dot(c, 24, 10, "#ffffff"); for (let x = 2; x < 34; x++) if (bayer(x, 6) < 0.5) dot(c, x, 6 + Math.round(Math.sin(x * 0.3)), "#6cf5a0"); } }
  };

  const thumbCache = {};
  function thumb(id) {
    if (thumbCache[id]) return thumbCache[id];
    const { canvas, ctx } = mk(36, 24);
    const t = THUMBS[id];
    if (t) {
      sky(ctx, 0, 36, 24, t.sky);
      hills(ctx, 0, 36, 24, { base: 14, amp: 2, freq: 0.2, phase: 1, top: t.far[0], body: t.far[1] });
      hills(ctx, 0, 36, 24, { base: 19, amp: 1, freq: 0.15, phase: 2, top: t.gr[0], body: t.gr[1] });
      t.deco(ctx);
    } else {
      const dark = id === "dark";
      box(ctx, 0, 0, 36, 24, dark ? "#181f26" : "#f7fafd");
      box(ctx, 4, 4, 14, 2, dark ? "#e2ecf5" : "#1e2933");
      box(ctx, 4, 9, 28, 2, dark ? "#3a4a59" : "#d9e7f7");
      box(ctx, 4, 13, 28, 2, dark ? "#3a4a59" : "#d9e7f7");
      box(ctx, 4, 17, 10, 3, dark ? "#88bdf2" : "#384959");
    }
    return (thumbCache[id] = canvas.toDataURL());
  }

  // ------------------------------------------------------------------ public API

  let current = null;
  const BORN = performance.now();

  // Colours for the season-change wipe and for the particle bursts Pip and the UI throw around.
  const FX = {
    spring: { wipe: ["#8ed4f2", "#b3e3f4", "#d9f0e8", "#ffc2d8", "#a6e38a"], burst: ["#ffc2d8", "#ff9ec0", "#ffffff", "#ffd23f", "#a6e38a"], rain: "petal" },
    summer: { wipe: ["#3fb0f2", "#66c4f6", "#9fdbf8", "#fde4ae", "#ffd54a"], burst: ["#ffd54a", "#fff0a0", "#ffffff", "#66c4f6", "#f2992a"], rain: "spark" },
    autumn: { wipe: ["#f08f4e", "#f5a95f", "#f9c47f", "#d96f26", "#b53a26"], burst: ["#d9822b", "#b5472a", "#e8b13a", "#f0903a", "#ffd470"], rain: "leaf" },
    winter: { wipe: ["#142a57", "#24467f", "#4a74a8", "#8fb2d0", "#eef6ff"], burst: ["#ffffff", "#dbe9ff", "#8fb2d0", "#6cf5a0", "#a6ffb8"], rain: "flake" },
    light: { wipe: ["#f7fafd", "#d9e7f7", "#bdddfc", "#88bdf2"], burst: ["#88bdf2", "#bdddfc", "#ffffff", "#384959"], rain: "spark" },
    dark: { wipe: ["#181f26", "#28333e", "#3a4a59", "#88bdf2"], burst: ["#88bdf2", "#bdddfc", "#ffffff", "#94acc2"], rain: "spark" }
  };
  const fx = (id) => FX[id] || FX.light;
  const seasonOf = (id) => (BUILD[id] ? id : "base");

  // Changing season dissolves the header into chunky pixels in the new season's colours,
  // swaps the scene while it is fully covered, then dissolves back out.
  let wipeTimer = 0;
  let wipeCanvas = null;

  function cancelWipe() {
    clearTimeout(wipeTimer);
    wipeTimer = 0;
    if (wipeCanvas) wipeCanvas.getContext("2d").clearRect(0, 0, wipeCanvas.width, wipeCanvas.height);
  }

  function wipe(id, rebuild) {
    cancelWipe();
    const parent = host.parentNode;
    const GW = 50, GH = 14, STEPS = 6, STEP_MS = 50;
    if (!wipeCanvas || wipeCanvas.parentNode !== parent) {
      wipeCanvas = document.createElement("canvas");
      wipeCanvas.className = "wipe";
      wipeCanvas.width = GW;
      wipeCanvas.height = GH;
      wipeCanvas.setAttribute("aria-hidden", "true");
      parent.appendChild(wipeCanvas);
    }
    const ctx = wipeCanvas.getContext("2d");
    const cols = fx(id).wipe;
    const r = rng(id.length * 977 + 13);
    const cells = [];
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        cells.push({ x, y, t: ((x / GW) * 0.62 + (y / GH) * 0.2 + r() * 0.3) / 1.12, c: cols[Math.floor(r() * cols.length)] });
      }
    }
    let step = 0;
    let phase = 0;
    const draw = () => {
      const p = step / STEPS;
      ctx.clearRect(0, 0, GW, GH);
      for (const c of cells) {
        if (phase === 0 ? c.t <= p : c.t > p) {
          ctx.fillStyle = c.c;
          ctx.fillRect(c.x, c.y, 1, 1);
        }
      }
    };
    const tick = () => {
      step++;
      if (step > STEPS) {
        if (phase === 0) {
          rebuild();
          phase = 1;
          step = 0;
          draw();
          wipeTimer = setTimeout(tick, STEP_MS);
          return;
        }
        ctx.clearRect(0, 0, GW, GH);
        wipeTimer = 0;
        return;
      }
      draw();
      wipeTimer = setTimeout(tick, STEP_MS);
    };
    draw();
    wipeTimer = setTimeout(tick, STEP_MS);
  }

  function normalize(id) {
    return LIST.some((t) => t.id === id) ? id : DEFAULT;
  }

  function apply(theme) {
    const id = normalize(theme);
    try { localStorage.setItem(KEY, id); } catch (e) { /* storage unavailable: fine */ }
    host = document.getElementById("scene");
    if (id === current && host && (!BUILD[id] || host.firstChild)) return id;
    // The very first draw when the popup opens never wipes; only a real switch does.
    const first = current === null || performance.now() - BORN < 900;
    current = id;

    const rebuild = () => {
      const root = document.documentElement;
      root.dataset.theme = id;
      root.classList.toggle("seasonal", !!BUILD[id]);
      root.classList.toggle("dark", id === "dark");

      layers = [];
      tx = ty = cx = cy = 0;
      if (host) {
        host.textContent = "";
        host.classList.remove("in");
        if (BUILD[id]) {
          BUILD[id]();
          void host.offsetWidth;
          host.classList.add("in");
        }
      }
      document.dispatchEvent(new CustomEvent("tidy-theme", { detail: { id, initial: first } }));
    };

    if (first || !host || reduce.matches) {
      cancelWipe();
      rebuild();
    } else {
      wipe(id, rebuild);
    }
    return id;
  }

  window.TidyThemes = { list: LIST, normalize, apply, thumb, current: () => current, fx, seasonOf };

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  apply(saved || DEFAULT);
})();

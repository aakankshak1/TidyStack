/* TidyStack pixel toolkit
   Everything visual that isn't a season scene lives here: the custom pixel-art icon set,
   Pip (the tab companion) in every mood and season, the little empty-state scenes, and the
   pixel notification picture. All of it is drawn at runtime onto tiny canvases, so there are
   no image files and nothing to download.

   This file runs in two places: the popup (document + canvas) and the background service
   worker (OffscreenCanvas only), which uses it to draw the picture on notifications. */
(function (root) {
  "use strict";

  const hasDOM = typeof document !== "undefined";
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  const seasonOf = (id) => (SEASONS.includes(id) ? id : "base");

  // ---------------------------------------------------------------- canvas

  function mk(w, h) {
    if (hasDOM) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      return { canvas, ctx: canvas.getContext("2d") };
    }
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext("2d") };
  }

  async function canvasToURL(canvas) {
    if (canvas.toDataURL) return canvas.toDataURL();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return "data:image/png;base64," + btoa(bin);
  }

  // Art pixels are drawn at a whole number of device pixels, so they stay razor sharp on any screen.
  const dpr = () => (hasDOM ? Math.max(1, Math.ceil(root.devicePixelRatio || 1)) : 1);

  function paint(ctx, rows, pal, ox, oy, s) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = pal[row[i]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect((ox + i) * s, (oy + j) * s, s, s);
      }
    }
  }

  function box(ctx, x, y, w, h, c, s) {
    ctx.fillStyle = c;
    ctx.fillRect(x * s, y * s, w * s, h * s);
  }

  // ----------------------------------------------------------------- icons
  // 9 x 9 grids, one colour. They are used as CSS masks, so they take on the text colour of
  // wherever they sit and follow every theme automatically.

  const ICONS = {
    window: ["..#####..", ".#.....#.", "#########", "#.......#", "#.#####.#", "#.......#", "#.#####.#", "#.......#", "#########"],
    copy: ["#######..", "#.....#..", "#.#######", "#.#.....#", "#.#.....#", "#.#.....#", "###.....#", "..#.....#", "..#######"],
    grave: ["..#####..", ".#.....#.", "#.......#", "#..###..#", "#...#...#", "#...#...#", "#.......#", "#.......#", "#########"],
    gear: ["...###...", ".#.###.#.", "..#####..", "###...###", "###...###", "###...###", "..#####..", ".#.###.#.", "...###..."],
    box: ["#########", "#.......#", "#########", ".#.....#.", ".#.###.#.", ".#.....#.", ".#.....#.", ".#.....#.", ".#######."],
    up: ["....#....", "...###...", "..#####..", "....#....", "....#....", "....#....", "#.......#", "#.......#", "#########"],
    x: ["#.......#", ".#.....#.", "..#...#..", "...#.#...", "....#....", "...#.#...", "..#...#..", ".#.....#.", "#.......#"],
    trash: ["...###...", "#########", ".#.....#.", ".#.#.#.#.", ".#.#.#.#.", ".#.#.#.#.", ".#.#.#.#.", ".#.....#.", "..#####.."],
    bell: ["....#....", "...###...", "..#####..", "..#####..", ".#######.", ".#######.", "#########", ".........", "...###..."],
    sound: ["...#.....", "..##..#..", "#####..#.", "#####.#.#", "#####.#.#", "#####.#.#", "#####..#.", "..##..#..", "...#....."],
    mute: ["...#.....", "..##.....", "#####.#.#", "#####..#.", "#####.#.#", "#####....", "#####....", "..##.....", "...#....."],
    sparkle: ["....#....", "....#....", "...###...", "..#####..", "#########", "..#####..", "...###...", "....#....", "....#...."],
    folder: ["####.....", "#..######", "#.......#", "#.......#", "#.......#", "#.......#", "#.......#", "#.......#", "#########"],
    spread: ["###...###", "#.#...#.#", "###...###", ".........", ".........", ".........", "###...###", "#.#...#.#", "###...###"]
  };

  const iconCache = {};

  // Smooth (not pixel) icons: the Settings gear is a clean, rounded 6-tooth gear.
  const SVG_ICONS = {
    gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>'
  };

  function iconURL(name) {
    if (SVG_ICONS[name]) return "data:image/svg+xml," + encodeURIComponent(SVG_ICONS[name]);
    const rows = ICONS[name];
    if (!rows || !hasDOM) return "";
    const s = 2 * dpr();
    const key = name + s;
    if (iconCache[key]) return iconCache[key];
    const { canvas, ctx } = mk(9 * s, 9 * s);
    paint(ctx, rows, { "#": "#000" }, 0, 0, s);
    return (iconCache[key] = canvas.toDataURL());
  }

  const iconHTML = (name, cls) =>
    `<i class="pix${cls ? " " + cls : ""}" data-icon="${name}" style="--pix:url(${iconURL(name)})" aria-hidden="true"></i>`;

  // Fills in any static <i class="pix" data-icon="..."> that was written straight into the HTML.
  function hydrate(scope) {
    if (!hasDOM) return;
    (scope || document).querySelectorAll("[data-icon]").forEach((el) => {
      if (!el.style.getPropertyValue("--pix")) el.style.setProperty("--pix", `url(${iconURL(el.dataset.icon)})`);
    });
  }

  // ------------------------------------------------------------------- Pip
  // 13 x 14 art pixels (plus two spare rows on top for hops). Every mood has two frames that
  // the CSS flips between. Each season gives Pip a little something to wear.

  const FW = 13;
  const FH = 16;

  const PAL = {
    o: "#4a3550", b: "#fff1d6", s: "#f2c9a0", w: "#ffffff", k: "#3b2a45", p: "#ff9fb0", m: "#3b2a45",
    g: "#5fbf5f", G: "#3a8f4a", u: "#6cc3ff", A: "#f0903a", R: "#c4472a", r: "#e8803a",
    S: "#2b2b3a", W: "#7fd0ff", P: "#ff8fb8", y: "#ffd23f", n: "#d94f5c", N: "#a83245", B: "#4fa3e0", D: "#2f7fbf"
  };

  const SPROUT = ["....gg.gg....", ".....gGg.....", "......G......"];
  const BODY = [
    "....ooooo....",
    "...obbbbbo...",
    "..obbwbbbbo..",
    ".obbbbbbbbbo.",
    ".obbkbbbkbbo.",
    ".obbkbbbkbbo.",
    ".obpbbbbbpbo.",
    ".obbbbmbbbbo.",
    "..ossssssso..",
    "...ooooooo...",
    "..ooo...ooo.."
  ];

  function buildPip(mood, f, season) {
    const g = SPROUT.concat(BODY).map((r) => r.split(""));
    const set = (x, y, c) => { if (g[y] && x >= 0 && x < FW) g[y][x] = c; };
    const clearEyes = () => { for (const x of [4, 8]) { set(x, 7, "b"); set(x, 8, "b"); } };
    const happyEyes = () => {
      clearEyes();
      for (const [x, y] of [[4, 7], [3, 8], [5, 8], [8, 7], [7, 8], [9, 8]]) set(x, y, "k");
    };
    let hop = 0;

    switch (mood) {
      case "happy":
        happyEyes();
        set(6, 10, "b"); set(5, 10, "m"); set(7, 10, "m"); set(6, 11, "m");
        hop = f;
        break;
      case "cheer":
        happyEyes();
        set(5, 10, "m"); set(6, 10, "m"); set(7, 10, "m"); set(6, 11, "m");
        if (f === 0) for (const [x, y] of [[0, 5], [0, 6], [12, 5], [12, 6]]) set(x, y, "o");
        else for (const [x, y] of [[0, 7], [0, 8], [12, 7], [12, 8]]) set(x, y, "o");
        hop = f === 0 ? 1 : 0;
        break;
      case "worry":
        set(3, 6, "m"); set(4, 5, "m"); set(9, 6, "m"); set(8, 5, "m");
        set(6, 10, "m"); set(6, 11, "m");
        set(12, f === 0 ? 6 : 7, "u"); set(12, f === 0 ? 7 : 8, "u");
        break;
      case "sleepy":
        clearEyes();
        for (const x of [3, 4, 5, 7, 8, 9]) set(x, 8, "k");
        if (f === 1) set(6, 11, "m");
        break;
      default: // idle
        if (f === 1) { set(4, 7, "b"); set(8, 7, "b"); } // blink
    }

    const scarf = (a, b) => {
      for (let x = 2; x <= 10; x++) set(x, 12, x % 2 ? a : b);
      set(11, 12, b); set(11, 13, a);
    };

    if (season === "spring") {
      for (const [x, y, c] of [[11, 3, "P"], [10, 4, "P"], [11, 4, "y"], [12, 4, "P"], [11, 5, "P"]]) set(x, y, c);
    } else if (season === "summer") {
      for (const x of [3, 4, 5, 7, 8, 9]) { set(x, 7, "S"); set(x, 8, "S"); }
      set(6, 7, "S"); set(4, 7, "W"); set(8, 7, "W");
    } else if (season === "autumn") {
      for (let y = 0; y < 3; y++) for (let x = 0; x < FW; x++) {
        if (g[y][x] === "g") g[y][x] = "A";
        else if (g[y][x] === "G") g[y][x] = "R";
      }
      scarf("r", "R");
    } else if (season === "winter") {
      for (let y = 0; y < 3; y++) for (let x = 0; x < FW; x++) g[y][x] = ".";
      for (const [x, y] of [[6, 0], [5, 1], [6, 1], [7, 1]]) set(x, y, "w");
      for (let x = 4; x <= 8; x++) set(x, 2, "n");
      for (let x = 3; x <= 9; x++) { set(x, 3, "n"); set(x, 4, "N"); }
      scarf("B", "D");
    }

    return { rows: g.map((r) => r.join("")), hop };
  }

  // Draws one frame with its top-left at (ox, oy) art pixels.
  function drawPip(ctx, mood, season, f, ox, oy, s) {
    const { rows, hop } = buildPip(mood, f, season);
    paint(ctx, rows, PAL, ox, oy + 2 - hop, s);
  }

  const sheetCache = {};
  // Both frames of a mood side by side. Shown at 3 css px per art pixel.
  function critterSheet(mood, season) {
    const s = 3 * dpr();
    const key = `${mood}|${season}|${s}`;
    if (sheetCache[key]) return sheetCache[key];
    const { canvas, ctx } = mk(FW * 2 * s, FH * s);
    drawPip(ctx, mood, season, 0, 0, 0, s);
    drawPip(ctx, mood, season, 1, FW, 0, s);
    return (sheetCache[key] = { url: canvas.toDataURL(), w: FW * 3, h: FH * 3 });
  }

  // ---------------------------------------------------------- empty scenes

  const CUSHION = {
    spring: ["#f9bcd0", "#f4a6c0", "#d97fa0"],
    summer: ["#ffe27a", "#ffd54a", "#e0a21f"],
    autumn: ["#eba04a", "#d9822b", "#a85a1a"],
    winter: ["#9cc4ec", "#6fa8dc", "#4a7fb5"],
    base: ["#b9cdee", "#9db8e0", "#6f8fc0"]
  };

  const sceneCache = {};
  // Little 23 x 22 scenes shown at 3x: Pip napping on a cushion, peeking out of a crate, or celebrating.
  function sceneURL(kind, season) {
    const s = 3 * dpr();
    const key = `${kind}|${season}|${s}`;
    if (sceneCache[key]) return sceneCache[key];
    const W = 23, H = 22;
    const { canvas, ctx } = mk(W * s, H * s);

    if (kind === "nap") {
      drawPip(ctx, "sleepy", season, 0, 5, 1, s);
      const [hi, mid, lo] = CUSHION[season] || CUSHION.base;
      box(ctx, 4, 14, 15, 1, hi, s);
      box(ctx, 3, 15, 17, 3, mid, s);
      box(ctx, 4, 18, 15, 1, lo, s);
      box(ctx, 3, 18, 1, 0, lo, s);
      box(ctx, 5, 20, 13, 1, "rgba(0,0,0,0.14)", s);
    } else if (kind === "peek") {
      drawPip(ctx, "idle", season, 0, 5, 1, s);
      box(ctx, 3, 14, 17, 7, "#b9783f", s);
      box(ctx, 3, 14, 17, 1, "#d49a5a", s);
      box(ctx, 3, 17, 17, 1, "#8a5527", s);
      box(ctx, 3, 20, 17, 1, "#8a5527", s);
      for (const x of [3, 9, 14, 19]) box(ctx, x, 14, 1, 7, "#8a5527", s);
      box(ctx, 4, 21, 15, 1, "rgba(0,0,0,0.14)", s);
    } else {
      box(ctx, 4, 17, 15, 1, "rgba(0,0,0,0.14)", s);
      drawPip(ctx, "happy", season, 0, 5, 1, s);
    }
    return (sceneCache[key] = { url: canvas.toDataURL(), w: W * 3, h: H * 3 });
  }

  // `text` must already be safe HTML (callers pass fixed strings).
  function emptyHTML(kind, text, season) {
    const sc = sceneURL(kind, season);
    const extra = kind === "nap"
      ? `<span class="zz z1">z</span><span class="zz z2">z</span><span class="zz z3">Z</span>`
      : kind === "twins"
        ? `<i class="tw t1"></i><i class="tw t2"></i><i class="tw t3"></i>`
        : "";
    return `<div class="empty-scene ${kind}">
      <div class="es-art" style="width:${sc.w}px;height:${sc.h}px;background-image:url(${sc.url})">${extra}</div>
      <p class="empty-state-text">${text}</p>
    </div>`;
  }

  // ---------------------------------------------------------- notifications

  const NOTE_BG = {
    spring: { sky: ["#b3e3f4", "#d9f0e8"], ground: "#a6d99f", dots: ["#ffc2d8", "#ffffff", "#ff9ec0"] },
    summer: { sky: ["#66c4f6", "#bfe6f8"], ground: "#f7db92", dots: ["#ffd54a", "#ffffff", "#9fdbf8"] },
    autumn: { sky: ["#f5a95f", "#fcdca6"], ground: "#a8742f", dots: ["#d9822b", "#b5472a", "#e8b13a"] },
    winter: { sky: ["#24467f", "#8fb2d0"], ground: "#e9f2fc", dots: ["#ffffff", "#dbe9ff", "#ffffff"] },
    base: { sky: ["#dbeafe", "#f1f5f9"], ground: "#c7d7ea", dots: ["#ffffff", "#bcd2ee", "#ffffff"] }
  };

  // A 120 x 120 pixel picture of Pip in the current season, for desktop notifications.
  async function notificationIcon(mood, season) {
    const N = 20, S = 6;
    const bg = NOTE_BG[season] || NOTE_BG.base;
    const { canvas, ctx } = mk(N * S, N * S);
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < N; x++) {
        const c = y < 6 ? bg.sky[0] : y === 6 || y === 7 ? ((x + y) % 2 ? bg.sky[1] : bg.sky[0]) : bg.sky[1];
        box(ctx, x, y, 1, 1, c, S);
      }
    }
    box(ctx, 0, 14, N, 6, bg.ground, S);
    box(ctx, 0, 14, N, 1, "rgba(255,255,255,0.35)", S);
    const spots = [[2, 3], [16, 5], [17, 2], [3, 9], [17, 10], [10, 1], [1, 16], [18, 17]];
    spots.forEach(([x, y], i) => box(ctx, x, y, 1, 1, bg.dots[i % bg.dots.length], S));
    if (season === "summer") box(ctx, 15, 1, 3, 3, "#ffd54a", S);
    box(ctx, 4, 16, 12, 1, "rgba(0,0,0,0.14)", S);
    drawPip(ctx, mood, season, 0, 3, 0, S);
    return canvasToURL(canvas);
  }

  // The TidyStack app icon (green rounded square with a stack of tabs), as ImageData for chrome.action.setIcon.
  function appIconData(size) {
    const { ctx } = mk(size, size);
    const u = size / 128;
    const rr = (x, y, w, h, r, fill, alpha) => {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x * u, y * u, w * u, h * u, r * u);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    rr(0, 0, 128, 128, 28, "#3d9a5b");
    rr(30, 26, 68, 30, 8, "#ffffff", 0.55);
    rr(24, 44, 80, 30, 8, "#ffffff", 0.8);
    rr(18, 62, 92, 40, 10, "#ffffff");
    rr(30, 76, 44, 8, 4, "#3d9a5b");
    rr(30, 90, 28, 6, 3, "#3d9a5b");
    return ctx.getImageData(0, 0, size, size);
  }

  root.TidyPixel = {
    seasonOf, iconURL, iconHTML, hydrate, critterSheet, sceneURL, emptyHTML, notificationIcon, appIconData, FW, FH
  };
})(typeof self !== "undefined" ? self : this);

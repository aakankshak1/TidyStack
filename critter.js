/* TidyStack companion: Pip, the little character who lives in the header.

   Pip reacts to how your tabs are doing, celebrates when you tidy up, and speaks in short,
   rare speech bubbles. This file also holds the "feel" of the whole popup: the pixel bursts,
   the archive flight, and the optional seasonal sound effects (muted by default, synthesised
   with Web Audio, so there are no audio files and nothing is ever downloaded).

   Plain JS, loaded after pixel.js and themes.js and before popup.js. */
(function () {
  "use strict";

  const P = window.TidyPixel;
  const T = window.TidyThemes;
  if (!P || !T) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const even = (n) => Math.round(n / 2) * 2;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const season = () => P.seasonOf(T.current());
  const palette = () => T.fx(T.current());

  // ------------------------------------------------------------------ sound

  const Sfx = (() => {
    let ctx = null;
    let enabled = false;
    const ROOT = { spring: 523.25, summer: 587.33, autumn: 392, winter: 659.25, base: 523.25 };
    const WAVE = { spring: "triangle", summer: "square", autumn: "triangle", winter: "sine", base: "triangle" };
    const MAJOR = [0, 2, 4, 7, 9];
    const MINOR = [0, 3, 5, 7, 10];

    // [scale degree, start (s), length (s)]
    const SEQ = {
      tick: [[2, 0, 0.05]],
      on: [[0, 0, 0.08], [4, 0.07, 0.12]],
      off: [[4, 0, 0.08], [0, 0.07, 0.12]],
      archive: [[0, 0, 0.07], [2, 0.06, 0.07], [4, 0.12, 0.13]],
      restore: [[2, 0, 0.07], [5, 0.07, 0.15]],
      cheer: [[0, 0, 0.08], [2, 0.07, 0.08], [4, 0.14, 0.08], [5, 0.21, 0.18]],
      boop: [[3, 0, 0.05], [5, 0.04, 0.09]],
      poof: [[-3, 0, 0.1]],
      wipe: [[0, 0, 0.1], [2, 0.08, 0.1], [4, 0.16, 0.1], [7, 0.24, 0.2]],
      bell: [[4, 0, 0.14], [7, 0.12, 0.22]]
    };

    function freq(deg) {
      const scale = season() === "autumn" ? MINOR : MAJOR;
      return ROOT[season()] * Math.pow(2, (scale[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12);
    }

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function tone(f, at, dur, vol, type) {
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    return {
      get enabled() { return enabled; },
      enable(on) { enabled = !!on; },
      play(name) {
        if (!enabled || !SEQ[name] || !ensure()) return;
        const s = season();
        const vol = WAVE[s] === "square" ? 0.03 : 0.06;
        for (const [deg, at, len] of SEQ[name]) {
          const f = freq(deg);
          tone(f, at, len + 0.08, vol, WAVE[s]);
          if (s === "winter") tone(f * 2.76, at, (len + 0.08) * 0.7, vol * 0.35, "sine"); // a touch of glassy bell
        }
      }
    };
  })();

  // -------------------------------------------------------------- particles

  const layer = document.createElement("div");
  layer.id = "fxLayer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  function spawn(x, y, w, h, color) {
    const el = document.createElement("i");
    el.className = "fxp";
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${color}`;
    layer.appendChild(el);
    return el;
  }

  function burst(x, y, o = {}) {
    if (reduce.matches) return;
    const colors = o.colors || palette().burst;
    const n = o.n || 12;
    const spread = o.spread || 34;
    for (let i = 0; i < n; i++) {
      const a = o.up ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(0, Math.PI * 2);
      const d = spread * rand(0.5, 1);
      const dx = Math.cos(a) * d;
      const dy = Math.sin(a) * d;
      const size = pick([2, 2, 4]);
      const el = spawn(even(x), even(y), size, size, pick(colors));
      el.animate(
        [
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${even(dx)}px, ${even(dy)}px)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${even(dx * 1.15)}px, ${even(dy + 22)}px)`, opacity: 0 }
        ],
        { duration: rand(550, 850), easing: "steps(9, end)", fill: "forwards" }
      ).onfinish = () => el.remove();
    }
  }

  function sparkle(el, o) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, Object.assign({ n: 7, spread: 18 }, o));
  }

  // Season confetti across the header: petals, glints, leaves or snow.
  function rain() {
    if (reduce.matches) return;
    const header = document.querySelector(".header");
    if (!header) return;
    const r = header.getBoundingClientRect();
    const cols = palette().burst;
    const shape = palette().rain;
    for (let i = 0; i < 24; i++) {
      const w = shape === "petal" ? 4 : shape === "leaf" ? 4 : 2;
      const h = shape === "petal" ? 2 : shape === "leaf" ? 4 : shape === "flake" ? 2 : 2;
      const x = even(r.left + rand(4, r.width - 8));
      const el = spawn(x, even(r.top - 6), w, h, pick(cols));
      const sway = even(rand(-14, 14));
      el.animate(
        [
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${sway}px, ${even(r.height * 0.5)}px)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${-sway}px, ${even(r.height + 10)}px)`, opacity: 0 }
        ],
        { duration: rand(1100, 1900), delay: rand(0, 500), easing: "steps(14, end)", fill: "both" }
      ).onfinish = () => el.remove();
    }
  }

  function pulse() {
    const scene = document.getElementById("scene");
    if (!scene || reduce.matches) return;
    scene.classList.add("celebrate");
    setTimeout(() => scene.classList.remove("celebrate"), 1100);
  }

  function hop(el) {
    if (!el || reduce.matches) return;
    el.classList.remove("hop");
    void el.offsetWidth;
    el.classList.add("hop");
    el.addEventListener("animationend", () => el.classList.remove("hop"), { once: true });
  }

  // A row folds into a little card that flies to the Graveyard tab and lands with a burst.
  function flyToGraveyard(row) {
    const target = document.querySelector('.tab-btn[data-tab="graveyard"] .pix');
    if (!row) return Promise.resolve();
    if (reduce.matches || !target) {
      row.classList.add("exiting");
      return wait(reduce.matches ? 0 : 260);
    }
    const r = row.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const left = r.left + 8;
    const top = r.top + 4;
    const card = document.createElement("div");
    card.className = "fly-card";
    const img = row.querySelector("img");
    card.innerHTML = `${img && img.src ? `<img src="${img.src}" alt="">` : ""}<i></i><i class="s"></i>`;
    card.style.left = left + "px";
    card.style.top = top + "px";
    layer.appendChild(card);
    row.classList.add("launched");
    const dx = even(t.left + t.width / 2 - (left + 30));
    const dy = even(t.top + t.height / 2 - (top + 12));
    return new Promise((resolve) => {
      card.animate(
        [
          { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
          { transform: "translate(0,-14px) scale(0.9) rotate(-4deg)", opacity: 1, offset: 0.3 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.25) rotate(8deg)`, opacity: 0.9 }
        ],
        { duration: 560, easing: "steps(14, end)", fill: "forwards" }
      ).onfinish = () => {
        card.remove();
        burst(t.left + t.width / 2, t.top + t.height / 2, { n: 10, spread: 26 });
        const btn = target.closest(".tab-btn");
        if (btn) {
          btn.classList.remove("bounce");
          void btn.offsetWidth;
          btn.classList.add("bounce");
          setTimeout(() => btn.classList.remove("bounce"), 520);
        }
        Sfx.play("archive");
        resolve();
      };
    });
  }

  function archiveRows(rows) {
    const list = (rows || []).filter(Boolean);
    const flying = list.slice(0, 8);
    list.slice(8).forEach((r) => r.classList.add("exiting"));
    if (!flying.length) return Promise.resolve();
    return Promise.all(flying.map((r, i) => wait(i * 90).then(() => flyToGraveyard(r))));
  }

  function popRow(row) {
    if (!row) return Promise.resolve();
    row.classList.add("exiting");
    if (reduce.matches) return Promise.resolve();
    const r = row.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ["#9aa5b1", "#c8d0d8", "#ffffff"], n: 8, spread: 22 });
    Sfx.play("poof");
    return wait(260);
  }

  // ------------------------------------------------------------------ Pip

  const LINES = {
    greet: {
      happy: ["All tidy in here!", "Your tabs are thriving."],
      worry1: ["That's quite a few tabs...", "Shall we tidy up a little?"],
      worry2: ["Tabs everywhere!!", "I can't see the floor."],
      sleepy: ["zzz... nothing to tidy."]
    },
    poke: {
      idle: ["Boop!", "Everything's in order.", "I live here now.", "Hi!"],
      happy: ["Thank you!", "So tidy!", "Happy Pip!"],
      worry: ["Eep!", "Please. Tabs.", "Gulp."],
      sleepy: ["Five more minutes...", "zzz"]
    },
    archive: ["Tucked away!", "Cosy in the Graveyard.", "Off to bed, tab."],
    group: ["Sorted! Lovely.", "Look at those tidy groups.", "Everything has a home."],
    merge: ["One of each, please.", "Twins no more!"],
    tidy: ["Spotless!", "Gold star for you.", "Nothing idle. Wow."],
    restore: ["Welcome back, tab!", "It lives again!"],
    undo: ["Rewound!", "Back it goes."],
    season: { spring: "Blossom time!", summer: "Beach day!", autumn: "Crunchy leaves!", winter: "Brr. Cosy mode on.", base: "Back to basics." }
  };

  const state = { companion: true, base: "idle", level: 0, temp: null, tempTimer: 0, bubbleTimer: 0, greeted: false, pokes: 0, pokeTimer: 0 };
  let el = null;
  let bodyEl = null;
  let bubbleEl = null;

  function mount() {
    const header = document.querySelector(".header");
    if (!header) return;
    el = document.createElement("div");
    el.className = "critter";
    el.id = "critter";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Pip, your tab companion. Press to say hi.");
    el.innerHTML = `<div class="bubble hidden" role="status"></div><i class="c-shadow"></i><i class="c-body"></i>`;
    header.appendChild(el);
    bodyEl = el.querySelector(".c-body");
    bubbleEl = el.querySelector(".bubble");
    el.addEventListener("click", poke);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); }
    });
  }

  function render() {
    if (!el) return;
    const mood = state.temp || state.base;
    const sh = P.critterSheet(mood, season());
    bodyEl.style.backgroundImage = `url(${sh.url})`;
    el.dataset.mood = mood;
    el.dataset.level = String(state.temp ? 0 : state.level);
  }

  function setTemp(mood, ms) {
    state.temp = mood;
    clearTimeout(state.tempTimer);
    state.tempTimer = setTimeout(() => { state.temp = null; render(); }, ms);
    render();
  }

  function say(text, ms) {
    if (!el || !state.companion || !text) return;
    bubbleEl.textContent = text;
    bubbleEl.classList.remove("hidden");
    bubbleEl.style.animation = "none";
    void bubbleEl.offsetWidth;
    bubbleEl.style.animation = "";
    clearTimeout(state.bubbleTimer);
    state.bubbleTimer = setTimeout(() => bubbleEl.classList.add("hidden"), ms || 3200);
  }

  function poke() {
    if (!state.companion) return;
    hop(el);
    Sfx.play("boop");
    const base = state.base === "worry" ? "worry" : state.base;
    state.pokes++;
    clearTimeout(state.pokeTimer);
    state.pokeTimer = setTimeout(() => { state.pokes = 0; }, 2200);
    if (state.pokes >= 6) {
      state.pokes = 0;
      setTemp("worry", 1400);
      say("Whee... I'm dizzy.");
      return;
    }
    setTemp(base === "worry" || base === "sleepy" ? "happy" : "happy", 1100);
    say(pick(LINES.poke[base] || LINES.poke.idle), 2600);
  }

  // Pip's mood follows how many tabs are open compared to the user's limit.
  function reactToStats(stats, threshold) {
    if (!el || !stats || typeof stats.total !== "number") return;
    const limit = Number(threshold) || 30;
    let mood = "idle";
    let level = 0;
    if (stats.total === 0) mood = "sleepy";
    else if (stats.total >= limit * 1.5) { mood = "worry"; level = 2; }
    else if (stats.total >= limit) { mood = "worry"; level = 1; }
    else if (!stats.stale && !stats.duplicates) mood = "happy";
    state.base = mood;
    state.level = level;
    render();

    if (!state.greeted) {
      state.greeted = true;
      const key = mood === "worry" ? (level === 2 ? "worry2" : "worry1") : mood;
      const pool = LINES.greet[key];
      if (pool) setTimeout(() => say(pick(pool), 3000), 450);
    }
  }

  // kind: archive | group | merge | tidy | restore | undo. "group" and "tidy" get the whole-header treatment.
  function celebrate(kind) {
    if (!el) return;
    setTemp("cheer", 1500);
    say(pick(LINES[kind] || LINES.tidy), 2800);
    const r = el.getBoundingClientRect();
    const big = kind === "group" || kind === "tidy";
    burst(r.left + r.width / 2, r.top + 14, { n: big ? 16 : 8, spread: big ? 40 : 26, up: true });
    if (big) {
      rain();
      pulse();
      Sfx.play("cheer");
    } else if (kind === "undo") {
      Sfx.play("restore");
    }
  }

  function configure(s) {
    if (!s) return;
    if (s.companion !== undefined) {
      state.companion = !!s.companion;
      // One switch hides Pip everywhere: the header, speech bubbles, the toast and the empty-state scenes.
      document.documentElement.classList.toggle("no-pip", !state.companion);
      if (el) el.classList.toggle("hidden", !state.companion);
      if (!state.companion) {
        clearTimeout(state.bubbleTimer);
        if (bubbleEl) bubbleEl.classList.add("hidden");
      }
    }
    if (s.sound !== undefined) Sfx.enable(!!s.sound);
  }

  // ---------------------------------------------------------- global feel

  // Every button, tab and swatch gets the same soft tick.
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".btn, .tab-btn, .theme-swatch, .section-links button, .undo-toast button");
    if (b && !b.disabled) Sfx.play("tick");
  }, true);

  // Every toggle squishes, and sparkles when switched on.
  document.addEventListener("change", (e) => {
    const input = e.target;
    if (!input.matches || !input.matches(".switch input")) return;
    const track = input.nextElementSibling;
    if (track) {
      track.classList.remove("pop");
      void track.offsetWidth;
      track.classList.add("pop");
      if (input.checked) sparkle(track);
    }
    Sfx.play(input.checked ? "on" : "off");
  });

  document.addEventListener("tidy-theme", (e) => {
    render();
    if (e.detail && !e.detail.initial) {
      Sfx.play("wipe");
      say(LINES.season[season()], 2400);
      setTemp("happy", 1400);
    }
  });

  mount();
  render();
  P.hydrate(document);

  window.Critter = {
    configure,
    reactToStats,
    celebrate,
    say,
    sfx: Sfx,
    fx: { archiveRows, popRow, burst, sparkle, rain, pulse }
  };
})();

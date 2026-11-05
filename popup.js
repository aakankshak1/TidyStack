// ---- TidyStack popup (plain JS, no build step) ----

// Every call to the background worker goes through here, so a failed request becomes
// a normal { ok: false } answer instead of a crashed panel.
async function send(message) {
  try {
    const res = await chrome.runtime.sendMessage(message);
    return res === undefined ? { ok: false, error: "No response" } : res;
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Favicons come from Chrome's own local favicon cache, so no site names are ever sent to a third party.
function faviconFor(url) {
  try {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", url);
    u.searchParams.set("size", "32");
    return u.toString();
  } catch {
    return "";
  }
}

// Some sites serve a white icon (GitHub's dark-mode octocat, for one) that vanishes on a cream page.
// So every icon sits on a small tile, and the tile colour is picked from the icon itself:
// light icons get a dark tile, everything else gets a white one.
function framedFavicon(img) {
  img.classList.add("fav");
  const pickTile = () => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      let weight = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        if (a < 0.2) continue;
        sum += ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) * a;
        weight += a;
      }
      img.dataset.tone = weight > 0 && sum / weight > 0.62 ? "light" : "dark";
    } catch { /* the tile just stays white */ }
  };
  img.addEventListener("load", pickTile);
  if (img.complete && img.naturalWidth) pickTile();
}

function formatIdle(ms) {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const OVERVIEW_ROW_CAP = 150;

// The pixel world (pixel.js + critter.js) is optional polish: if it ever fails to load, everything still works.
const ico = (name) => (window.TidyPixel ? window.TidyPixel.iconHTML(name) : "");
const worldSeason = () => (window.TidyPixel && window.TidyThemes ? window.TidyPixel.seasonOf(window.TidyThemes.current()) : "base");
const emptyScene = (kind, text) =>
  window.TidyPixel && !(appSettings && appSettings.companion === false)
    ? window.TidyPixel.emptyHTML(kind, text, worldSeason())
    : `<p class="empty-state">${text}</p>`;

let appSettings = null;

// --- Theme -----------------------------------------------------------------

// themes.js owns the palettes and the pixel scenes. Spring is the default.
function applyTheme(theme) {
  return window.TidyThemes.apply(theme);
}

// --- Tab row builder ---------------------------------------------------------

function buildTabRow({ title, url, meta, idleMs, onOpen, actions }) {
  const row = document.createElement("div");
  row.className = "tab-row";

  const img = document.createElement("img");
  framedFavicon(img);
  img.src = faviconFor(url);
  img.alt = "";
  img.onerror = () => { img.style.visibility = "hidden"; };
  row.appendChild(img);

  const info = document.createElement("button");
  info.className = "tab-row-info";
  info.disabled = !onOpen;
  info.innerHTML = `
    <div class="tab-row-title">${escapeHtml(title)}</div>
    <div class="tab-row-meta">${escapeHtml(meta || "")}${idleMs != null ? ` <span class="idle">· ${formatIdle(idleMs)} idle</span>` : ""}</div>
  `;
  if (onOpen) info.addEventListener("click", onOpen);
  row.appendChild(info);

  if (actions && actions.length) {
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "tab-row-actions";
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.className = `btn btn-sm ${a.variant === "danger" ? "btn-danger" : "btn-outline"}`;
      if (a.icon && window.TidyPixel) {
        // Pixel icon buttons: the label stays available as a tooltip and for screen readers.
        btn.classList.add("btn-icon");
        btn.innerHTML = ico(a.icon);
        btn.title = a.label;
        btn.setAttribute("aria-label", a.label);
      } else {
        btn.textContent = a.label;
      }
      btn.addEventListener("click", (e) => { e.stopPropagation(); a.onClick(); });
      actionsWrap.appendChild(btn);
    }
    row.appendChild(actionsWrap);
  }

  return row;
}

const errorState = (text = "Something went wrong. Close and reopen TidyStack to try again.") =>
  `<p class="empty-state">${escapeHtml(text)}</p>`;

// --- Tab count ---------------------------------------------------------------

function renderFan(stats) {
  const el = document.getElementById("fanRow");
  el.innerHTML = "";

  if (!stats || typeof stats.total !== "number" || stats.total === 0) {
    el.innerHTML = `<p class="fan-summary">Nothing to look at yet.</p>`;
    return;
  }

  const bits = [];
  if (stats.stale) bits.push(`${stats.stale} idle`);
  if (stats.duplicates) bits.push(`${stats.duplicates} duplicate`);
  el.innerHTML = `
    <div>
      <p class="fan-count">${stats.total} <span>tabs open</span></p>
      ${bits.length ? `<p class="fan-summary">${escapeHtml(bits.join(" · "))}</p>` : ""}
    </div>
  `;
}

// --- Toast (a little message from Pip, with optional Undo) ----------------------

let toastTimeout = null;
let toastHideTimer = null;

function hideToast() {
  const toast = document.getElementById("undoToast");
  clearTimeout(toastTimeout);
  clearTimeout(toastHideTimer);
  if (toast.classList.contains("hidden")) return;
  toast.classList.add("leaving");
  toastHideTimer = setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("leaving", "show");
  }, 170);
}

function showToast(message, { undo = true, mood } = {}) {
  const toast = document.getElementById("undoToast");
  clearTimeout(toastTimeout);
  clearTimeout(toastHideTimer);
  document.getElementById("undoMessage").textContent = message;
  document.getElementById("undoBtn").classList.toggle("hidden", !undo);

  const pip = document.getElementById("toastPip");
  if (window.TidyPixel && !(appSettings && appSettings.companion === false)) {
    const sheet = window.TidyPixel.critterSheet(mood || (undo ? "cheer" : "happy"), worldSeason());
    pip.style.backgroundImage = `url(${sheet.url})`;
    pip.classList.remove("hidden");
  } else {
    pip.classList.add("hidden");
  }

  toast.classList.remove("hidden", "leaving", "show");
  void toast.offsetWidth;
  toast.classList.add("show");
  toastTimeout = setTimeout(hideToast, 5000);
}
const showUndo = (message) => showToast(message, { undo: true });
const showError = (message) => showToast(message, { undo: false, mood: "worry" });

document.getElementById("undoBtn").addEventListener("click", async () => {
  const res = await send({ type: "UNDO_LAST" });
  hideToast();
  if (res && res.ok === false) showError(res.message || res.error || "Couldn't undo that.");
  else window.Critter?.celebrate("undo");
  refreshHeader();
  renderActivePanel();
});

// --- Header refresh -----------------------------------------------------------

async function refreshHeader() {
  const stats = await send({ type: "GET_GUILT_STATS" });
  renderFan(stats);
  window.Critter?.reactToStats(stats, appSettings ? appSettings.threshold : 30);
  return stats;
}

// --- Overview panel ------------------------------------------------------------

async function renderOverviewPanel() {
  const root = document.querySelector('[data-panel="overview"]');
  root.innerHTML = `
    <div class="panel-actions">
      <button class="btn btn-outline btn-sm flex-1" id="groupBtn">${ico("folder")}<span>Group by topic</span></button>
      <button class="btn btn-outline btn-sm flex-1" id="ungroupBtn">${ico("spread")}<span>Ungroup all</span></button>
    </div>
    <div class="section-header">
      <h2 class="section-title">Idle tabs</h2>
      <div class="section-links" id="overviewBulk"></div>
    </div>
    <div class="list-scroll" id="overviewList">
      <p class="empty-state">Looking at your tabs…</p>
    </div>
  `;

  const setLabel = (btn, text) => { btn.querySelector("span").textContent = text; };

  document.getElementById("groupBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    setLabel(btn, "Grouping…");
    const res = await send({ type: "GROUP_BY_TOPIC" });
    setLabel(btn, "Group by topic");
    if (res && res.ok && res.topicCount > 0) {
      showUndo(`Grouped ${plural(res.topicCount, "topic")}`);
      window.Critter?.celebrate("group");
    } else if (res && res.ok) {
      showToast("Nothing to group just yet.", { undo: false });
    } else {
      showError("Couldn't group those. Nothing was changed.");
    }
    refreshHeader();
    renderOverviewPanel();
  });
  document.getElementById("ungroupBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    setLabel(btn, "Ungrouping…");
    const res = await send({ type: "UNGROUP_ALL" });
    setLabel(btn, "Ungroup all");
    if (res && res.ok) showToast("Ungrouped everything.", { undo: false });
    refreshHeader();
    renderOverviewPanel();
  });

  const report = await send({ type: "GET_REPORT" });
  const list = document.getElementById("overviewList");
  const bulk = document.getElementById("overviewBulk");
  bulk.innerHTML = "";
  list.innerHTML = "";

  if (!Array.isArray(report.tabs)) {
    list.innerHTML = errorState();
    return;
  }

  const tabs = report.tabs.filter((t) => t.isStale).sort((a, b) => b.idleMs - a.idleMs);

  if (tabs.length === 0) {
    list.innerHTML = emptyScene("nap", "Nothing idle right now. Nicely kept.");
    return;
  }

  const rowEls = [];

  const archiveAllBtn = document.createElement("button");
  archiveAllBtn.className = "link-accent";
  archiveAllBtn.textContent = "Archive all";
  archiveAllBtn.addEventListener("click", async () => {
    await window.Critter?.fx.archiveRows(rowEls);
    runAction(tabs.map((t) => t.id), "archive", `Archived ${plural(tabs.length, "tab")}`);
  });
  bulk.appendChild(archiveAllBtn);

  const closeAllBtn = document.createElement("button");
  closeAllBtn.className = "link-clay";
  closeAllBtn.textContent = "Close all";
  closeAllBtn.addEventListener("click", () => {
    rowEls.forEach((r) => r.classList.add("exiting"));
    setTimeout(() => runAction(tabs.map((t) => t.id), "close", `Closed ${plural(tabs.length, "tab")}`), 260);
  });
  bulk.appendChild(closeAllBtn);

  // Only the longest-idle tabs get a row, so the popup stays quick with hundreds of tabs open.
  // "Archive all" and "Close all" above still cover every idle tab.
  for (const t of tabs.slice(0, OVERVIEW_ROW_CAP)) {
    const row = buildTabRow({
      title: t.title,
      url: t.url,
      meta: t.topic,
      idleMs: t.idleMs,
      onOpen: () => send({ type: "GO_TO_TAB", tabId: t.id }),
      actions: [
        { label: "Archive", icon: "box", onClick: () => rowAction(row, t.id, "archive", `Archived "${t.title}"`) },
        { label: "Close", icon: "x", variant: "danger", onClick: () => rowAction(row, t.id, "close", `Closed "${t.title}"`) }
      ]
    });
    rowEls.push(row);
    list.appendChild(row);
  }

  if (tabs.length > OVERVIEW_ROW_CAP) {
    const more = document.createElement("p");
    more.className = "empty-state";
    more.textContent = `Showing the ${OVERVIEW_ROW_CAP} longest-idle of ${tabs.length}.`;
    list.appendChild(more);
  }

  async function rowAction(rowEl, tabId, kind, label) {
    if (kind === "archive") {
      if (window.Critter) await window.Critter.fx.archiveRows([rowEl]);
      else { rowEl.classList.add("exiting"); await new Promise((r) => setTimeout(r, 260)); }
    } else if (window.Critter) {
      await window.Critter.fx.popRow(rowEl);
    } else {
      rowEl.classList.add("exiting");
      await new Promise((r) => setTimeout(r, 260));
    }
    await runAction([tabId], kind, label);
  }

  // The background worker caps how many tabs one request can touch, so big batches are sent in chunks.
  async function runAction(tabIds, kind, label) {
    let failed = false;
    for (let i = 0; i < tabIds.length; i += 400) {
      const chunk = tabIds.slice(i, i + 400);
      const res = kind === "archive"
        ? await send({ type: "ARCHIVE_TABS", tabIds: chunk, reason: "manual" })
        : await send({ type: "CLOSE_TABS", tabIds: chunk });
      if (res && res.ok === false) failed = true;
    }
    if (failed) showError("Couldn't finish that. Nothing was lost.");
    else showUndo(label);
    const stats = await refreshHeader();
    renderOverviewPanel();
    if (!failed) {
      const tidy = stats && typeof stats.total === "number" && !stats.stale && !stats.duplicates;
      if (tidy) window.Critter?.celebrate("tidy");
      else if (kind === "archive") window.Critter?.celebrate("archive");
    }
  }
}

// --- Duplicates panel ------------------------------------------------------------

async function renderDuplicatesPanel() {
  const root = document.querySelector('[data-panel="duplicates"]');
  root.innerHTML = `
    <p class="dup-intro">Same page open more than once. Merging keeps one copy and safely closes the rest -- nothing is lost, it's just tidied.</p>
    <div class="dup-list" id="dupList"><p class="empty-state">Scanning for duplicates…</p></div>
  `;

  const groups = await send({ type: "GET_DUPLICATES" });
  const list = document.getElementById("dupList");
  list.innerHTML = "";

  if (!Array.isArray(groups)) {
    list.innerHTML = errorState();
    return;
  }

  if (groups.length === 0) {
    list.innerHTML = emptyScene("twins", "No duplicate tabs right now. One of each, just right.");
    return;
  }

  for (const g of groups) {
    const card = document.createElement("div");
    card.className = "dup-card";
    card.innerHTML = `
      <div class="dup-card-head">
        <img src="${escapeHtml(faviconFor(g.tabs[0].url))}" alt="" />
        <span>${escapeHtml(g.tabs[0].title)}</span>
        <span class="badge badge-clay">${g.tabs.length}×</span>
      </div>
      <div class="dup-card-actions">
        <button class="btn btn-outline btn-sm" data-keep="newest">Keep newest</button>
        <button class="btn btn-outline btn-sm" data-keep="oldest">Keep oldest</button>
      </div>
    `;
    const favImg = card.querySelector("img");
    framedFavicon(favImg);
    favImg.onerror = (e) => { e.target.style.visibility = "hidden"; };
    card.querySelectorAll("[data-keep]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const res = await send({ type: "RESOLVE_DUPLICATES", groups: [g.normalizedUrl], keep: btn.dataset.keep });
        if (res && res.ok) {
          showUndo(`Merged ${plural(g.tabs.length, "duplicate tab")}`);
          window.Critter?.fx.sparkle(card);
          window.Critter?.celebrate("merge");
        } else {
          showError("Couldn't merge those. Nothing was closed.");
        }
        refreshHeader();
        renderDuplicatesPanel();
      });
    });
    list.appendChild(card);
  }
}

// --- Graveyard panel ------------------------------------------------------------

async function renderGraveyardPanel(query) {
  const root = document.querySelector('[data-panel="graveyard"]');
  const isFirstRender = !root.dataset.rendered;
  if (isFirstRender) {
    root.dataset.rendered = "1";
    root.innerHTML = `
      <div class="search-wrap">
        <input class="search-input" id="graveyardSearch" placeholder="Search archived tabs…" maxlength="200" />
      </div>
      <div class="section-header">
        <h2 class="section-title" id="graveyardTitle">Graveyard</h2>
        <div class="section-links" id="graveyardBulk"></div>
      </div>
      <div class="list-scroll" id="graveyardList"></div>
    `;
    let debounce;
    document.getElementById("graveyardSearch").addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderGraveyardPanel(e.target.value), 150);
    });
  }

  const res = await send({ type: "GET_GRAVEYARD", query });
  const list = document.getElementById("graveyardList");
  const bulk = document.getElementById("graveyardBulk");
  bulk.innerHTML = "";
  list.innerHTML = "";

  if (!res || res.ok === false || !Array.isArray(res.entries)) {
    document.getElementById("graveyardTitle").textContent = "Graveyard";
    list.innerHTML = errorState("Couldn't read the Graveyard. Your archived tabs are still saved.");
    return;
  }

  const { entries, total } = res;
  document.getElementById("graveyardTitle").textContent = `Graveyard (${total})`;

  if (entries.length > 0) {
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "link-accent";
    restoreBtn.textContent = total > entries.length || entries.length > 50 ? "Restore 50" : "Restore all";
    restoreBtn.addEventListener("click", async () => {
      const r = await send({ type: "RESTORE_MANY", ids: entries.slice(0, 50).map((e) => e.id) });
      if (r && r.ok) {
        showToast(`Restored ${plural(r.opened, "tab")}`, { undo: false });
        window.Critter?.celebrate("restore");
      } else {
        showError("Couldn't restore those. They're still saved.");
      }
      refreshHeader();
      renderGraveyardPanel(query);
    });
    bulk.appendChild(restoreBtn);

    if (!query) {
      const clearBtn = document.createElement("button");
      clearBtn.className = "link-clay";
      clearBtn.textContent = "Clear all";
      clearBtn.addEventListener("click", async () => {
        if (!confirm(`Permanently delete all ${plural(total, "archived tab")}? This can't be undone.`)) return;
        await send({ type: "CLEAR_GRAVEYARD" });
        showToast("Graveyard cleared", { undo: false });
        renderGraveyardPanel(query);
      });
      bulk.appendChild(clearBtn);
    }
  }

  if (entries.length === 0) {
    list.innerHTML = emptyScene(
      "peek",
      query
        ? "No archived tabs match that search."
        : "Nothing archived yet. Archived tabs stay here until you bring them back or delete them yourself."
    );
    return;
  }

  for (const e of entries) {
    const row = buildTabRow({
      title: e.title,
      url: e.url,
      meta: new Date(e.archivedAt).toLocaleDateString(),
      actions: [
        {
          label: "Restore",
          icon: "up",
          onClick: async () => {
            const r = row.getBoundingClientRect();
            window.Critter?.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { up: true, n: 12, spread: 30 });
            window.Critter?.sfx.play("restore");
            await send({ type: "RESTORE_ENTRY", entryId: e.id });
            refreshHeader();
            renderGraveyardPanel(query);
          }
        },
        {
          label: "Delete",
          icon: "trash",
          variant: "danger",
          onClick: async () => {
            if (window.Critter) await window.Critter.fx.popRow(row);
            await send({ type: "DELETE_GRAVEYARD_ENTRY", entryId: e.id });
            renderGraveyardPanel(query);
          }
        }
      ]
    });
    list.appendChild(row);
  }

  if (total > entries.length) {
    const more = document.createElement("p");
    more.className = "empty-state";
    more.textContent = `Showing the newest ${entries.length} of ${total}. Search to find older ones.`;
    list.appendChild(more);
  }
}

// --- Settings panel ------------------------------------------------------------

const PREVIEW_THEMES = ["spring", "summer", "autumn", "winter"];

async function renderSettingsPanel() {
  const root = document.querySelector('[data-panel="settings"]');
  const settings = await send({ type: "GET_SETTINGS" });
  if (!settings || settings.ok === false) {
    root.innerHTML = errorState();
    return;
  }

  let selectedTheme = window.TidyThemes.normalize(settings.theme);
  // Season swatches animate when hovered: petals fall, glints twinkle, leaves drift, snow falls.
  const themeSwatches = window.TidyThemes.list
    .map((t) => {
      const prev = PREVIEW_THEMES.includes(t.id) ? `<span class="prev prev-${t.id}"><i></i><i></i><i></i><i></i><i></i><i></i></span>` : "";
      return `<button type="button" class="theme-swatch" data-theme-id="${t.id}" aria-pressed="${t.id === selectedTheme}"><span class="thumb-wrap"><img src="${window.TidyThemes.thumb(t.id)}" alt="" />${prev}</span><span>${t.label}</span></button>`;
    })
    .join("");

  root.innerHTML = `
    <div class="settings-body">
      <div class="field-row">
        <label class="field-label" for="thresholdInput">Nudge me past</label>
        <div class="field-combo">
          <input class="field-input" type="number" min="5" max="300" id="thresholdInput" value="${Number(settings.threshold)}" />
          <span class="unit">tabs</span>
        </div>
      </div>
      <div class="field-row">
        <label class="field-label" for="staleAmountInput">Idle after</label>
        <div class="field-combo">
          <input class="field-input field-input-combo" type="number" min="0.5" step="0.5" id="staleAmountInput" value="${Number(settings.staleAmount)}" />
          <select class="field-select" id="staleUnitInput">
            <option value="hours" ${settings.staleUnit === "hours" ? "selected" : ""}>hours</option>
            <option value="days" ${settings.staleUnit === "days" ? "selected" : ""}>days</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <label class="field-label">${ico("folder")}Auto-group by topic</label>
        <label class="switch"><input type="checkbox" id="autoGroupInput" ${settings.autoGroup ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-row">
        <label class="field-label">${ico("bell")}Playful notifications</label>
        <label class="switch"><input type="checkbox" id="playfulInput" ${settings.playfulNotifications ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-row">
        <button class="btn btn-outline btn-sm" id="testNotifyBtn" type="button">${ico("bell")}<span>Send a test notification</span></button>
      </div>
      <p class="hint hidden" id="notifyHint"></p>
      <div class="field-row">
        <label class="field-label">${ico("sparkle")}Pixel companion (Pip)</label>
        <label class="switch"><input type="checkbox" id="companionInput" ${settings.companion ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-row">
        <label class="field-label">${ico("sound")}Seasonal sounds</label>
        <label class="switch"><input type="checkbox" id="soundInput" ${settings.sound ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <p class="hint">Off by default. Each season has its own little chimes.</p>
      <div class="field-text-block">
        <label class="field-label">Theme</label>
        <div class="theme-grid" id="themeGrid">${themeSwatches}</div>
      </div>

      <hr class="divider" />

      <div class="field-row">
        <label class="field-label">${ico("box")}Auto-archive idle tabs on schedule</label>
        <label class="switch"><input type="checkbox" id="autoCleanupInput" ${settings.autoCleanup ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-text-block">
        <label class="field-label" for="exceptionsInput">Never mark stale</label>
        <input class="field-text-input" type="text" id="exceptionsInput" maxlength="2000" placeholder="gmail.com, docs.google.com" value="${escapeHtml((settings.exceptionDomains || []).join(", "))}" />
      </div>

    </div>
  `;

  // Every change is saved the moment you make it, so there is no Save button to forget.
  // If a save ever fails, Pip says so in a toast.
  let saveQueue = Promise.resolve();

  function collectSettings() {
    return {
      threshold: Number(document.getElementById("thresholdInput").value) || 30,
      staleAmount: Number(document.getElementById("staleAmountInput").value) || 3,
      staleUnit: document.getElementById("staleUnitInput").value,
      autoGroup: document.getElementById("autoGroupInput").checked,
      playfulNotifications: document.getElementById("playfulInput").checked,
      companion: document.getElementById("companionInput").checked,
      sound: document.getElementById("soundInput").checked,
      theme: selectedTheme,
      autoCleanup: document.getElementById("autoCleanupInput").checked,
      exceptionDomains: document.getElementById("exceptionsInput").value
    };
  }

  function saveNow() {
    // One save at a time, in the order they were made.
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const res = await send({ type: "SET_SETTINGS", settings: collectSettings() });
      // Read the settings back, so "Saved" only appears if they really stuck.
      let stuck = false;
      if (res && res.ok && res.settings) {
        const back = await send({ type: "GET_SETTINGS" });
        stuck = !!back && back.ok !== false &&
          ["autoGroup", "playfulNotifications", "companion", "sound", "autoCleanup"].every((k) => back[k] === res.settings[k]);
      }
      if (stuck) {
        // Show what was actually saved (values are tidied up and kept in range).
        const s = res.settings;
        appSettings = s;
        document.getElementById("thresholdInput").value = s.threshold;
        document.getElementById("staleAmountInput").value = s.staleAmount;
        document.getElementById("exceptionsInput").value = s.exceptionDomains.join(", ");
        applyTheme(s.theme);
        window.Critter?.configure(s);
        refreshHeader();
      } else {
        showError("Couldn't save that setting. Please try again.");
      }
    });
    return saveQueue;
  }

  root.querySelector(".settings-body").addEventListener("change", (e) => {
    // Sound and companion take effect right away, so you can hear or see the change before it's even saved.
    if (e.target.id === "soundInput") window.Critter?.configure({ sound: e.target.checked });
    if (e.target.id === "companionInput") {
      appSettings = Object.assign({}, appSettings, { companion: e.target.checked });
      window.Critter?.configure({ companion: e.target.checked });
    }
    if (e.target.matches("input, select")) saveNow();
  });

  // Picking a theme previews it right away and saves it.
  document.getElementById("themeGrid").addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-swatch");
    if (!btn) return;
    selectedTheme = btn.dataset.themeId;
    document.querySelectorAll(".theme-swatch").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    applyTheme(selectedTheme);
    saveNow();
  });

  document.getElementById("testNotifyBtn").addEventListener("click", async () => {
    const hint = document.getElementById("notifyHint");
    const res = await send({ type: "TEST_NOTIFICATION" });
    hint.classList.remove("hidden");
    if (res && res.ok && res.level !== "denied") {
      window.Critter?.sfx.play("bell");
      hint.textContent = "Sent. If you don't see it, allow notifications for Google Chrome in your system settings (macOS: System Settings > Notifications > Google Chrome) and turn off Focus / Do Not Disturb.";
    } else if (res && res.level === "denied") {
      hint.textContent = "Chrome has notifications turned off for TidyStack. Allow them in Chrome's site and extension settings, then try again.";
    } else {
      hint.textContent = "Chrome wouldn't show the notification. Reload TidyStack from chrome://extensions and try again.";
    }
  });
}

// --- Tab switching ------------------------------------------------------------

const panelRenderers = {
  overview: renderOverviewPanel,
  duplicates: renderDuplicatesPanel,
  graveyard: () => {
    const input = document.getElementById("graveyardSearch");
    return renderGraveyardPanel(input ? input.value : undefined);
  },
  settings: renderSettingsPanel
};

let activeTab = "overview";

function renderActivePanel() {
  panelRenderers[activeTab]();
}

document.getElementById("tabsNav").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  activeTab = btn.dataset.tab;

  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".panel").forEach((p) => {
    const show = p.dataset.panel === activeTab;
    p.classList.toggle("hidden", !show);
    if (show) {
      p.classList.remove("panel-in");
      void p.offsetWidth;
      p.classList.add("panel-in");
    }
  });

  renderActivePanel();
});

// --- Init -----------------------------------------------------------------------

(async function init() {
  if (window.TidyPixel) window.TidyPixel.hydrate(document);
  const settings = await send({ type: "GET_SETTINGS" });
  appSettings = settings && settings.ok !== false ? settings : null;
  applyTheme(appSettings ? appSettings.theme : undefined);
  window.Critter?.configure(appSettings || {});
  await refreshHeader();
  await renderOverviewPanel();
})();

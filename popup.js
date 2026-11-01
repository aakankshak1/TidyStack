// ---- Tab Tamer popup (plain JS, no build step) ----

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function faviconFallback(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return "";
  }
}

function formatIdle(ms) {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// --- Theme -----------------------------------------------------------------

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") return root.classList.add("dark");
  if (theme === "light") return root.classList.remove("dark");
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  root.classList.toggle("dark", mql.matches);
}

// --- Tab row builder ---------------------------------------------------------

function buildTabRow({ title, url, faviconUrl, meta, idleMs, onOpen, actions }) {
  const row = document.createElement("div");
  row.className = "tab-row";

  const img = document.createElement("img");
  img.src = faviconUrl || faviconFallback(url);
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
      btn.textContent = a.label;
      btn.addEventListener("click", (e) => { e.stopPropagation(); a.onClick(); });
      actionsWrap.appendChild(btn);
    }
    row.appendChild(actionsWrap);
  }

  return row;
}

// --- Tab fan (signature element) --------------------------------------------

function renderFan(stats) {
  const el = document.getElementById("fanRow");
  el.innerHTML = "";

  if (!stats || stats.total === 0) {
    el.innerHTML = `<p class="fan-summary">Nothing to look at yet.</p>`;
    return;
  }

  el.innerHTML = `
    <div>
      <p class="fan-count">${stats.total} <span>tabs open</span></p>
    </div>
  `;
}

// --- Undo toast --------------------------------------------------------------

let undoTimeout = null;

function showUndo(message) {
  const toast = document.getElementById("undoToast");
  document.getElementById("undoMessage").textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => toast.classList.add("hidden"), 5000);
}

document.getElementById("undoBtn").addEventListener("click", async () => {
  await send({ type: "UNDO_LAST" });
  document.getElementById("undoToast").classList.add("hidden");
  refreshHeader();
  renderActivePanel();
});

// --- Header / fan refresh -----------------------------------------------------

async function refreshHeader() {
  const [stats] = await Promise.all([
    send({ type: "GET_GUILT_STATS" })
  ]);
  renderFan(stats);
}

// --- Overview panel ------------------------------------------------------------

async function renderOverviewPanel() {
  const root = document.querySelector('[data-panel="overview"]');
  root.innerHTML = `
    <div class="panel-actions">
      <button class="btn btn-outline btn-sm flex-1" id="groupBtn">Group by topic</button>
      <button class="btn btn-outline btn-sm flex-1" id="ungroupBtn">Ungroup all</button>
    </div>
    <div class="section-header">
      <h2 class="section-title">Idle tabs</h2>
      <div class="section-links" id="overviewBulk"></div>
    </div>
    <div class="list-scroll" id="overviewList">
      <p class="empty-state">Looking at your tabs…</p>
    </div>
  `;

  document.getElementById("groupBtn").addEventListener("click", async (e) => {
    e.target.textContent = "Grouping…";
    await send({ type: "GROUP_BY_TOPIC" });
    e.target.textContent = "Group by topic";
    refreshHeader();
    renderOverviewPanel();
  });
  document.getElementById("ungroupBtn").addEventListener("click", async (e) => {
    e.target.textContent = "Ungrouping…";
    await send({ type: "UNGROUP_ALL" });
    e.target.textContent = "Ungroup all";
    refreshHeader();
    renderOverviewPanel();
  });

  const report = await send({ type: "GET_REPORT" });
  const tabs = report.tabs.filter((t) => t.isStale).sort((a, b) => b.idleMs - a.idleMs);

  const list = document.getElementById("overviewList");
  const bulk = document.getElementById("overviewBulk");
  bulk.innerHTML = "";
  list.innerHTML = "";

  if (tabs.length === 0) {
    list.innerHTML = `<p class="empty-state">Nothing idle right now. Nicely kept.</p>`;
    return;
  }

  const archiveAllBtn = document.createElement("button");
  archiveAllBtn.className = "link-accent";
  archiveAllBtn.textContent = "Archive all";
  archiveAllBtn.addEventListener("click", () => bulkAction(tabs.map((t) => t.id), "archive", `Archived ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`));
  bulk.appendChild(archiveAllBtn);

  const closeAllBtn = document.createElement("button");
  closeAllBtn.className = "link-clay";
  closeAllBtn.textContent = "Close all";
  closeAllBtn.addEventListener("click", () => bulkAction(tabs.map((t) => t.id), "close", `Closed ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`));
  bulk.appendChild(closeAllBtn);

  for (const t of tabs) {
    const row = buildTabRow({
      title: t.title,
      url: t.url,
      faviconUrl: t.faviconUrl,
      meta: t.topic,
      idleMs: t.idleMs,
      onOpen: () => send({ type: "GO_TO_TAB", tabId: t.id }),
      actions: [
        { label: "Archive", onClick: () => rowAction(row, t.id, "archive", `Archived "${t.title}"`) },
        { label: "Close", variant: "danger", onClick: () => rowAction(row, t.id, "close", `Closed "${t.title}"`) }
      ]
    });
    list.appendChild(row);
  }

  async function rowAction(rowEl, tabId, kind, label) {
    rowEl.classList.add("exiting");
    setTimeout(async () => {
      if (kind === "archive") await send({ type: "ARCHIVE_TABS", tabIds: [tabId], reason: "manual" });
      else await send({ type: "CLOSE_TABS", tabIds: [tabId] });
      showUndo(label);
      refreshHeader();
      renderOverviewPanel();
    }, 260);
  }

  async function bulkAction(tabIds, kind, label) {
    if (kind === "archive") await send({ type: "ARCHIVE_TABS", tabIds, reason: "manual" });
    else await send({ type: "CLOSE_TABS", tabIds });
    showUndo(label);
    refreshHeader();
    renderOverviewPanel();
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

  if (groups.length === 0) {
    list.innerHTML = `
      <div class="empty-state-icon">
        <svg width="38" height="34" viewBox="0 0 38 34">
          <rect x="4" y="8" width="20" height="20" rx="3" fill="none" stroke="rgb(var(--text-muted))" stroke-width="1.6" />
          <rect x="14" y="4" width="20" height="20" rx="3" fill="rgb(var(--bg))" stroke="rgb(var(--text-muted))" stroke-width="1.6" />
          <path d="M20 13 L23 16 L29 9" fill="none" stroke="rgb(var(--accent))" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <p class="empty-state-text">No duplicate tabs right now.</p>
    `;
    return;
  }

  for (const g of groups) {
    const card = document.createElement("div");
    card.className = "dup-card";
    card.innerHTML = `
      <div class="dup-card-head">
        <img src="${faviconFallback(g.tabs[0].url)}" alt="" />
        <span>${escapeHtml(g.tabs[0].title)}</span>
        <span class="badge badge-clay">${g.tabs.length}×</span>
      </div>
      <div class="dup-card-actions">
        <button class="btn btn-outline btn-sm" data-keep="newest">Keep newest</button>
        <button class="btn btn-outline btn-sm" data-keep="oldest">Keep oldest</button>
      </div>
    `;
    card.querySelectorAll("[data-keep]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await send({ type: "RESOLVE_DUPLICATES", groups: [g.normalizedUrl], keep: btn.dataset.keep });
        showUndo(`Merged ${g.tabs.length} duplicate tabs`);
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
        <input class="search-input" id="graveyardSearch" placeholder="Search archived tabs…" />
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

  const entries = await send({ type: "GET_GRAVEYARD", query });
  document.getElementById("graveyardTitle").textContent = `Graveyard (${entries.length})`;

  const bulk = document.getElementById("graveyardBulk");
  bulk.innerHTML = "";
  if (entries.length > 0) {
    const btn = document.createElement("button");
    btn.className = "link-accent";
    btn.textContent = "Restore all";
    btn.addEventListener("click", async () => {
      const count = entries.length;
      await send({ type: "RESTORE_ALL" });
      showUndo(`Restored ${count} tab${count === 1 ? "" : "s"}`);
      refreshHeader();
      renderGraveyardPanel(query);
    });
    bulk.appendChild(btn);
  }

  const list = document.getElementById("graveyardList");
  list.innerHTML = "";

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="empty-state-icon">
        <svg width="40" height="34" viewBox="0 0 40 34">
          <path d="M8 33 V16 A12 12 0 0 1 32 16 V33" fill="none" stroke="rgb(var(--text-muted))" stroke-width="1.6" />
          <line x1="4" y1="33" x2="36" y2="33" stroke="rgb(var(--text-muted))" stroke-width="1.6" stroke-linecap="round" />
          <path d="M20 12 V4 M16 7 L20 4 L24 7" fill="none" stroke="rgb(var(--accent))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <p class="empty-state-text">${
        query
          ? "No archived tabs match that search."
          : "Nothing archived yet. Archived tabs stay here until you bring them back -- nothing is ever deleted."
      }</p>
    `;
    return;
  }

  for (const e of entries) {
    const row = buildTabRow({
      title: e.title,
      url: e.url,
      faviconUrl: e.faviconUrl,
      meta: new Date(e.archivedAt).toLocaleDateString(),
      actions: [
        {
          label: "Restore",
          onClick: async () => {
            await send({ type: "RESTORE_ENTRY", entryId: e.id });
            renderGraveyardPanel(query);
          }
        }
      ]
    });
    list.appendChild(row);
  }
}

// --- Settings panel ------------------------------------------------------------

async function renderSettingsPanel() {
  const root = document.querySelector('[data-panel="settings"]');
  const settings = await send({ type: "GET_SETTINGS" });

  root.innerHTML = `
    <div class="settings-body">
      <div class="field-row">
        <label class="field-label">Nudge me past</label>
        <input class="field-input" type="number" min="5" max="300" id="thresholdInput" value="${settings.threshold}" />
      </div>
      <div class="field-row">
        <label class="field-label">Idle after</label>
        <div class="field-combo">
          <input class="field-input field-input-combo" type="number" min="0.5" step="0.5" id="staleAmountInput" value="${settings.staleAmount}" />
          <select class="field-select" id="staleUnitInput">
            <option value="hours" ${settings.staleUnit === "hours" ? "selected" : ""}>hours</option>
            <option value="days" ${settings.staleUnit === "days" ? "selected" : ""}>days</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <label class="field-label">Auto-group by topic</label>
        <label class="switch"><input type="checkbox" id="autoGroupInput" ${settings.autoGroup ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-row">
        <label class="field-label">Playful notifications</label>
        <label class="switch"><input type="checkbox" id="playfulInput" ${settings.playfulNotifications ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-row">
        <label class="field-label">Theme</label>
        <select class="field-select" id="themeInput">
          <option value="system" ${settings.theme === "system" ? "selected" : ""}>Match system</option>
          <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
          <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
        </select>
      </div>

      <hr class="divider" />

      <div class="field-row">
        <label class="field-label">Auto-archive idle tabs on schedule</label>
        <label class="switch"><input type="checkbox" id="autoCleanupInput" ${settings.autoCleanup ? "checked" : ""}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="field-text-block">
        <label class="field-label">Never mark stale</label>
        <input class="field-text-input" type="text" id="exceptionsInput" placeholder="gmail.com, docs.google.com" value="${escapeHtml((settings.exceptionDomains || []).join(", "))}" />
      </div>

      <div class="save-row">
        <button class="btn btn-default btn-sm" id="saveSettingsBtn">Save changes</button>
      </div>
    </div>
  `;

  document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
    const newSettings = {
      threshold: Number(document.getElementById("thresholdInput").value) || 30,
      staleAmount: Number(document.getElementById("staleAmountInput").value) || 3,
      staleUnit: document.getElementById("staleUnitInput").value,
      autoGroup: document.getElementById("autoGroupInput").checked,
      playfulNotifications: document.getElementById("playfulInput").checked,
      theme: document.getElementById("themeInput").value,
      autoCleanup: document.getElementById("autoCleanupInput").checked,
      exceptionDomains: document.getElementById("exceptionsInput").value.split(",").map((s) => s.trim()).filter(Boolean)
    };
    await send({ type: "SET_SETTINGS", settings: newSettings });
    applyTheme(newSettings.theme);
    const btn = document.getElementById("saveSettingsBtn");
    btn.textContent = "Saved";
    setTimeout(() => { btn.textContent = "Save changes"; }, 1500);
  });
}

// --- Tab switching ------------------------------------------------------------

const panelRenderers = {
  overview: renderOverviewPanel,
  duplicates: renderDuplicatesPanel,
  graveyard: () => renderGraveyardPanel(),
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
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== activeTab));

  renderActivePanel();
});

// --- Init -----------------------------------------------------------------------

(async function init() {
  const settings = await send({ type: "GET_SETTINGS" });
  applyTheme(settings.theme);
  await refreshHeader();
  await renderOverviewPanel();
})();

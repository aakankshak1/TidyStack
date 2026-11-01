function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function formatIdle(ms) {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / 60000)}m idle`;
  if (hours < 24) return `${hours.toFixed(1)}h idle`;
  return `${(hours / 24).toFixed(1)}d idle`;
}

function faviconFor(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return "";
  }
}

let currentStaleIds = [];

async function refresh() {
  const staleListEl = document.getElementById("staleList");
  staleListEl.innerHTML = `<p class="empty-state">Checking for stale tabs…</p>`;

  const report = await send({ type: "GET_REPORT" });
  const { tabs, totalCount } = report;

  document.getElementById("totalCount").textContent = totalCount;
  const threshold = report.settings.threshold;
  document.getElementById("subtitle").textContent =
    totalCount >= threshold
      ? `${totalCount} tabs — over your limit of ${threshold}`
      : `${totalCount} tabs open`;

  const stale = tabs.filter(t => t.isStale).sort((a, b) => b.idleMs - a.idleMs);
  currentStaleIds = stale.map(t => t.id);

  if (stale.length === 0) {
    staleListEl.innerHTML = `<p class="empty-state">No stale tabs — nice and tidy. 🎉</p>`;
    return;
  }

  staleListEl.innerHTML = "";
  for (const tab of stale) {
    const row = document.createElement("div");
    row.className = "tab-row";
    row.innerHTML = `
      <img class="tab-favicon" src="${faviconFor(tab.url)}" />
      <div class="tab-info" data-tabid="${tab.id}">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-meta">${formatIdle(tab.idleMs)} · ${escapeHtml(tab.topic)}</div>
      </div>
      <div class="tab-row-actions">
        <button data-action="bookmark" data-tabid="${tab.id}">Save</button>
        <button data-action="close" data-tabid="${tab.id}" class="danger">✕</button>
      </div>
    `;
    staleListEl.appendChild(row);
  }

  staleListEl.querySelectorAll(".tab-info").forEach(el => {
    el.addEventListener("click", async () => {
      await send({ type: "GO_TO_TAB", tabId: Number(el.dataset.tabid) });
      window.close();
    });
  });

  staleListEl.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tabId = Number(btn.dataset.tabid);
      if (btn.dataset.action === "bookmark") {
        await send({ type: "BOOKMARK_AND_CLOSE", tabIds: [tabId] });
      } else {
        await send({ type: "CLOSE_TABS", tabIds: [tabId] });
      }
      refresh();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("refreshBtn").addEventListener("click", refresh);

document.getElementById("groupBtn").addEventListener("click", async () => {
  const btn = document.getElementById("groupBtn");
  btn.textContent = "Grouping…";
  await send({ type: "GROUP_BY_TOPIC" });
  btn.textContent = "🧩 Group by topic";
  refresh();
});

document.getElementById("ungroupBtn").addEventListener("click", async () => {
  const btn = document.getElementById("ungroupBtn");
  btn.textContent = "Ungrouping…";
  await send({ type: "UNGROUP_ALL" });
  btn.textContent = "↩️ Ungroup all";
  refresh();
});

document.getElementById("bookmarkAllBtn").addEventListener("click", async () => {
  if (currentStaleIds.length === 0) return;
  await send({ type: "BOOKMARK_AND_CLOSE", tabIds: currentStaleIds });
  refresh();
});

document.getElementById("closeAllBtn").addEventListener("click", async () => {
  if (currentStaleIds.length === 0) return;
  if (!confirm(`Close ${currentStaleIds.length} stale tabs? (They won't be saved.)`)) return;
  await send({ type: "CLOSE_TABS", tabIds: currentStaleIds });
  refresh();
});

// --- Settings panel ---

const settingsPanel = document.getElementById("settingsPanel");
document.getElementById("settingsToggle").addEventListener("click", async () => {
  settingsPanel.classList.toggle("hidden");
  if (!settingsPanel.classList.contains("hidden")) {
    const settings = await send({ type: "GET_SETTINGS" });
    document.getElementById("thresholdInput").value = settings.threshold;
    document.getElementById("staleHoursInput").value = settings.staleHours;
    document.getElementById("autoGroupInput").checked = settings.autoGroup;
  }
});

document.getElementById("saveSettings").addEventListener("click", async () => {
  const settings = {
    threshold: Number(document.getElementById("thresholdInput").value) || 30,
    staleHours: Number(document.getElementById("staleHoursInput").value) || 3,
    autoGroup: document.getElementById("autoGroupInput").checked
  };
  await send({ type: "SET_SETTINGS", settings });
  settingsPanel.classList.add("hidden");
  refresh();
});

refresh();

// ---- Tab Tamer background service worker ----

const STORAGE_KEY = "tabLastActive";     // { [tabId]: timestampMs }
const SETTINGS_KEY = "tabTamerSettings"; // { threshold, staleHours, autoGroup }

const DEFAULT_SETTINGS = {
  threshold: 30,      // trigger notification once this many tabs are open
  staleHours: 3,      // a tab is "stale" if untouched for this many hours
  autoGroup: true      // auto-group by domain when threshold is hit
};

// --- Helpers -----------------------------------------------------------

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

async function getActivityMap() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function setActivityMap(map) {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

async function touchTab(tabId) {
  const map = await getActivityMap();
  map[tabId] = Date.now();
  await setActivityMap(map);
}

async function pruneClosedTabs() {
  const map = await getActivityMap();
  const openTabs = await chrome.tabs.query({});
  const openIds = new Set(openTabs.map(t => String(t.id)));
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!openIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) await setActivityMap(map);
}

// Extract a rough "topic" key from a URL: use the registrable domain.
function topicKeyForUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    // Keep last two parts for most domains (e.g. github.com, notion.so)
    return parts.length > 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return "other";
  }
}

function prettyTopicName(key) {
  const name = key.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// --- Core: gather tab info with staleness -------------------------------

async function getTabReport() {
  const settings = await getSettings();
  const map = await getActivityMap();
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const staleMs = settings.staleHours * 60 * 60 * 1000;

  const report = tabs
    .filter(t => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://"))
    .map(t => {
      const last = map[t.id] || now; // unseen tabs assumed fresh at first scan
      return {
        id: t.id,
        title: t.title || t.url,
        url: t.url,
        pinned: t.pinned,
        groupId: t.groupId,
        lastActive: last,
        idleMs: now - last,
        isStale: !t.pinned && (now - last) > staleMs,
        topic: topicKeyForUrl(t.url)
      };
    });

  return { tabs: report, settings, totalCount: tabs.length };
}

// --- Grouping by topic ---------------------------------------------------

async function groupTabsByTopic() {
  const { tabs } = await getTabReport();

  // Bucket tabs by (windowId, topic) so grouping NEVER moves tabs
  // across windows -- each window is grouped independently.
  const byWindowTopic = {}; // { [windowId]: { [topic]: [tabId, ...] } }
  const tabIdToWindowId = {};
  const rawTabs = await chrome.tabs.query({});
  for (const t of rawTabs) tabIdToWindowId[t.id] = t.windowId;

  for (const t of tabs) {
    if (t.pinned) continue;
    const windowId = tabIdToWindowId[t.id];
    if (windowId == null) continue;
    (byWindowTopic[windowId] ||= {});
    (byWindowTopic[windowId][t.topic] ||= []).push(t.id);
  }

  const existingGroups = await chrome.tabGroups.query({});
  // Track existing group titles PER WINDOW, since group titles can repeat across windows.
  const titleToGroupIdByWindow = {};
  for (const g of existingGroups) {
    (titleToGroupIdByWindow[g.windowId] ||= {});
    titleToGroupIdByWindow[g.windowId][g.title] = g.id;
  }

  const colors = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  let colorIdx = 0;
  let topicCount = 0;

  for (const [windowId, byTopic] of Object.entries(byWindowTopic)) {
    const winIdNum = Number(windowId);
    for (const [topic, tabIds] of Object.entries(byTopic)) {
      if (tabIds.length < 2) continue; // don't bother grouping lone tabs
      topicCount++;
      const label = prettyTopicName(topic);
      const existingForWindow = titleToGroupIdByWindow[winIdNum] || {};
      try {
        if (existingForWindow[label] != null) {
          // groupId alone is enough here -- tabs already live in this window
          await chrome.tabs.group({ tabIds, groupId: existingForWindow[label] });
        } else {
          // Pin the new group to THIS window explicitly so nothing migrates
          const groupId = await chrome.tabs.group({
            tabIds,
            createProperties: { windowId: winIdNum }
          });
          await chrome.tabGroups.update(groupId, {
            title: label,
            color: colors[colorIdx % colors.length]
          });
          colorIdx++;
        }
      } catch (e) {
        console.warn("Group failed for", topic, "in window", windowId, e);
      }
    }
  }
  return { topicCount, windowCount: Object.keys(byWindowTopic).length };
}

async function ungroupAllTabs() {
  const groups = await chrome.tabGroups.query({});
  for (const g of groups) {
    const tabsInGroup = await chrome.tabs.query({ groupId: g.id });
    const tabIds = tabsInGroup.map(t => t.id);
    if (tabIds.length) await chrome.tabs.ungroup(tabIds);
  }
  return groups.length;
}

// --- Stale tab actions ----------------------------------------------------

async function bookmarkAndCloseTabs(tabIds) {
  const tabs = await Promise.all(tabIds.map(id => chrome.tabs.get(id).catch(() => null)));
  const folder = await getOrCreateStaleFolder();
  for (const t of tabs) {
    if (!t) continue;
    await chrome.bookmarks.create({ parentId: folder.id, title: t.title, url: t.url });
  }
  await chrome.tabs.remove(tabIds.filter(Boolean));
}

async function closeTabs(tabIds) {
  await chrome.tabs.remove(tabIds.filter(Boolean));
}

let staleFolderId = null;
async function getOrCreateStaleFolder() {
  if (staleFolderId) {
    try {
      const [existing] = await chrome.bookmarks.get(staleFolderId);
      if (existing) return existing;
    } catch {
      staleFolderId = null;
    }
  }
  const dateLabel = new Date().toLocaleDateString();
  const results = await chrome.bookmarks.search({ title: "Tab Tamer" });
  let root = results.find(r => !r.url);
  if (!root) {
    root = await chrome.bookmarks.create({ title: "Tab Tamer" });
  }
  const folder = await chrome.bookmarks.create({
    parentId: root.id,
    title: `Stale tabs — ${dateLabel}`
  });
  staleFolderId = folder.id;
  return folder;
}

// --- Threshold check + notification --------------------------------------

async function checkThreshold() {
  const { tabs, settings, totalCount } = await getTabReport();
  const staleCount = tabs.filter(t => t.isStale).length;

  if (totalCount >= settings.threshold) {
    const data = await chrome.storage.local.get("lastNotifiedCount");
    if (data.lastNotifiedCount !== totalCount) {
      chrome.notifications.create("tab-tamer-threshold", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Whoa, that's a lot of tabs",
        message: `You have ${totalCount} tabs open (${staleCount} look stale). Click the Tab Tamer icon to clean up.`,
        priority: 1
      });
      await chrome.storage.local.set({ lastNotifiedCount: totalCount });
    }
    if (settings.autoGroup) {
      await groupTabsByTopic();
    }
  }
}

// --- Event wiring ---------------------------------------------------------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await touchTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete") await touchTab(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getActivityMap();
  delete map[tabId];
  await setActivityMap(map);
});

chrome.alarms.create("periodicCheck", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicCheck") {
    await pruneClosedTabs();
    await checkThreshold();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const map = await getActivityMap();
  const now = Date.now();
  for (const t of tabs) {
    if (!(t.id in map)) map[t.id] = now;
  }
  await setActivityMap(map);
});

// --- Message API for popup -------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "GET_REPORT": {
        const report = await getTabReport();
        sendResponse(report);
        break;
      }
      case "GROUP_BY_TOPIC": {
        const result = await groupTabsByTopic();
        sendResponse({ ok: true, groups: result.topicCount, windows: result.windowCount });
        break;
      }
      case "UNGROUP_ALL": {
        const count = await ungroupAllTabs();
        sendResponse({ ok: true, groups: count });
        break;
      }
      case "CLOSE_TABS": {
        await closeTabs(msg.tabIds);
        sendResponse({ ok: true });
        break;
      }
      case "BOOKMARK_AND_CLOSE": {
        await bookmarkAndCloseTabs(msg.tabIds);
        sendResponse({ ok: true });
        break;
      }
      case "GET_SETTINGS": {
        sendResponse(await getSettings());
        break;
      }
      case "SET_SETTINGS": {
        await chrome.storage.local.set({ [SETTINGS_KEY]: msg.settings });
        sendResponse({ ok: true });
        break;
      }
      case "GO_TO_TAB": {
        await chrome.tabs.update(msg.tabId, { active: true });
        const tab = await chrome.tabs.get(msg.tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message type" });
    }
  })();
  return true; // keep the message channel open for async sendResponse
});

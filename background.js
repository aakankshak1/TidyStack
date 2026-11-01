// ---- Tab Tamer background service worker (plain JS, no build step) ----

const SETTINGS_KEY = "tabTamerSettings";
const ACTIVITY_KEY = "tabTamerActivity";
const GRAVEYARD_KEY = "tabTamerGraveyard";
const UNDO_KEY = "tabTamerUndoStack";
const MAX_UNDO = 10;

const DEFAULT_SETTINGS = {
  threshold: 30,
  staleAmount: 3,
  staleUnit: "days", // "days" | "hours"
  autoGroup: true,
  playfulNotifications: true,
  theme: "system",
  autoCleanup: false,
  exceptionDomains: []
};

// --- Settings -------------------------------------------------------------

async function getSettings() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    const stored = data[SETTINGS_KEY];
    if (!stored || typeof stored !== "object") return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    // Migrate from the older single-unit "staleDays" field, if present.
    if (stored.staleDays != null && stored.staleAmount == null) {
      merged.staleAmount = stored.staleDays;
      merged.staleUnit = "days";
    }
    return merged;
  } catch (e) {
    console.warn("Tab Tamer: settings read failed, using defaults", e);
    return { ...DEFAULT_SETTINGS };
  }
}

async function setSettings(settings) {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch (e) {
    console.warn("Tab Tamer: settings write failed", e);
  }
}

// --- Activity tracking ------------------------------------------------------

async function getActivityMap() {
  try {
    const data = await chrome.storage.local.get(ACTIVITY_KEY);
    const map = data[ACTIVITY_KEY];
    return map && typeof map === "object" ? map : {};
  } catch (e) {
    console.warn("Tab Tamer: activity read failed, resetting", e);
    return {};
  }
}

async function setActivityMap(map) {
  try {
    await chrome.storage.local.set({ [ACTIVITY_KEY]: map });
  } catch (e) {
    console.warn("Tab Tamer: activity write failed", e);
  }
}

async function touchTab(tabId) {
  const map = await getActivityMap();
  const now = Date.now();
  const existing = map[tabId];
  map[String(tabId)] = { firstSeen: existing?.firstSeen ?? now, lastActive: now };
  await setActivityMap(map);
}

async function forgetTab(tabId) {
  const map = await getActivityMap();
  delete map[String(tabId)];
  await setActivityMap(map);
}

async function pruneClosedTabs() {
  const map = await getActivityMap();
  const openTabs = await chrome.tabs.query({});
  const openIds = new Set(openTabs.map((t) => String(t.id)));
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!openIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) await setActivityMap(map);
}

function topicKeyForUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return "other";
  }
}

function prettyTopicName(key) {
  const name = key.split(".")[0] || key;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const stripParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "ref", "source"
    ];
    stripParams.forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.hostname}${path}${u.search}`;
  } catch {
    return url;
  }
}

function isEligibleUrl(url) {
  if (!url) return false;
  return !/^(chrome|edge|about|chrome-extension):/i.test(url);
}

async function getTabReport(settingsOverride) {
  const settings = settingsOverride ?? (await getSettings());
  const map = await getActivityMap();
  const now = Date.now();
  const staleMs = settings.staleUnit === "hours"
    ? settings.staleAmount * 60 * 60 * 1000
    : settings.staleAmount * 24 * 60 * 60 * 1000;
  const exceptions = settings.exceptionDomains ?? [];

  let rawTabs = [];
  try {
    rawTabs = await chrome.tabs.query({});
  } catch (e) {
    console.warn("Tab Tamer: tabs.query failed", e);
    return { tabs: [], settings, totalCount: 0 };
  }

  const eligible = rawTabs.filter((t) => !t.incognito && isEligibleUrl(t.url));

  const tabs = eligible.map((t) => {
    const record = map[String(t.id)];
    const lastActive = record?.lastActive ?? now;
    const topic = topicKeyForUrl(t.url);
    const isException = exceptions.some((d) => topic === d || topic.endsWith("." + d));
    return {
      id: t.id,
      title: t.title || t.url || "Untitled tab",
      url: t.url,
      faviconUrl: t.favIconUrl || null,
      pinned: !!t.pinned,
      groupId: t.groupId ?? -1,
      windowId: t.windowId,
      lastActive,
      idleMs: now - lastActive,
      isStale: !t.pinned && !isException && now - lastActive > staleMs,
      isDiscarded: !!t.discarded,
      isPdf: (t.url || "").toLowerCase().endsWith(".pdf"),
      topic
    };
  });

  return { tabs, settings, totalCount: eligible.length };
}

async function getGuiltStats() {
  const { tabs } = await getTabReport();
  const map = await getActivityMap();
  const now = Date.now();

  const stale = tabs.filter((t) => t.isStale).length;

  const neverRevisited = tabs.filter((t) => {
    const rec = map[String(t.id)];
    if (!rec) return false;
    const oneDayMs = 24 * 60 * 60 * 1000;
    return rec.firstSeen === rec.lastActive && now - rec.firstSeen > oneDayMs;
  }).length;

  const seen = new Map();
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicates = [...seen.values()].filter((c) => c > 1).reduce((a, c) => a + c, 0);

  return { total: tabs.length, stale, duplicates, neverRevisited };
}

// --- Duplicates -------------------------------------------------------------

async function findDuplicates() {
  const { tabs } = await getTabReport();
  const byUrl = new Map();

  for (const t of tabs) {
    if (t.pinned) continue;
    const key = normalizeUrl(t.url);
    const list = byUrl.get(key) ?? [];
    list.push(t);
    byUrl.set(key, list);
  }

  const groups = [];
  for (const [normalizedUrl, group] of byUrl.entries()) {
    if (group.length > 1) groups.push({ normalizedUrl, tabs: group });
  }
  return groups.sort((a, b) => b.tabs.length - a.tabs.length);
}

function resolveDuplicateGroups(groups, keep) {
  const toClose = [];
  for (const group of groups) {
    const sorted = [...group.tabs].sort((a, b) =>
      keep === "newest" ? b.lastActive - a.lastActive : a.lastActive - b.lastActive
    );
    const [, ...rest] = sorted;
    toClose.push(...rest.map((t) => t.id));
  }
  return toClose;
}

// --- Graveyard (archive, never delete) --------------------------------------

async function getGraveyardAll() {
  try {
    const data = await chrome.storage.local.get(GRAVEYARD_KEY);
    const list = data[GRAVEYARD_KEY];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("Tab Tamer: graveyard read failed, treating as empty", e);
    return [];
  }
}

async function saveGraveyardAll(entries) {
  try {
    await chrome.storage.local.set({ [GRAVEYARD_KEY]: entries });
  } catch (e) {
    console.warn("Tab Tamer: graveyard write failed", e);
  }
}

async function archiveTabs(tabs, reason = "manual") {
  const entries = tabs.map((t) => ({
    id: crypto.randomUUID(),
    title: t.title,
    url: t.url,
    faviconUrl: t.faviconUrl,
    archivedAt: Date.now(),
    reason
  }));

  const all = await getGraveyardAll();
  await saveGraveyardAll([...entries, ...all]);

  try {
    await chrome.tabs.remove(tabs.map((t) => t.id));
  } catch (e) {
    console.warn("Tab Tamer: some tabs were already closed before archiving", e);
  }

  return entries;
}

async function searchGraveyard(query) {
  const all = await getGraveyardAll();
  if (!query || !query.trim()) return all;
  const q = query.trim().toLowerCase();
  return all.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
}

async function restoreEntry(entryId) {
  const all = await getGraveyardAll();
  const entry = all.find((e) => e.id === entryId);
  if (!entry) return null;
  try {
    await chrome.tabs.create({ url: entry.url, active: true });
  } catch (e) {
    console.warn("Tab Tamer: failed to reopen archived tab", e);
    return null;
  }
  await saveGraveyardAll(all.filter((e) => e.id !== entryId));
  return entry;
}

async function restoreAllEntries() {
  const all = await getGraveyardAll();
  const BATCH = 15;
  let opened = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    await Promise.all(
      batch.map((e) =>
        chrome.tabs.create({ url: e.url, active: false }).catch((err) => {
          console.warn("Tab Tamer: restore-all failed for one tab", err);
        })
      )
    );
    opened += batch.length;
  }
  await saveGraveyardAll([]);
  return opened;
}

async function deleteGraveyardEntry(entryId) {
  const all = await getGraveyardAll();
  await saveGraveyardAll(all.filter((e) => e.id !== entryId));
}

// --- Undo (session-scoped: clears on browser restart, on purpose) -----------

const undoStore = chrome.storage.session ?? chrome.storage.local;

async function getUndoStack() {
  try {
    const data = await undoStore.get(UNDO_KEY);
    const stack = data[UNDO_KEY];
    return Array.isArray(stack) ? stack : [];
  } catch (e) {
    console.warn("Tab Tamer: undo stack read failed", e);
    return [];
  }
}

async function saveUndoStack(stack) {
  try {
    await undoStore.set({ [UNDO_KEY]: stack.slice(0, MAX_UNDO) });
  } catch (e) {
    console.warn("Tab Tamer: undo stack write failed", e);
  }
}

async function pushUndo(action) {
  const stack = await getUndoStack();
  const entry = { ...action, id: crypto.randomUUID(), performedAt: Date.now() };
  await saveUndoStack([entry, ...stack]);
}

async function undoLast() {
  const stack = await getUndoStack();
  const [last, ...rest] = stack;
  if (!last) return { ok: false, message: "Nothing to undo." };

  try {
    if (last.type === "archive") {
      for (const id of last.payload) await restoreEntry(id);
    } else if (last.type === "close") {
      for (const t of last.payload) await chrome.tabs.create({ url: t.url, active: false });
    } else if (last.type === "group") {
      await chrome.tabs.ungroup(last.payload.filter(Boolean));
    } else if (last.type === "ungroup") {
      await saveUndoStack(rest);
      return { ok: false, message: "That grouping can't be restored automatically -- group again from the panel." };
    }
  } catch (e) {
    console.warn("Tab Tamer: undo failed", e);
    await saveUndoStack(rest);
    return { ok: false, message: "Couldn't undo that -- the tabs may have already changed." };
  }

  await saveUndoStack(rest);
  return { ok: true, message: `Undid: ${last.label}` };
}

// --- Grouping (per-window, never merges windows) -----------------------------

const GROUP_COLORS = ["blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple"];

async function groupTabsByTopic() {
  const { tabs } = await getTabReport();

  const byWindowTopic = {};
  for (const t of tabs) {
    if (t.pinned) continue;
    (byWindowTopic[t.windowId] ??= {});
    (byWindowTopic[t.windowId][t.topic] ??= []).push(t.id);
  }

  let existingGroups = [];
  try {
    existingGroups = await chrome.tabGroups.query({});
  } catch (e) {
    console.warn("Tab Tamer: tabGroups.query failed", e);
  }
  const titleToGroupIdByWindow = {};
  for (const g of existingGroups) {
    (titleToGroupIdByWindow[g.windowId] ??= {});
    if (g.title) titleToGroupIdByWindow[g.windowId][g.title] = g.id;
  }

  let colorIdx = 0;
  let topicCount = 0;
  const allGroupedTabIds = [];

  for (const [windowIdStr, byTopic] of Object.entries(byWindowTopic)) {
    const windowId = Number(windowIdStr);
    for (const [topic, tabIds] of Object.entries(byTopic)) {
      if (tabIds.length < 2) continue;
      topicCount++;
      const label = prettyTopicName(topic);
      const existingId = titleToGroupIdByWindow[windowId]?.[label];
      try {
        if (existingId != null) {
          await chrome.tabs.group({ tabIds, groupId: existingId });
        } else {
          const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
          await chrome.tabGroups.update(groupId, {
            title: label,
            color: GROUP_COLORS[colorIdx % GROUP_COLORS.length]
          });
          colorIdx++;
        }
        allGroupedTabIds.push(...tabIds);
      } catch (e) {
        console.warn("Tab Tamer: grouping failed for", topic, "in window", windowId, e);
      }
    }
  }

  if (allGroupedTabIds.length > 0) {
    await pushUndo({
      type: "group",
      label: `Grouped ${topicCount} topic${topicCount === 1 ? "" : "s"}`,
      payload: allGroupedTabIds
    });
  }

  return { topicCount, windowCount: Object.keys(byWindowTopic).length };
}

async function ungroupAllTabs() {
  let groups = [];
  try {
    groups = await chrome.tabGroups.query({});
  } catch (e) {
    console.warn("Tab Tamer: tabGroups.query failed", e);
    return 0;
  }
  for (const g of groups) {
    try {
      const tabsInGroup = await chrome.tabs.query({ groupId: g.id });
      const tabIds = tabsInGroup.map((t) => t.id).filter(Boolean);
      if (tabIds.length) await chrome.tabs.ungroup(tabIds);
    } catch (e) {
      console.warn("Tab Tamer: ungroup failed for group", g.id, e);
    }
  }
  return groups.length;
}

// --- Notifications ------------------------------------------------------------

const PLAYFUL_THRESHOLD_LINES = [
  (n) => `You've adopted ${n} tabs. They miss you.`,
  (n) => `${n} tabs and counting -- someone's popular.`,
  (n) => `Your tabs are starting a small retirement home. ${n} residents so far.`
];
const PLAIN_THRESHOLD_LINE = (n) => `You have ${n} tabs open.`;

const PLAYFUL_CLEANUP_LINES = [
  (n) => `Archived ${n} tab${n === 1 ? "" : "s"} that had officially graduated.`,
  (n) => `Tucked ${n} idle tab${n === 1 ? "" : "s"} into the Graveyard for you.`
];
const PLAIN_CLEANUP_LINE = (n) =>
  `Archived ${n} idle tab${n === 1 ? "" : "s"}. Nothing was deleted -- find it in the Graveyard.`;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function thresholdMessage(count, playful) {
  return playful ? pick(PLAYFUL_THRESHOLD_LINES)(count) : PLAIN_THRESHOLD_LINE(count);
}

function cleanupMessage(count, playful) {
  return playful ? pick(PLAYFUL_CLEANUP_LINES)(count) : PLAIN_CLEANUP_LINE(count);
}

async function notify(id, title, message) {
  try {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message,
      priority: 0
    });
  } catch (e) {
    console.warn("Tab Tamer: notification failed", e);
  }
}

// --- Event wiring --------------------------------------------------------------

chrome.tabs.onActivated.addListener(({ tabId }) => touchTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") touchTab(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((t) => t.id != null).map((t) => touchTab(t.id)));
});

chrome.alarms.create("periodicCheck", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "periodicCheck") return;
  await pruneClosedTabs();

  const settings = await getSettings();
  const { tabs, totalCount } = await getTabReport(settings);
  const staleTabs = tabs.filter((t) => t.isStale);

  if (totalCount >= settings.threshold) {
    const data = await chrome.storage.local.get("lastNotifiedCount");
    if (data.lastNotifiedCount !== totalCount) {
      await notify("tab-tamer-threshold", "Tab Tamer", thresholdMessage(totalCount, settings.playfulNotifications));
      await chrome.storage.local.set({ lastNotifiedCount: totalCount });
    }
    if (settings.autoGroup) await groupTabsByTopic();
  }

  if (settings.autoCleanup && staleTabs.length > 0) {
    const entries = await archiveTabs(
      staleTabs.map((t) => ({ id: t.id, title: t.title, url: t.url, faviconUrl: t.faviconUrl })),
      "auto-stale"
    );
    await pushUndo({
      type: "archive",
      label: `Auto-archived ${entries.length} idle tab${entries.length === 1 ? "" : "s"}`,
      payload: entries.map((e) => e.id)
    });
    await notify("tab-tamer-autocleanup", "Tab Tamer", cleanupMessage(entries.length, settings.playfulNotifications));
  }
});

// --- Message router --------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "GET_REPORT": {
        const settings = await getSettings();
        sendResponse(await getTabReport(settings));
        break;
      }
      case "GET_GUILT_STATS": {
        sendResponse(await getGuiltStats());
        break;
      }
      case "GROUP_BY_TOPIC": {
        sendResponse({ ok: true, ...(await groupTabsByTopic()) });
        break;
      }
      case "UNGROUP_ALL": {
        const count = await ungroupAllTabs();
        sendResponse({ ok: true, count });
        break;
      }
      case "GET_DUPLICATES": {
        sendResponse(await findDuplicates());
        break;
      }
      case "RESOLVE_DUPLICATES": {
        const allGroups = await findDuplicates();
        const groups = allGroups.filter((g) => msg.groups.includes(g.normalizedUrl));
        const tabIds = resolveDuplicateGroups(groups, msg.keep);
        const allOpenTabs = await chrome.tabs.query({});
        const closedTabs = allOpenTabs.filter((t) => tabIds.includes(t.id)).map((t) => ({ url: t.url }));
        await chrome.tabs.remove(tabIds);
        await pushUndo({
          type: "close",
          label: `Closed ${tabIds.length} duplicate tab${tabIds.length === 1 ? "" : "s"}`,
          payload: closedTabs
        });
        sendResponse({ ok: true, closed: tabIds.length });
        break;
      }
      case "ARCHIVE_TABS": {
        const tabsToArchive = await Promise.all(msg.tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
        const valid = tabsToArchive.filter(Boolean);
        const entries = await archiveTabs(
          valid.map((t) => ({ id: t.id, title: t.title || t.url || "Untitled tab", url: t.url, faviconUrl: t.favIconUrl || null })),
          msg.reason ?? "manual"
        );
        await pushUndo({
          type: "archive",
          label: `Archived ${entries.length} tab${entries.length === 1 ? "" : "s"}`,
          payload: entries.map((e) => e.id)
        });
        sendResponse({ ok: true, entries });
        break;
      }
      case "CLOSE_TABS": {
        const tabsToClose = await Promise.all(msg.tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
        const valid = tabsToClose.filter(Boolean);
        await chrome.tabs.remove(valid.map((t) => t.id));
        await pushUndo({
          type: "close",
          label: `Closed ${valid.length} tab${valid.length === 1 ? "" : "s"}`,
          payload: valid.map((t) => ({ url: t.url }))
        });
        sendResponse({ ok: true });
        break;
      }
      case "GET_GRAVEYARD": {
        sendResponse(await searchGraveyard(msg.query));
        break;
      }
      case "RESTORE_ENTRY": {
        const entry = await restoreEntry(msg.entryId);
        sendResponse({ ok: !!entry, entry });
        break;
      }
      case "RESTORE_ALL": {
        const count = await restoreAllEntries();
        sendResponse({ ok: true, count });
        break;
      }
      case "DELETE_GRAVEYARD_ENTRY": {
        await deleteGraveyardEntry(msg.entryId);
        sendResponse({ ok: true });
        break;
      }
      case "GET_UNDO_STACK": {
        sendResponse(await getUndoStack());
        break;
      }
      case "UNDO_LAST": {
        sendResponse(await undoLast());
        break;
      }
      case "GET_SETTINGS": {
        sendResponse(await getSettings());
        break;
      }
      case "SET_SETTINGS": {
        await setSettings(msg.settings);
        sendResponse({ ok: true });
        break;
      }
      case "GO_TO_TAB": {
        try {
          await chrome.tabs.update(msg.tabId, { active: true });
          const tab = await chrome.tabs.get(msg.tabId);
          await chrome.windows.update(tab.windowId, { focused: true });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: "That tab may have already closed." });
        }
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();
  return true;
});

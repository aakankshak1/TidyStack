// ---- TidyStack background service worker (plain JS, no build step) ----
"use strict";

// pixel.js draws Pip's picture for notifications (OffscreenCanvas, no files). It is optional polish:
// if it can't load, notifications simply use the normal icon.
try { importScripts("pixel.js"); } catch (e) { console.warn("TidyStack: pixel art unavailable", e); }

// The green TidyStack icon is painted onto the toolbar button every time the worker starts.
try {
  if (self.TidyPixel && self.TidyPixel.appIconData) {
    const imageData = {};
    for (const size of [16, 32, 48, 128]) imageData[size] = self.TidyPixel.appIconData(size);
    chrome.action.setIcon({ imageData }).catch(() => {});
  }
} catch (e) { console.warn("TidyStack: could not paint the toolbar icon", e); }

const SETTINGS_KEY = "tidyStackSettings";
const ACTIVITY_KEY = "tidyStackActivity";
const GRAVEYARD_KEY = "tidyStackGraveyard";
const UNDO_KEY = "tidyStackUndoStack";
const NUDGE_KEY = "tidyStackNudge";
const ACTIVE_BY_WINDOW_KEY = "tidyStackActiveByWindow";

// Before the rename, data was saved under the old product's name. These are the only places the
// old name still appears: they let existing settings and archived tabs carry over once.
const LEGACY_KEYS = { tabTamerSettings: SETTINGS_KEY, tabTamerGraveyard: GRAVEYARD_KEY };
const LEGACY_TEMPORARY_KEYS = ["tabTamerActivity", "tabTamerUndoStack"];

const MAX_UNDO = 10;
const MAX_IDS_PER_ACTION = 500;   // sanity cap on any single request from the popup
const RESTORE_CAP = 50;           // never open more than this many tabs in one click
const LIST_CAP = 200;             // the popup only ever renders this many graveyard rows
const RENUDGE_MS = 6 * 60 * 60 * 1000;
const THEMES = ["spring", "summer", "autumn", "winter", "light", "dark"];

const DEFAULT_SETTINGS = {
  threshold: 30,
  staleAmount: 3,
  staleUnit: "days", // "days" | "hours"
  autoGroup: true,
  playfulNotifications: true,
  companion: true,
  sound: false,
  theme: "spring",
  autoCleanup: false,
  exceptionDomains: []
};

// --- One-time move from the old storage names ---------------------------------
// Copies old data to the new names without overwriting anything already saved there, and only
// removes an old copy after the new one is written. Anything that reads settings or the
// Graveyard waits for this first, so nothing is ever read half-moved.
const migrated = (async function migrateLegacyData() {
  try {
    const legacyNames = Object.keys(LEGACY_KEYS);
    const found = await chrome.storage.local.get([...legacyNames, ...Object.values(LEGACY_KEYS), ...LEGACY_TEMPORARY_KEYS]);
    const toWrite = {};
    for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
      if (found[oldKey] !== undefined && found[newKey] === undefined) toWrite[newKey] = found[oldKey];
    }
    if (Object.keys(toWrite).length) await chrome.storage.local.set(toWrite);
    const copied = legacyNames.filter((oldKey) => LEGACY_KEYS[oldKey] in toWrite);
    const removable = [...copied, ...LEGACY_TEMPORARY_KEYS.filter((k) => found[k] !== undefined)];
    if (removable.length) await chrome.storage.local.remove(removable);
  } catch (e) {
    console.warn("TidyStack: could not move data from the old storage names", e);
  }
})();

// --- Small helpers ---------------------------------------------------------

// Serialises read-modify-write cycles on one storage key, so two events firing at the
// same moment (very common with many tabs) can't overwrite each other's changes.
const locks = new Map();
function withLock(name, fn) {
  const prev = locks.get(name) || Promise.resolve();
  const run = Promise.all([prev, migrated]).then(() => fn());
  locks.set(name, run.catch(() => {}));
  return run;
}

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const clip = (s, n) => String(s ?? "").slice(0, n);
const isIdList = (a) => Array.isArray(a) && a.length > 0 && a.length <= MAX_IDS_PER_ACTION && a.every(Number.isInteger);
const isStrList = (a) => Array.isArray(a) && a.length <= MAX_IDS_PER_ACTION && a.every((s) => typeof s === "string");

function normalizeDomains(input) {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const out = new Set();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const d = item.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
    if (d && /^[a-z0-9.-]+$/.test(d) && d.length <= 253) out.add(d);
    if (out.size >= 100) break;
  }
  return [...out];
}

// --- Settings -------------------------------------------------------------

function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    threshold: Math.round(clampNum(s.threshold, 5, 300, DEFAULT_SETTINGS.threshold)),
    staleAmount: clampNum(s.staleAmount, 0.5, 365, DEFAULT_SETTINGS.staleAmount),
    staleUnit: s.staleUnit === "hours" ? "hours" : "days",
    autoGroup: !!s.autoGroup,
    playfulNotifications: !!s.playfulNotifications,
    companion: !!s.companion,
    sound: !!s.sound,
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    autoCleanup: !!s.autoCleanup,
    exceptionDomains: normalizeDomains(s.exceptionDomains)
  };
}

async function getSettings() {
  try {
    await migrated;
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    const stored = data[SETTINGS_KEY];
    const merged = stored && typeof stored === "object" ? { ...stored } : {};
    // Migrate from the older single-unit "staleDays" field, if present.
    if (merged.staleDays != null && merged.staleAmount == null) {
      merged.staleAmount = merged.staleDays;
      merged.staleUnit = "days";
    }
    return sanitizeSettings(merged);
  } catch (e) {
    console.warn("TidyStack: settings read failed, using defaults", e);
    return sanitizeSettings(null);
  }
}

async function setSettings(raw) {
  const clean = sanitizeSettings(raw);
  await migrated;
  await chrome.storage.local.set({ [SETTINGS_KEY]: clean });
  return clean;
}

// --- Activity tracking ------------------------------------------------------
// Tab ids only live as long as the browser session, so records for closed tabs are
// pruned and any open tab without a record is given one the first time we see it.

async function getActivityMap() {
  try {
    const data = await chrome.storage.local.get(ACTIVITY_KEY);
    const map = data[ACTIVITY_KEY];
    return map && typeof map === "object" ? map : {};
  } catch (e) {
    console.warn("TidyStack: activity read failed", e);
    return {};
  }
}

async function setActivityMap(map) {
  try {
    await chrome.storage.local.set({ [ACTIVITY_KEY]: map });
  } catch (e) {
    console.warn("TidyStack: activity write failed", e);
  }
}

function touchTab(tabId) {
  return withLock("activity", async () => {
    const map = await getActivityMap();
    const now = Date.now();
    const existing = map[String(tabId)];
    if (existing && now - existing.lastActive < 5000) return; // no need to write on every blip
    map[String(tabId)] = { firstSeen: existing?.firstSeen ?? now, lastActive: now };
    await setActivityMap(map);
  });
}

function forgetTab(tabId) {
  return withLock("activity", async () => {
    const map = await getActivityMap();
    if (!(String(tabId) in map)) return;
    delete map[String(tabId)];
    await setActivityMap(map);
  });
}

function pruneClosedTabs() {
  return withLock("activity", async () => {
    const map = await getActivityMap();
    const openTabs = await chrome.tabs.query({});
    const openIds = new Set(openTabs.map((t) => String(t.id)));
    let changed = false;
    for (const id of Object.keys(map)) {
      if (!openIds.has(id)) { delete map[id]; changed = true; }
    }
    if (changed) await setActivityMap(map);
  });
}

// Gives every open tab a record (used on install and browser start).
function seedAllTabs() {
  return withLock("activity", async () => {
    const map = await getActivityMap();
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    let changed = false;
    for (const t of tabs) {
      if (t.id != null && !map[String(t.id)]) { map[String(t.id)] = { firstSeen: now, lastActive: now }; changed = true; }
    }
    if (changed) await setActivityMap(map);
  });
}

// --- URL helpers ---------------------------------------------------------------

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function topicKeyForUrl(url) {
  const host = hostOf(url);
  if (!host) return "other";
  if (/^[\d.]+$/.test(host) || host.includes(":")) return host; // IP address
  const parts = host.split(".");
  if (parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join("."); // bbc.co.uk, example.com.au
  }
  return parts.length > 2 ? parts.slice(-2).join(".") : host;
}

function prettyTopicName(key) {
  const name = key.split(".")[0] || key;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Only well-known tracking parameters. Generic ones like "ref" or "source" can change which page you get.
    const stripParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "igshid"
    ];
    stripParams.forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    // u.host keeps the port, so localhost:3000 and localhost:5173 are not mistaken for the same page.
    return `${u.host}${path}${u.search}`;
  } catch {
    return url;
  }
}

// Only real web/file pages are managed. Browser-internal pages are left alone.
function isEligibleUrl(url) {
  return typeof url === "string" && /^(https?|ftp|file):/i.test(url);
}
const isRestorableUrl = isEligibleUrl;

// --- Tab report ------------------------------------------------------------------

async function getTabReport(settingsOverride) {
  const settings = settingsOverride ?? (await getSettings());
  const now = Date.now();
  const staleMs = settings.staleUnit === "hours"
    ? settings.staleAmount * 60 * 60 * 1000
    : settings.staleAmount * 24 * 60 * 60 * 1000;
  const exceptions = settings.exceptionDomains;

  let rawTabs = [];
  try {
    rawTabs = await chrome.tabs.query({});
  } catch (e) {
    console.warn("TidyStack: tabs.query failed", e);
    return { tabs: [], totalCount: 0 };
  }

  const eligible = rawTabs.filter((t) => t.id != null && !t.incognito && isEligibleUrl(t.url));

  let map = await getActivityMap();
  if (eligible.some((t) => !map[String(t.id)])) {
    await withLock("activity", async () => {
      map = await getActivityMap();
      let changed = false;
      for (const t of eligible) {
        if (!map[String(t.id)]) { map[String(t.id)] = { firstSeen: now, lastActive: now }; changed = true; }
      }
      if (changed) await setActivityMap(map);
    });
  }

  const tabs = eligible.map((t) => {
    const record = map[String(t.id)];
    const inUse = !!t.active || !!t.audible; // what you're looking at or listening to is never idle
    const lastActive = inUse ? now : record?.lastActive ?? now;
    const host = hostOf(t.url);
    const isException = exceptions.some((d) => host === d || host.endsWith("." + d));
    return {
      id: t.id,
      title: t.title || t.url || "Untitled tab",
      url: t.url,
      pinned: !!t.pinned,
      groupId: t.groupId ?? -1,
      windowId: t.windowId,
      lastActive,
      idleMs: now - lastActive,
      isStale: !t.pinned && !inUse && !isException && now - lastActive > staleMs,
      topic: topicKeyForUrl(t.url)
    };
  });

  return { tabs, totalCount: eligible.length };
}

async function getGuiltStats() {
  const { tabs } = await getTabReport();
  const map = await getActivityMap();
  const now = Date.now();

  const stale = tabs.filter((t) => t.isStale).length;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const neverRevisited = tabs.filter((t) => {
    const rec = map[String(t.id)];
    return rec && rec.firstSeen === rec.lastActive && now - rec.firstSeen > oneDayMs;
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
    toClose.push(...rest);
  }
  return toClose;
}

// --- Graveyard (archive, never silently delete) ---------------------------------
// Reads throw on failure on purpose: if we can't read the graveyard we must not write
// over it with a partial list.

async function getGraveyardAll() {
  await migrated;
  const data = await chrome.storage.local.get(GRAVEYARD_KEY);
  const list = data[GRAVEYARD_KEY];
  return Array.isArray(list) ? list : [];
}

async function saveGraveyardAll(entries) {
  await chrome.storage.local.set({ [GRAVEYARD_KEY]: entries });
}

async function archiveTabs(tabs, reason = "manual") {
  const clean = tabs.filter((t) => t && Number.isInteger(t.id) && isEligibleUrl(t.url));
  if (clean.length === 0) return [];

  const entries = clean.map((t) => ({
    id: crypto.randomUUID(),
    title: clip(t.title || t.url, 300),
    url: t.url,
    archivedAt: Date.now(),
    reason: clip(reason, 30)
  }));

  // Save first. If saving fails this throws and the tabs stay open -- nothing is lost.
  await withLock("graveyard", async () => {
    const all = await getGraveyardAll();
    await saveGraveyardAll([...entries, ...all]);
  });

  try {
    await chrome.tabs.remove(clean.map((t) => t.id));
  } catch (e) {
    console.warn("TidyStack: some tabs were already closed before archiving", e);
  }
  return entries;
}

async function searchGraveyard(query) {
  const all = await getGraveyardAll();
  const q = clip(query, 200).trim().toLowerCase();
  const matches = q ? all.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)) : all;
  return { total: matches.length, entries: matches.slice(0, LIST_CAP) };
}

// Opens the chosen entries and removes only the ones that actually opened.
function restoreEntries(ids, { active = false, cap = RESTORE_CAP } = {}) {
  return withLock("graveyard", async () => {
    const all = await getGraveyardAll();
    const wanted = new Set(ids);
    const chosen = all.filter((e) => wanted.has(e.id)).slice(0, cap);
    const opened = new Set();
    for (const [i, e] of chosen.entries()) {
      if (!isRestorableUrl(e.url)) continue;
      try {
        await chrome.tabs.create({ url: e.url, active: active && i === chosen.length - 1 });
        opened.add(e.id);
      } catch (err) {
        console.warn("TidyStack: failed to reopen an archived tab", err);
      }
    }
    if (opened.size) await saveGraveyardAll(all.filter((e) => !opened.has(e.id)));
    return { opened: opened.size, remaining: all.length - opened.size };
  });
}

function deleteGraveyardEntry(entryId) {
  return withLock("graveyard", async () => {
    const all = await getGraveyardAll();
    await saveGraveyardAll(all.filter((e) => e.id !== entryId));
  });
}

function clearGraveyard() {
  return withLock("graveyard", async () => {
    const all = await getGraveyardAll();
    await saveGraveyardAll([]);
    return all.length;
  });
}

// --- Undo (session-scoped: clears on browser restart, on purpose) -----------

const undoStore = chrome.storage.session ?? chrome.storage.local;

async function getUndoStack() {
  try {
    const data = await undoStore.get(UNDO_KEY);
    const stack = data[UNDO_KEY];
    return Array.isArray(stack) ? stack : [];
  } catch (e) {
    console.warn("TidyStack: undo stack read failed", e);
    return [];
  }
}

async function saveUndoStack(stack) {
  try {
    await undoStore.set({ [UNDO_KEY]: stack.slice(0, MAX_UNDO) });
  } catch (e) {
    console.warn("TidyStack: undo stack write failed", e);
  }
}

function pushUndo(action) {
  return withLock("undo", async () => {
    const stack = await getUndoStack();
    await saveUndoStack([{ ...action, id: crypto.randomUUID(), performedAt: Date.now() }, ...stack]);
  });
}

function undoLast() {
  return withLock("undo", async () => {
    const stack = await getUndoStack();
    const [last, ...rest] = stack;
    if (!last) return { ok: false, message: "Nothing to undo." };

    try {
      if (last.type === "archive") {
        await restoreEntries(last.payload, { active: false, cap: Infinity });
      } else if (last.type === "close") {
        for (const t of last.payload) {
          if (isRestorableUrl(t.url)) await chrome.tabs.create({ url: t.url, active: false });
        }
      } else if (last.type === "group") {
        await chrome.tabs.ungroup(last.payload.filter(Boolean));
      }
    } catch (e) {
      console.warn("TidyStack: undo failed", e);
      await saveUndoStack(rest);
      return { ok: false, message: "Couldn't undo that -- the tabs may have already changed." };
    }

    await saveUndoStack(rest);
    return { ok: true, message: `Undid: ${last.label}` };
  });
}

// --- Grouping (per-window, never merges windows) -----------------------------

const GROUP_COLORS = ["blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple"];

// Only tabs that aren't in a group yet are moved, so groups you made yourself are never pulled apart.
// `record: false` is for the automatic run, which must not fill up your Undo list on its own.
async function groupTabsByTopic({ record = true } = {}) {
  const { tabs } = await getTabReport();

  const byWindowTopic = {};
  for (const t of tabs) {
    if (t.pinned || t.groupId !== -1) continue;
    (byWindowTopic[t.windowId] ??= {});
    (byWindowTopic[t.windowId][t.topic] ??= []).push(t.id);
  }

  let existingGroups = [];
  try {
    existingGroups = await chrome.tabGroups.query({});
  } catch (e) {
    console.warn("TidyStack: tabGroups.query failed", e);
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
      const label = prettyTopicName(topic);
      const existingId = titleToGroupIdByWindow[windowId]?.[label];
      if (tabIds.length < 2 && existingId == null) continue; // a lone tab only joins a group that already exists
      topicCount++;
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
        console.warn("TidyStack: grouping failed for", topic, "in window", windowId, e);
      }
    }
  }

  if (record && allGroupedTabIds.length > 0) {
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
    console.warn("TidyStack: tabGroups.query failed", e);
    return 0;
  }
  for (const g of groups) {
    try {
      const tabsInGroup = await chrome.tabs.query({ groupId: g.id });
      const tabIds = tabsInGroup.map((t) => t.id).filter(Boolean);
      if (tabIds.length) await chrome.tabs.ungroup(tabIds);
    } catch (e) {
      console.warn("TidyStack: ungroup failed for group", g.id, e);
    }
  }
  return groups.length;
}

// --- Notifications ------------------------------------------------------------

// Playful notifications are messages from Pip, the tab companion, with Pip's picture in the
// current season. Plain ones stay short and use the normal icon.
const THRESHOLD_LINES = {
  any: [
    (n) => `${n} tabs are open and I'm getting a bit dizzy. Tidy a few?`,
    (n) => `Psst. ${n} tabs. They miss you, and I miss the floor.`,
    (n) => `${n} residents in the tab village. Maybe a small archive party?`
  ],
  spring: [(n) => `${n} tabs, like wildflowers: lovely, but someone has to pick them.`],
  summer: [(n) => `${n} tabs and it's getting hot in here. Let's cool things down.`],
  autumn: [(n) => `${n} tabs piled up like fallen leaves. Rake time?`],
  winter: [(n) => `${n} tabs and I'm snowed in. Dig me out?`]
};
const PLAIN_THRESHOLD_LINE = (n) => `You have ${n} tabs open.`;

const CLEANUP_LINES = {
  any: [
    (n) => `Tucked ${n} idle tab${n === 1 ? "" : "s"} into the Graveyard. It's cosy in there.`,
    (n) => `Archived ${n} tab${n === 1 ? "" : "s"} that had officially graduated.`
  ],
  spring: [(n) => `Swept ${n} old tab${n === 1 ? "" : "s"} away. Spring cleaning done!`],
  summer: [(n) => `Packed ${n} idle tab${n === 1 ? "" : "s"} away for the season.`],
  autumn: [(n) => `Raked up ${n} tab${n === 1 ? "" : "s"} and tucked them in the Graveyard.`],
  winter: [(n) => `Tucked ${n} tab${n === 1 ? "" : "s"} in for the winter. Nothing was deleted.`]
};
const PLAIN_CLEANUP_LINE = (n) =>
  `Archived ${n} idle tab${n === 1 ? "" : "s"}. Nothing was deleted -- find it in the Graveyard.`;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const seasonKey = (theme) => (self.TidyPixel ? self.TidyPixel.seasonOf(theme) : "base");

function thresholdMessage(count, settings) {
  if (!settings.playfulNotifications) return { message: PLAIN_THRESHOLD_LINE(count) };
  const pool = THRESHOLD_LINES.any.concat(THRESHOLD_LINES[seasonKey(settings.theme)] || []);
  return { title: settings.companion ? "Pip from TidyStack" : "TidyStack", message: pick(pool)(count), mood: "worry", theme: settings.theme, playful: settings.companion };
}

function cleanupMessage(count, settings) {
  if (!settings.playfulNotifications) return { message: PLAIN_CLEANUP_LINE(count) };
  const pool = CLEANUP_LINES.any.concat(CLEANUP_LINES[seasonKey(settings.theme)] || []);
  return { title: settings.companion ? "Pip from TidyStack" : "TidyStack", message: pick(pool)(count), mood: "cheer", theme: settings.theme, playful: settings.companion };
}

// Resolves true only if Chrome actually accepted the notification. (Chrome reports failures through
// runtime.lastError rather than throwing, so a plain try/catch would claim success when it failed.)
async function notify({ title = "TidyStack", message, mood, theme, playful } = {}) {
  let iconUrl = chrome.runtime.getURL("icons/icon128.png");
  if (playful && self.TidyPixel) {
    try {
      iconUrl = await self.TidyPixel.notificationIcon(mood || "idle", self.TidyPixel.seasonOf(theme));
    } catch (e) {
      console.warn("TidyStack: could not draw the notification picture", e);
    }
  }
  return new Promise((resolve) => {
    try {
      chrome.notifications.create(
        `tidystack-${Date.now()}`,
        {
          type: "basic",
          iconUrl,
          title,
          message,
          priority: 0
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) console.warn("TidyStack: notification failed", err.message);
          resolve(!err);
        }
      );
    } catch (e) {
      console.warn("TidyStack: notification failed", e);
      resolve(false);
    }
  });
}

async function countEligibleTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => t.id != null && !t.incognito && isEligibleUrl(t.url)).length;
}

// Nudges once when you cross your limit, then at most every few hours while you stay over it.
// Dropping back under the limit resets it, so the next crossing nudges again. The "already nudged"
// note is only saved when Chrome really accepted the notification, so a failed one is retried.
function checkNudge(settingsOverride, { reset = false } = {}) {
  return withLock("nudge", async () => {
    const settings = settingsOverride ?? (await getSettings());
    const count = await countEligibleTabs();
    if (reset) await chrome.storage.local.remove(NUDGE_KEY);
    const data = await chrome.storage.local.get(NUDGE_KEY);
    const state = data[NUDGE_KEY] && typeof data[NUDGE_KEY] === "object" ? data[NUDGE_KEY] : { over: false, at: 0 };

    if (count < settings.threshold) {
      if (state.over) await chrome.storage.local.set({ [NUDGE_KEY]: { over: false, at: state.at } });
      return;
    }
    const due = !state.over || Date.now() - state.at > RENUDGE_MS;
    if (!due) return;
    const sent = await notify(thresholdMessage(count, settings));
    if (sent) await chrome.storage.local.set({ [NUDGE_KEY]: { over: true, at: Date.now() } });
  });
}

// Many tabs can open or finish loading at once (restoring a session, opening a bookmark folder).
// This waits for things to settle and then does one check, instead of one per tab. A brand-new tab
// has no address yet, so checking the moment it's created would also miss it.
let nudgeTimer = null;
function scheduleNudgeCheck(delayMs = 3000) {
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    quiet(checkNudge());
  }, delayMs);
}

// --- Periodic work --------------------------------------------------------------

async function runPeriodicCheck() {
  await pruneClosedTabs();
  const settings = await getSettings();
  await checkNudge(settings);

  const { tabs, totalCount } = await getTabReport(settings);

  if (totalCount >= settings.threshold && settings.autoGroup) await groupTabsByTopic({ record: false });

  const staleTabs = tabs.filter((t) => t.isStale);
  if (settings.autoCleanup && staleTabs.length > 0) {
    const entries = await archiveTabs(staleTabs, "auto-stale");
    if (entries.length) {
      await pushUndo({
        type: "archive",
        label: `Auto-archived ${entries.length} idle tab${entries.length === 1 ? "" : "s"}`,
        payload: entries.map((e) => e.id)
      });
      await notify(cleanupMessage(entries.length, settings));
    }
  }
}

// The alarm must only be created if it doesn't exist yet. Re-creating it every time the
// service worker wakes up resets its timer, so it may never get the chance to fire.
async function ensureAlarm() {
  try {
    const existing = await chrome.alarms.get("periodicCheck");
    if (!existing) chrome.alarms.create("periodicCheck", { periodInMinutes: 15, delayInMinutes: 1 });
  } catch (e) {
    console.warn("TidyStack: could not set up the periodic check", e);
  }
}

// --- Event wiring --------------------------------------------------------------

const quiet = (p) => p.catch((e) => console.warn("TidyStack:", e));

// When you switch tabs, the tab you just left was in use right up to that moment. Without this, a
// tab you read for hours would look "idle for hours" the second you switched away from it.
function noteActivation(tabId, windowId) {
  return withLock("activeByWindow", async () => {
    let byWindow = {};
    try {
      const data = await undoStore.get(ACTIVE_BY_WINDOW_KEY);
      const saved = data[ACTIVE_BY_WINDOW_KEY];
      if (saved && typeof saved === "object") byWindow = saved;
    } catch (e) {
      console.warn("TidyStack: could not read the active-tab note", e);
    }
    const previous = byWindow[String(windowId)];
    byWindow[String(windowId)] = tabId;
    try {
      await undoStore.set({ [ACTIVE_BY_WINDOW_KEY]: byWindow });
    } catch (e) {
      console.warn("TidyStack: could not save the active-tab note", e);
    }
    if (Number.isInteger(previous) && previous !== tabId) {
      const stillOpen = await chrome.tabs.get(previous).catch(() => null);
      if (stillOpen) await touchTab(previous);
    }
  });
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  quiet(touchTab(tabId));
  quiet(noteActivation(tabId, windowId));
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  // A background tab finishing a load (an auto-refreshing inbox, say) isn't you using it.
  if (tab && tab.active) quiet(touchTab(tabId));
  scheduleNudgeCheck();
});
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id != null) quiet(touchTab(tab.id));
  scheduleNudgeCheck();
});
chrome.tabs.onRemoved.addListener((tabId) => quiet(forgetTab(tabId)));

// Clicking a nudge just dismisses it.
chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("tidystack-")) chrome.notifications.clear(id, () => void chrome.runtime.lastError);
});

chrome.runtime.onInstalled.addListener(() => { quiet(seedAllTabs()); quiet(ensureAlarm()); scheduleNudgeCheck(5000); });
chrome.runtime.onStartup.addListener(() => { quiet(seedAllTabs()); quiet(ensureAlarm()); scheduleNudgeCheck(5000); });
quiet(ensureAlarm());

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "periodicCheck") quiet(runPeriodicCheck());
});

// --- Message router --------------------------------------------------------------

async function handleMessage(msg) {
  switch (msg.type) {
    case "GET_REPORT":
      return getTabReport();
    case "GET_GUILT_STATS":
      return getGuiltStats();
    case "GROUP_BY_TOPIC":
      return { ok: true, ...(await groupTabsByTopic()) };
    case "UNGROUP_ALL":
      return { ok: true, count: await ungroupAllTabs() };
    case "GET_DUPLICATES":
      return findDuplicates();

    case "RESOLVE_DUPLICATES": {
      if (!isStrList(msg.groups) || !["newest", "oldest"].includes(msg.keep)) return { ok: false, error: "Bad request" };
      const groups = (await findDuplicates()).filter((g) => msg.groups.includes(g.normalizedUrl));
      const toClose = resolveDuplicateGroups(groups, msg.keep);
      if (toClose.length === 0) return { ok: true, closed: 0 };
      await chrome.tabs.remove(toClose.map((t) => t.id));
      await pushUndo({
        type: "close",
        label: `Closed ${toClose.length} duplicate tab${toClose.length === 1 ? "" : "s"}`,
        payload: toClose.map((t) => ({ url: t.url }))
      });
      return { ok: true, closed: toClose.length };
    }

    case "ARCHIVE_TABS": {
      if (!isIdList(msg.tabIds)) return { ok: false, error: "Bad request" };
      const found = await Promise.all(msg.tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
      const entries = await archiveTabs(
        found.filter(Boolean).map((t) => ({ id: t.id, title: t.title, url: t.url })),
        "manual"
      );
      if (entries.length) {
        await pushUndo({
          type: "archive",
          label: `Archived ${entries.length} tab${entries.length === 1 ? "" : "s"}`,
          payload: entries.map((e) => e.id)
        });
      }
      return { ok: true, count: entries.length };
    }

    case "CLOSE_TABS": {
      if (!isIdList(msg.tabIds)) return { ok: false, error: "Bad request" };
      const found = await Promise.all(msg.tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
      const valid = found.filter((t) => t && isEligibleUrl(t.url));
      if (valid.length === 0) return { ok: true, count: 0 };
      await chrome.tabs.remove(valid.map((t) => t.id));
      await pushUndo({
        type: "close",
        label: `Closed ${valid.length} tab${valid.length === 1 ? "" : "s"}`,
        payload: valid.map((t) => ({ url: t.url }))
      });
      return { ok: true, count: valid.length };
    }

    case "GET_GRAVEYARD":
      return { ok: true, ...(await searchGraveyard(msg.query)) };
    case "RESTORE_ENTRY":
      if (typeof msg.entryId !== "string") return { ok: false, error: "Bad request" };
      return { ok: true, ...(await restoreEntries([msg.entryId], { active: true })) };
    case "RESTORE_MANY":
      if (!isStrList(msg.ids)) return { ok: false, error: "Bad request" };
      return { ok: true, ...(await restoreEntries(msg.ids)) };
    case "DELETE_GRAVEYARD_ENTRY":
      if (typeof msg.entryId !== "string") return { ok: false, error: "Bad request" };
      await deleteGraveyardEntry(msg.entryId);
      return { ok: true };
    case "CLEAR_GRAVEYARD":
      return { ok: true, count: await clearGraveyard() };

    case "GET_UNDO_STACK":
      return getUndoStack();
    case "UNDO_LAST":
      return undoLast();

    case "GET_SETTINGS":
      return getSettings();
    case "SET_SETTINGS": {
      const before = await getSettings();
      const clean = await setSettings(msg.settings);
      // A new limit starts fresh: if you're already past it, you're nudged straight away.
      quiet(checkNudge(clean, { reset: clean.threshold !== before.threshold }));
      return { ok: true, settings: clean };
    }

    case "TEST_NOTIFICATION": {
      const settings = await getSettings();
      const level = await chrome.notifications.getPermissionLevel().catch(() => "unknown");
      const ok = await notify(
        settings.playfulNotifications
          ? { title: settings.companion ? "Pip from TidyStack" : "TidyStack", message: "This is what a nudge looks like. Your tabs say hi.", mood: "happy", theme: settings.theme, playful: settings.companion }
          : { message: "This is a test notification." }
      );
      return { ok, level };
    }

    case "GO_TO_TAB": {
      if (!Number.isInteger(msg.tabId)) return { ok: false, error: "Bad request" };
      try {
        await chrome.tabs.update(msg.tabId, { active: true });
        const tab = await chrome.tabs.get(msg.tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        return { ok: true };
      } catch {
        return { ok: false, error: "That tab may have already closed." };
      }
    }

    default:
      return { ok: false, error: "Unknown message type" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only TidyStack's own pages may talk to the service worker. (There are no content scripts and no
  // externally_connectable entry, so no website can reach this, but we check anyway.)
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== "string") return false;
  if (typeof sender.url !== "string" || !sender.url.startsWith(chrome.runtime.getURL(""))) return false;
  handleMessage(msg)
    .then(sendResponse)
    .catch((e) => {
      console.warn("TidyStack: request failed", msg.type, e);
      sendResponse({ ok: false, error: "Something went wrong. Please try again." });
    });
  return true;
});

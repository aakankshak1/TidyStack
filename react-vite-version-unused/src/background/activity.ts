import type { TabInfo, Settings } from "../lib/types";
import { getSettings } from "./storage";

const ACTIVITY_KEY = "tabTamerActivity"; // { [tabId]: firstSeenMs|lastActiveMs pair }

interface ActivityRecord {
  firstSeen: number;
  lastActive: number;
}

type ActivityMap = Record<string, ActivityRecord>;

async function getActivityMap(): Promise<ActivityMap> {
  try {
    const data = await chrome.storage.local.get(ACTIVITY_KEY);
    const map = data[ACTIVITY_KEY];
    return map && typeof map === "object" ? map : {};
  } catch (e) {
    console.warn("Tab Tamer: activity read failed, resetting", e);
    return {};
  }
}

async function setActivityMap(map: ActivityMap): Promise<void> {
  try {
    await chrome.storage.local.set({ [ACTIVITY_KEY]: map });
  } catch (e) {
    console.warn("Tab Tamer: activity write failed", e);
  }
}

export async function touchTab(tabId: number): Promise<void> {
  const map = await getActivityMap();
  const now = Date.now();
  const existing = map[tabId];
  map[String(tabId)] = { firstSeen: existing?.firstSeen ?? now, lastActive: now };
  await setActivityMap(map);
}

export async function forgetTab(tabId: number): Promise<void> {
  const map = await getActivityMap();
  delete map[String(tabId)];
  await setActivityMap(map);
}

export async function pruneClosedTabs(): Promise<void> {
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

/** Registrable-domain "topic" for grouping (github.com, docs.google.com -> google.com). */
export function topicKeyForUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return "other";
  }
}

export function prettyTopicName(key: string): string {
  const name = key.split(".")[0] || key;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Strips common tracking params so ?utm_source=... doesn't defeat duplicate detection. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const stripParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "ref", "source"
    ];
    stripParams.forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    // Normalize trailing slash so example.com and example.com/ match.
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.hostname}${path}${u.search}`;
  } catch {
    return url;
  }
}

function isEligibleUrl(url: string | undefined): url is string {
  if (!url) return false;
  return !/^(chrome|edge|about|chrome-extension):/i.test(url);
}

/**
 * Builds the current tab report. Skips incognito tabs entirely (never touch
 * or store private-browsing data), and handles pinned/discarded/PDF tabs
 * and missing favicons gracefully rather than throwing.
 */
export async function getTabReport(
  settingsOverride?: Settings
): Promise<{ tabs: TabInfo[]; settings: Settings; totalCount: number }> {
  const settings = settingsOverride ?? (await getSettings());
  const map = await getActivityMap();
  const now = Date.now();
  const staleMs = settings.staleDays * 24 * 60 * 60 * 1000;
  const exceptions = settings.exceptionDomains ?? [];

  let rawTabs: chrome.tabs.Tab[] = [];
  try {
    rawTabs = await chrome.tabs.query({});
  } catch (e) {
    console.warn("Tab Tamer: tabs.query failed", e);
    return { tabs: [], settings, totalCount: 0 };
  }

  const eligible = rawTabs.filter((t) => !t.incognito && isEligibleUrl(t.url));

  const tabs: TabInfo[] = eligible.map((t) => {
    const record = map[String(t.id)];
    const lastActive = record?.lastActive ?? now;
    const topic = topicKeyForUrl(t.url!);
    const isException = exceptions.some((d) => topic === d || topic.endsWith("." + d));
    return {
      id: t.id!,
      title: t.title || t.url || "Untitled tab",
      url: t.url!,
      faviconUrl: t.favIconUrl || null,
      pinned: !!t.pinned,
      groupId: t.groupId ?? -1,
      windowId: t.windowId!,
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

export async function getGuiltStats() {
  const { tabs } = await getTabReport();
  const map = await getActivityMap();
  const now = Date.now();

  const stale = tabs.filter((t) => t.isStale).length;

  // "Never revisited" = still on its very first activation since Tab Tamer noticed it,
  // and that first sighting was more than a day ago (so brand-new tabs aren't flagged).
  const neverRevisited = tabs.filter((t) => {
    const rec = map[String(t.id)];
    if (!rec) return false;
    const oneDayMs = 24 * 60 * 60 * 1000;
    return rec.firstSeen === rec.lastActive && now - rec.firstSeen > oneDayMs;
  }).length;

  const seen = new Map<string, number>();
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicates = [...seen.values()].filter((c) => c > 1).reduce((a, c) => a + c, 0);

  return { total: tabs.length, stale, duplicates, neverRevisited };
}

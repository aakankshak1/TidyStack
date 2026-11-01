import type { GraveyardEntry } from "../lib/types";

const GRAVEYARD_KEY = "tabTamerGraveyard";

function uuid(): string {
  // crypto.randomUUID is available in MV3 service workers.
  return crypto.randomUUID();
}

async function getAll(): Promise<GraveyardEntry[]> {
  try {
    const data = await chrome.storage.local.get(GRAVEYARD_KEY);
    const list = data[GRAVEYARD_KEY];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("Tab Tamer: graveyard read failed, treating as empty", e);
    return [];
  }
}

async function saveAll(entries: GraveyardEntry[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [GRAVEYARD_KEY]: entries });
  } catch (e) {
    console.warn("Tab Tamer: graveyard write failed", e);
  }
}

export interface ArchivableTab {
  id: number;
  title: string;
  url: string;
  faviconUrl: string | null;
}

/**
 * Archives tabs (stores metadata locally, then closes them) instead of
 * deleting anything. Returns the created entries so callers can build an
 * undo action from them.
 */
export async function archiveTabs(
  tabs: ArchivableTab[],
  reason: GraveyardEntry["reason"] = "manual"
): Promise<GraveyardEntry[]> {
  const entries: GraveyardEntry[] = tabs.map((t) => ({
    id: uuid(),
    title: t.title,
    url: t.url,
    faviconUrl: t.faviconUrl,
    archivedAt: Date.now(),
    reason
  }));

  const all = await getAll();
  await saveAll([...entries, ...all]);

  try {
    await chrome.tabs.remove(tabs.map((t) => t.id));
  } catch (e) {
    // Tab may have already closed in a race -- that's fine, metadata is saved either way.
    console.warn("Tab Tamer: some tabs were already closed before archiving", e);
  }

  return entries;
}

export async function searchGraveyard(query?: string): Promise<GraveyardEntry[]> {
  const all = await getAll();
  if (!query || !query.trim()) return all;
  const q = query.trim().toLowerCase();
  return all.filter(
    (e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
  );
}

export async function restoreEntry(entryId: string): Promise<GraveyardEntry | null> {
  const all = await getAll();
  const entry = all.find((e) => e.id === entryId);
  if (!entry) return null;

  try {
    await chrome.tabs.create({ url: entry.url, active: true });
  } catch (e) {
    console.warn("Tab Tamer: failed to reopen archived tab", e);
    return null;
  }

  await saveAll(all.filter((e) => e.id !== entryId));
  return entry;
}

export async function restoreAll(): Promise<number> {
  const all = await getAll();
  // Cap a single restore-all burst so we don't try to open hundreds of tabs
  // at once and choke the browser -- restores in small batches instead.
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
  await saveAll([]);
  return opened;
}

export async function deleteEntry(entryId: string): Promise<void> {
  const all = await getAll();
  await saveAll(all.filter((e) => e.id !== entryId));
}

/** Quietly archive tabs untouched for N days, if enabled. */
export async function autoArchiveOldEntries(_maxAgeDays: number): Promise<void> {
  // Graveyard entries themselves are never auto-deleted (per skill: "never
  // auto-delete tabs" applies to the archive too -- it's a permanent local
  // record until the person clears it). This function is a placeholder for
  // a future "auto-purge after N days" *opt-in* setting, kept separate from
  // core archiving so it's never on by default.
}

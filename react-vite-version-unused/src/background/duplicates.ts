import type { DuplicateGroup, TabInfo } from "../lib/types";
import { normalizeUrl, getTabReport } from "./activity";

export async function findDuplicates(): Promise<DuplicateGroup[]> {
  const { tabs } = await getTabReport();
  const byUrl = new Map<string, TabInfo[]>();

  for (const t of tabs) {
    if (t.pinned) continue; // pinned tabs are intentional, never flagged as duplicates
    const key = normalizeUrl(t.url);
    const list = byUrl.get(key) ?? [];
    list.push(t);
    byUrl.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [normalizedUrl, group] of byUrl.entries()) {
    if (group.length > 1) groups.push({ normalizedUrl, tabs: group });
  }
  return groups.sort((a, b) => b.tabs.length - a.tabs.length);
}

/**
 * Returns the tab IDs to close for the given resolution strategy, keeping
 * exactly one tab per duplicate group (the newest or oldest by lastActive).
 */
export function resolveDuplicateGroups(
  groups: DuplicateGroup[],
  keep: "newest" | "oldest"
): number[] {
  const toClose: number[] = [];
  for (const group of groups) {
    const sorted = [...group.tabs].sort((a, b) =>
      keep === "newest" ? b.lastActive - a.lastActive : a.lastActive - b.lastActive
    );
    const [, ...rest] = sorted; // keep the first, close the rest
    toClose.push(...rest.map((t) => t.id));
  }
  return toClose;
}

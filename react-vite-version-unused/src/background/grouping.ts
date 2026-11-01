import { getTabReport, prettyTopicName } from "./activity";
import { pushUndo } from "./undo";

const GROUP_COLORS: chrome.tabGroups.ColorEnum[] = [
  "blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple"
];

export async function groupTabsByTopic(): Promise<{ topicCount: number; windowCount: number }> {
  const { tabs } = await getTabReport();

  const byWindowTopic: Record<number, Record<string, number[]>> = {};
  for (const t of tabs) {
    if (t.pinned) continue;
    (byWindowTopic[t.windowId] ??= {});
    (byWindowTopic[t.windowId][t.topic] ??= []).push(t.id);
  }

  let existingGroups: chrome.tabGroups.TabGroup[] = [];
  try {
    existingGroups = await chrome.tabGroups.query({});
  } catch (e) {
    console.warn("Tab Tamer: tabGroups.query failed", e);
  }
  const titleToGroupIdByWindow: Record<number, Record<string, number>> = {};
  for (const g of existingGroups) {
    (titleToGroupIdByWindow[g.windowId] ??= {});
    if (g.title) titleToGroupIdByWindow[g.windowId][g.title] = g.id;
  }

  let colorIdx = 0;
  let topicCount = 0;
  const allGroupedTabIds: number[] = [];

  for (const [windowIdStr, byTopic] of Object.entries(byWindowTopic)) {
    const windowId = Number(windowIdStr);
    for (const [topic, tabIds] of Object.entries(byTopic)) {
      if (tabIds.length < 2) continue; // lone tabs aren't worth grouping
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

/** One click, always available -- never traps tabs inside a group. */
export async function ungroupAllTabs(): Promise<number> {
  let groups: chrome.tabGroups.TabGroup[] = [];
  try {
    groups = await chrome.tabGroups.query({});
  } catch (e) {
    console.warn("Tab Tamer: tabGroups.query failed", e);
    return 0;
  }
  for (const g of groups) {
    try {
      const tabsInGroup = await chrome.tabs.query({ groupId: g.id });
      const tabIds = tabsInGroup.map((t) => t.id!).filter(Boolean);
      if (tabIds.length) await chrome.tabs.ungroup(tabIds);
    } catch (e) {
      console.warn("Tab Tamer: ungroup failed for group", g.id, e);
    }
  }
  return groups.length;
}

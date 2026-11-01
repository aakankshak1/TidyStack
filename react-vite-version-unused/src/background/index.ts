import type { Message } from "../lib/types";
import { getSettings, setSettings, DEFAULT_SETTINGS } from "./storage";
import { touchTab, forgetTab, pruneClosedTabs, getTabReport, getGuiltStats } from "./activity";
import { archiveTabs, searchGraveyard, restoreEntry, restoreAll, deleteEntry } from "./graveyard";
import { findDuplicates, resolveDuplicateGroups } from "./duplicates";
import { pushUndo, getUndoStack, undoLast } from "./undo";
import { groupTabsByTopic, ungroupAllTabs } from "./grouping";
import { thresholdMessage, cleanupMessage, notify } from "./notifications";

// --- Activity tracking (skips incognito automatically inside getTabReport) ---

chrome.tabs.onActivated.addListener(({ tabId }) => touchTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") touchTab(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((t) => t.id != null).map((t) => touchTab(t.id!)));
});

// --- Periodic check: threshold nudge + optional auto-group + auto-cleanup ---

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
      await notify(
        "tab-tamer-threshold",
        "Tab Tamer",
        thresholdMessage(totalCount, settings.playfulNotifications)
      );
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
    await notify(
      "tab-tamer-autocleanup",
      "Tab Tamer",
      cleanupMessage(entries.length, settings.playfulNotifications)
    );
  }
});

// --- Message router ---

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
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
        const closedTabs = allOpenTabs
          .filter((t) => tabIds.includes(t.id!))
          .map((t) => ({ url: t.url! }));
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
        const tabsToArchive = await Promise.all(
          msg.tabIds.map((id) => chrome.tabs.get(id).catch(() => null))
        );
        const valid = tabsToArchive.filter((t): t is chrome.tabs.Tab => !!t);
        const entries = await archiveTabs(
          valid.map((t) => ({
            id: t.id!,
            title: t.title || t.url || "Untitled tab",
            url: t.url!,
            faviconUrl: t.favIconUrl || null
          })),
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
        const tabsToClose = await Promise.all(
          msg.tabIds.map((id) => chrome.tabs.get(id).catch(() => null))
        );
        const valid = tabsToClose.filter((t): t is chrome.tabs.Tab => !!t);
        await chrome.tabs.remove(valid.map((t) => t.id!));
        await pushUndo({
          type: "close",
          label: `Closed ${valid.length} tab${valid.length === 1 ? "" : "s"}`,
          payload: valid.map((t) => ({ url: t.url! }))
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
        const count = await restoreAll();
        sendResponse({ ok: true, count });
        break;
      }
      case "DELETE_GRAVEYARD_ENTRY": {
        await deleteEntry(msg.entryId);
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
  return true; // keep the channel open for the async response above
});

// Keep DEFAULT_SETTINGS import used (referenced by popup indirectly via getSettings fallback).
void DEFAULT_SETTINGS;

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  faviconUrl: string | null;
  pinned: boolean;
  groupId: number;
  windowId: number;
  lastActive: number; // epoch ms
  idleMs: number;
  isStale: boolean;
  isDiscarded: boolean;
  isPdf: boolean;
  topic: string; // registrable domain, used for grouping
}

export interface GraveyardEntry {
  id: string; // uuid
  title: string;
  url: string;
  faviconUrl: string | null;
  archivedAt: number;
  reason: "manual" | "auto-stale" | "duplicate";
}

export interface DuplicateGroup {
  normalizedUrl: string;
  tabs: TabInfo[];
}

export interface UndoAction {
  id: string;
  type: "archive" | "close" | "group" | "ungroup";
  label: string; // plain-English description shown in the undo toast
  performedAt: number;
  // Serialized enough state to reverse the action.
  payload: unknown;
}

export interface Settings {
  threshold: number; // nudge once tab count exceeds this
  staleDays: number; // a tab counts as "idle" after this many days
  autoGroup: boolean;
  playfulNotifications: boolean;
  theme: "system" | "light" | "dark";
  autoArchiveDays: number | null; // null = off. archives (never deletes) after N days
  autoCleanup: boolean; // auto-archive stale tabs on schedule
  exceptionDomains: string[]; // domains never marked stale
}

export interface TabGuiltStats {
  total: number;
  stale: number;
  duplicates: number;
  neverRevisited: number;
}

export type Message =
  | { type: "GET_REPORT" }
  | { type: "GET_GUILT_STATS" }
  | { type: "GROUP_BY_TOPIC" }
  | { type: "UNGROUP_ALL" }
  | { type: "GET_DUPLICATES" }
  | { type: "RESOLVE_DUPLICATES"; groups: string[]; keep: "newest" | "oldest" }
  | { type: "ARCHIVE_TABS"; tabIds: number[]; reason?: GraveyardEntry["reason"] }
  | { type: "CLOSE_TABS"; tabIds: number[] }
  | { type: "GET_GRAVEYARD"; query?: string }
  | { type: "RESTORE_ENTRY"; entryId: string }
  | { type: "RESTORE_ALL" }
  | { type: "DELETE_GRAVEYARD_ENTRY"; entryId: string }
  | { type: "GET_UNDO_STACK" }
  | { type: "UNDO_LAST" }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: Settings }
  | { type: "GO_TO_TAB"; tabId: number };

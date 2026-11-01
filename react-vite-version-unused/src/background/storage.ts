import type { Settings } from "../lib/types";

const SETTINGS_KEY = "tabTamerSettings";

export const DEFAULT_SETTINGS: Settings = {
  threshold: 30,
  staleDays: 3, // note: displayed as days in the new UI, more intuitive than hours
  autoGroup: true,
  playfulNotifications: true,
  theme: "system",
  autoArchiveDays: null,
  autoCleanup: false,
  exceptionDomains: []
};

export async function getSettings(): Promise<Settings> {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    const stored = data[SETTINGS_KEY];
    if (!stored || typeof stored !== "object") return { ...DEFAULT_SETTINGS };
    // Merge defensively -- if storage is partially corrupted or from an older
    // version, missing/invalid fields fall back to defaults instead of crashing.
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (e) {
    console.warn("Tab Tamer: settings read failed, using defaults", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch (e) {
    console.warn("Tab Tamer: settings write failed", e);
  }
}

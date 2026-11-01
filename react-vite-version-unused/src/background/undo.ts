import type { UndoAction } from "../lib/types";
import { restoreEntry } from "./graveyard";

const UNDO_KEY = "tabTamerUndoStack";
const MAX_STACK = 10;

// chrome.storage.session persists for the browser session but clears on
// restart -- exactly the semantics we want: undo works until you close the
// browser, then it honestly stops offering something it can no longer do.
const store = chrome.storage.session ?? chrome.storage.local;

async function getStack(): Promise<UndoAction[]> {
  try {
    const data = await store.get(UNDO_KEY);
    const stack = data[UNDO_KEY];
    return Array.isArray(stack) ? stack : [];
  } catch (e) {
    console.warn("Tab Tamer: undo stack read failed", e);
    return [];
  }
}

async function saveStack(stack: UndoAction[]): Promise<void> {
  try {
    await store.set({ [UNDO_KEY]: stack.slice(0, MAX_STACK) });
  } catch (e) {
    console.warn("Tab Tamer: undo stack write failed", e);
  }
}

export async function pushUndo(action: Omit<UndoAction, "id" | "performedAt">): Promise<void> {
  const stack = await getStack();
  const entry: UndoAction = { ...action, id: crypto.randomUUID(), performedAt: Date.now() };
  await saveStack([entry, ...stack]);
}

export async function getUndoStack(): Promise<UndoAction[]> {
  return getStack();
}

/** Reverses the most recent action, if any. Returns a plain-English result for the toast. */
export async function undoLast(): Promise<{ ok: boolean; message: string }> {
  const stack = await getStack();
  const [last, ...rest] = stack;
  if (!last) return { ok: false, message: "Nothing to undo." };

  try {
    switch (last.type) {
      case "archive": {
        const entryIds = last.payload as string[];
        for (const id of entryIds) await restoreEntry(id);
        break;
      }
      case "close": {
        const closed = last.payload as { url: string }[];
        for (const t of closed) await chrome.tabs.create({ url: t.url, active: false });
        break;
      }
      case "group": {
        const tabIds = last.payload as number[];
        await chrome.tabs.ungroup(tabIds.filter(Boolean));
        break;
      }
      case "ungroup": {
        // Regrouping exactly as before isn't reliably reconstructable once
        // Chrome has merged/dissolved a group, so we're honest about that
        // instead of silently doing nothing.
        await saveStack(rest);
        return { ok: false, message: "That grouping can't be restored automatically -- group again from the panel." };
      }
    }
  } catch (e) {
    console.warn("Tab Tamer: undo failed", e);
    await saveStack(rest);
    return { ok: false, message: "Couldn't undo that -- the tabs may have already changed." };
  }

  await saveStack(rest);
  return { ok: true, message: `Undid: ${last.label}` };
}

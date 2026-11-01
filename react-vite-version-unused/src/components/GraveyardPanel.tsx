import { useEffect, useState } from "react";
import type { GraveyardEntry } from "@/lib/types";
import { send } from "@/lib/messaging";
import { TabRow } from "@/components/TabRow";

interface Props {
  onUndoAvailable: (label: string) => void;
}

export function GraveyardPanel({ onUndoAvailable }: Props) {
  const [entries, setEntries] = useState<GraveyardEntry[] | null>(null);
  const [query, setQuery] = useState("");

  async function load(q?: string) {
    const result = await send<GraveyardEntry[]>({ type: "GET_GRAVEYARD", query: q });
    setEntries(result);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => load(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  async function restore(entryId: string, title: string) {
    await send({ type: "RESTORE_ENTRY", entryId });
    load(query);
  }

  async function restoreAll() {
    const count = entries?.length ?? 0;
    await send({ type: "RESTORE_ALL" });
    onUndoAvailable(`Restored ${count} tab${count === 1 ? "" : "s"}`);
    load(query);
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search archived tabs…"
          className="w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[14px] text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5">
        <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-text-muted">
          Graveyard {entries ? `(${entries.length})` : ""}
        </h2>
        {entries && entries.length > 0 && (
          <button className="text-[12.5px] font-medium text-accent hover:underline" onClick={restoreAll}>
            Restore all
          </button>
        )}
      </div>

      <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {entries === null ? (
          <p className="px-2 py-6 text-center text-[13.5px] text-text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <svg width="40" height="34" viewBox="0 0 40 34" className="opacity-40">
              <path
                d="M8 33 V16 A12 12 0 0 1 32 16 V33"
                fill="none"
                stroke="rgb(var(--text-muted))"
                strokeWidth="1.6"
              />
              <line x1="4" y1="33" x2="36" y2="33" stroke="rgb(var(--text-muted))" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M20 12 V4 M16 7 L20 4 L24 7" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="max-w-[220px] text-[13.5px] text-text-muted">
              {query
                ? "No archived tabs match that search."
                : "Nothing archived yet. Archived tabs stay here until you bring them back -- nothing is ever deleted."}
            </p>
          </div>
        ) : (
          entries.map((e) => (
            <TabRow
              key={e.id}
              title={e.title}
              url={e.url}
              faviconUrl={e.faviconUrl}
              meta={new Date(e.archivedAt).toLocaleDateString()}
              actions={[{ label: "Restore", onClick: () => restore(e.id, e.title) }]}
            />
          ))
        )}
      </div>
    </div>
  );
}

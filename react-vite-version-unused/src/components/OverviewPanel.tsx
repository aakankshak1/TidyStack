import { useEffect, useState } from "react";
import type { TabInfo } from "@/lib/types";
import { send } from "@/lib/messaging";
import { TabRow } from "@/components/TabRow";
import { Button } from "@/components/ui/button";

interface Props {
  onChanged: () => void;
  onUndoAvailable: (label: string) => void;
}

export function OverviewPanel({ onChanged, onUndoAvailable }: Props) {
  const [tabs, setTabs] = useState<TabInfo[] | null>(null);
  const [busy, setBusy] = useState<"group" | "ungroup" | null>(null);
  const [exitingIds, setExitingIds] = useState<Set<number>>(new Set());

  async function load() {
    const report = await send<{ tabs: TabInfo[] }>({ type: "GET_REPORT" });
    setTabs(report.tabs.filter((t) => t.isStale).sort((a, b) => b.idleMs - a.idleMs));
  }

  useEffect(() => {
    load();
  }, []);

  async function refreshAll() {
    await load();
    setExitingIds(new Set());
    onChanged();
  }

  async function archive(tabIds: number[], label: string) {
    setExitingIds((prev) => new Set([...prev, ...tabIds]));
    setTimeout(async () => {
      await send({ type: "ARCHIVE_TABS", tabIds, reason: "manual" });
      onUndoAvailable(label);
      refreshAll();
    }, 260);
  }

  async function close(tabIds: number[], label: string) {
    setExitingIds((prev) => new Set([...prev, ...tabIds]));
    setTimeout(async () => {
      await send({ type: "CLOSE_TABS", tabIds });
      onUndoAvailable(label);
      refreshAll();
    }, 260);
  }

  async function group() {
    setBusy("group");
    await send({ type: "GROUP_BY_TOPIC" });
    setBusy(null);
    refreshAll();
  }

  async function ungroup() {
    setBusy("ungroup");
    await send({ type: "UNGROUP_ALL" });
    setBusy(null);
    refreshAll();
  }

  if (tabs === null) {
    return <p className="px-4 py-6 text-center text-[13.5px] text-text-muted">Looking at your tabs…</p>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex gap-2 px-4 py-3">
        <Button variant="outline" size="sm" className="flex-1" onClick={group} disabled={busy === "group"}>
          {busy === "group" ? "Grouping…" : "Group by topic"}
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={ungroup} disabled={busy === "ungroup"}>
          {busy === "ungroup" ? "Ungrouping…" : "Ungroup all"}
        </Button>
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5">
        <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-text-muted">
          Idle tabs
        </h2>
        {tabs.length > 0 && (
          <div className="flex gap-3">
            <button
              className="text-[12.5px] font-medium text-accent hover:underline"
              onClick={() => archive(tabs.map((t) => t.id), `Archived ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`)}
            >
              Archive all
            </button>
            <button
              className="text-[12.5px] font-medium text-clay hover:underline"
              onClick={() => close(tabs.map((t) => t.id), `Closed ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`)}
            >
              Close all
            </button>
          </div>
        )}
      </div>

      <div className="flex max-h-[260px] flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {tabs.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13.5px] text-text-muted">
            Nothing idle right now. Nicely kept.
          </p>
        ) : (
          tabs.map((t) => (
            <TabRow
              key={t.id}
              title={t.title}
              url={t.url}
              faviconUrl={t.faviconUrl}
              meta={t.topic}
              idleMs={t.idleMs}
              exiting={exitingIds.has(t.id)}
              onOpen={() => send({ type: "GO_TO_TAB", tabId: t.id })}
              actions={[
                { label: "Archive", onClick: () => archive([t.id], `Archived "${t.title}"`) },
                { label: "Close", variant: "danger", onClick: () => close([t.id], `Closed "${t.title}"`) }
              ]}
            />
          ))
        )}
      </div>
    </div>
  );
}

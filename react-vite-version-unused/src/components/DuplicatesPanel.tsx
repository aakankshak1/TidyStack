import { useEffect, useState } from "react";
import type { DuplicateGroup } from "@/lib/types";
import { send } from "@/lib/messaging";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { faviconFallback } from "@/lib/utils";

interface Props {
  onUndoAvailable: (label: string) => void;
  onChanged: () => void;
}

export function DuplicatesPanel({ onUndoAvailable, onChanged }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);

  async function load() {
    setGroups(await send<DuplicateGroup[]>({ type: "GET_DUPLICATES" }));
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(group: DuplicateGroup, keep: "newest" | "oldest") {
    await send({
      type: "RESOLVE_DUPLICATES",
      groups: [group.normalizedUrl],
      keep
    });
    onUndoAvailable(`Merged ${group.tabs.length} duplicate tabs`);
    load();
    onChanged();
  }

  return (
    <div className="flex flex-col px-4 py-3">
      <p className="mb-2 text-[13px] text-text-muted">
        Same page open more than once. Merging keeps one copy and safely closes the rest -- nothing is lost, it's just tidied.
      </p>

      {groups === null ? (
        <p className="px-2 py-6 text-center text-[13.5px] text-text-muted">Scanning for duplicates…</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <svg width="38" height="34" viewBox="0 0 38 34" className="opacity-40">
            <rect x="4" y="8" width="20" height="20" rx="3" fill="none" stroke="rgb(var(--text-muted))" strokeWidth="1.6" />
            <rect x="14" y="4" width="20" height="20" rx="3" fill="rgb(var(--bg))" stroke="rgb(var(--text-muted))" strokeWidth="1.6" />
            <path d="M20 13 L23 16 L29 9" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="max-w-[220px] text-[13.5px] text-text-muted">No duplicate tabs right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.normalizedUrl} className="rounded-sm border border-border p-2">
              <div className="flex items-center gap-2">
                <img src={faviconFallback(g.tabs[0].url)} alt="" className="h-4 w-4 rounded-[3px]" />
                <span className="truncate text-[14px] font-medium text-text">{g.tabs[0].title}</span>
                <Badge variant="clay">{g.tabs.length}×</Badge>
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => resolve(g, "newest")}>
                  Keep newest
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolve(g, "oldest")}>
                  Keep oldest
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import type { TabGuiltStats } from "@/lib/types";

interface Props {
  stats: TabGuiltStats | null;
}

// A small hand of "tabs" fanned like cards -- each one colored by what
// it represents. Deliberately irregular rotation/spacing rather than a
// perfect grid; this is the one bold visual choice in the whole popup,
// everything else stays quiet around it.
const SLOTS = [
  { rotate: -11, lift: 1 },
  { rotate: -5, lift: 4 },
  { rotate: 2, lift: 0 },
  { rotate: 8, lift: 5 },
  { rotate: 14, lift: 1 }
];

function colorFor(category: "fresh" | "stale" | "duplicate") {
  if (category === "stale") return "rgb(var(--amber))";
  if (category === "duplicate") return "rgb(var(--clay))";
  return "rgb(var(--accent))";
}

export function TabFan({ stats }: Props) {
  if (!stats || stats.total === 0) {
    return (
      <div className="flex items-center gap-3 px-4 pt-3">
        <svg width="56" height="34" viewBox="0 0 56 34" className="shrink-0 opacity-30">
          <rect x="4" y="10" width="34" height="20" rx="4" fill="none" stroke="rgb(var(--text-muted))" strokeWidth="1.5" />
        </svg>
        <p className="text-[13.5px] text-text-muted">Nothing to look at yet.</p>
      </div>
    );
  }

  // Build up to 5 representative tabs from the real proportions so the
  // fan is never just decorative -- it reflects the actual mix.
  const fresh = Math.max(stats.total - stats.stale - stats.duplicates, 0);
  const weighted: ("fresh" | "stale" | "duplicate")[] = [];
  const ratios: [("fresh" | "stale" | "duplicate"), number][] = [
    ["fresh", fresh],
    ["stale", stats.stale],
    ["duplicate", stats.duplicates]
  ];
  const total = ratios.reduce((a, [, v]) => a + v, 0) || 1;
  for (const [cat, count] of ratios) {
    const slots = Math.round((count / total) * 5);
    for (let i = 0; i < slots && weighted.length < 5; i++) weighted.push(cat);
  }
  while (weighted.length < Math.min(5, stats.total)) weighted.push("fresh");

  return (
    <div className="flex items-center gap-3 px-4 pt-3">
      <svg width="72" height="40" viewBox="0 0 72 40" className="shrink-0 overflow-visible">
        {weighted.map((cat, i) => {
          const slot = SLOTS[i % SLOTS.length];
          const cx = 36;
          const cy = 30;
          return (
            <g
              key={i}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              transform={`rotate(${slot.rotate} ${cx} ${cy}) translate(0 ${-slot.lift})`}
            >
              <rect
                x={cx - 15}
                y={cy - 20}
                width="30"
                height="20"
                rx="4"
                fill={colorFor(cat)}
                fillOpacity={cat === "fresh" ? 0.85 : 0.9}
                stroke="rgb(var(--surface))"
                strokeWidth="1.5"
              />
              <rect x={cx - 15} y={cy - 20} width="30" height="4" rx="2" fill="rgb(var(--surface))" fillOpacity="0.35" />
            </g>
          );
        })}
      </svg>

      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[14.5px] font-medium leading-tight text-text">
          {stats.total} <span className="text-text-muted">tabs</span>
        </p>
        <p className="text-[12.5px] leading-tight text-text-muted">{summarize(stats)}</p>
      </div>
    </div>
  );
}

function summarize(stats: TabGuiltStats): string {
  if (stats.stale === 0 && stats.duplicates === 0) return "Nothing idle. Nicely kept.";
  const parts: string[] = [];
  if (stats.stale > 0) parts.push(`${stats.stale} idle a while`);
  if (stats.duplicates > 0) parts.push(`${stats.duplicates} duplicates`);
  return parts.join(" · ");
}

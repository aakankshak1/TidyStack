import { faviconFallback, formatIdle } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  url: string;
  faviconUrl?: string | null;
  meta?: string;
  idleMs?: number;
  onOpen?: () => void;
  actions?: { label: string; onClick: () => void; variant?: "outline" | "danger" | "default" }[];
  exiting?: boolean;
}

export function TabRow({ title, url, faviconUrl, meta, idleMs, onOpen, actions, exiting }: Props) {
  return (
    <div
      className="group flex items-center gap-2.5 rounded-sm border border-transparent px-2 py-1.5 transition-all duration-[280ms] ease-calm hover:border-border hover:bg-surface"
      style={
        exiting
          ? { opacity: 0, transform: "translateY(6px) rotate(-1.5deg) scale(0.98)" }
          : undefined
      }
    >
      <img
        src={faviconUrl || faviconFallback(url)}
        alt=""
        className="h-4 w-4 shrink-0 rounded-[3px]"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <div className="truncate text-[14px] font-medium leading-tight text-text">{title}</div>
        <div className="truncate text-[12.5px] leading-tight text-text-muted">
          {meta}
          {idleMs != null && (
            <span className="ml-1 font-mono text-[12px]">· {formatIdle(idleMs)} idle</span>
          )}
        </div>
      </button>
      {actions && (
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant={a.variant ?? "outline"} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { send } from "@/lib/messaging";

interface Props {
  message: string | null;
  onDismiss: () => void;
  onUndone: () => void;
}

export function UndoToast({ message, onDismiss, onUndone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const id = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 5000);
    return () => clearTimeout(id);
  }, [message]);

  if (!message) return null;

  async function undo() {
    await send({ type: "UNDO_LAST" });
    setVisible(false);
    setTimeout(onDismiss, 200);
    onUndone();
  }

  return (
    <div
      className={`pointer-events-none absolute inset-x-3 bottom-3 z-40 transition-all duration-200 ease-calm ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2 shadow-popover">
        <span className="text-[13.5px] text-text">{message}</span>
        <button onClick={undo} className="text-[13.5px] font-medium text-accent hover:underline">
          Undo
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";
import { send } from "@/lib/messaging";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const FIELD_LABEL = "text-[14px] text-text";
const FIELD_ROW = "flex items-center justify-between py-2";

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    send<Settings>({ type: "GET_SETTINGS" }).then(setSettings);
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!settings) return;
    await send({ type: "SET_SETTINGS", settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!settings) return <p className="px-4 py-6 text-center text-[13.5px] text-text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className={FIELD_ROW}>
        <label className={FIELD_LABEL}>Nudge me past</label>
        <input
          type="number"
          min={5}
          max={300}
          value={settings.threshold}
          onChange={(e) => update("threshold", Number(e.target.value) || 30)}
          className="w-16 rounded-sm border border-border bg-surface px-2 py-1 text-right text-[14px] focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>
      <div className={FIELD_ROW}>
        <label className={FIELD_LABEL}>Idle after (days)</label>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={settings.staleDays}
          onChange={(e) => update("staleDays", Number(e.target.value) || 3)}
          className="w-16 rounded-sm border border-border bg-surface px-2 py-1 text-right text-[14px] focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>
      <div className={FIELD_ROW}>
        <label className={FIELD_LABEL}>Auto-group by topic</label>
        <Switch checked={settings.autoGroup} onCheckedChange={(v) => update("autoGroup", v)} />
      </div>
      <div className={FIELD_ROW}>
        <label className={FIELD_LABEL}>Playful notifications</label>
        <Switch
          checked={settings.playfulNotifications}
          onCheckedChange={(v) => update("playfulNotifications", v)}
        />
      </div>
      <div className={FIELD_ROW}>
        <label className={FIELD_LABEL}>Theme</label>
        <select
          value={settings.theme}
          onChange={(e) => update("theme", e.target.value as Settings["theme"])}
          className="rounded-sm border border-border bg-surface px-2 py-1 text-[14px] focus-visible:outline-2 focus-visible:outline-accent"
        >
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="my-2 border-t border-border" />

      <div className={FIELD_ROW}>
        <label className={FIELD_LABEL}>Auto-archive idle tabs on schedule</label>
        <Switch checked={settings.autoCleanup} onCheckedChange={(v) => update("autoCleanup", v)} />
      </div>
      <div className="py-2">
        <label className={`${FIELD_LABEL} mb-1 block`}>Never mark stale</label>
        <input
          type="text"
          placeholder="gmail.com, docs.google.com"
          value={(settings.exceptionDomains || []).join(", ")}
          onChange={(e) =>
            update(
              "exceptionDomains",
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
            )
          }
          className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[14px] focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      <Button className="mt-3 self-end" size="sm" onClick={save}>
        {saved ? "Saved" : "Save changes"}
      </Button>
    </div>
  );
}

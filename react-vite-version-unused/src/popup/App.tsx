import { useEffect, useState } from "react";
import type { TabGuiltStats, Settings } from "@/lib/types";
import { send } from "@/lib/messaging";
import { Header } from "@/components/Header";
import { TabFan } from "@/components/TabFan";
import { OverviewPanel } from "@/components/OverviewPanel";
import { GraveyardPanel } from "@/components/GraveyardPanel";
import { DuplicatesPanel } from "@/components/DuplicatesPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UndoToast } from "@/components/UndoToast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";

function useTheme(theme: Settings["theme"] | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle("dark", dark);

    if (theme === "dark") return apply(true);
    if (theme === "light") return apply(false);

    // "system" (or not loaded yet): follow prefers-color-scheme live.
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mql.matches);
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [theme]);
}

export default function App() {
  const [stats, setStats] = useState<TabGuiltStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [theme, setTheme] = useState<Settings["theme"]>();
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  async function refreshStats() {
    const [g, report, settings] = await Promise.all([
      send<TabGuiltStats>({ type: "GET_GUILT_STATS" }),
      send<{ totalCount: number }>({ type: "GET_REPORT" }),
      send<Settings>({ type: "GET_SETTINGS" })
    ]);
    setStats(g);
    setTotalCount(report.totalCount);
    setTheme(settings.theme);
  }

  useEffect(() => {
    refreshStats();
  }, []);

  useTheme(theme);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex flex-col">
        <Header totalCount={totalCount} />
        <TabFan stats={stats} />

        <Tabs defaultValue="overview" className="mt-3">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
            <TabsTrigger value="graveyard">Graveyard</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewPanel onChanged={refreshStats} onUndoAvailable={setUndoMessage} />
          </TabsContent>
          <TabsContent value="duplicates">
            <DuplicatesPanel onChanged={refreshStats} onUndoAvailable={setUndoMessage} />
          </TabsContent>
          <TabsContent value="graveyard">
            <GraveyardPanel onUndoAvailable={setUndoMessage} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsPanel />
          </TabsContent>
        </Tabs>

        <div className="h-14" />
        <UndoToast
          message={undoMessage}
          onDismiss={() => setUndoMessage(null)}
          onUndone={refreshStats}
        />
      </div>
    </TooltipProvider>
  );
}

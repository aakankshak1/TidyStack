import { Button } from "@/components/ui/button";
import { send } from "@/lib/messaging";

export function PremiumBanner() {
  return (
    <div className="mx-4 mt-3 flex items-center justify-between rounded-sm border border-amber-soft bg-amber-soft px-3 py-2">
      <div className="text-[11.5px] leading-snug text-text">
        <span className="font-medium">Go further:</span> auto-archive on schedule + site exceptions
      </div>
      <Button size="sm" variant="outline" onClick={() => send({ type: "OPEN_PAYMENT_PAGE" })}>
        Upgrade
      </Button>
    </div>
  );
}

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[12px] font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "bg-border/60 text-text-muted",
        accent: "bg-accent-soft text-accent",
        amber: "bg-amber-soft text-amber",
        clay: "bg-clay-soft text-clay"
      }
    },
    defaultVariants: { variant: "neutral" }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

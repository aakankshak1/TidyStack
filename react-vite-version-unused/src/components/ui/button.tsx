import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-[14px] font-medium transition-colors duration-150 ease-calm disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent/90",
        outline: "border border-border bg-surface text-text hover:bg-accent-soft hover:border-accent/30",
        ghost: "text-text-muted hover:bg-accent-soft hover:text-text",
        link: "text-accent hover:underline underline-offset-2 p-0 h-auto",
        danger: "text-clay hover:bg-clay-soft"
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2 text-[13.5px]",
        icon: "h-7 w-7"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";

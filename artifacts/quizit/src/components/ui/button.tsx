import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-sans text-sm font-bold uppercase tracking-wider cursor-pointer transition-[transform,box-shadow,background-color,border-color] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-primary-border bg-primary text-primary-foreground hover:glow-primary",
        destructive: "border border-destructive-border bg-destructive text-destructive-foreground hover:brightness-110",
        outline: "border-2 border-border bg-transparent text-foreground hover:border-primary hover:text-primary",
        secondary: "border border-secondary-border bg-secondary text-secondary-foreground hover:glow-secondary",
        ghost: "border border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
        link: "border-none text-primary underline-offset-4 hover:underline normal-case tracking-normal",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-[calc(var(--radius)-2px)] px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

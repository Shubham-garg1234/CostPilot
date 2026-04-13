import type { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function cn(...values: Array<string | false | null | undefined>) {
  return clsx(values);
}

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("glass rounded-[28px] shadow-panel", className)}>{children}</div>;
}

export function Pill({
  children,
  tone = "default"
}: PropsWithChildren<{ tone?: "default" | "warn" | "danger" }>) {
  const styles = {
    default: "bg-black/5 text-slate-700",
    warn: "bg-amber-100 text-amber-900",
    danger: "bg-rose-100 text-rose-900"
  };

  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", styles[tone])}>
      {children}
    </span>
  );
}


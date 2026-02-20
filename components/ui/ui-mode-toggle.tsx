"use client";

import { cn } from "@/lib/utils";
import type { UiMode } from "@/hooks/use-ui-mode";

interface UiModeToggleProps {
  mode: UiMode;
  onModeChange: (mode: UiMode) => void;
  className?: string;
}

export function UiModeToggle({
  mode,
  onModeChange,
  className,
}: UiModeToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border/60 bg-background/60 p-0.5",
        className
      )}
      role="tablist"
      aria-label="Interface mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "simple"}
        onClick={() => onModeChange("simple")}
        className={cn(
          "rounded-sm px-2 py-1 text-[11px] font-medium tracking-tight transition-colors",
          mode === "simple"
            ? "bg-white text-black"
            : "text-muted-foreground hover:text-white"
        )}
      >
        Simple
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "advanced"}
        onClick={() => onModeChange("advanced")}
        className={cn(
          "rounded-sm px-2 py-1 text-[11px] font-medium tracking-tight transition-colors",
          mode === "advanced"
            ? "bg-indigo/80 text-white"
            : "text-muted-foreground hover:text-white"
        )}
      >
        Labs
      </button>
    </div>
  );
}

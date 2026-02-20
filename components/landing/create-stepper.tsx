"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export type CreateStep = "story" | "visual" | "review";

interface CreateStepperProps {
  step: CreateStep;
  canAccessVisual: boolean;
  canAccessReview: boolean;
  onStepChange: (step: CreateStep) => void;
}

const STEP_ORDER: Array<{
  id: CreateStep;
  label: string;
  helper: string;
}> = [
  {
    id: "story",
    label: "Step 1: Story Setup",
    helper: "Describe the scene and conflict for your opening page.",
  },
  {
    id: "visual",
    label: "Step 2: Visual Direction",
    helper: "Choose style and add optional character references.",
  },
  {
    id: "review",
    label: "Step 3: Review & Generate",
    helper: "Confirm summary and generate your first page.",
  },
];

export function CreateStepper({
  step,
  canAccessVisual,
  canAccessReview,
  onStepChange,
}: CreateStepperProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STEP_ORDER.map((item, index) => {
          const isCurrent = item.id === step;
          const isDone =
            (item.id === "story" && (step === "visual" || step === "review")) ||
            (item.id === "visual" && step === "review");
          const isLocked =
            (item.id === "visual" && !canAccessVisual) ||
            (item.id === "review" && !canAccessReview);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => !isLocked && onStepChange(item.id)}
              disabled={isLocked}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/70",
                isCurrent
                  ? "border-indigo/60 bg-indigo/10"
                  : "border-border/60 bg-background/50",
                isLocked
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-indigo/40 hover:bg-indigo/5"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-white" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </p>
                {isDone && (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
              <p className="sr-only">Step {index + 1}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

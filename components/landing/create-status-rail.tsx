"use client";

import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pin,
  PinOff,
} from "lucide-react";

export type CreateStatus = "ready" | "generating" | "saving" | "error" | "done";

interface CreateStatusRailProps {
  status: CreateStatus;
  message: string;
  nextAction: string;
  stageIndex: number;
  isExpanded: boolean;
  isPinned: boolean;
  onToggleExpanded: () => void;
  onTogglePinned: () => void;
}

const STAGES = [
  "Checking generation credits",
  "Uploading character references",
  "Drawing your opening panel",
  "Saving to your story library",
];

function getStatusLabel(status: CreateStatus) {
  if (status === "generating" || status === "saving") return "Generating";
  if (status === "done") return "Saved";
  if (status === "error") return "Error";
  return "Ready";
}

export function CreateStatusRail({
  status,
  message,
  nextAction,
  stageIndex,
  isExpanded,
  isPinned,
  onToggleExpanded,
  onTogglePinned,
}: CreateStatusRailProps) {
  const badgeLabel = getStatusLabel(status);
  const isBusy = status === "generating" || status === "saving";

  return (
    <div className="w-full max-w-sm">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="ml-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-white transition-colors hover:border-indigo/40"
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            status === "error"
              ? "bg-rose-400"
              : status === "done"
                ? "bg-emerald-400"
                : isBusy
                  ? "bg-amber-300"
                  : "bg-sky-300"
          )}
        />
        {badgeLabel}
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            isExpanded ? "rotate-180" : "rotate-0"
          )}
        />
      </button>

      {isExpanded && (
        <div className="mt-2 rounded-xl border border-border/60 bg-background/85 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Live Activity</p>
              <p className="mt-1 text-xs text-muted-foreground">{message}</p>
            </div>
            <button
              type="button"
              onClick={onTogglePinned}
              className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-white"
            >
              {isPinned ? (
                <>
                  <PinOff className="h-3.5 w-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="h-3.5 w-3.5" />
                  Pin
                </>
              )}
            </button>
          </div>

          <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-background/60 p-3">
            {STAGES.map((stage, index) => {
              const isCompleted = status === "done" || stageIndex > index;
              const isActive = stageIndex === index && isBusy;
              return (
                <div key={stage} className="flex items-center gap-2">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />
                  ) : status === "error" && stageIndex === index ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  ) : (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/80" />
                  )}
                  <p
                    className={cn(
                      "text-xs",
                      isCompleted || isActive
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {stage}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Next action
            </p>
            <p className="mt-1 text-xs text-foreground">{nextAction}</p>
          </div>
        </div>
      )}
    </div>
  );
}

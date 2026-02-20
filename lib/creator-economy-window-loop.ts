import {
  CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES,
  type CreatorEconomyOptimizationObjective,
} from "@/lib/creator-economy-optimizer";
import {
  CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS,
  type CreatorEconomyStrategyLoopReport,
} from "@/lib/creator-economy-strategy-loop";
import { type CreatorEconomyAutonomousBacklog } from "@/lib/creator-economy-policy";
import { type CreatorEconomyGovernanceReport } from "@/lib/creator-economy-governance";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";
import { type StoryCreatorEconomyRun } from "@/lib/schema";

export type CreatorEconomyWindowGateStatus = "ready" | "hold" | "blocked";

export type CreatorEconomyWindowGate = {
  status: CreatorEconomyWindowGateStatus;
  reasons: string[];
  windowCompletedRuns: number;
  windowPositiveRate: number;
  staleOpenRuns: number;
};

export type CreatorEconomyWindowAdaptation = {
  nextCadenceHours: number;
  recommendedObjective: CreatorEconomyOptimizationObjective;
  reason: string;
};

export type CreatorEconomyExecutionWindowReport = {
  generatedAt: string;
  activeCycle: {
    cycle: number;
    objective: CreatorEconomyOptimizationObjective;
    mode: string;
    maxActionsPerCycle: number;
    cooldownHours: number;
    scheduledWindowStart: string;
    scheduledWindowEnd: string;
  } | null;
  gate: CreatorEconomyWindowGate;
  adaptation: CreatorEconomyWindowAdaptation;
  preview: {
    readyBacklogItems: number;
    maxActions: number;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, precision = 2): number {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

function getCadenceIndex(cadenceHours: number): number {
  const index = CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS.indexOf(
    cadenceHours as (typeof CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS)[number],
  );
  if (index >= 0) {
    return index;
  }
  return 2;
}

function getActiveCycle({
  strategyLoop,
  now,
}: {
  strategyLoop: CreatorEconomyStrategyLoopReport;
  now: Date;
}) {
  if (strategyLoop.cycles.length === 0) {
    return null;
  }

  for (const cycle of strategyLoop.cycles) {
    const start = Date.parse(cycle.scheduledWindowStart);
    const end = Date.parse(cycle.scheduledWindowEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }
    if (now.getTime() >= start && now.getTime() < end) {
      return cycle;
    }
  }

  const firstUpcoming = strategyLoop.cycles.find((cycle) => {
    const start = Date.parse(cycle.scheduledWindowStart);
    return Number.isFinite(start) && start > now.getTime();
  });
  if (firstUpcoming) {
    return firstUpcoming;
  }

  return strategyLoop.cycles[strategyLoop.cycles.length - 1] ?? null;
}

function getRunCombinedDelta(run: StoryCreatorEconomyRun): number | null {
  const baseline = run.baselineMetrics?.combinedScore;
  const outcome = run.outcomeMetrics?.combinedScore;
  if (typeof baseline !== "number" || typeof outcome !== "number") {
    return null;
  }
  return outcome - baseline;
}

function isPositiveRun(run: StoryCreatorEconomyRun): boolean {
  const decision = run.outcomeDecision?.trim().toLowerCase();
  const delta = getRunCombinedDelta(run);

  if (decision === "archive") {
    return false;
  }

  if (delta !== null) {
    if (decision === "scale") {
      return delta >= -2;
    }
    if (decision === "hold") {
      return delta >= -1;
    }
    return delta >= 0;
  }

  return decision === "scale" || decision === "iterate";
}

function getRunsInCycleWindow({
  history,
  cycle,
}: {
  history: StoryCreatorEconomyRun[];
  cycle: NonNullable<ReturnType<typeof getActiveCycle>>;
}): StoryCreatorEconomyRun[] {
  const start = Date.parse(cycle.scheduledWindowStart);
  const end = Date.parse(cycle.scheduledWindowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [];
  }
  return history.filter((run) => {
    const createdAt = run.createdAt.getTime();
    return createdAt >= start && createdAt < end;
  });
}

function nextObjectiveForGate({
  gateStatus,
  windowPositiveRate,
  governance,
}: {
  gateStatus: CreatorEconomyWindowGateStatus;
  windowPositiveRate: number;
  governance: CreatorEconomyGovernanceReport;
}): CreatorEconomyOptimizationObjective {
  if (gateStatus === "blocked" || gateStatus === "hold") {
    return "stabilize";
  }
  if (governance.status === "healthy" && windowPositiveRate >= 0.75) {
    return "growth";
  }
  return "balanced";
}

function asObjective(
  value: string,
): CreatorEconomyOptimizationObjective {
  return CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES.includes(
    value as CreatorEconomyOptimizationObjective,
  )
    ? (value as CreatorEconomyOptimizationObjective)
    : "balanced";
}

export function buildCreatorEconomyExecutionWindowReport({
  strategyLoop,
  history,
  learning,
  governance,
  backlog,
  now = new Date(),
}: {
  strategyLoop: CreatorEconomyStrategyLoopReport;
  history: StoryCreatorEconomyRun[];
  learning: CreatorEconomyPolicyLearningReport;
  governance: CreatorEconomyGovernanceReport;
  backlog: CreatorEconomyAutonomousBacklog;
  now?: Date;
}): CreatorEconomyExecutionWindowReport {
  const activeCycle = getActiveCycle({
    strategyLoop,
    now,
  });

  const readyBacklogItems = backlog.summary.ready;
  const maxActions = activeCycle
    ? clamp(
        Math.min(activeCycle.maxActionsPerCycle, governance.constraints.maxActionsCap),
        1,
        5,
      )
    : Math.max(1, governance.constraints.maxActionsCap);

  const gateReasons: string[] = [];
  let gateStatus: CreatorEconomyWindowGateStatus = "ready";
  let windowCompletedRuns = 0;
  let windowPositiveRate = 0;

  if (!activeCycle) {
    gateStatus = "hold";
    gateReasons.push("No active strategy cycle window is available.");
  } else {
    const runsInWindow = getRunsInCycleWindow({
      history,
      cycle: activeCycle,
    });
    const completedInWindow = runsInWindow.filter((run) => run.status === "completed");
    windowCompletedRuns = completedInWindow.length;

    if (completedInWindow.length > 0) {
      const positiveRuns = completedInWindow.filter((run) => isPositiveRun(run)).length;
      windowPositiveRate = positiveRuns / completedInWindow.length;
    }

    if (governance.status === "paused") {
      gateStatus = "blocked";
      gateReasons.push("Governance is paused; execution window is blocked.");
    } else if (learning.totals.staleOpenRuns >= 2) {
      gateStatus = "hold";
      gateReasons.push(
        `${learning.totals.staleOpenRuns} stale open runs detected; close outcome debt before progressing cadence.`,
      );
    } else if (windowCompletedRuns === 0) {
      gateStatus = "hold";
      gateReasons.push("No completed outcomes in the active window yet.");
    } else if (windowPositiveRate < 0.55) {
      gateStatus = "hold";
      gateReasons.push(
        `Window positive rate is ${Math.round(windowPositiveRate * 100)}%; need >= 55% to unlock cadence progression.`,
      );
    }
  }

  if (gateReasons.length === 0) {
    gateReasons.push("Execution window is healthy and outcome-gated progression is available.");
  }

  const cadenceIndex = getCadenceIndex(strategyLoop.cadenceHours);
  let nextCadenceIndex = cadenceIndex;
  let adaptationReason = "Cadence remains stable based on current window outcomes.";

  if (gateStatus === "ready" && windowPositiveRate >= 0.8 && learning.totals.staleOpenRuns === 0) {
    nextCadenceIndex = Math.max(0, cadenceIndex - 1);
    adaptationReason = "Strong window outcomes detected; cadence can accelerate one step.";
  } else if (gateStatus === "hold" || gateStatus === "blocked") {
    nextCadenceIndex = Math.min(
      CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS.length - 1,
      cadenceIndex + 1,
    );
    adaptationReason =
      gateStatus === "blocked"
        ? "Governance blocked window; cadence is slowed for safety."
        : "Outcome gate is on hold; cadence is slowed until positive closure improves.";
  }

  const nextCadenceHours = CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS[nextCadenceIndex];
  const recommendedObjective = nextObjectiveForGate({
    gateStatus,
    windowPositiveRate,
    governance,
  });

  return {
    generatedAt: now.toISOString(),
    activeCycle: activeCycle
      ? {
          cycle: activeCycle.cycle,
          objective: asObjective(activeCycle.objective),
          mode: activeCycle.mode,
          maxActionsPerCycle: activeCycle.maxActionsPerCycle,
          cooldownHours: activeCycle.cooldownHours,
          scheduledWindowStart: activeCycle.scheduledWindowStart,
          scheduledWindowEnd: activeCycle.scheduledWindowEnd,
        }
      : null,
    gate: {
      status: gateStatus,
      reasons: gateReasons,
      windowCompletedRuns,
      windowPositiveRate: round(windowPositiveRate),
      staleOpenRuns: learning.totals.staleOpenRuns,
    },
    adaptation: {
      nextCadenceHours,
      recommendedObjective,
      reason: adaptationReason,
    },
    preview: {
      readyBacklogItems,
      maxActions,
    },
  };
}

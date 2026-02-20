import {
  applyCreatorEconomyOptimizerProfileToPolicy,
  type CreatorEconomyOptimizationObjective,
  type CreatorEconomyOptimizerReport,
} from "@/lib/creator-economy-optimizer";
import { type CreatorEconomyAutonomousBacklog, type CreatorEconomyDecisionPolicy } from "@/lib/creator-economy-policy";
import { type CreatorEconomyGovernanceReport } from "@/lib/creator-economy-governance";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";

export const CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS = [6, 8, 12, 18, 24] as const;

export type CreatorEconomyStrategyCadenceHours =
  (typeof CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS)[number];

export type CreatorEconomyStrategyCycle = {
  cycle: number;
  objective: CreatorEconomyOptimizationObjective;
  mode: CreatorEconomyDecisionPolicy["mode"];
  maxActionsPerCycle: number;
  cooldownHours: number;
  scheduledWindowStart: string;
  scheduledWindowEnd: string;
  rationale: string;
};

export type CreatorEconomyStrategyLoopReport = {
  generatedAt: string;
  selectedObjective: CreatorEconomyOptimizationObjective;
  recommendedCadenceHours: CreatorEconomyStrategyCadenceHours;
  cadenceHours: CreatorEconomyStrategyCadenceHours;
  autoOptimizeEnabled: boolean;
  safeWindow: boolean;
  nextRefreshAt: string;
  cycles: CreatorEconomyStrategyCycle[];
  guardrails: string[];
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pickClosestCadence(
  value: number,
): CreatorEconomyStrategyCadenceHours {
  let best: CreatorEconomyStrategyCadenceHours =
    CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS[0];
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS) {
    const delta = Math.abs(option - value);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = option;
    }
  }

  return best;
}

function getRecommendedCadence({
  governance,
  learning,
  backlog,
}: {
  governance: CreatorEconomyGovernanceReport;
  learning: CreatorEconomyPolicyLearningReport;
  backlog: CreatorEconomyAutonomousBacklog;
}): CreatorEconomyStrategyCadenceHours {
  if (governance.status === "paused") {
    return 24;
  }
  if (governance.status === "watch") {
    return 12;
  }

  if (
    learning.totals.overallPositiveRate >= 0.75 &&
    backlog.summary.ready >= 2 &&
    learning.totals.staleOpenRuns === 0
  ) {
    return 6;
  }

  if (learning.totals.overallPositiveRate >= 0.62) {
    return 8;
  }

  return 12;
}

function isSafeWindow({
  governance,
  learning,
}: {
  governance: CreatorEconomyGovernanceReport;
  learning: CreatorEconomyPolicyLearningReport;
}): boolean {
  return (
    governance.status === "healthy" &&
    learning.totals.staleOpenRuns === 0 &&
    governance.signals.riskyOutcomeRate < 0.4
  );
}

function chooseCycleObjective({
  previousObjective,
  cycle,
  safeWindow,
  autoOptimizeEnabled,
  governance,
  learning,
  backlog,
  selectedObjective,
}: {
  previousObjective: CreatorEconomyOptimizationObjective;
  cycle: number;
  safeWindow: boolean;
  autoOptimizeEnabled: boolean;
  governance: CreatorEconomyGovernanceReport;
  learning: CreatorEconomyPolicyLearningReport;
  backlog: CreatorEconomyAutonomousBacklog;
  selectedObjective: CreatorEconomyOptimizationObjective;
}): { objective: CreatorEconomyOptimizationObjective; rationale: string } {
  if (cycle === 1) {
    return {
      objective: selectedObjective,
      rationale: `Operator-selected entry objective: ${selectedObjective}.`,
    };
  }

  if (governance.status === "paused") {
    return {
      objective: "stabilize",
      rationale:
        "Governance is paused; enforcing stabilize objective until loop health recovers.",
    };
  }

  if (!autoOptimizeEnabled) {
    return {
      objective: selectedObjective,
      rationale:
        "Auto-optimization is disabled; cadence will reuse the selected objective.",
    };
  }

  if (learning.totals.overallPositiveRate < 0.5 || learning.totals.staleOpenRuns >= 2) {
    return {
      objective: "stabilize",
      rationale:
        "Risk/staleness signals are elevated; shifting to stabilize objective.",
    };
  }

  if (
    safeWindow &&
    learning.totals.overallPositiveRate >= 0.7 &&
    backlog.summary.ready >= 2
  ) {
    return {
      objective: "growth",
      rationale:
        "Healthy loop with ready backlog; upgrading cycle objective to growth.",
    };
  }

  if (previousObjective === "growth" && governance.status !== "healthy") {
    return {
      objective: "balanced",
      rationale:
        "Governance is no longer healthy; de-escalating from growth to balanced.",
    };
  }

  return {
    objective: "balanced",
    rationale: "Maintaining balanced objective for controlled throughput.",
  };
}

export function buildCreatorEconomyStrategyLoopReport({
  policy,
  optimizerReport,
  governance,
  learning,
  backlog,
  selectedObjective,
  cadenceHours,
  autoOptimize,
  now = new Date(),
}: {
  policy: CreatorEconomyDecisionPolicy;
  optimizerReport: CreatorEconomyOptimizerReport;
  governance: CreatorEconomyGovernanceReport;
  learning: CreatorEconomyPolicyLearningReport;
  backlog: CreatorEconomyAutonomousBacklog;
  selectedObjective: CreatorEconomyOptimizationObjective;
  cadenceHours?: number;
  autoOptimize?: boolean;
  now?: Date;
}): CreatorEconomyStrategyLoopReport {
  const recommendedCadenceHours = getRecommendedCadence({
    governance,
    learning,
    backlog,
  });
  const selectedCadence =
    cadenceHours === undefined
      ? recommendedCadenceHours
      : pickClosestCadence(clamp(cadenceHours, 6, 24));

  const safeWindow = isSafeWindow({
    governance,
    learning,
  });
  const autoOptimizeEnabled =
    autoOptimize ??
    (safeWindow &&
      governance.constraints.allowAutorun &&
      backlog.summary.ready > 0);

  const notes: string[] = [];
  notes.push(
    `Cadence selected at ${selectedCadence}h (recommended ${recommendedCadenceHours}h).`,
  );
  notes.push(
    `Loop health: ${Math.round(learning.totals.overallPositiveRate * 100)}% positive outcomes with ${learning.totals.staleOpenRuns} stale run(s).`,
  );
  if (!autoOptimizeEnabled) {
    notes.push(
      "Auto-optimization is currently off; objective progression stays operator-controlled.",
    );
  } else {
    notes.push(
      "Auto-optimization is enabled and will rebalance future cycles when loop signals drift.",
    );
  }

  const guardrails = [
    "Never exceed governance max action cap for any strategy cycle.",
    "Always honor governance cooldown floor before scheduling the next cycle.",
    "If governance enters paused state, force objective to stabilize until health recovers.",
  ];

  const cycles: CreatorEconomyStrategyCycle[] = [];
  let rollingPolicy = policy;
  let rollingObjective = selectedObjective;

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const nextObjective = chooseCycleObjective({
      previousObjective: rollingObjective,
      cycle,
      safeWindow,
      autoOptimizeEnabled,
      governance,
      learning,
      backlog,
      selectedObjective,
    });
    const optimizedPolicy = applyCreatorEconomyOptimizerProfileToPolicy({
      policy: rollingPolicy,
      report: optimizerReport,
      objective: nextObjective.objective,
    });
    const maxActionsPerCycle = Math.min(
      optimizedPolicy.maxActionsPerCycle,
      governance.constraints.maxActionsCap,
    );
    const cooldownHours = Math.max(
      optimizedPolicy.cooldownHours,
      governance.constraints.cooldownFloorHours,
    );

    const scheduledWindowStart = new Date(
      now.getTime() + (cycle - 1) * selectedCadence * 3600000,
    );
    const scheduledWindowEnd = new Date(
      scheduledWindowStart.getTime() + selectedCadence * 3600000,
    );

    cycles.push({
      cycle,
      objective: nextObjective.objective,
      mode: optimizedPolicy.mode,
      maxActionsPerCycle,
      cooldownHours,
      scheduledWindowStart: scheduledWindowStart.toISOString(),
      scheduledWindowEnd: scheduledWindowEnd.toISOString(),
      rationale: nextObjective.rationale,
    });

    rollingObjective = nextObjective.objective;
    rollingPolicy = {
      ...optimizedPolicy,
      maxActionsPerCycle,
      cooldownHours,
    };
  }

  const nextRefreshAt = new Date(
    now.getTime() + selectedCadence * 3600000,
  ).toISOString();

  return {
    generatedAt: now.toISOString(),
    selectedObjective,
    recommendedCadenceHours,
    cadenceHours: selectedCadence,
    autoOptimizeEnabled,
    safeWindow,
    nextRefreshAt,
    cycles,
    guardrails,
    notes,
  };
}

import { type CreatorEconomyAutonomousBacklog, type CreatorEconomyAutonomyMode, type CreatorEconomyDecisionPolicy } from "@/lib/creator-economy-policy";
import { type CreatorEconomyGovernanceReport } from "@/lib/creator-economy-governance";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";

export const CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES = [
  "stabilize",
  "balanced",
  "growth",
] as const;

export type CreatorEconomyOptimizationObjective =
  (typeof CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES)[number];

export type CreatorEconomyOptimizerProfile = {
  objective: CreatorEconomyOptimizationObjective;
  label: string;
  rationale: string;
  policyOverride: {
    mode: CreatorEconomyAutonomyMode;
    maxActionsPerCycle: number;
    cooldownHours: number;
  };
  expectedImpact: {
    velocityDelta: number;
    riskDelta: number;
    confidenceDelta: number;
  };
};

export type CreatorEconomyOptimizerReport = {
  generatedAt: string;
  recommendedObjective: CreatorEconomyOptimizationObjective;
  profiles: CreatorEconomyOptimizerProfile[];
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getProfileByObjective({
  report,
  objective,
}: {
  report: CreatorEconomyOptimizerReport;
  objective: CreatorEconomyOptimizationObjective;
}): CreatorEconomyOptimizerProfile {
  return report.profiles.find((profile) => profile.objective === objective) ?? report.profiles[1]!;
}

export function buildCreatorEconomyOptimizerReport({
  policy,
  learning,
  governance,
  backlog,
  now = new Date(),
}: {
  policy: CreatorEconomyDecisionPolicy;
  learning: CreatorEconomyPolicyLearningReport;
  governance: CreatorEconomyGovernanceReport;
  backlog: CreatorEconomyAutonomousBacklog;
  now?: Date;
}): CreatorEconomyOptimizerReport {
  const readyItems = backlog.summary.ready;
  const positiveRate = learning.totals.overallPositiveRate;
  const staleOpenRuns = learning.totals.staleOpenRuns;

  const stabilizeMode: CreatorEconomyAutonomyMode =
    governance.status === "paused" ? "manual" : "assist";
  const stabilizeMaxActions = 1;
  const stabilizeCooldown = clamp(
    Math.max(policy.cooldownHours + 2, governance.constraints.cooldownFloorHours + 2),
    6,
    24,
  );

  const balancedMode: CreatorEconomyAutonomyMode =
    policy.mode === "auto" && governance.status !== "healthy" ? "assist" : policy.mode;
  const balancedMaxActions = clamp(
    Math.min(policy.maxActionsPerCycle, governance.constraints.maxActionsCap),
    1,
    5,
  );
  const balancedCooldown = clamp(
    Math.max(policy.cooldownHours, governance.constraints.cooldownFloorHours),
    4,
    24,
  );

  const growthMode: CreatorEconomyAutonomyMode =
    governance.status === "healthy" ? "auto" : "assist";
  const growthMaxActions = clamp(
    Math.min(
      governance.constraints.maxActionsCap,
      Math.max(policy.maxActionsPerCycle, 2),
    ),
    1,
    5,
  );
  const growthCooldown = clamp(
    Math.max(governance.constraints.cooldownFloorHours, policy.cooldownHours - 2),
    4,
    24,
  );

  const profiles: CreatorEconomyOptimizerProfile[] = [
    {
      objective: "stabilize",
      label: "Stabilize Loop",
      rationale:
        "Prioritize safety and canon reliability while reducing throughput volatility.",
      policyOverride: {
        mode: stabilizeMode,
        maxActionsPerCycle: stabilizeMaxActions,
        cooldownHours: stabilizeCooldown,
      },
      expectedImpact: {
        velocityDelta: -18,
        riskDelta: -28,
        confidenceDelta: +6,
      },
    },
    {
      objective: "balanced",
      label: "Balanced Throughput",
      rationale:
        "Maintain measured delivery speed while preserving governance-safe constraints.",
      policyOverride: {
        mode: balancedMode,
        maxActionsPerCycle: balancedMaxActions,
        cooldownHours: balancedCooldown,
      },
      expectedImpact: {
        velocityDelta: +4,
        riskDelta: -6,
        confidenceDelta: +4,
      },
    },
    {
      objective: "growth",
      label: "Scale Window",
      rationale:
        "Maximize cycle output when loop health is strong and stale debt is under control.",
      policyOverride: {
        mode: growthMode,
        maxActionsPerCycle: growthMaxActions,
        cooldownHours: growthCooldown,
      },
      expectedImpact: {
        velocityDelta: +20,
        riskDelta: +14,
        confidenceDelta: -4,
      },
    },
  ];

  let recommendedObjective: CreatorEconomyOptimizationObjective = "balanced";
  if (
    governance.status === "paused" ||
    staleOpenRuns >= 3 ||
    positiveRate < 0.45
  ) {
    recommendedObjective = "stabilize";
  } else if (
    governance.status === "healthy" &&
    positiveRate >= 0.68 &&
    readyItems >= 2
  ) {
    recommendedObjective = "growth";
  }

  const notes: string[] = [];
  if (recommendedObjective === "stabilize") {
    notes.push("Optimizer recommends stabilization due to loop-health risk signals.");
  }
  if (recommendedObjective === "growth") {
    notes.push("Optimizer detected a healthy scale window with sufficient ready backlog.");
  }
  notes.push(
    `Governance status is ${governance.status}; max action cap is ${governance.constraints.maxActionsCap}.`,
  );
  notes.push(
    `Learning signals: ${Math.round(positiveRate * 100)}% positive outcomes, ${staleOpenRuns} stale open run(s).`,
  );

  return {
    generatedAt: now.toISOString(),
    recommendedObjective,
    profiles,
    notes,
  };
}

export function applyCreatorEconomyOptimizerProfileToPolicy({
  policy,
  report,
  objective,
}: {
  policy: CreatorEconomyDecisionPolicy;
  report: CreatorEconomyOptimizerReport;
  objective: CreatorEconomyOptimizationObjective;
}): CreatorEconomyDecisionPolicy {
  const profile = getProfileByObjective({
    report,
    objective,
  });

  const confidenceShift =
    objective === "stabilize" ? +8 : objective === "growth" ? -6 : +2;

  return {
    ...policy,
    mode: profile.policyOverride.mode,
    maxActionsPerCycle: profile.policyOverride.maxActionsPerCycle,
    cooldownHours: profile.policyOverride.cooldownHours,
    confidence: clamp(policy.confidence + confidenceShift, 10, 99),
    rationale: [...policy.rationale, `Optimizer objective applied: ${profile.label}.`],
    guardrails: [
      ...policy.guardrails,
      `Optimizer objective ${profile.objective} active; reassess after one cycle.`,
    ],
  };
}

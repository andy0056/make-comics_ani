import {
  type CreatorEconomyAutomationExecution,
  type CreatorEconomyAutomationPlan,
  type CreatorEconomyAutomationRecommendation,
} from "@/lib/creator-economy-automation";
import { type RoleAgentId } from "@/lib/collaborative-role-agents";
import { type CreatorEconomyOperatingPlan } from "@/lib/creator-economy-orchestrator";
import { type StoryCreatorEconomyRun } from "@/lib/schema";

export const CREATOR_ECONOMY_AUTONOMY_MODES = [
  "manual",
  "assist",
  "auto",
] as const;

export type CreatorEconomyAutonomyMode =
  (typeof CREATOR_ECONOMY_AUTONOMY_MODES)[number];

export type CreatorEconomyDecisionPolicy = {
  mode: CreatorEconomyAutonomyMode;
  recommendedOutcome: "scale" | "iterate" | "hold" | "archive";
  confidence: number;
  rationale: string[];
  guardrails: string[];
  maxActionsPerCycle: number;
  cooldownHours: number;
};

export type CreatorEconomyBacklogItemStatus =
  | "ready"
  | "blocked"
  | "cooldown";

export type CreatorEconomyAutonomousBacklogItem = {
  id: string;
  recommendationId: string;
  title: string;
  priority: "high" | "medium" | "low";
  ownerRoleAgentId: RoleAgentId;
  ownerUserId: string | null;
  status: CreatorEconomyBacklogItemStatus;
  score: number;
  reason: string;
  execution: CreatorEconomyAutomationExecution;
  triggerIds: string[];
  lastExecutedAt: string | null;
  cooldownUntil: string | null;
};

export type CreatorEconomyAutonomousBacklog = {
  generatedAt: string;
  mode: CreatorEconomyAutonomyMode;
  policy: CreatorEconomyDecisionPolicy;
  summary: {
    total: number;
    ready: number;
    blocked: number;
    cooldown: number;
  };
  items: CreatorEconomyAutonomousBacklogItem[];
};

function parseRunPlan(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function getRecommendationIdFromRun(run: StoryCreatorEconomyRun): string | null {
  const plan = parseRunPlan(run.plan);

  const directId = plan.executedRecommendationId;
  if (typeof directId === "string" && directId.trim().length > 0) {
    return directId;
  }

  const recommendation = plan.recommendation;
  if (recommendation && typeof recommendation === "object") {
    const candidateId = (recommendation as Record<string, unknown>).id;
    if (typeof candidateId === "string" && candidateId.trim().length > 0) {
      return candidateId;
    }
  }

  return null;
}

function getExecutionSource(run: StoryCreatorEconomyRun): string | null {
  const plan = parseRunPlan(run.plan);
  const source = plan.source;
  if (typeof source === "string" && source.trim().length > 0) {
    return source;
  }
  return null;
}

function getPriorityWeight(priority: CreatorEconomyAutomationRecommendation["priority"]): number {
  switch (priority) {
    case "high":
      return 100;
    case "medium":
      return 72;
    case "low":
      return 45;
    default:
      return 50;
  }
}

function hoursBetween(now: Date, then: Date): number {
  return Math.max(0, (now.getTime() - then.getTime()) / 3600000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function buildCreatorEconomyDecisionPolicy({
  mode,
  automationPlan,
  operatingPlan,
  history,
  now = new Date(),
}: {
  mode: CreatorEconomyAutonomyMode;
  automationPlan: CreatorEconomyAutomationPlan;
  operatingPlan: CreatorEconomyOperatingPlan;
  history: StoryCreatorEconomyRun[];
  now?: Date;
}): CreatorEconomyDecisionPolicy {
  const activeRisk = automationPlan.triggers.filter(
    (trigger) => trigger.kind === "risk" && trigger.status === "fired",
  );
  const activeOpportunities = automationPlan.triggers.filter(
    (trigger) => trigger.kind === "opportunity" && trigger.status === "fired",
  );
  const highRiskCount = activeRisk.filter((trigger) => trigger.severity === "high").length;

  const latestRun = history[0] ?? null;
  const latestRunAt = latestRun?.completedAt ?? latestRun?.createdAt ?? null;
  const idleHours = latestRunAt ? hoursBetween(now, latestRunAt) : Number.POSITIVE_INFINITY;

  let recommendedOutcome: CreatorEconomyDecisionPolicy["recommendedOutcome"] = "iterate";
  if (highRiskCount >= 2 || operatingPlan.scoreBand === "stabilize") {
    recommendedOutcome = "iterate";
  } else if (activeRisk.length === 0 && activeOpportunities.length > 0) {
    recommendedOutcome = "scale";
  } else if (activeRisk.length === 0 && activeOpportunities.length === 0) {
    recommendedOutcome = "hold";
  }

  const maxActionsPerCycle =
    mode === "manual" ? 1 : mode === "assist" ? 2 : 3;
  const cooldownHours =
    mode === "manual"
      ? 18
      : activeRisk.length > 0
        ? 12
        : 8;

  const confidence = clamp(
    Math.round(
      48 +
        (activeOpportunities.length > 0 ? 18 : 0) +
        (highRiskCount === 0 ? 12 : 0) +
        (idleHours >= 24 ? 10 : 0),
    ),
    35,
    95,
  );

  const rationale: string[] = [];
  if (highRiskCount > 0) {
    rationale.push(
      `${highRiskCount} high-risk trigger(s) active; bias policy toward controlled iteration before scale decisions.`,
    );
  }
  if (activeOpportunities.length > 0) {
    rationale.push("Opportunity trigger detected; distribution scale can be tested under quality gates.");
  }
  if (idleHours >= 24) {
    rationale.push("Execution loop is stale; enqueue at least one recommendation to restore learning cadence.");
  }
  if (rationale.length === 0) {
    rationale.push("Signals are stable; continue measured execution with periodic trigger refresh.");
  }

  const guardrails = [
    "Always keep continuity + publishing quality gates active during autonomous runs.",
    "Require explicit owner assignment for every queued recommendation before execution.",
    "Never execute more than max actions per cycle; reassess triggers after each cycle.",
  ];

  return {
    mode,
    recommendedOutcome,
    confidence,
    rationale,
    guardrails,
    maxActionsPerCycle,
    cooldownHours,
  };
}

function findLastExecutionByRecommendation({
  recommendationId,
  history,
}: {
  recommendationId: string;
  history: StoryCreatorEconomyRun[];
}): StoryCreatorEconomyRun | null {
  for (const run of history) {
    const source = getExecutionSource(run);
    if (
      source !== "economy_automation" &&
      source !== "economy_backlog" &&
      source !== "economy_autorun" &&
      source !== "economy_window_loop" &&
      source !== "economy_self_healing"
    ) {
      continue;
    }

    const runRecommendationId = getRecommendationIdFromRun(run);
    if (runRecommendationId === recommendationId) {
      return run;
    }
  }

  return null;
}

export function buildCreatorEconomyAutonomousBacklog({
  mode,
  automationPlan,
  policy,
  history,
  now = new Date(),
}: {
  mode: CreatorEconomyAutonomyMode;
  automationPlan: CreatorEconomyAutomationPlan;
  policy: CreatorEconomyDecisionPolicy;
  history: StoryCreatorEconomyRun[];
  now?: Date;
}): CreatorEconomyAutonomousBacklog {
  const queueByRecommendationId = new Map(
    automationPlan.queue.map((item) => [item.recommendationId, item]),
  );

  const items = automationPlan.recommendations
    .map<CreatorEconomyAutonomousBacklogItem>((recommendation) => {
      const queueItem = queueByRecommendationId.get(recommendation.id);
      const lastRun = findLastExecutionByRecommendation({
        recommendationId: recommendation.id,
        history,
      });

      const executedAt = lastRun?.completedAt ?? lastRun?.createdAt ?? null;
      const elapsedHours = executedAt ? hoursBetween(now, executedAt) : Number.POSITIVE_INFINITY;
      const cooldownActive = elapsedHours < policy.cooldownHours;

      let status: CreatorEconomyBacklogItemStatus = "ready";
      let reason = "Ready for execution.";
      if (queueItem && queueItem.status === "blocked") {
        status = "blocked";
        reason = queueItem.reason;
      } else if (cooldownActive) {
        status = "cooldown";
        reason = `Cooling down for ${Math.ceil(policy.cooldownHours - elapsedHours)}h.`;
      }

      const priorityWeight = getPriorityWeight(recommendation.priority);
      const triggerBoost = recommendation.triggerIds.length * 8;
      const queueBoost = status === "ready" ? 12 : status === "cooldown" ? -6 : -30;
      const score = priorityWeight + triggerBoost + queueBoost;

      const cooldownUntil =
        cooldownActive && executedAt
          ? new Date(executedAt.getTime() + policy.cooldownHours * 3600000).toISOString()
          : null;

      return {
        id: `backlog-${recommendation.id}`,
        recommendationId: recommendation.id,
        title: recommendation.title,
        priority: recommendation.priority,
        ownerRoleAgentId: recommendation.ownerRoleAgentId,
        ownerUserId: queueItem?.ownerUserId ?? null,
        status,
        score,
        reason,
        execution: recommendation.execution,
        triggerIds: recommendation.triggerIds,
        lastExecutedAt: executedAt ? executedAt.toISOString() : null,
        cooldownUntil,
      };
    })
    .sort((left, right) => right.score - left.score);

  return {
    generatedAt: now.toISOString(),
    mode,
    policy,
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      cooldown: items.filter((item) => item.status === "cooldown").length,
    },
    items,
  };
}

export function selectCreatorEconomyBacklogExecutionItems({
  backlog,
  maxActions,
}: {
  backlog: CreatorEconomyAutonomousBacklog;
  maxActions?: number;
}): CreatorEconomyAutonomousBacklogItem[] {
  const boundedMax = clamp(
    Math.round(maxActions ?? backlog.policy.maxActionsPerCycle),
    1,
    5,
  );

  return backlog.items
    .filter((item) => item.status === "ready")
    .slice(0, boundedMax);
}

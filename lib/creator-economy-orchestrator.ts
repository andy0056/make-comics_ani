import { type Story } from "@/lib/schema";
import { type CreatorRoleAgentsBoard, type RoleAgentId } from "@/lib/collaborative-role-agents";
import { type IpIncubatorReport } from "@/lib/ip-incubator";
import { type MerchabilityDetectorReport, type MerchExperimentPlan } from "@/lib/merchability-detector";

export type CreatorEconomyMetricKey =
  | "combinedScore"
  | "ipOverall"
  | "retentionPotential"
  | "merchSignal"
  | "roleCoverage"
  | "collaboratorCount"
  | "remixCount"
  | "pageCount";

export type CreatorEconomyMetrics = Record<CreatorEconomyMetricKey, number>;

export type CreatorEconomyMetricDelta = {
  key: CreatorEconomyMetricKey;
  label: string;
  current: number;
  previous: number | null;
  delta: number | null;
};

export type CreatorEconomyPriorityTrack = {
  id: string;
  label: string;
  ownerRoleAgentId: RoleAgentId;
  priority: "high" | "medium" | "low";
  rationale: string;
  nextActions: string[];
};

export type CreatorEconomyOperatingPlan = {
  generatedAt: string;
  storySlug: string;
  storyTitle: string;
  sprintObjective: CreatorRoleAgentsBoard["sprintObjective"];
  horizonDays: number;
  scoreBand: "aggressive" | "balanced" | "stabilize";
  baselineMetrics: CreatorEconomyMetrics;
  metricDeltas: CreatorEconomyMetricDelta[];
  priorityTracks: CreatorEconomyPriorityTrack[];
  executionLoop: string[];
  blockerWatchlist: string[];
  rolloutNote: string;
};

export type CreatorEconomyRunDeltaReport = {
  runId: string;
  status: string;
  baselineMetrics: CreatorEconomyMetrics;
  outcomeMetrics: Partial<CreatorEconomyMetrics>;
  deltas: CreatorEconomyMetricDelta[];
  summary: string;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max);
}

function toScore(value: number): number {
  return Math.round(clamp(value));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function normalizeCreatorEconomyMetrics(
  value: unknown,
): Partial<CreatorEconomyMetrics> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  const output: Partial<CreatorEconomyMetrics> = {};

  const metricKeys: CreatorEconomyMetricKey[] = [
    "combinedScore",
    "ipOverall",
    "retentionPotential",
    "merchSignal",
    "roleCoverage",
    "collaboratorCount",
    "remixCount",
    "pageCount",
  ];

  for (const key of metricKeys) {
    const numeric = toNumber(input[key]);
    if (numeric !== null) {
      output[key] = numeric;
    }
  }

  return output;
}

function metricLabel(key: CreatorEconomyMetricKey): string {
  switch (key) {
    case "combinedScore":
      return "Combined Score";
    case "ipOverall":
      return "IP Readiness";
    case "retentionPotential":
      return "Retention Potential";
    case "merchSignal":
      return "Merch Signal";
    case "roleCoverage":
      return "Role Coverage";
    case "collaboratorCount":
      return "Collaborator Count";
    case "remixCount":
      return "Remix Count";
    case "pageCount":
      return "Page Count";
    default:
      return key;
  }
}

function buildMetrics({
  ipReport,
  merchReport,
  roleBoard,
}: {
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
  roleBoard: CreatorRoleAgentsBoard;
}): CreatorEconomyMetrics {
  const roleCoverage = toScore(
    (roleBoard.roster.filter((role) => Boolean(role.ownerUserId)).length /
      Math.max(roleBoard.roster.length, 1)) *
      100,
  );

  const combinedScore = toScore(
    ipReport.overallScore * 0.38 +
      ipReport.retentionPotentialScore * 0.2 +
      merchReport.overallScore * 0.24 +
      roleCoverage * 0.18,
  );

  return {
    combinedScore,
    ipOverall: ipReport.overallScore,
    retentionPotential: ipReport.retentionPotentialScore,
    merchSignal: merchReport.overallScore,
    roleCoverage,
    collaboratorCount: roleBoard.participants.length,
    remixCount: ipReport.signals.remixCount,
    pageCount: ipReport.signals.pageCount,
  };
}

function getScoreBand(combinedScore: number): CreatorEconomyOperatingPlan["scoreBand"] {
  if (combinedScore >= 78) {
    return "aggressive";
  }
  if (combinedScore >= 58) {
    return "balanced";
  }
  return "stabilize";
}

function buildMetricDeltas({
  current,
  previous,
}: {
  current: CreatorEconomyMetrics;
  previous: Partial<CreatorEconomyMetrics>;
}): CreatorEconomyMetricDelta[] {
  const keys: CreatorEconomyMetricKey[] = [
    "combinedScore",
    "ipOverall",
    "retentionPotential",
    "merchSignal",
    "roleCoverage",
    "collaboratorCount",
    "remixCount",
    "pageCount",
  ];

  return keys.map((key) => {
    const previousValue = toNumber(previous[key]);
    return {
      key,
      label: metricLabel(key),
      current: current[key],
      previous: previousValue,
      delta: previousValue === null ? null : Math.round((current[key] - previousValue) * 10) / 10,
    };
  });
}

function buildPriorityTracks({
  roleBoard,
  ipReport,
  merchReport,
  merchPlan,
}: {
  roleBoard: CreatorRoleAgentsBoard;
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
  merchPlan: MerchExperimentPlan | null;
}): CreatorEconomyPriorityTrack[] {
  const storyArchitect = roleBoard.roster.find((role) => role.id === "story_architect");
  const continuityDirector = roleBoard.roster.find(
    (role) => role.id === "continuity_director",
  );
  const merchOperator = roleBoard.roster.find((role) => role.id === "merch_operator");
  const distributionOperator = roleBoard.roster.find(
    (role) => role.id === "distribution_operator",
  );

  const topMerchCandidate = merchReport.candidates[0];

  return [
    {
      id: "canon-and-story",
      label: "Canon + Narrative Reliability",
      ownerRoleAgentId: "continuity_director",
      priority: ipReport.overallScore < 60 ? "high" : "medium",
      rationale:
        ipReport.overallScore < 60
          ? "Story readiness is below expansion threshold; continuity must stabilize first."
          : "Continuity is stable enough for measured scale.",
      nextActions: [
        continuityDirector?.checklist[0] ?? "Review continuity risks before each generation run.",
        storyArchitect?.checklist[0] ?? "Ship one high-clarity narrative beat this sprint.",
      ],
    },
    {
      id: "merch-validation",
      label: "Merch Validation Loop",
      ownerRoleAgentId: "merch_operator",
      priority: merchReport.overallScore < 58 ? "high" : "medium",
      rationale:
        merchReport.overallScore < 58
          ? "Merch signal is early; run low-risk tests and collect structured demand feedback."
          : "Signals are healthy enough for staged pilot execution.",
      nextActions: [
        merchOperator?.checklist[0] ?? "Select one candidate and define success metric.",
        merchPlan
          ? `Execute merch plan focus: ${merchPlan.primaryMetric.name} (${merchPlan.primaryMetric.target}).`
          : `Use top candidate: ${topMerchCandidate?.title ?? "Define first candidate."}`,
      ],
    },
    {
      id: "distribution-and-feedback",
      label: "Distribution + Feedback Cycle",
      ownerRoleAgentId: "distribution_operator",
      priority: "medium",
      rationale:
        "Distribution execution should feed measurable insights back into story and merch iterations.",
      nextActions: [
        distributionOperator?.checklist[0] ?? "Schedule channel launch windows and CTA checks.",
        "Run post-launch review and update next sprint objective with measured deltas.",
      ],
    },
  ];
}

function buildRolloutNote({
  scoreBand,
  metricDeltas,
}: {
  scoreBand: CreatorEconomyOperatingPlan["scoreBand"];
  metricDeltas: CreatorEconomyMetricDelta[];
}): string {
  const positiveDeltaCount = metricDeltas.filter(
    (metric) => metric.delta !== null && metric.delta > 0,
  ).length;

  if (scoreBand === "aggressive") {
    return "Run aggressive but controlled scaling: keep quality gates strict while increasing launch cadence.";
  }

  if (scoreBand === "stabilize") {
    return "Stabilize core story and merch signals before expanding scope; prioritize reliability over volume.";
  }

  if (positiveDeltaCount >= 3) {
    return "Balanced scale path is healthy; keep current cadence and compound wins with one new experiment.";
  }

  return "Balanced mode with caution: maintain cadence, tighten weak signals, and re-evaluate after one sprint.";
}

export function buildCreatorEconomyOperatingPlan({
  story,
  ipReport,
  merchReport,
  roleBoard,
  merchPlan,
  previousMetrics,
  generatedAt = new Date().toISOString(),
}: {
  story: Story;
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
  roleBoard: CreatorRoleAgentsBoard;
  merchPlan: MerchExperimentPlan | null;
  previousMetrics?: Partial<CreatorEconomyMetrics>;
  generatedAt?: string;
}): CreatorEconomyOperatingPlan {
  const baselineMetrics = buildMetrics({
    ipReport,
    merchReport,
    roleBoard,
  });
  const metricDeltas = buildMetricDeltas({
    current: baselineMetrics,
    previous: previousMetrics ?? {},
  });
  const scoreBand = getScoreBand(baselineMetrics.combinedScore);

  return {
    generatedAt,
    storySlug: story.slug,
    storyTitle: story.title,
    sprintObjective: roleBoard.sprintObjective,
    horizonDays: roleBoard.horizonDays,
    scoreBand,
    baselineMetrics,
    metricDeltas,
    priorityTracks: buildPriorityTracks({
      roleBoard,
      ipReport,
      merchReport,
      merchPlan,
    }),
    executionLoop: roleBoard.syncCadence,
    blockerWatchlist: roleBoard.coordinationRisks,
    rolloutNote: buildRolloutNote({ scoreBand, metricDeltas }),
  };
}

export function buildCreatorEconomyRunDeltaReport({
  runId,
  status,
  baselineMetrics,
  outcomeMetrics,
}: {
  runId: string;
  status: string;
  baselineMetrics: Partial<CreatorEconomyMetrics>;
  outcomeMetrics: Partial<CreatorEconomyMetrics>;
}): CreatorEconomyRunDeltaReport {
  const normalizedBaseline: CreatorEconomyMetrics = {
    combinedScore: toNumber(baselineMetrics.combinedScore) ?? 0,
    ipOverall: toNumber(baselineMetrics.ipOverall) ?? 0,
    retentionPotential: toNumber(baselineMetrics.retentionPotential) ?? 0,
    merchSignal: toNumber(baselineMetrics.merchSignal) ?? 0,
    roleCoverage: toNumber(baselineMetrics.roleCoverage) ?? 0,
    collaboratorCount: toNumber(baselineMetrics.collaboratorCount) ?? 0,
    remixCount: toNumber(baselineMetrics.remixCount) ?? 0,
    pageCount: toNumber(baselineMetrics.pageCount) ?? 0,
  };

  const deltaKeys: CreatorEconomyMetricKey[] = [
    "combinedScore",
    "ipOverall",
    "retentionPotential",
    "merchSignal",
    "roleCoverage",
    "collaboratorCount",
    "remixCount",
    "pageCount",
  ];

  const deltas: CreatorEconomyMetricDelta[] = deltaKeys.map((key) => {
    const baseline = toNumber(normalizedBaseline[key]) ?? 0;
    const outcome = toNumber(outcomeMetrics[key]);
    return {
      key,
      label: metricLabel(key),
      current: outcome ?? baseline,
      previous: baseline,
      delta: outcome === null ? null : Math.round((outcome - baseline) * 10) / 10,
    };
  });

  const positive = deltas.filter((delta) => delta.delta !== null && delta.delta > 0).length;
  const negative = deltas.filter((delta) => delta.delta !== null && delta.delta < 0).length;

  const summary =
    positive > negative
      ? "Run improved more metrics than it regressed."
      : negative > positive
        ? "Run regressed on key metrics; tighten plan before scaling."
        : "Run produced mixed/neutral outcomes; iterate with focused scope.";

  return {
    runId,
    status,
    baselineMetrics: normalizedBaseline,
    outcomeMetrics,
    deltas,
    summary,
  };
}

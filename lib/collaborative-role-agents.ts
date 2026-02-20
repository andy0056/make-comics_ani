import { type Story, type StoryCollaborator } from "@/lib/schema";
import { type IpIncubatorReport } from "@/lib/ip-incubator";
import {
  type MerchabilityDetectorReport,
  type MerchExperimentPlan,
} from "@/lib/merchability-detector";

export const ROLE_AGENT_IDS = [
  "story_architect",
  "continuity_director",
  "visual_art_director",
  "merch_operator",
  "distribution_operator",
] as const;

export type RoleAgentId = (typeof ROLE_AGENT_IDS)[number];

export const ROLE_AGENT_SPRINT_OBJECTIVES = [
  "ship_next_drop",
  "stabilize_world",
  "scale_distribution",
  "launch_merch_pilot",
] as const;

export type RoleAgentSprintObjective =
  (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number];

export type RoleAgentParticipant = {
  userId: string;
  role: "owner" | "editor" | "viewer";
};

export type CreatorRoleAgentCard = {
  id: RoleAgentId;
  label: string;
  ownerUserId: string | null;
  ownerRole: RoleAgentParticipant["role"] | null;
  priority: "high" | "medium" | "low";
  objective: string;
  focusArea: string;
  checklist: string[];
};

export type CreatorRoleAgentsBoard = {
  generatedAt: string;
  storySlug: string;
  storyTitle: string;
  sprintObjective: RoleAgentSprintObjective;
  horizonDays: number;
  participants: RoleAgentParticipant[];
  roster: CreatorRoleAgentCard[];
  coordinationRisks: string[];
  syncCadence: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function dedupeParticipants(
  storyOwnerUserId: string,
  collaborators: StoryCollaborator[],
): RoleAgentParticipant[] {
  const participants: RoleAgentParticipant[] = [
    { userId: storyOwnerUserId, role: "owner" },
  ];

  for (const collaborator of collaborators) {
    if (
      participants.some(
        (participant) => participant.userId === collaborator.userId,
      )
    ) {
      continue;
    }

    participants.push({
      userId: collaborator.userId,
      role: collaborator.role === "viewer" ? "viewer" : "editor",
    });
  }

  return participants;
}

function chooseOwner({
  participants,
  preferredRole,
  fallbackIndex,
}: {
  participants: RoleAgentParticipant[];
  preferredRole: RoleAgentParticipant["role"];
  fallbackIndex: number;
}): RoleAgentParticipant {
  const match = participants.find((participant) => participant.role === preferredRole);
  if (match) {
    return match;
  }

  return participants[fallbackIndex % participants.length] ?? participants[0];
}

function roleLabel(id: RoleAgentId): string {
  switch (id) {
    case "story_architect":
      return "Story Architect";
    case "continuity_director":
      return "Continuity Director";
    case "visual_art_director":
      return "Visual Art Director";
    case "merch_operator":
      return "Merch Operator";
    case "distribution_operator":
      return "Distribution Operator";
    default:
      return "Role Agent";
  }
}

function getObjectiveText(
  sprintObjective: RoleAgentSprintObjective,
  roleId: RoleAgentId,
): string {
  const base: Record<RoleAgentSprintObjective, string> = {
    ship_next_drop: "Ship a coherent next release with measurable audience pull.",
    stabilize_world: "Harden canon and improve long-arc consistency.",
    scale_distribution:
      "Expand high-quality distribution throughput across channels.",
    launch_merch_pilot: "Launch and validate a low-risk merch pilot.",
  };

  const roleSuffix: Record<RoleAgentId, string> = {
    story_architect: " Keep story beats coherent and escalation clear.",
    continuity_director:
      " Protect canon rules and fix drift before generation/publish.",
    visual_art_director:
      " Maintain style evolution and panel clarity through the arc.",
    merch_operator: " Convert recurring motifs into concrete merch tests.",
    distribution_operator:
      " Package and ship channel-ready variants with quality checks.",
  };

  return `${base[sprintObjective]}${roleSuffix[roleId]}`;
}

function buildChecklist({
  roleId,
  ipReport,
  merchReport,
  merchPlan,
}: {
  roleId: RoleAgentId;
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
  merchPlan: MerchExperimentPlan | null;
}): string[] {
  const primaryMerchCandidate = merchReport.candidates[0];
  const continuityPillar = ipReport.pillars.find(
    (pillar) => pillar.id === "canon_strength",
  );

  switch (roleId) {
    case "story_architect":
      return [
        `Prioritize the next experiment: ${ipReport.nextExperiments[0] ?? "Add one stronger cliffhanger beat."}`,
        "Keep each new page tied to one clear narrative objective.",
        "Prepare two alternate beat branches for collaborator review.",
      ];
    case "continuity_director":
      return [
        `Review canon readiness (${continuityPillar?.score ?? 0}/100) before generation queue runs.`,
        "Approve or reject lock conflicts with explicit handoff notes.",
        "Log one continuity risk and one fix after each page batch.",
      ];
    case "visual_art_director":
      return [
        `Track style-morph continuity with current band: ${ipReport.band.replace("_", " ")}.`,
        "Enforce shot framing consistency for hero and rival close-ups.",
        "Run a visual QA pass before publish autopipeline export.",
      ];
    case "merch_operator":
      return [
        `Primary candidate: ${primaryMerchCandidate?.title ?? "Define one merch candidate."}`,
        merchPlan
          ? `Execute plan phase order: ${merchPlan.phases.map((phase) => phase.phase).join(" -> ")}.`
          : "Build first merch experiment plan with clear metric target.",
        "Capture demand and objections in a single post-run summary.",
      ];
    case "distribution_operator":
      return [
        merchPlan
          ? `Schedule launch waves for: ${merchPlan.selectedChannels.join(", ")}.`
          : "Align publish channels with quality gate readiness.",
        "Ensure CTA and metadata stay consistent across channels.",
        "Report launch metrics at +6h, +24h, and +72h.",
      ];
    default:
      return ["Define role-specific checklist."];
  }
}

function getFocusArea(roleId: RoleAgentId): string {
  switch (roleId) {
    case "story_architect":
      return "Narrative progression";
    case "continuity_director":
      return "Canon integrity";
    case "visual_art_director":
      return "Visual consistency";
    case "merch_operator":
      return "Monetization experiments";
    case "distribution_operator":
      return "Channel execution";
    default:
      return "Operational alignment";
  }
}

function getPriority({
  roleId,
  ipReport,
  merchReport,
}: {
  roleId: RoleAgentId;
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
}): CreatorRoleAgentCard["priority"] {
  if (roleId === "continuity_director" && ipReport.overallScore < 60) {
    return "high";
  }
  if (roleId === "merch_operator" && merchReport.overallScore < 60) {
    return "high";
  }
  if (roleId === "distribution_operator" && ipReport.retentionPotentialScore < 58) {
    return "high";
  }
  if (roleId === "story_architect" || roleId === "visual_art_director") {
    return "medium";
  }
  return "low";
}

function buildCoordinationRisks({
  participants,
  ipReport,
  merchReport,
}: {
  participants: RoleAgentParticipant[];
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
}): string[] {
  const risks: string[] = [];

  if (participants.length < 2) {
    risks.push(
      "Single-operator risk: all role agents collapse to one owner; use explicit checklist handoffs to avoid blind spots.",
    );
  }

  if (ipReport.overallScore < 55) {
    risks.push(
      "Narrative/canon readiness is low; prioritize continuity and story architecture before pushing distribution volume.",
    );
  }

  if (merchReport.overallScore < 55) {
    risks.push(
      "Merchability signals are weak; run low-cost validation before committing to larger merch pilots.",
    );
  }

  if (risks.length === 0) {
    risks.push("No critical blockers detected; proceed with daily sync and strict metric tracking.");
  }

  return risks;
}

function buildSyncCadence({
  sprintObjective,
  horizonDays,
}: {
  sprintObjective: RoleAgentSprintObjective;
  horizonDays: number;
}): string[] {
  const cadence = [
    "Daily 10-minute role sync on blockers and lock handoffs.",
    "Mid-sprint checkpoint: review continuity + publish quality gates.",
  ];

  if (sprintObjective === "launch_merch_pilot") {
    cadence.push("Launch-day cadence: review demand metrics at +6h and +24h.");
  }

  if (horizonDays >= 10) {
    cadence.push("End-of-sprint retro: decide scale, iterate, or archive experiments.");
  }

  return cadence;
}

export function buildCreatorRoleAgentsBoard({
  story,
  collaborators,
  ipReport,
  merchReport,
  merchPlan,
  sprintObjective,
  horizonDays,
  ownerOverrides,
  generatedAt = new Date().toISOString(),
}: {
  story: Story;
  collaborators: StoryCollaborator[];
  ipReport: IpIncubatorReport;
  merchReport: MerchabilityDetectorReport;
  merchPlan?: MerchExperimentPlan | null;
  sprintObjective: RoleAgentSprintObjective;
  horizonDays: number;
  ownerOverrides?: Partial<Record<RoleAgentId, string>>;
  generatedAt?: string;
}): CreatorRoleAgentsBoard {
  const participants = dedupeParticipants(story.userId, collaborators);
  const boundedHorizon = clamp(horizonDays, 3, 30);

  const defaults: Record<RoleAgentId, RoleAgentParticipant> = {
    story_architect: chooseOwner({
      participants,
      preferredRole: "owner",
      fallbackIndex: 0,
    }),
    continuity_director: chooseOwner({
      participants,
      preferredRole: "editor",
      fallbackIndex: 1,
    }),
    visual_art_director: chooseOwner({
      participants,
      preferredRole: "editor",
      fallbackIndex: 2,
    }),
    merch_operator: chooseOwner({
      participants,
      preferredRole: "editor",
      fallbackIndex: 3,
    }),
    distribution_operator: chooseOwner({
      participants,
      preferredRole: "viewer",
      fallbackIndex: 4,
    }),
  };

  const roster: CreatorRoleAgentCard[] = ROLE_AGENT_IDS.map((roleId) => {
    const overrideUserId = ownerOverrides?.[roleId];
    const overrideParticipant = overrideUserId
      ? participants.find((participant) => participant.userId === overrideUserId)
      : null;
    const owner = overrideParticipant ?? defaults[roleId];

    return {
      id: roleId,
      label: roleLabel(roleId),
      ownerUserId: owner?.userId ?? null,
      ownerRole: owner?.role ?? null,
      priority: getPriority({ roleId, ipReport, merchReport }),
      objective: getObjectiveText(sprintObjective, roleId),
      focusArea: getFocusArea(roleId),
      checklist: buildChecklist({
        roleId,
        ipReport,
        merchReport,
        merchPlan: merchPlan ?? null,
      }),
    };
  });

  return {
    generatedAt,
    storySlug: story.slug,
    storyTitle: story.title,
    sprintObjective,
    horizonDays: boundedHorizon,
    participants,
    roster,
    coordinationRisks: buildCoordinationRisks({
      participants,
      ipReport,
      merchReport,
    }),
    syncCadence: buildSyncCadence({
      sprintObjective,
      horizonDays: boundedHorizon,
    }),
  };
}

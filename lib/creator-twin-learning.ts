import {
  type CreatorTwinAudienceMode,
  type CreatorTwinDialogueMode,
  type CreatorTwinPreferences,
  normalizeCreatorTwinPreferences,
} from "@/lib/creator-twin";

export type CreatorTwinLearningSignal =
  | "autopilot_plan_generated"
  | "page_generated"
  | "queue_completed";

type CountMap<T extends string> = Record<T, number>;

type CreatorTwinLearningMetadata = {
  samples: number;
  pageCountUsage: Record<"2" | "3" | "4", number>;
  dialogueModeUsage: CountMap<CreatorTwinDialogueMode>;
  audienceModeUsage: CountMap<CreatorTwinAudienceMode>;
  signalCounts: CountMap<CreatorTwinLearningSignal>;
  lastSignalAt?: string;
};

type CreatorTwinLearningEnvelope = {
  learning: CreatorTwinLearningMetadata;
};

type ApplyLearningInput = {
  currentPreferences: CreatorTwinPreferences;
  observedPreferences: CreatorTwinPreferences;
  existingMetadata: unknown;
  signalType: CreatorTwinLearningSignal;
  weight?: number;
};

export type ApplyLearningOutput = {
  nextPreferences: CreatorTwinPreferences;
  nextMetadata: Record<string, unknown>;
  samples: number;
  updatedByLearning: boolean;
};

const MIN_LEARNING_SAMPLES = 6;
const MODE_CONFIDENCE_THRESHOLD = 0.55;

function createDefaultLearningMetadata(): CreatorTwinLearningMetadata {
  return {
    samples: 0,
    pageCountUsage: { "2": 0, "3": 0, "4": 0 },
    dialogueModeUsage: {
      concise: 0,
      balanced: 0,
      cinematic: 0,
    },
    audienceModeUsage: {
      general: 0,
      kids: 0,
      teen: 0,
    },
    signalCounts: {
      autopilot_plan_generated: 0,
      page_generated: 0,
      queue_completed: 0,
    },
  };
}

function normalizeLearningMetadata(
  value: unknown,
): CreatorTwinLearningMetadata {
  if (!value || typeof value !== "object") {
    return createDefaultLearningMetadata();
  }

  const envelope = value as Partial<CreatorTwinLearningEnvelope>;
  const learning = envelope.learning;
  if (!learning || typeof learning !== "object") {
    return createDefaultLearningMetadata();
  }

  const defaults = createDefaultLearningMetadata();
  const source = learning as Partial<CreatorTwinLearningMetadata>;

  return {
    samples:
      typeof source.samples === "number" && Number.isFinite(source.samples)
        ? Math.max(0, Math.floor(source.samples))
        : defaults.samples,
    pageCountUsage: {
      "2":
        typeof source.pageCountUsage?.["2"] === "number"
          ? Math.max(0, Math.floor(source.pageCountUsage["2"]))
          : defaults.pageCountUsage["2"],
      "3":
        typeof source.pageCountUsage?.["3"] === "number"
          ? Math.max(0, Math.floor(source.pageCountUsage["3"]))
          : defaults.pageCountUsage["3"],
      "4":
        typeof source.pageCountUsage?.["4"] === "number"
          ? Math.max(0, Math.floor(source.pageCountUsage["4"]))
          : defaults.pageCountUsage["4"],
    },
    dialogueModeUsage: {
      concise:
        typeof source.dialogueModeUsage?.concise === "number"
          ? Math.max(0, Math.floor(source.dialogueModeUsage.concise))
          : defaults.dialogueModeUsage.concise,
      balanced:
        typeof source.dialogueModeUsage?.balanced === "number"
          ? Math.max(0, Math.floor(source.dialogueModeUsage.balanced))
          : defaults.dialogueModeUsage.balanced,
      cinematic:
        typeof source.dialogueModeUsage?.cinematic === "number"
          ? Math.max(0, Math.floor(source.dialogueModeUsage.cinematic))
          : defaults.dialogueModeUsage.cinematic,
    },
    audienceModeUsage: {
      general:
        typeof source.audienceModeUsage?.general === "number"
          ? Math.max(0, Math.floor(source.audienceModeUsage.general))
          : defaults.audienceModeUsage.general,
      kids:
        typeof source.audienceModeUsage?.kids === "number"
          ? Math.max(0, Math.floor(source.audienceModeUsage.kids))
          : defaults.audienceModeUsage.kids,
      teen:
        typeof source.audienceModeUsage?.teen === "number"
          ? Math.max(0, Math.floor(source.audienceModeUsage.teen))
          : defaults.audienceModeUsage.teen,
    },
    signalCounts: {
      autopilot_plan_generated:
        typeof source.signalCounts?.autopilot_plan_generated === "number"
          ? Math.max(0, Math.floor(source.signalCounts.autopilot_plan_generated))
          : defaults.signalCounts.autopilot_plan_generated,
      page_generated:
        typeof source.signalCounts?.page_generated === "number"
          ? Math.max(0, Math.floor(source.signalCounts.page_generated))
          : defaults.signalCounts.page_generated,
      queue_completed:
        typeof source.signalCounts?.queue_completed === "number"
          ? Math.max(0, Math.floor(source.signalCounts.queue_completed))
          : defaults.signalCounts.queue_completed,
    },
    lastSignalAt:
      typeof source.lastSignalAt === "string" ? source.lastSignalAt : undefined,
  };
}

function getTopMode<T extends string>(usage: Record<T, number>): T {
  const entries = Object.entries(usage) as Array<[T, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function getModeConfidence<T extends string>(
  usage: Record<T, number>,
  mode: T,
  totalSamples: number,
): number {
  if (totalSamples <= 0) {
    return 0;
  }
  return (usage[mode] ?? 0) / totalSamples;
}

export function applyCreatorTwinLearning({
  currentPreferences,
  observedPreferences,
  existingMetadata,
  signalType,
  weight = 1,
}: ApplyLearningInput): ApplyLearningOutput {
  const safeCurrent = normalizeCreatorTwinPreferences(currentPreferences);
  const safeObserved = normalizeCreatorTwinPreferences(observedPreferences);
  const normalizedWeight = Math.min(10, Math.max(1, Math.floor(weight)));
  const learning = normalizeLearningMetadata(existingMetadata);

  learning.samples += normalizedWeight;
  learning.pageCountUsage[String(safeObserved.pageCount) as "2" | "3" | "4"] +=
    normalizedWeight;
  learning.dialogueModeUsage[safeObserved.dialogueMode] += normalizedWeight;
  learning.audienceModeUsage[safeObserved.audienceMode] += normalizedWeight;
  learning.signalCounts[signalType] += 1;
  learning.lastSignalAt = new Date().toISOString();

  let nextPreferences = safeCurrent;
  let updatedByLearning = false;

  if (learning.samples >= MIN_LEARNING_SAMPLES) {
    const topPageCount = Number(
      getTopMode(learning.pageCountUsage as Record<"2" | "3" | "4", number>),
    ) as 2 | 3 | 4;
    const topDialogueMode = getTopMode(learning.dialogueModeUsage);
    const topAudienceMode = getTopMode(learning.audienceModeUsage);

    const pageConfidence = getModeConfidence(
      learning.pageCountUsage as Record<"2" | "3" | "4", number>,
      String(topPageCount) as "2" | "3" | "4",
      learning.samples,
    );
    const dialogueConfidence = getModeConfidence(
      learning.dialogueModeUsage,
      topDialogueMode,
      learning.samples,
    );
    const audienceConfidence = getModeConfidence(
      learning.audienceModeUsage,
      topAudienceMode,
      learning.samples,
    );

    const learnedPreferences: CreatorTwinPreferences = {
      pageCount:
        pageConfidence >= MODE_CONFIDENCE_THRESHOLD
          ? topPageCount
          : safeCurrent.pageCount,
      dialogueMode:
        dialogueConfidence >= MODE_CONFIDENCE_THRESHOLD
          ? topDialogueMode
          : safeCurrent.dialogueMode,
      audienceMode:
        audienceConfidence >= MODE_CONFIDENCE_THRESHOLD
          ? topAudienceMode
          : safeCurrent.audienceMode,
    };

    const changed =
      learnedPreferences.pageCount !== safeCurrent.pageCount ||
      learnedPreferences.dialogueMode !== safeCurrent.dialogueMode ||
      learnedPreferences.audienceMode !== safeCurrent.audienceMode;

    if (changed) {
      nextPreferences = learnedPreferences;
      updatedByLearning = true;
    }
  }

  return {
    nextPreferences,
    nextMetadata: { learning },
    samples: learning.samples,
    updatedByLearning,
  };
}


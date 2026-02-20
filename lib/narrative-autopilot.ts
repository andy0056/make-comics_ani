import Together from "together-ai";
import { z } from "zod";
import { COMIC_STYLES } from "@/lib/constants";
import {
  buildCharacterDnaContext,
  buildStoryWorldContext,
} from "@/lib/consistency-engine";
import { type CharacterDnaProfile, type StoryCharacter } from "@/lib/schema";
import { type StoryWorldPayload } from "@/lib/story-world";

const panelPlanItemSchema = z.object({
  panelNumber: z.number().int().min(1).max(5),
  camera: z.string().trim().min(2).max(60),
  action: z.string().trim().min(6).max(220),
  visualFocus: z.string().trim().min(2).max(120),
});

const dialoguePlanItemSchema = z.object({
  speaker: z.string().trim().min(1).max(60),
  line: z.string().trim().min(2).max(180),
  intent: z.string().trim().min(2).max(100),
});

const rawCheckpointSchema = z.object({
  pageNumber: z.number().int().min(1).max(999),
  beatTitle: z.string().trim().min(2).max(80),
  beatSummary: z.string().trim().min(8).max(260),
  panelPlan: z.array(panelPlanItemSchema).min(3).max(8),
  dialoguePlan: z.array(dialoguePlanItemSchema).min(1).max(8),
});

const rawAutopilotPlanSchema = z.object({
  arcTitle: z.string().trim().min(2).max(90),
  arcSummary: z.string().trim().min(8).max(320),
  checkpoints: z.array(rawCheckpointSchema).min(1).max(8),
});

export type PanelChoreography = {
  panelNumber: 1 | 2 | 3 | 4 | 5;
  camera: string;
  action: string;
  visualFocus: string;
};

export type AdaptiveDialogueBeat = {
  speaker: string;
  line: string;
  intent: string;
};

export type DialogueMode = "concise" | "balanced" | "cinematic";
export type AudienceMode = "general" | "kids" | "teen";
export type CameraDirectionMode =
  | "balanced"
  | "kinetic"
  | "cinematic"
  | "graphic_novel";

export type NarrativeAutopilotCheckpoint = {
  id: string;
  pageNumber: number;
  beatTitle: string;
  beatSummary: string;
  panelPlan: PanelChoreography[];
  dialoguePlan: AdaptiveDialogueBeat[];
  beatPrompt: string;
};

export type NarrativeAutopilotPlan = {
  arcTitle: string;
  arcSummary: string;
  checkpoints: NarrativeAutopilotCheckpoint[];
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function extractJsonObject(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function toCameraCycle(index: number, mode: CameraDirectionMode): string {
  const camerasByMode: Record<CameraDirectionMode, string[]> = {
    balanced: [
      "wide establishing shot",
      "medium tracking shot",
      "dramatic close-up",
      "over-the-shoulder shot",
      "heroic low-angle shot",
    ],
    kinetic: [
      "handheld push-in shot",
      "dynamic side-tracking shot",
      "whip-pan transition framing",
      "tilted over-the-shoulder shot",
      "impact low-angle action shot",
    ],
    cinematic: [
      "anamorphic wide establishing shot",
      "slow dolly-in medium shot",
      "shallow-depth dramatic close-up",
      "motivated over-the-shoulder reveal",
      "heroic silhouette low-angle shot",
    ],
    graphic_novel: [
      "high-contrast full-panel wide shot",
      "boxed medium composition shot",
      "ink-heavy close-up portrait shot",
      "split-frame over-the-shoulder shot",
      "bold noir low-angle splash shot",
    ],
  };
  const cameras = camerasByMode[mode];

  return cameras[index % cameras.length];
}

function buildAdaptiveBeatPrompt({
  beatTitle,
  beatSummary,
  panelPlan,
  dialoguePlan,
}: {
  beatTitle: string;
  beatSummary: string;
  panelPlan: PanelChoreography[];
  dialoguePlan: AdaptiveDialogueBeat[];
}): string {
  const panelsText = panelPlan
    .map(
      (panel) =>
        `Panel ${panel.panelNumber} (${panel.camera}): ${panel.action}. Focus: ${panel.visualFocus}.`,
    )
    .join("\n");

  const dialogueText = dialoguePlan
    .map(
      (dialogue) =>
        `${dialogue.speaker}: "${dialogue.line}" [intent: ${dialogue.intent}]`,
    )
    .join("\n");

  return [
    `${beatTitle}: ${beatSummary}`,
    "",
    "Panel choreography:",
    panelsText,
    "",
    "Suggested dialogue beats:",
    dialogueText,
  ].join("\n");
}

function normalizePanelPlan(
  rawPlan: z.infer<typeof rawCheckpointSchema>["panelPlan"],
): PanelChoreography[] {
  const trimmed = rawPlan.slice(0, 5);
  const normalized = trimmed.map((panel, index) => ({
    panelNumber: (index + 1) as 1 | 2 | 3 | 4 | 5,
    camera: truncateText(panel.camera, 60),
    action: truncateText(panel.action, 220),
    visualFocus: truncateText(panel.visualFocus, 120),
  }));

  while (normalized.length < 5) {
    const index = normalized.length;
    normalized.push({
      panelNumber: (index + 1) as 1 | 2 | 3 | 4 | 5,
      camera: toCameraCycle(index, "balanced"),
      action: "Advance the current beat while preserving continuity.",
      visualFocus: "Main characters and immediate stakes",
    });
  }

  return normalized;
}

function normalizeDialoguePlan(
  rawPlan: z.infer<typeof rawCheckpointSchema>["dialoguePlan"],
): AdaptiveDialogueBeat[] {
  return rawPlan.slice(0, 4).map((item) => ({
    speaker: truncateText(item.speaker, 60),
    line: truncateText(item.line, 180),
    intent: truncateText(item.intent, 100),
  }));
}

function buildArcPrompt({
  storyTitle,
  storyDescription,
  style,
  nextPageNumber,
  targetPageCount,
  recentPrompts,
  storyCharacters,
  storyWorld,
  characterDnaProfiles,
  dialogueMode,
  audienceMode,
  cameraDirectionMode,
  directorTranscript,
}: {
  storyTitle: string;
  storyDescription?: string | null;
  style?: string;
  nextPageNumber: number;
  targetPageCount: number;
  recentPrompts: string[];
  storyCharacters: StoryCharacter[];
  storyWorld: StoryWorldPayload;
  characterDnaProfiles: CharacterDnaProfile[];
  dialogueMode: DialogueMode;
  audienceMode: AudienceMode;
  cameraDirectionMode: CameraDirectionMode;
  directorTranscript?: string;
}): string {
  const styleName =
    COMIC_STYLES.find((entry) => entry.id === style)?.name ?? "Noir";
  const characterNames = storyCharacters
    .map((character) => character.name.trim())
    .filter(Boolean);
  const worldContext = buildStoryWorldContext(storyWorld);
  const dnaContext = buildCharacterDnaContext(characterDnaProfiles);
  const recentBeatText =
    recentPrompts.length > 0
      ? recentPrompts
          .slice(-4)
          .map((prompt, index) => `${index + 1}. ${prompt}`)
          .join("\n")
      : "No prior pages yet.";

  const characterText =
    characterNames.length > 0
      ? characterNames.join(", ")
      : "Introduce a clear protagonist and one supporting character.";

  const dialogueModeRule =
    dialogueMode === "concise"
      ? "Dialogue mode: concise. Keep lines very short, direct, and sparse (4-9 words when possible)."
      : dialogueMode === "cinematic"
        ? "Dialogue mode: cinematic. Use dramatic but natural lines with emotional cadence and memorable phrasing."
        : "Dialogue mode: balanced. Keep lines clear, readable, and expressive without over-writing.";
  const audienceModeRule =
    audienceMode === "kids"
      ? "Audience mode: kids (8-12). Keep language simple, positive, and age-appropriate. Avoid graphic content, explicit violence, and mature themes."
      : audienceMode === "teen"
        ? "Audience mode: teen (13+). Allow sharper stakes and tension, but keep content PG-13 and avoid explicit gore or sexual content."
      : "Audience mode: general. Keep content broadly accessible while preserving compelling stakes.";
  const cameraDirectionRule =
    cameraDirectionMode === "kinetic"
      ? "Camera direction mode: kinetic. Favor aggressive motion language, energetic framing shifts, and momentum-heavy panel transitions."
      : cameraDirectionMode === "cinematic"
        ? "Camera direction mode: cinematic. Favor filmic lens language, measured push-ins, emotional close-ups, and composed reveals."
        : cameraDirectionMode === "graphic_novel"
          ? "Camera direction mode: graphic novel. Favor high-contrast compositions, bold silhouettes, and iconic panel staging."
          : "Camera direction mode: balanced. Use varied but stable framing with clear readability and continuity.";
  const normalizedDirectorTranscript = directorTranscript
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);

  return `You are Narrative Autopilot for a comic editor.
Generate a tight multi-page continuation plan.

Story title: ${storyTitle}
Story description: ${storyDescription?.trim() || "N/A"}
Visual style: ${styleName}
Start page number: ${nextPageNumber}
Target pages: ${targetPageCount}
Characters: ${characterText}

Recent beats:
${recentBeatText}

${worldContext ? `World context:\n${worldContext}\n` : ""}
${dnaContext ? `${dnaContext}\n` : ""}
${normalizedDirectorTranscript ? `Director transcript guidance:\n${normalizedDirectorTranscript}\n` : ""}

Return VALID JSON only with this exact shape:
{
  "arcTitle": "string",
  "arcSummary": "string",
  "checkpoints": [
    {
      "pageNumber": number,
      "beatTitle": "string",
      "beatSummary": "string",
      "panelPlan": [
        { "panelNumber": 1, "camera": "string", "action": "string", "visualFocus": "string" }
      ],
      "dialoguePlan": [
        { "speaker": "string", "line": "string", "intent": "string" }
      ]
    }
  ]
}

Rules:
- Return exactly ${targetPageCount} checkpoints.
- Panel plan must contain exactly 5 panels per checkpoint.
- Dialogue lines must be short, natural, and distinct by character voice.
- ${dialogueModeRule}
- ${audienceModeRule}
- ${cameraDirectionRule}
- ${
    normalizedDirectorTranscript
      ? "Treat director transcript guidance as the preferred shot language and pacing intent, unless it conflicts with continuity."
      : "Infer cinematic intent from story context and preserve coherent shot language."
  }
- Keep continuity with existing beats, character traits, and world canon.
- Escalate stakes across checkpoints and end with a mini cliffhanger.`;
}

export function buildFallbackNarrativeAutopilotPlan({
  storyTitle,
  nextPageNumber,
  targetPageCount,
  recentPrompts,
  storyCharacters,
  cameraDirectionMode = "balanced",
}: {
  storyTitle: string;
  nextPageNumber: number;
  targetPageCount: number;
  recentPrompts: string[];
  storyCharacters: StoryCharacter[];
  cameraDirectionMode?: CameraDirectionMode;
}): NarrativeAutopilotPlan {
  const lead = storyCharacters[0]?.name || "Protagonist";
  const partner = storyCharacters[1]?.name || "Ally";
  const latestBeat = recentPrompts.at(-1);
  const beatLabels = [
    "Trigger",
    "Complication",
    "Confrontation",
    "Setback",
    "Cliffhanger",
  ];

  const checkpoints = Array.from({ length: targetPageCount }).map((_, index) => {
    const pageNumber = nextPageNumber + index;
    const beatTitle =
      beatLabels[index] ?? `Escalation Beat ${index + 1}`;
    const beatSummary = latestBeat
      ? `${lead} pushes forward after "${truncateText(
          latestBeat,
          72,
        )}", while ${partner.toLowerCase()} forces a harder decision.`
      : `${lead} and ${partner} move the story forward with rising stakes and tighter consequences.`;

    const panelPlan: PanelChoreography[] = Array.from({ length: 5 }).map(
      (_, panelIndex) => ({
        panelNumber: (panelIndex + 1) as 1 | 2 | 3 | 4 | 5,
        camera: toCameraCycle(panelIndex, cameraDirectionMode),
        action:
          panelIndex === 2
            ? `${lead} makes a decisive move that shifts the scene momentum.`
            : `${lead} and ${partner} react to the escalating conflict.`,
        visualFocus:
          panelIndex === 4
            ? "Hook for the next page"
            : "Character intent and environmental pressure",
      }),
    );

    const dialoguePlan: AdaptiveDialogueBeat[] = [
      {
        speaker: lead,
        line: "We cannot stall now. The window is closing.",
        intent: "Drive urgency",
      },
      {
        speaker: partner,
        line: "Then we commit, but we do it smart.",
        intent: "Counterbalance with strategy",
      },
      {
        speaker: lead,
        line: "One wrong move and everything breaks.",
        intent: "Raise tension before page end",
      },
    ];

    const beatPrompt = buildAdaptiveBeatPrompt({
      beatTitle,
      beatSummary,
      panelPlan,
      dialoguePlan,
    });

    return {
      id: `autopilot-page-${pageNumber}`,
      pageNumber,
      beatTitle,
      beatSummary,
      panelPlan,
      dialoguePlan,
      beatPrompt,
    };
  });

  return {
    arcTitle: `${storyTitle} - Next Arc`,
    arcSummary:
      "Escalate conflict over the next pages, reinforce character voices, and land on a clear hook.",
    checkpoints,
  };
}

function normalizeAutopilotPlan({
  rawPlan,
  nextPageNumber,
  targetPageCount,
}: {
  rawPlan: z.infer<typeof rawAutopilotPlanSchema>;
  nextPageNumber: number;
  targetPageCount: number;
}): NarrativeAutopilotPlan {
  const checkpoints = rawPlan.checkpoints
    .slice(0, targetPageCount)
    .map((checkpoint, index) => {
      const pageNumber = nextPageNumber + index;
      const panelPlan = normalizePanelPlan(checkpoint.panelPlan);
      const dialoguePlan = normalizeDialoguePlan(checkpoint.dialoguePlan);
      const beatTitle = truncateText(checkpoint.beatTitle, 80);
      const beatSummary = truncateText(checkpoint.beatSummary, 260);

      return {
        id: `autopilot-page-${pageNumber}`,
        pageNumber,
        beatTitle,
        beatSummary,
        panelPlan,
        dialoguePlan,
        beatPrompt: buildAdaptiveBeatPrompt({
          beatTitle,
          beatSummary,
          panelPlan,
          dialoguePlan,
        }),
      };
    });

  return {
    arcTitle: truncateText(rawPlan.arcTitle, 90),
    arcSummary: truncateText(rawPlan.arcSummary, 320),
    checkpoints,
  };
}

export async function generateNarrativeAutopilotPlan({
  client,
  storyTitle,
  storyDescription,
  style,
  nextPageNumber,
  targetPageCount,
  recentPrompts,
  storyCharacters,
  storyWorld,
  characterDnaProfiles,
  dialogueMode = "balanced",
  audienceMode = "general",
  cameraDirectionMode = "balanced",
  directorTranscript,
}: {
  client: Together;
  storyTitle: string;
  storyDescription?: string | null;
  style?: string;
  nextPageNumber: number;
  targetPageCount: number;
  recentPrompts: string[];
  storyCharacters: StoryCharacter[];
  storyWorld: StoryWorldPayload;
  characterDnaProfiles: CharacterDnaProfile[];
  dialogueMode?: DialogueMode;
  audienceMode?: AudienceMode;
  cameraDirectionMode?: CameraDirectionMode;
  directorTranscript?: string;
}): Promise<NarrativeAutopilotPlan> {
  const safeTarget = clamp(targetPageCount, 1, 5);

  const fallback = buildFallbackNarrativeAutopilotPlan({
    storyTitle,
    nextPageNumber,
    targetPageCount: safeTarget,
    recentPrompts,
    storyCharacters,
    cameraDirectionMode,
  });

  const prompt = buildArcPrompt({
    storyTitle,
    storyDescription,
    style,
    nextPageNumber,
    targetPageCount: safeTarget,
    recentPrompts,
    storyCharacters,
    storyWorld,
    characterDnaProfiles,
    dialogueMode,
    audienceMode,
    cameraDirectionMode,
    directorTranscript,
  });

  try {
    const response = await client.chat.completions.create({
      model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
      messages: [
        {
          role: "system",
          content:
            "You are a senior comic narrative director. Return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.65,
      max_tokens: 1800,
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return fallback;
    }

    const json = extractJsonObject(content);
    if (!json) {
      return fallback;
    }

    const parsed = rawAutopilotPlanSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      return fallback;
    }

    return normalizeAutopilotPlan({
      rawPlan: parsed.data,
      nextPageNumber,
      targetPageCount: safeTarget,
    });
  } catch {
    return fallback;
  }
}

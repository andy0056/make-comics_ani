import Together from "together-ai";
import { z } from "zod";

const voiceLineSchema = z.object({
  speaker: z.string().trim().min(1).max(80),
  line: z.string().trim().min(1).max(220),
  delivery: z.string().trim().min(2).max(120),
});

const sfxCueSchema = z.object({
  panelNumber: z.number().int().min(1).max(5),
  cue: z.string().trim().min(2).max(80),
  intensity: z.enum(["low", "medium", "high"]),
  purpose: z.string().trim().min(2).max(120),
});

const checkpointPackSchema = z.object({
  checkpointId: z.string().trim().min(1).max(120),
  pageNumber: z.number().int().min(1).max(999),
  beatTitle: z.string().trim().min(2).max(120),
  voiceLines: z.array(voiceLineSchema).min(1).max(6),
  sfxCues: z.array(sfxCueSchema).min(1).max(5),
});

const voiceCastSchema = z.object({
  speaker: z.string().trim().min(1).max(80),
  voiceProfile: z.string().trim().min(2).max(120),
  direction: z.string().trim().min(2).max(140),
});

const rawVoicePackSchema = z.object({
  cast: z.array(voiceCastSchema).min(1).max(12),
  checkpoints: z.array(checkpointPackSchema).min(1).max(8),
  mixNotes: z.array(z.string().trim().min(3).max(180)).min(2).max(8),
});

export type VoiceCastEntry = z.infer<typeof voiceCastSchema>;
export type VoiceSfxCheckpointPack = z.infer<typeof checkpointPackSchema>;
export type VoiceCastSfxPack = {
  generatedAt: string;
  source: "model" | "fallback";
  cast: VoiceCastEntry[];
  checkpoints: VoiceSfxCheckpointPack[];
  mixNotes: string[];
  pipelinePath: Array<{
    stage: "voice_cast" | "line_direction" | "sfx_spotting";
    status: "ready";
    note: string;
  }>;
};

type VoicePackInputCheckpoint = {
  id: string;
  pageNumber: number;
  beatTitle: string;
  beatSummary: string;
  panelPlan: Array<{
    panelNumber: number;
    camera: string;
    action: string;
    visualFocus: string;
  }>;
  dialoguePlan: Array<{
    speaker: string;
    line: string;
    intent: string;
  }>;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function extractJsonObject(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function inferIntensity(text: string): "low" | "medium" | "high" {
  const lowered = text.toLowerCase();
  if (
    lowered.includes("explosion") ||
    lowered.includes("impact") ||
    lowered.includes("crash") ||
    lowered.includes("shatter")
  ) {
    return "high";
  }
  if (
    lowered.includes("run") ||
    lowered.includes("chase") ||
    lowered.includes("jump") ||
    lowered.includes("fight")
  ) {
    return "medium";
  }
  return "low";
}

function buildPipelinePath(): VoiceCastSfxPack["pipelinePath"] {
  return [
    {
      stage: "voice_cast",
      status: "ready",
      note: "Character voices mapped from dialogue intent and story context.",
    },
    {
      stage: "line_direction",
      status: "ready",
      note: "Line deliveries tuned for pacing and emotional contour.",
    },
    {
      stage: "sfx_spotting",
      status: "ready",
      note: "Panel-level SFX cues placed for readability and impact rhythm.",
    },
  ];
}

export function buildFallbackVoiceCastSfxPack({
  checkpoints,
  directorTranscript,
  audienceMode = "general",
}: {
  checkpoints: VoicePackInputCheckpoint[];
  directorTranscript?: string;
  audienceMode?: "general" | "kids" | "teen";
}): VoiceCastSfxPack {
  const speakerOrder: string[] = [];
  checkpoints.forEach((checkpoint) => {
    checkpoint.dialoguePlan.forEach((dialogue) => {
      const speaker = normalizeWhitespace(dialogue.speaker || "Narrator");
      if (speaker && !speakerOrder.includes(speaker)) {
        speakerOrder.push(speaker);
      }
    });
  });

  const cast: VoiceCastEntry[] = (speakerOrder.length > 0
    ? speakerOrder
    : ["Narrator"]
  )
    .slice(0, 8)
    .map((speaker) => ({
      speaker,
      voiceProfile:
        speaker.toLowerCase() === "narrator"
          ? "Grounded narration with clear pacing"
          : "Expressive character voice with clean diction",
      direction:
        audienceMode === "kids"
          ? "Keep delivery bright and clear for younger readers."
          : audienceMode === "teen"
            ? "Keep delivery energetic and emotionally sharp."
            : "Balance dramatic tone with readability.",
    }));

  const checkpointsPack: VoiceSfxCheckpointPack[] = checkpoints.map(
    (checkpoint) => {
      const voiceLines = checkpoint.dialoguePlan.slice(0, 4).map((dialogue) => ({
        speaker: normalizeWhitespace(dialogue.speaker || "Narrator"),
        line: truncateText(normalizeWhitespace(dialogue.line), 220),
        delivery: truncateText(
          normalizeWhitespace(dialogue.intent || "Intent-driven delivery"),
          120,
        ),
      }));
      const safeVoiceLines =
        voiceLines.length > 0
          ? voiceLines
          : [
              {
                speaker: "Narrator",
                line: truncateText(checkpoint.beatSummary, 180),
                delivery: "Carry the beat with a steady narrative cadence.",
              },
            ];

      const sfxCues = checkpoint.panelPlan.slice(0, 3).map((panel) => ({
        panelNumber: Math.max(1, Math.min(5, panel.panelNumber)),
        cue:
          panel.panelNumber === 1
            ? "ambient pulse"
            : panel.panelNumber === 2
              ? "motion accent"
              : "dramatic sting",
        intensity: inferIntensity(`${panel.action} ${panel.visualFocus}`),
        purpose: truncateText(
          normalizeWhitespace(
            `Support panel ${panel.panelNumber} transition: ${panel.action}`,
          ),
          120,
        ),
      }));

      const safeSfxCues =
        sfxCues.length > 0
          ? sfxCues
          : [
              {
                panelNumber: 1,
                cue: "ambient pulse",
                intensity: "low" as const,
                purpose: "Maintain tonal continuity across the beat.",
              },
            ];

      return {
        checkpointId: checkpoint.id,
        pageNumber: checkpoint.pageNumber,
        beatTitle: truncateText(checkpoint.beatTitle, 120),
        voiceLines: safeVoiceLines,
        sfxCues: safeSfxCues,
      };
    },
  );

  const transcriptHint = normalizeWhitespace(directorTranscript ?? "");
  const mixNotes = [
    audienceMode === "kids"
      ? "Keep SFX playful and avoid aggressive loud cues."
      : "Keep SFX layered under dialogue to preserve readability.",
    transcriptHint
      ? `Director transcript anchor: ${truncateText(transcriptHint, 120)}`
      : "No director transcript supplied; blend defaults with beat intent.",
    "Prioritize line clarity in panels marked as close-up or emotional focus.",
  ];

  return {
    generatedAt: new Date().toISOString(),
    source: "fallback",
    cast,
    checkpoints: checkpointsPack,
    mixNotes,
    pipelinePath: buildPipelinePath(),
  };
}

function buildVoicePackPrompt({
  storyTitle,
  style,
  checkpoints,
  audienceMode,
  directorTranscript,
}: {
  storyTitle: string;
  style: string;
  checkpoints: VoicePackInputCheckpoint[];
  audienceMode: "general" | "kids" | "teen";
  directorTranscript?: string;
}): string {
  const checkpointText = checkpoints
    .map((checkpoint) => {
      const dialogue = checkpoint.dialoguePlan
        .map(
          (line) =>
            `- ${line.speaker}: "${line.line}" [intent: ${line.intent}]`,
        )
        .join("\n");
      const panels = checkpoint.panelPlan
        .map(
          (panel) =>
            `- Panel ${panel.panelNumber}: ${panel.camera}; ${panel.action}; focus: ${panel.visualFocus}`,
        )
        .join("\n");
      return [
        `Page ${checkpoint.pageNumber} (${checkpoint.id}) - ${checkpoint.beatTitle}`,
        `Summary: ${checkpoint.beatSummary}`,
        "Panel plan:",
        panels,
        "Dialogue plan:",
        dialogue || "- No dialogue",
      ].join("\n");
    })
    .join("\n\n");

  const transcript = normalizeWhitespace(directorTranscript ?? "");

  return `You are an audio direction planner for comic production.
Create a voice-cast + SFX planning pack for the given comic beat checkpoints.

Story title: ${storyTitle}
Style: ${style}
Audience: ${audienceMode}
${transcript ? `Director transcript: ${truncateText(transcript, 1200)}` : "Director transcript: none"}

Checkpoints:
${checkpointText}

Return VALID JSON only with this exact shape:
{
  "cast": [
    {
      "speaker": "string",
      "voiceProfile": "string",
      "direction": "string"
    }
  ],
  "checkpoints": [
    {
      "checkpointId": "string",
      "pageNumber": number,
      "beatTitle": "string",
      "voiceLines": [
        {
          "speaker": "string",
          "line": "string",
          "delivery": "string"
        }
      ],
      "sfxCues": [
        {
          "panelNumber": number,
          "cue": "string",
          "intensity": "low|medium|high",
          "purpose": "string"
        }
      ]
    }
  ],
  "mixNotes": ["string"]
}

Rules:
- Include all checkpointIds from input exactly once.
- SFX cues must align with panel actions and not drown dialogue.
- Keep language concise and production-oriented.
- Keep content safe for the specified audience.
- Do not include markdown.`;
}

export async function generateVoiceCastSfxPack({
  client,
  storyTitle,
  style,
  checkpoints,
  audienceMode = "general",
  directorTranscript,
}: {
  client: Together;
  storyTitle: string;
  style: string;
  checkpoints: VoicePackInputCheckpoint[];
  audienceMode?: "general" | "kids" | "teen";
  directorTranscript?: string;
}): Promise<VoiceCastSfxPack> {
  const safeCheckpoints = checkpoints.slice(0, 6);
  if (safeCheckpoints.length === 0) {
    return buildFallbackVoiceCastSfxPack({
      checkpoints: [],
      directorTranscript,
      audienceMode,
    });
  }

  const fallback = buildFallbackVoiceCastSfxPack({
    checkpoints: safeCheckpoints,
    directorTranscript,
    audienceMode,
  });

  try {
    const response = await client.chat.completions.create({
      model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
      messages: [
        {
          role: "system",
          content:
            "You are an expert voice director and SFX supervisor. Return valid JSON only.",
        },
        {
          role: "user",
          content: buildVoicePackPrompt({
            storyTitle,
            style,
            checkpoints: safeCheckpoints,
            audienceMode,
            directorTranscript,
          }),
        },
      ],
      temperature: 0.5,
      max_tokens: 1800,
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return fallback;
    }

    const extracted = extractJsonObject(content);
    if (!extracted) {
      return fallback;
    }

    const parsed = rawVoicePackSchema.safeParse(JSON.parse(extracted));
    if (!parsed.success) {
      return fallback;
    }

    const byCheckpointId = new Map(
      parsed.data.checkpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint]),
    );
    const normalizedCheckpoints = safeCheckpoints.map((checkpoint) => {
      const planned = byCheckpointId.get(checkpoint.id);
      if (!planned) {
        return fallback.checkpoints.find(
          (entry) => entry.checkpointId === checkpoint.id,
        ) as VoiceSfxCheckpointPack;
      }

      return {
        ...planned,
        checkpointId: checkpoint.id,
        pageNumber: checkpoint.pageNumber,
        beatTitle: truncateText(checkpoint.beatTitle, 120),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      source: "model",
      cast: parsed.data.cast,
      checkpoints: normalizedCheckpoints,
      mixNotes: parsed.data.mixNotes,
      pipelinePath: buildPipelinePath(),
    };
  } catch {
    return fallback;
  }
}

import { describe, expect, it } from "vitest";
import { buildFallbackVoiceCastSfxPack } from "@/lib/voice-cast-sfx";

describe("voice-cast-sfx", () => {
  it("builds deterministic fallback pack with cast, checkpoints, and pipeline stages", () => {
    const pack = buildFallbackVoiceCastSfxPack({
      checkpoints: [
        {
          id: "cp-1",
          pageNumber: 2,
          beatTitle: "Ambush on the Rooftop",
          beatSummary: "The hero is cornered and forced to improvise.",
          panelPlan: [
            {
              panelNumber: 1,
              camera: "wide shot",
              action: "Hero scans the rooftop for exits.",
              visualFocus: "Hero and skyline",
            },
            {
              panelNumber: 2,
              camera: "close-up",
              action: "Villain lunges with a metal pipe.",
              visualFocus: "Villain strike",
            },
          ],
          dialoguePlan: [
            {
              speaker: "Hero",
              line: "Stay calm. Find the gap.",
              intent: "Internal focus",
            },
            {
              speaker: "Villain",
              line: "You are trapped now!",
              intent: "Threaten",
            },
          ],
        },
      ],
      directorTranscript: "Lean into panic, then resolve with control.",
      audienceMode: "teen",
    });

    expect(pack.source).toBe("fallback");
    expect(pack.cast.length).toBeGreaterThan(0);
    expect(pack.checkpoints).toHaveLength(1);
    expect(pack.checkpoints[0]?.voiceLines.length).toBeGreaterThan(0);
    expect(pack.checkpoints[0]?.sfxCues.length).toBeGreaterThan(0);
    expect(pack.pipelinePath).toHaveLength(3);
    expect(pack.mixNotes.length).toBeGreaterThan(1);
  });
});

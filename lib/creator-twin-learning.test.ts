import { describe, expect, it } from "vitest";
import { applyCreatorTwinLearning } from "@/lib/creator-twin-learning";
import { getDefaultCreatorTwinPreferences } from "@/lib/creator-twin";

describe("creator-twin-learning", () => {
  it("accumulates metadata samples from observed behavior", () => {
    const result = applyCreatorTwinLearning({
      currentPreferences: getDefaultCreatorTwinPreferences(),
      observedPreferences: {
        pageCount: 4,
        dialogueMode: "cinematic",
        audienceMode: "teen",
      },
      existingMetadata: {},
      signalType: "page_generated",
      weight: 2,
    });

    expect(result.samples).toBe(2);
    expect(result.nextPreferences).toEqual(getDefaultCreatorTwinPreferences());
    expect(result.updatedByLearning).toBe(false);
  });

  it("updates defaults when one preference cluster dominates after enough samples", () => {
    let metadata: Record<string, unknown> = {};
    let current = getDefaultCreatorTwinPreferences();

    for (let i = 0; i < 7; i += 1) {
      const result = applyCreatorTwinLearning({
        currentPreferences: current,
        observedPreferences: {
          pageCount: 4,
          dialogueMode: "cinematic",
          audienceMode: "teen",
        },
        existingMetadata: metadata,
        signalType: "queue_completed",
        weight: 1,
      });
      metadata = result.nextMetadata;
      current = result.nextPreferences;
    }

    expect(current).toEqual({
      pageCount: 4,
      dialogueMode: "cinematic",
      audienceMode: "teen",
    });
  });
});


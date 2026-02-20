import { describe, expect, it } from "vitest";
import {
  getDefaultCreatorTwinPreferences,
  normalizeCreatorTwinPreferences,
} from "@/lib/creator-twin";

describe("creator-twin", () => {
  it("returns defaults for invalid input", () => {
    expect(normalizeCreatorTwinPreferences(null)).toEqual(
      getDefaultCreatorTwinPreferences(),
    );
    expect(
      normalizeCreatorTwinPreferences({
        pageCount: 99,
        dialogueMode: "wild",
        audienceMode: "all",
      }),
    ).toEqual(getDefaultCreatorTwinPreferences());
  });

  it("accepts valid preferences", () => {
    expect(
      normalizeCreatorTwinPreferences({
        pageCount: 4,
        dialogueMode: "cinematic",
        audienceMode: "teen",
      }),
    ).toEqual({
      pageCount: 4,
      dialogueMode: "cinematic",
      audienceMode: "teen",
    });
  });
});


import { describe, expect, it } from "vitest";
import { buildCharacterBiblePromptSection } from "@/lib/character-bible";

describe("character-bible", () => {
  it("returns empty section when no characters exist", () => {
    expect(buildCharacterBiblePromptSection([])).toBe("");
  });

  it("formats character continuity instructions", () => {
    const section = buildCharacterBiblePromptSection([
      {
        id: "1",
        storyId: "s1",
        name: "Nova",
        role: "Lead",
        appearance: "Red scarf and mechanical arm",
        personality: "Calm under pressure",
        speechStyle: "Precise and sharp",
        referenceImageUrl: "https://example.com/nova.png",
        isLocked: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    expect(section).toContain("CHARACTER BIBLE");
    expect(section).toContain("Nova");
    expect(section).toContain("Locked continuity traits must not change");
  });
});

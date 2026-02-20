import { describe, expect, it } from "vitest";
import {
  buildConsistencyContext,
  buildContinuationSuggestions,
} from "@/lib/consistency-engine";

describe("consistency-engine", () => {
  it("includes title, recent prompts, and locked character data", () => {
    const context = buildConsistencyContext({
      storyTitle: "Skyline Reckoning",
      storyDescription: "A city under pressure",
      style: "noir",
      previousPrompts: [
        "Hero meets mentor",
        "Villain sends warning",
        "Ally is captured",
      ],
      storyCharacters: [
        {
          id: "a",
          storyId: "story-1",
          name: "Mira",
          role: "Protagonist",
          appearance: "Silver hair and blue jacket",
          personality: "Brave but impatient",
          speechStyle: "Short and direct",
          referenceImageUrl: null,
          isLocked: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    expect(context).toContain("Story title: Skyline Reckoning");
    expect(context).toContain("Recent page beats:");
    expect(context).toContain("Mira");
    expect(context).toContain("appearance=Silver hair and blue jacket");
  });

  it("returns three continuation suggestions", () => {
    const suggestions = buildContinuationSuggestions({
      storyTitle: "Skyline Reckoning",
      recentPrompts: ["Hero escapes rooftop ambush"],
      characterNames: ["Mira", "Kade"],
    });

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toContain("Mira");
    expect(suggestions[1]).toContain("Kade");
  });
});

import { describe, expect, it } from "vitest";
import { formatPresenceUserLabel, STORY_EDIT_RESOURCE } from "@/lib/story-coedit";

describe("story-coedit", () => {
  it("exposes stable lock resources", () => {
    expect(STORY_EDIT_RESOURCE.title).toBe("story-title");
    expect(STORY_EDIT_RESOURCE.pages).toBe("story-pages");
    expect(STORY_EDIT_RESOURCE.characterBible).toBe("character-bible");
  });

  it("keeps short user labels intact", () => {
    expect(formatPresenceUserLabel("user_1234")).toBe("user_1234");
  });

  it("truncates long user labels for compact UI", () => {
    expect(formatPresenceUserLabel("user_very_long_identifier_1234")).toBe(
      "user_ver…1234",
    );
  });
});


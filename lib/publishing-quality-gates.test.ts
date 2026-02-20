import { describe, expect, it } from "vitest";
import {
  buildStoryPublishingPack,
  rebuildStoryPublishingPackMarkdown,
  type StoryPublishingPack,
} from "@/lib/publishing-distribution";
import {
  applyPublishingQuickFix,
  evaluateStoryPublishingPackQuality,
} from "@/lib/publishing-quality-gates";
import { type Page, type Story } from "@/lib/schema";

function createStory(): Story {
  return {
    id: "story-1",
    title: "Neon Protocol",
    slug: "neon-protocol",
    description: "Two rivals race to stop a rogue signal before dawn.",
    style: "noir",
    userId: "user-1",
    usesOwnApiKey: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createPage({
  pageNumber,
  prompt,
  imageUrl,
}: {
  pageNumber: number;
  prompt: string;
  imageUrl: string | null;
}): Page {
  return {
    id: `page-${pageNumber}`,
    storyId: "story-1",
    pageNumber,
    prompt,
    characterImageUrls: [],
    generatedImageUrl: imageUrl,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildBasePack(): StoryPublishingPack {
  return buildStoryPublishingPack({
    story: createStory(),
    pages: [
      createPage({
        pageNumber: 1,
        prompt: "Mira enters the rain-soaked neon alley.",
        imageUrl: "https://cdn.example.com/page-1.jpg",
      }),
      createPage({
        pageNumber: 2,
        prompt: "Kade triggers a diversion as drones close in.",
        imageUrl: "https://cdn.example.com/page-2.jpg",
      }),
    ],
    channels: ["x_thread"],
    emotionLock: "suspense",
  });
}

describe("publishing-quality-gates", () => {
  it("flags blocking issues for malformed channel payloads", () => {
    const basePack = buildBasePack();
    const brokenPack = rebuildStoryPublishingPackMarkdown({
      ...basePack,
      channels: basePack.channels.map((channel) => ({
        ...channel,
        primaryCaption: "x".repeat(760),
        hashtags: ["tag1", "#tag2", "tag3", "tag4", "tag5", "tag6", "tag7"],
        postSequence: ["one"],
        callToAction: "Go",
      })),
    });

    const quality = evaluateStoryPublishingPackQuality(brokenPack);
    expect(quality.status).toBe("needs_fixes");
    expect(quality.blockingIssueCount).toBeGreaterThan(0);
    const channelQuality = quality.channelResults[0];
    expect(channelQuality?.checks.some((check) => !check.passed)).toBe(true);
  });

  it("applies quick fixes and clears blocking issues", () => {
    let pack = buildBasePack();

    pack = rebuildStoryPublishingPackMarkdown({
      ...pack,
      channels: pack.channels.map((channel) => ({
        ...channel,
        primaryCaption: "x".repeat(760),
        hashtags: ["tag1", "#tag2", "tag3", "tag4", "tag5", "tag6", "tag7"],
        postSequence: ["one"],
        callToAction: "Go",
      })),
    });

    pack = applyPublishingQuickFix({
      pack,
      channel: "x_thread",
      action: "trim_primary_caption",
    });
    pack = applyPublishingQuickFix({
      pack,
      channel: "x_thread",
      action: "trim_hashtags",
    });
    pack = applyPublishingQuickFix({
      pack,
      channel: "x_thread",
      action: "normalize_hashtags",
    });
    pack = applyPublishingQuickFix({
      pack,
      channel: "x_thread",
      action: "ensure_sequence",
    });
    pack = applyPublishingQuickFix({
      pack,
      channel: "x_thread",
      action: "ensure_cta",
    });

    const quality = evaluateStoryPublishingPackQuality(pack);
    expect(quality.status).toBe("ready");
    expect(quality.blockingIssueCount).toBe(0);
    expect(pack.channels[0]?.hashtags.every((tag) => tag.startsWith("#"))).toBe(true);
    expect(pack.channels[0]?.postSequence.length).toBeGreaterThanOrEqual(3);
  });
});

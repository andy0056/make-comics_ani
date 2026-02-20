import { describe, expect, it } from "vitest";
import {
  buildPublishingAutopipelineBundle,
  buildStoryPublishingPack,
  type DistributionChannel,
} from "@/lib/publishing-distribution";
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

describe("publishing-distribution", () => {
  it("builds a publish pack with channel kits and markdown", () => {
    const pack = buildStoryPublishingPack({
      story: createStory(),
      pages: [
        createPage({
          pageNumber: 1,
          prompt: "Mira tracks the signal through the neon market at midnight.",
          imageUrl: "https://cdn.example.com/page-1.jpg",
        }),
        createPage({
          pageNumber: 2,
          prompt: "Kade blocks the only bridge while drones close in.",
          imageUrl: "https://cdn.example.com/page-2.jpg",
        }),
      ],
      storyUrl: "https://app.makecomics.local/story/neon-protocol",
      tone: "cinematic",
    });

    expect(pack.storySlug).toBe("neon-protocol");
    expect(pack.pageCount).toBe(2);
    expect(pack.channels.length).toBe(4);
    expect(pack.styleMorphTimeline.length).toBe(2);
    expect(pack.baseHashtags).toContain("#KaBoom");
    expect(pack.markdownKit).toContain("Publish Kit - Neon Protocol");
    expect(pack.markdownKit).toContain("Style morph mode:");
    expect(pack.markdownKit).toContain("## X Thread");
  });

  it("supports channel filtering and de-duplicates selected channels", () => {
    const selectedChannels: DistributionChannel[] = [
      "x_thread",
      "linkedin_post",
      "x_thread",
    ];

    const pack = buildStoryPublishingPack({
      story: createStory(),
      pages: [
        createPage({
          pageNumber: 1,
          prompt: "The first conflict erupts in the transit tunnel.",
          imageUrl: "https://cdn.example.com/page-1.jpg",
        }),
      ],
      channels: selectedChannels,
      tone: "hype",
    });

    expect(pack.channels.map((channel) => channel.channel)).toEqual([
      "x_thread",
      "linkedin_post",
    ]);
    expect(pack.channels[0]?.primaryCaption).toContain("Big energy update:");
  });

  it("builds emotion-locked variants and emotion hashtags", () => {
    const pack = buildStoryPublishingPack({
      story: createStory(),
      pages: [
        createPage({
          pageNumber: 1,
          prompt: "A detective corners the suspect in a rain-soaked alley.",
          imageUrl: "https://cdn.example.com/page-1.jpg",
        }),
        createPage({
          pageNumber: 2,
          prompt: "The rooftop standoff turns into a dangerous jump.",
          imageUrl: "https://cdn.example.com/page-2.jpg",
        }),
      ],
      emotionLock: "suspense",
      styleMorphMode: "bold",
    });

    expect(pack.emotionLock).toBe("suspense");
    expect(pack.baseHashtags).toContain("#SuspenseTone");
    expect(pack.styleMorphMode).toBe("bold");
    expect(pack.channels[0]?.emotionLockedPrimaryCaption).toContain(
      "Emotion lock (suspense)",
    );
    expect(pack.channels[0]?.emotionLockedShortCaption).toContain("Suspense cut");
  });

  it("throws when no generated pages are available", () => {
    expect(() =>
      buildStoryPublishingPack({
        story: createStory(),
        pages: [
          createPage({
            pageNumber: 1,
            prompt: "Placeholder prompt only",
            imageUrl: null,
          }),
        ],
      }),
    ).toThrow("No generated pages available for publishing");
  });

  it("builds autopipeline bundle with manifest and channel files", () => {
    const { pack, bundle } = buildPublishingAutopipelineBundle({
      story: createStory(),
      pages: [
        createPage({
          pageNumber: 1,
          prompt: "Mira enters the neon alley under heavy rain.",
          imageUrl: "https://cdn.example.com/page-1.jpg",
        }),
        createPage({
          pageNumber: 2,
          prompt: "Kade triggers a diversion while drones scan the bridge.",
          imageUrl: "https://cdn.example.com/page-2.jpg",
        }),
      ],
      tone: "educational",
      styleMorphMode: "subtle",
      emotionLock: "heroic",
      channels: ["x_thread", "newsletter_blurb"],
    });

    expect(pack.channels).toHaveLength(2);
    expect(bundle.bundleVersion).toBe("x3-autopipeline-v1");
    expect(bundle.metadata.emotionLock).toBe("heroic");
    expect(bundle.metadata.styleMorphMode).toBe("subtle");
    expect(bundle.assets).toHaveLength(2);
    expect(bundle.files.some((file) => file.path === "manifest.json")).toBe(true);
    expect(
      bundle.files.some((file) => file.path === "channels/x_thread.md"),
    ).toBe(true);
  });
});

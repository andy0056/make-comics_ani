import { describe, expect, it, vi } from "vitest";
import Together from "together-ai";
import {
  buildFallbackNarrativeAutopilotPlan,
  generateNarrativeAutopilotPlan,
} from "@/lib/narrative-autopilot";
import { type StoryCharacter } from "@/lib/schema";

function createStoryCharacter(name: string): StoryCharacter {
  return {
    id: `character-${name.toLowerCase()}`,
    storyId: "story-1",
    name,
    role: "Lead",
    appearance: "Distinct silhouette",
    personality: "Driven",
    speechStyle: "Direct",
    referenceImageUrl: null,
    isLocked: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("narrative-autopilot", () => {
  it("builds deterministic fallback plan with 5-panel choreography", () => {
    const plan = buildFallbackNarrativeAutopilotPlan({
      storyTitle: "Neon Protocol",
      nextPageNumber: 3,
      targetPageCount: 3,
      recentPrompts: ["The alarm siren starts and the vault begins to seal."],
      storyCharacters: [createStoryCharacter("Mira"), createStoryCharacter("Kade")],
    });

    expect(plan.checkpoints).toHaveLength(3);
    expect(plan.checkpoints[0].pageNumber).toBe(3);
    expect(plan.checkpoints[0].panelPlan).toHaveLength(5);
    expect(plan.checkpoints[0].beatPrompt).toContain("Panel choreography:");
    expect(plan.checkpoints[0].beatPrompt).toContain("Suggested dialogue beats:");
  });

  it("applies camera direction mode in fallback panel choreography", () => {
    const plan = buildFallbackNarrativeAutopilotPlan({
      storyTitle: "Neon Protocol",
      nextPageNumber: 2,
      targetPageCount: 1,
      recentPrompts: [],
      storyCharacters: [createStoryCharacter("Mira")],
      cameraDirectionMode: "kinetic",
    });

    expect(plan.checkpoints[0]?.panelPlan[0]?.camera).toContain("handheld");
  });

  it("normalizes valid model output into autopilot checkpoints", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    arcTitle: "Vault Break Arc",
                    arcSummary: "Escalate tension while splitting the team.",
                    checkpoints: [
                      {
                        pageNumber: 4,
                        beatTitle: "A risky split",
                        beatSummary:
                          "Mira takes the high route while Kade distracts the guards.",
                        panelPlan: [
                          {
                            panelNumber: 1,
                            camera: "wide establishing shot",
                            action: "Show both entry paths to the vault.",
                            visualFocus: "Environment geometry",
                          },
                          {
                            panelNumber: 2,
                            camera: "medium shot",
                            action: "Mira climbs into a maintenance lane.",
                            visualFocus: "Mira's determination",
                          },
                          {
                            panelNumber: 3,
                            camera: "close-up",
                            action: "Kade triggers a decoy alarm.",
                            visualFocus: "Control panel lights",
                          },
                          {
                            panelNumber: 4,
                            camera: "over-the-shoulder shot",
                            action: "A patrol turns unexpectedly toward Mira.",
                            visualFocus: "Guard posture",
                          },
                          {
                            panelNumber: 5,
                            camera: "low-angle shot",
                            action: "Mira freezes as the patrol flashlight sweeps in.",
                            visualFocus: "Cliffhanger beat",
                          },
                        ],
                        dialoguePlan: [
                          {
                            speaker: "Mira",
                            line: "If they look up, we lose the whole run.",
                            intent: "Signal risk",
                          },
                          {
                            speaker: "Kade",
                            line: "Then keep moving. I will buy you ten seconds.",
                            intent: "Offer support under pressure",
                          },
                        ],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    } as unknown as Together;

    const plan = await generateNarrativeAutopilotPlan({
      client: mockClient,
      storyTitle: "Neon Protocol",
      storyDescription: "A crew breaches an adaptive security vault.",
      style: "noir",
      nextPageNumber: 4,
      targetPageCount: 1,
      recentPrompts: ["The team reaches the vault perimeter."],
      storyCharacters: [createStoryCharacter("Mira"), createStoryCharacter("Kade")],
      storyWorld: { timeline: [], locations: [], canonRules: [] },
      characterDnaProfiles: [],
    });

    expect(plan.arcTitle).toBe("Vault Break Arc");
    expect(plan.checkpoints).toHaveLength(1);
    expect(plan.checkpoints[0].pageNumber).toBe(4);
    expect(plan.checkpoints[0].panelPlan).toHaveLength(5);
    expect(plan.checkpoints[0].dialoguePlan[0]?.speaker).toBe("Mira");
  });

  it("falls back when model response is invalid", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "not-json-response" } }],
          }),
        },
      },
    } as unknown as Together;

    const plan = await generateNarrativeAutopilotPlan({
      client: mockClient,
      storyTitle: "Neon Protocol",
      storyDescription: null,
      style: "manga",
      nextPageNumber: 2,
      targetPageCount: 2,
      dialogueMode: "concise",
      recentPrompts: [],
      storyCharacters: [createStoryCharacter("Mira")],
      storyWorld: { timeline: [], locations: [], canonRules: [] },
      characterDnaProfiles: [],
    });

    expect(plan.arcTitle).toContain("Neon Protocol");
    expect(plan.checkpoints).toHaveLength(2);
    expect(plan.checkpoints[0].pageNumber).toBe(2);
  });

  it("injects audience mode instructions into model prompt", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              arcTitle: "Audience Arc",
              arcSummary: "Audience tuned plan.",
              checkpoints: [
                {
                  pageNumber: 5,
                  beatTitle: "Beat 1",
                  beatSummary: "Audience-safe escalation beat.",
                  panelPlan: [
                    {
                      panelNumber: 1,
                      camera: "wide shot",
                      action: "Scene opens on a tense standoff.",
                      visualFocus: "Hero posture",
                    },
                    {
                      panelNumber: 2,
                      camera: "medium shot",
                      action: "Hero evaluates options quickly.",
                      visualFocus: "Facial reaction",
                    },
                    {
                      panelNumber: 3,
                      camera: "close-up",
                      action: "A clue appears on the device screen.",
                      visualFocus: "Device signal",
                    },
                    {
                      panelNumber: 4,
                      camera: "over-the-shoulder",
                      action: "Villain advances one step closer.",
                      visualFocus: "Distance between rivals",
                    },
                    {
                      panelNumber: 5,
                      camera: "low-angle shot",
                      action: "Hero chooses a non-lethal counter move.",
                      visualFocus: "Decision moment",
                    },
                  ],
                  dialoguePlan: [
                    {
                      speaker: "Mira",
                      line: "We end this without crossing the line.",
                      intent: "Maintain moral boundary",
                    },
                  ],
                },
              ],
            }),
          },
        },
      ],
    });

    const mockClient = {
      chat: {
        completions: {
          create: createMock,
        },
      },
    } as unknown as Together;

    await generateNarrativeAutopilotPlan({
      client: mockClient,
      storyTitle: "Neon Protocol",
      storyDescription: "A crew breaches an adaptive security vault.",
      style: "noir",
      nextPageNumber: 5,
      targetPageCount: 1,
      dialogueMode: "balanced",
      audienceMode: "kids",
      recentPrompts: ["The team reaches the vault perimeter."],
      storyCharacters: [createStoryCharacter("Mira"), createStoryCharacter("Kade")],
      storyWorld: { timeline: [], locations: [], canonRules: [] },
      characterDnaProfiles: [],
    });

    const requestPayload = createMock.mock.calls[0]?.[0] as
      | { messages?: Array<{ role: string; content: string }> }
      | undefined;
    const userPrompt =
      requestPayload?.messages?.find((message) => message.role === "user")
        ?.content ?? "";

    expect(userPrompt).toContain("Audience mode: kids (8-12)");
  });

  it("injects director transcript guidance into model prompt", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              arcTitle: "Director Arc",
              arcSummary: "Director-driven pacing.",
              checkpoints: [
                {
                  pageNumber: 6,
                  beatTitle: "Beat 1",
                  beatSummary: "Camera-first direction beat.",
                  panelPlan: [
                    {
                      panelNumber: 1,
                      camera: "wide shot",
                      action: "Open on the skyline before dropping to street level.",
                      visualFocus: "Scale and loneliness",
                    },
                    {
                      panelNumber: 2,
                      camera: "tracking shot",
                      action: "Follow hero sprinting through rain-soaked alley.",
                      visualFocus: "Momentum",
                    },
                    {
                      panelNumber: 3,
                      camera: "close-up",
                      action: "Hero hesitates at the torn wanted poster.",
                      visualFocus: "Eyes and doubt",
                    },
                    {
                      panelNumber: 4,
                      camera: "over-the-shoulder",
                      action: "Reveal rival approaching behind the hero.",
                      visualFocus: "Impending collision",
                    },
                    {
                      panelNumber: 5,
                      camera: "low-angle shot",
                      action: "Hero turns with resolve before impact.",
                      visualFocus: "Decision beat",
                    },
                  ],
                  dialoguePlan: [
                    {
                      speaker: "Mira",
                      line: "Keep it tight. Every second counts.",
                      intent: "Push urgency",
                    },
                  ],
                },
              ],
            }),
          },
        },
      ],
    });

    const mockClient = {
      chat: {
        completions: {
          create: createMock,
        },
      },
    } as unknown as Together;

    await generateNarrativeAutopilotPlan({
      client: mockClient,
      storyTitle: "Neon Protocol",
      storyDescription: "A crew breaches an adaptive security vault.",
      style: "noir",
      nextPageNumber: 6,
      targetPageCount: 1,
      dialogueMode: "cinematic",
      audienceMode: "general",
      cameraDirectionMode: "cinematic",
      directorTranscript:
        "Open with a very wide skyline shot, then quick kinetic tracking cuts. Keep dialogue sparse and high tension.",
      recentPrompts: ["The team reaches the vault perimeter."],
      storyCharacters: [createStoryCharacter("Mira"), createStoryCharacter("Kade")],
      storyWorld: { timeline: [], locations: [], canonRules: [] },
      characterDnaProfiles: [],
    });

    const requestPayload = createMock.mock.calls[0]?.[0] as
      | { messages?: Array<{ role: string; content: string }> }
      | undefined;
    const userPrompt =
      requestPayload?.messages?.find((message) => message.role === "user")
        ?.content ?? "";

    expect(userPrompt).toContain("Director transcript guidance:");
    expect(userPrompt).toContain("Camera direction mode: cinematic");
    expect(userPrompt).toContain("wide skyline shot");
  });
});

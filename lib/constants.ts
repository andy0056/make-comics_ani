export type PanelLayout = {
  id: string;
  name: string;
  description: string;
  panelCount: number;
  layoutDescription: string;
  panelDirections: string[];
};

export const PANEL_LAYOUTS: PanelLayout[] = [
  {
    id: "3-panel",
    name: "3 Panels",
    description: "One hero panel on top, two reaction panels below. Great for establishing a scene with impact.",
    panelCount: 3,
    layoutDescription: `3-panel comic page arranged as:
[    Panel 1    ] — top row, 1 wide establishing/action panel
[Panel 2][Panel 3] — bottom row, 2 equal panels for reaction and resolution
- Solid black panel borders with clean white gutters between panels`,
    panelDirections: [
      "Wide establishing shot or dramatic action moment — set the scene with environment and mood",
      "Medium shot — character reaction, dialogue exchange, or plot development",
      "Close-up or dynamic angle — emotional payoff, cliffhanger, or transition beat",
    ],
  },
  {
    id: "4-panel",
    name: "4 Panels",
    description: "Classic 2×2 grid. Balanced pacing, ideal for dialogue scenes and steady story progression.",
    panelCount: 4,
    layoutDescription: `4-panel comic page arranged in a 2x2 grid:
[Panel 1][Panel 2] — top row
[Panel 3][Panel 4] — bottom row
- All panels equal size
- Solid black panel borders with clean white gutters between panels`,
    panelDirections: [
      "Establishing shot — introduce scene, setting, or character entrance",
      "Development — action begins, dialogue starts, tension builds",
      "Escalation — conflict peaks, dramatic moment, key revelation",
      "Resolution/cliffhanger — emotional payoff or hook for the next page",
    ],
  },
  {
    id: "5-panel",
    name: "5 Panels",
    description: "Cinematic layout with a large hero panel in the center. Best for dramatic moments and action.",
    panelCount: 5,
    layoutDescription: `5-panel comic page arranged as:
[Panel 1] [Panel 2] — top row, 2 equal panels
[    Panel 3      ] — middle row, 1 large cinematic hero panel
[Panel 4] [Panel 5] — bottom row, 2 equal panels
- Solid black panel borders with clean white gutters between panels
- Each panel clearly separated and distinct`,
    panelDirections: [
      "Opening shot — establish scene or continue from previous page",
      "Character introduction or dialogue — medium shot with clear expressions",
      "HERO PANEL — large cinematic moment, dramatic action, or emotional climax",
      "Reaction or consequence — show the impact of the hero panel moment",
      "Closing beat — resolution, transition, or cliffhanger for next page",
    ],
  },
  {
    id: "6-panel",
    name: "6 Panels",
    description: "Dense 3×2 grid for detailed storytelling. Steady pacing, great for longer narrative sequences.",
    panelCount: 6,
    layoutDescription: `6-panel comic page arranged in a 3x2 grid:
[Panel 1][Panel 2] — top row
[Panel 3][Panel 4] — middle row
[Panel 5][Panel 6] — bottom row
- All panels equal size for steady pacing
- Solid black panel borders with clean white gutters between panels`,
    panelDirections: [
      "Establishing shot — set the scene and mood",
      "Character focus — introduce or re-establish key character",
      "Action or dialogue — advance the plot with movement or conversation",
      "Tension point — build toward the key moment",
      "Climax — the dramatic peak of the page",
      "Resolution/hook — emotional landing or setup for next page",
    ],
  },
] as const;

export const DEFAULT_PANEL_LAYOUT_ID = "5-panel";

export const COMIC_STYLES = [
  {
    id: "american-modern",
    name: "American Modern",
    prompt: "contemporary American superhero comic style, bold vibrant colors, dynamic heroic poses, detailed muscular anatomy, cinematic action scenes, modern digital art",
    compositionGuidance: "Use dynamic Dutch angles for action. Bold thick outlines. Saturated primary colors. Dramatic foreshortening on hero poses. Deep shadows with rim lighting.",
  },
  {
    id: "manga",
    name: "Manga",
    prompt: "Japanese manga style, clean precise black linework, screen tone shading, expressive eyes, dynamic speed lines, black and white with impact effects",
    compositionGuidance: "Emphasize emotional expressions with large expressive eyes. Use screen tones for shading. Add speed lines for motion. Include impact frames and dramatic reaction shots. Maintain clean negative space.",
  },
  {
    id: "noir",
    name: "Noir",
    prompt: "film noir style, high contrast black and white, deep dramatic shadows, 1940s detective aesthetic, heavy bold inking, moody atmospheric lighting",
    compositionGuidance: "Heavy chiaroscuro lighting. Venetian blind shadow patterns. Low camera angles for menace. Silhouettes and partial face reveals. Rain and wet reflections for atmosphere.",
  },
  {
    id: "vintage",
    name: "Vintage",
    prompt: "Golden Age 1950s comic style, visible halftone Ben-Day dots, limited retro color palette, nostalgic warm tones, classic adventure comics",
    compositionGuidance: "Visible Ben-Day dot patterns. Limited 4-color palette feel. Bold simple compositions. Clear readable action. Warm nostalgic color temperature.",
  },
  {
    id: "webtoon",
    name: "Webtoon",
    prompt: "modern webtoon-inspired comic style, crisp clean linework, rich full-color gradients, expressive character acting, polished lighting, readable panel storytelling, contemporary digital comic finish",
    compositionGuidance: "Clean digital finish with soft gradients. Luminous lighting effects. Simplified but expressive character designs. Pastel-to-vivid color range. Modern fashion and contemporary settings.",
  },
  {
    id: "anime-cinematic",
    name: "Cinematic Anime",
    prompt: "cinematic anime comic style, dramatic composition, dynamic action framing, detailed line art, bold color contrast, atmospheric lighting, emotionally expressive faces, high-impact panel energy",
    compositionGuidance: "Cinematic widescreen framing. Lens flare and atmospheric particle effects. Dramatic backlighting. Dynamic camera swoops. High-saturation accent colors against muted backgrounds.",
  },
] as const;


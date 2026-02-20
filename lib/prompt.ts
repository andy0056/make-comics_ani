import { COMIC_STYLES, PANEL_LAYOUTS, DEFAULT_PANEL_LAYOUT_ID } from "./constants";

export function buildComicPrompt({
  prompt,
  style,
  panelLayoutId,
  characterImages = [],
  isContinuation = false,
  previousContext = "",
  isAddPage = false,
  previousPages = [],
}: {
  prompt: string;
  style?: string;
  panelLayoutId?: string;
  characterImages?: string[];
  isContinuation?: boolean;
  previousContext?: string;
  isAddPage?: boolean;
  previousPages?: Array<{
    prompt: string;
  }>;
}): string {
  const styleInfo = COMIC_STYLES.find((s) => s.id === style);
  const styleDesc = styleInfo?.prompt || COMIC_STYLES[2].prompt;
  const compositionGuidance = styleInfo?.compositionGuidance || "";

  // Panel layout
  const layout = PANEL_LAYOUTS.find((l) => l.id === panelLayoutId) ||
    PANEL_LAYOUTS.find((l) => l.id === DEFAULT_PANEL_LAYOUT_ID)!;

  // Build panel choreography
  const panelChoreography = layout.panelDirections
    .map((dir, i) => `  Panel ${i + 1}: ${dir}`)
    .join("\n");

  // Build continuation context
  let continuationContext = "";
  if (isContinuation && previousContext) {
    continuationContext = `\nCONTINUATION CONTEXT:
This is a continuation of an existing story. The previous page showed: ${previousContext}
Maintain visual consistency with the previous panels. Continue the narrative naturally.\n`;
  }

  if (isAddPage && previousPages.length > 0) {
    // Create a smart summary instead of dumping all raw prompts
    const recentPages = previousPages.slice(-3); // Use last 3 pages for context
    const storyArc = recentPages
      .map((page, index) => {
        const pageNum = previousPages.length - recentPages.length + index + 1;
        return `  Page ${pageNum}: ${page.prompt}`;
      })
      .join("\n");

    continuationContext = `\nSTORY CONTINUATION CONTEXT:
This comic has ${previousPages.length} existing page${previousPages.length > 1 ? "s" : ""}. Here are the most recent:
${storyArc}

The new page should naturally continue this story. Maintain the same characters, setting, and narrative style. Reference previous events and build upon them. Do not repeat what already happened.\n`;
  }

  // Build character consistency instructions
  let characterSection = "";
  if (characterImages.length > 0) {
    if (characterImages.length === 1) {
      characterSection = `
CRITICAL FACE CONSISTENCY INSTRUCTIONS:
- REFERENCE CHARACTER: Use the uploaded image as EXACT reference for the protagonist's face and appearance
- FACE MATCHING: The character's face must be IDENTICAL to the reference image - same eyes, nose, mouth, hair, facial structure
- APPEARANCE PRESERVATION: Maintain exact skin tone, hair color/style, eye color, and distinctive facial features
- CHARACTER CONSISTENCY: This exact same character must appear in ALL ${layout.panelCount} panels with the same face throughout
- STYLE APPLICATION: Apply ${style} comic art style to the body/pose/action but KEEP THE FACE EXACTLY AS IN THE REFERENCE IMAGE
- NO VARIATION: Do not alter, modify, or change the character's face in any way from the reference`;
    } else if (characterImages.length === 2) {
      characterSection = `
CRITICAL DUAL CHARACTER FACE CONSISTENCY INSTRUCTIONS:
- CHARACTER 1 REFERENCE: Use the FIRST uploaded image as EXACT reference for Character 1's face and appearance
- CHARACTER 2 REFERENCE: Use the SECOND uploaded image as EXACT reference for Character 2's face and appearance
- FACE MATCHING: Both characters' faces must be IDENTICAL to their respective reference images
- VISUAL DISTINCTION: Keep both characters clearly visually distinct with their unique faces, hair, and features
- CONSISTENT PRESENCE: Both characters must appear together in at least ${Math.max(2, layout.panelCount - 1)} of the ${layout.panelCount} panels
- STYLE APPLICATION: Apply ${style} comic art style while maintaining EXACT facial features from references
- NO FACE VARIATION: Never alter or modify either character's face from their reference images`;
    }
  }

  const systemPrompt = `Professional comic book page illustration.
${continuationContext}
${characterSection}

CHARACTER CONSISTENCY RULES (HIGHEST PRIORITY):
- If reference images are provided, the characters' FACES must be 100% identical to the reference images
- Never change hair color, eye color, facial structure, or distinctive features
- Apply comic style to body/pose/action but preserve exact facial appearance
- Same character must look identical across all panels they appear in

TEXT AND LETTERING (CRITICAL):
- All text in speech bubbles must be PERFECTLY CLEAR, LEGIBLE, and correctly spelled
- Use bold clean comic book lettering, large and easy to read
- Speech bubbles: crisp white fill, solid black outline, pointed tail toward speaker
- Keep dialogue SHORT: maximum 1-2 sentences per bubble
- NO blurry, warped, or unreadable text

PAGE LAYOUT:
${layout.layoutDescription}

PANEL CHOREOGRAPHY (follow this shot sequence):
${panelChoreography}

ART STYLE:
${styleDesc}
${compositionGuidance}
${characterSection}

COMPOSITION:
- Vary camera angles across panels as directed in the choreography above
- Natural visual flow: left-to-right, top-to-bottom reading order
- Dynamic character poses with clear expressive acting
- Detailed backgrounds matching the scene and mood`;

  return `${systemPrompt}\n\nSTORY:\n${prompt}`;
}

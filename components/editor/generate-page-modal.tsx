"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, X, Loader2, Check, Sparkles, ChevronRight, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { validateFileForUpload, generateFilePreview } from "@/lib/file-utils";
import { usePresignedUpload } from "next-s3-upload";
import { isContentPolicyViolation } from "@/lib/utils";
import { PANEL_LAYOUTS } from "@/lib/constants";
import { PanelLayoutDiagram } from "@/components/landing/visual-guides";

interface CharacterItem {
  url: string;
  isNew?: boolean;
  file?: File;
  preview?: string;
}

interface GeneratePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: {
    prompt: string;
    characterUrls?: string[];
    panelLayout?: string;
  }) => Promise<void>;
  pageNumber: number;
  isRedrawMode?: boolean;
  existingPrompt?: string;
  existingCharacters?: string[];
  lastPageCharacters?: string[];
  previousPageCharacters?: string[];
  isAdvancedMode?: boolean;
  // New props for context
  previousPagePrompt?: string;
  previousPageImage?: string;
  defaultPanelLayout?: string;
}

/**
 * Continuation sparks: narrative direction suggestions for the next page.
 * These help users think about pacing and story structure.
 */
const CONTINUATION_SPARKS = [
  { emoji: "⚡", label: "Escalate", prompt: "Raise the stakes — introduce a new threat, complication, or twist that changes everything." },
  { emoji: "💬", label: "Dialogue", prompt: "Focus on a meaningful conversation between characters — reveal motives, build tension through words." },
  { emoji: "🔍", label: "Reveal", prompt: "Uncover a secret or reveal crucial information that reframes what the reader thought they knew." },
  { emoji: "🏃", label: "Chase", prompt: "Launch into motion — a pursuit, escape, or race against time with kinetic energy." },
  { emoji: "💔", label: "Emotional beat", prompt: "Slow down for an emotional moment — a memory, a loss, or a quiet realization that hits hard." },
  { emoji: "🌅", label: "New scene", prompt: "Cut to a new location or time — establish a fresh setting that contrasts with what came before." },
  { emoji: "🤝", label: "Alliance", prompt: "Two characters join forces, make a deal, or find unexpected common ground." },
  { emoji: "💥", label: "Confrontation", prompt: "A direct conflict erupts — physical, verbal, or ideological. The tension finally breaks." },
  { emoji: "🧩", label: "Clue", prompt: "Plant a mystery element — something feels off, a detail doesn't add up, curiosity deepens." },
  { emoji: "🎭", label: "Flashback", prompt: "Cut to a memory or past event that explains a character's current behavior or motivation." },
];

const BOT_ROOT_SELECTOR = '[data-kaboom-bot-root="true"]';

function getRandomSparks(count: number = 3): typeof CONTINUATION_SPARKS {
  const shuffled = [...CONTINUATION_SPARKS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Truncate prompt text for the "Previously" context card.
 */
function truncatePrompt(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export function GeneratePageModal({
  isOpen,
  onClose,
  onGenerate,
  pageNumber,
  isRedrawMode = false,
  existingPrompt = "",
  existingCharacters = [],
  lastPageCharacters = [],
  previousPageCharacters = [],
  isAdvancedMode = false,
  previousPagePrompt = "",
  previousPageImage = "",
  defaultPanelLayout = "5-panel",
}: GeneratePageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [selectedCharacterIndices, setSelectedCharacterIndices] = useState<
    Set<number>
  >(new Set());
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [displayedSparks, setDisplayedSparks] = useState(() => getRandomSparks(3));
  const [panelLayout, setPanelLayout] = useState(defaultPanelLayout);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasOpenRef = useRef(false);
  const { toast } = useToast();
  const { uploadToS3 } = usePresignedUpload();
  const showOptionalControls = isAdvancedMode || showAdvancedControls;

  const hasPreviousContext = !!previousPagePrompt || !!previousPageImage;

  // Reset form and initialize characters when modal opens
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = true;
    setPrompt(isRedrawMode ? existingPrompt : "");
    setShowPreview(null);
    setIsGenerating(false);
    setShowAdvancedControls(isAdvancedMode);
    setDisplayedSparks(getRandomSparks(3));
    setPanelLayout(defaultPanelLayout);

    // Initialize characters
    const existingItems: CharacterItem[] = existingCharacters.map((url) => ({
      url,
      isNew: false,
    }));
    setCharacters(existingItems);

    // Smart selection
    const defaultSelected = new Set<number>();
    const charactersToSelect: string[] = [];
    if (lastPageCharacters.length >= 2) {
      charactersToSelect.push(...lastPageCharacters.slice(0, 2));
    } else {
      charactersToSelect.push(...lastPageCharacters);
      if (charactersToSelect.length < 2 && previousPageCharacters.length > 0) {
        for (const charUrl of previousPageCharacters) {
          if (!charactersToSelect.includes(charUrl) && charactersToSelect.length < 2) {
            charactersToSelect.push(charUrl);
          }
        }
      }
    }
    charactersToSelect.forEach((charUrl) => {
      const index = existingItems.findIndex((item) => item.url === charUrl);
      if (index !== -1) defaultSelected.add(index);
    });
    setSelectedCharacterIndices(defaultSelected);

    // Intelligently steal focus only if the user is not actively chatting with the bot
    const activeEl = document.activeElement;
    if (!activeEl?.closest(BOT_ROOT_SELECTOR)) {
      // Small timeout allows the modal to finish animating in
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isRedrawMode, existingPrompt, existingCharacters, lastPageCharacters, previousPageCharacters, isAdvancedMode, defaultPanelLayout]);

  useKeyboardShortcut(
    () => {
      if (isOpen && !isGenerating && prompt.trim()) {
        handleGenerate();
      }
    },
    { disabled: !isOpen || isGenerating }
  );

  const applySpark = useCallback((sparkPrompt: string) => {
    setPrompt((prev) => {
      // If user already typed something, append the direction
      if (prev.trim()) {
        return prev.trim() + " " + sparkPrompt;
      }
      return sparkPrompt;
    });
    // Focus immediately without a timeout to prevent async focus stealing during pastes
    if (textareaRef.current && !document.activeElement?.closest(BOT_ROOT_SELECTOR)) {
      textareaRef.current.focus();
    }
  }, []);

  // Listen for "Send to Editor" events from KaBoom Bot
  useEffect(() => {
    const handleBotPrompt = (e: CustomEvent<string>) => {
      if (!isOpen) return; // Only process if the modal is actively open

      // Clean up markdown formatting (remove bold asterisks)
      const cleanedPrompt = e.detail.replace(/\*\*/g, '');
      applySpark(cleanedPrompt);
    };

    document.addEventListener('kaboom:use-prompt', handleBotPrompt as EventListener);
    return () => {
      document.removeEventListener('kaboom:use-prompt', handleBotPrompt as EventListener);
    };
  }, [isOpen, applySpark]);

  const handleFiles = async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const filesArray = Array.from(newFiles);
    const validationResults = filesArray.map((file) => ({
      file,
      validation: validateFileForUpload(file, true),
    }));
    validationResults.forEach(({ validation }) => {
      if (!validation.valid && validation.error) {
        toast({ title: "Invalid file", description: validation.error, variant: "destructive", duration: 4000 });
      }
    });
    const validFiles = validationResults.filter(({ validation }) => validation.valid).map(({ file }) => file);
    if (validFiles.length === 0) return;

    const newCharacterItems: CharacterItem[] = await Promise.all(
      validFiles.map(async (file) => {
        const preview = await generateFilePreview(file);
        return { url: "", isNew: true, file, preview };
      })
    );

    setCharacters((prev) => {
      const updated = [...prev, ...newCharacterItems];
      const newSelected = new Set(selectedCharacterIndices);
      newCharacterItems.forEach((_, idx) => newSelected.add(prev.length + idx));
      if (newSelected.size > 2) {
        const selectedArray = Array.from(newSelected).sort((a, b) => b - a);
        const toKeep = selectedArray.slice(0, 2);
        newSelected.clear();
        toKeep.forEach((idx) => newSelected.add(idx));
      }
      setSelectedCharacterIndices(newSelected);
      return updated;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleCharacterSelection = (index: number) => {
    setSelectedCharacterIndices((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(index)) {
        newSelected.delete(index);
      } else {
        if (newSelected.size >= 2) {
          const selectedArray = Array.from(newSelected).sort((a, b) => a - b);
          newSelected.delete(selectedArray[0]);
        }
        newSelected.add(index);
      }
      return newSelected;
    });
  };

  const removeCharacter = (index: number) => {
    setCharacters((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      setSelectedCharacterIndices((prevSelected) => {
        const newSelected = new Set<number>();
        prevSelected.forEach((idx) => {
          if (idx < index) newSelected.add(idx);
          else if (idx > index) newSelected.add(idx - 1);
        });
        return newSelected;
      });
      return updated;
    });
    setShowPreview(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const selectedCharacters = Array.from(selectedCharacterIndices)
        .sort((a, b) => a - b)
        .map((idx) => characters[idx])
        .filter(Boolean);
      const characterUrls = await Promise.all(
        selectedCharacters.map(async (char) => {
          if (char.isNew && char.file) {
            const { url } = await uploadToS3(char.file);
            return url;
          }
          return char.url;
        })
      );
      await onGenerate({
        prompt,
        characterUrls: characterUrls.length > 0 ? characterUrls : undefined,
        panelLayout,
      });
    } catch (error) {
      console.error("Error generating page:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate page. Please try again.";
      let title = "Generation failed";
      if (isContentPolicyViolation(errorMessage)) title = "Content policy violation";
      toast({ title, description: errorMessage, variant: "destructive", duration: 4000 });
      setIsGenerating(false);
      throw error;
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isGenerating) return;
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange} modal={false}>
        <DialogContent
          onInteractOutside={(e) => {
            const target = e.target as Element;
            if (target.closest && target.closest(BOT_ROOT_SELECTOR)) {
              e.preventDefault();
            }
          }}
          onKeyDown={(e) => {
            // Explicitly allow standard clipboard shortcuts to pass through unhindered
            // so they work simultaneously in both the modal and the floating widget
            if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a"].includes(e.key.toLowerCase())) {
              e.stopPropagation();
            }
          }}
          className="border border-border/50 rounded-lg bg-background max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="text-xl text-white font-heading">
              {isRedrawMode
                ? `Redraw Page ${pageNumber}`
                : `Continue Your Story`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Add prompt details and optionally adjust advanced controls before
              generating the next comic page.
            </DialogDescription>
            <DialogClose
              disabled={isGenerating}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* ── Previously: Context Card ── */}
            {hasPreviousContext && !isRedrawMode && (
              <div className="rounded-lg border border-border/40 bg-background/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
                  Previously on page {pageNumber - 1}
                </p>
                <div className="flex gap-3">
                  {previousPageImage && (
                    <div className="flex-shrink-0 w-16 h-20 rounded-md overflow-hidden border border-border/30">
                      <img
                        src={previousPageImage}
                        alt={`Page ${pageNumber - 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {truncatePrompt(previousPagePrompt, 200)}
                  </p>
                </div>
              </div>
            )}

            {/* ── Continuation Sparks ── */}
            {!isRedrawMode && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
                  What happens next?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {displayedSparks.map((spark) => (
                    <button
                      key={spark.label}
                      type="button"
                      onClick={() => applySpark(spark.prompt)}
                      disabled={isGenerating}
                      className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-indigo/40 hover:bg-indigo/5 hover:text-white disabled:opacity-50"
                    >
                      <span>{spark.emoji}</span>
                      <span>{spark.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDisplayedSparks(getRandomSparks(3))}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/40 px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-white disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    More
                  </button>
                </div>
              </div>
            )}

            {/* ── Prompt Input ── */}
            <div className="relative glass-panel p-1 rounded-xl group focus-within:border-indigo/30 transition-colors">
              <div className="bg-background/80 rounded-lg p-4 border border-border/50">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] uppercase text-muted-foreground tracking-[0.02em] font-medium">
                    Page {pageNumber} direction
                  </label>
                  {!isAdvancedMode && (
                    <button
                      type="button"
                      onClick={() => setShowAdvancedControls((current) => !current)}
                      className="text-[10px] uppercase text-indigo hover:text-indigo-300 tracking-[0.02em] transition-colors"
                    >
                      {showOptionalControls ? "Hide Options" : "Characters"}
                    </button>
                  )}
                </div>

                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    isRedrawMode
                      ? "Tweak the prompt to improve this page..."
                      : previousPagePrompt
                        ? "Describe what happens next — or tap a direction above..."
                        : "Describe this page — what happens, who's in it, what's the mood..."
                  }
                  disabled={isGenerating}
                  className="w-full bg-transparent border-none text-sm text-white placeholder-muted-foreground/50 focus:ring-0 focus:outline-none resize-none h-24 leading-relaxed tracking-tight"
                />

                {/* Character controls */}
                {showOptionalControls ? (
                  <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                    <div className="space-y-2">
                      {characters.length > 0 && (
                        <div className="flex flex-wrap gap-2 pb-2">
                          {characters.map((char, index) => {
                            const isSelected = selectedCharacterIndices.has(index);
                            const imageUrl = char.preview || char.url;
                            return (
                              <div key={index} className="relative group/thumb">
                                <button
                                  type="button"
                                  onClick={() => toggleCharacterSelection(index)}
                                  onDoubleClick={() => setShowPreview(imageUrl)}
                                  disabled={isGenerating}
                                  className={`w-10 h-10 rounded-md overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed relative ${isSelected
                                    ? "border-2 border-indigo-500"
                                    : "border-2 border-transparent hover:border-indigo/50"
                                    }`}
                                  title="Click to select/deselect, double-click to preview"
                                >
                                  <img
                                    src={imageUrl || "/placeholder.svg"}
                                    alt={`Character ${index + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  {isSelected && (
                                    <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-indigo-500 rounded-full flex items-center justify-center pointer-events-none z-10 border border-background">
                                      <Check className="w-2 h-2 text-white" />
                                    </div>
                                  )}
                                </button>
                                {char.isNew && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeCharacter(index); }}
                                    disabled={isGenerating}
                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity disabled:opacity-50 z-20"
                                  >
                                    <X className="w-2.5 h-2.5 text-white" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => !isGenerating && fileInputRef.current?.click()}
                        disabled={isGenerating}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{characters.length === 0 ? "Add characters (optional, max 2)" : "Upload new character"}</span>
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedControls(true)}
                      className="text-xs text-muted-foreground hover:text-white transition-colors"
                    >
                      Add character references (optional)
                    </button>
                    <span className="text-xs text-muted-foreground/70">
                      0-2 refs
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Panel Layout Selector ── */}
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
              <div className="flex gap-1">
                {PANEL_LAYOUTS.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setPanelLayout(layout.id)}
                    disabled={isGenerating}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-all disabled:opacity-50 ${panelLayout === layout.id
                      ? "border-indigo/50 bg-indigo/10 text-white"
                      : "border-border/40 text-muted-foreground/70 hover:border-border/60 hover:text-white"
                      }`}
                  >
                    <PanelLayoutDiagram layoutId={layout.id} />
                    <span>{layout.panelCount}</span>
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground/50 ml-auto">
                {PANEL_LAYOUTS.find(l => l.id === panelLayout)?.name ?? ""}
              </span>
            </div>

            {/* ── Footer info ── */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground/70">
                {isRedrawMode
                  ? "Previous pages and characters automatically referenced."
                  : showOptionalControls
                    ? `Previous page auto-referenced. ${selectedCharacterIndices.size} character${selectedCharacterIndices.size !== 1 ? "s" : ""} selected.`
                    : "Previous page automatically referenced for continuity."}
              </p>
              <span className="text-[10px] text-muted-foreground/50">
                Page {pageNumber}
              </span>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="w-full gap-2 bg-white hover:bg-neutral-200 text-black tracking-tight"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {isRedrawMode ? "Redrawing page..." : "Generating page..."}
                  </span>
                </>
              ) : (
                <>
                  {isRedrawMode ? `Redraw Page ${pageNumber}` : `Generate Page ${pageNumber}`}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Character Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center p-4"
          onClick={() => setShowPreview(null)}
        >
          <div className="relative max-w-sm max-h-[80vh] glass-panel p-4 rounded-xl z-101">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 hover:bg-white/10 z-102"
              onClick={() => setShowPreview(null)}
            >
              <X className="w-4 h-4" />
            </Button>
            <img
              src={showPreview || "/placeholder.svg"}
              alt="Character preview"
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  );
}

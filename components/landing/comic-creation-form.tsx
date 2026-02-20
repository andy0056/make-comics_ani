"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  Check,
  ArrowRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LayoutGrid,
  Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePresignedUpload } from "next-s3-upload";
import { useAuth, useClerk, SignInButton } from "@clerk/nextjs";
import { COMIC_STYLES, PANEL_LAYOUTS, DEFAULT_PANEL_LAYOUT_ID } from "@/lib/constants";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useApiKey } from "@/hooks/use-api-key";
import { isContentPolicyViolation } from "@/lib/utils";
import { ApiKeyModal } from "@/components/api-key-modal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { CreateStep } from "@/components/landing/create-stepper";
import type { CreateStatus } from "@/components/landing/create-status-rail";
import { FirstRunHint } from "@/components/landing/first-run-hint";
import { validateFileForUpload } from "@/lib/file-utils";
import { STORY_SPARKS, getRandomSpark, getGenres, type StorySpark } from "@/lib/story-sparks";
import { PanelLayoutDiagram, StylePreviewChip } from "@/components/landing/visual-guides";

interface ComicCreationFormProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  style: string;
  setStyle: (style: string) => void;
  characterFiles: File[];
  setCharacterFiles: (files: File[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isAdvancedMode?: boolean;
  simpleStep?: CreateStep;
  onSimpleStepChange?: (step: CreateStep) => void;
  onStatusChange?: (status: CreateStatus, meta?: CreateStatusMeta) => void;
  showFirstRunHints?: boolean;
  onDismissHints?: () => void;
  onFirstRunCompleted?: () => void;
  simpleModeV2Enabled?: boolean;
  onGenerationStateChange?: (snapshot: GenerationProgressSnapshot) => void;
  onCreateSuccess?: () => void;
  hideStatusPanel?: boolean;
}

export interface CreateStatusMeta {
  stageIndex?: number;
  message?: string;
}

export const GENERATION_STAGES = [
  { id: "check_credits", label: "Checking your generation credits" },
  { id: "upload_references", label: "Uploading your character references" },
  { id: "generate_image", label: "Drawing your comic opening panel" },
  { id: "save_story", label: "Saving your story to library" },
] as const;

export type GenerationStageId = (typeof GENERATION_STAGES)[number]["id"];

export type GenerationProgressSnapshot = {
  generationStage: GenerationStageId | null;
  failedStage: GenerationStageId | null;
  isLoading: boolean;
  isAutoRetrying: boolean;
  elapsedSeconds: number;
  lastGenerationError: string | null;
  lastRequestId: string | null;
  hasAutoRetried: boolean;
  currentStageLabel: string;
};

type GenerationStageState = "done" | "active" | "error" | "pending";

export function getGenerationStageState({
  stageId,
  generationStage,
  failedStage,
  isLoading,
}: {
  stageId: GenerationStageId;
  generationStage: GenerationStageId | null;
  failedStage: GenerationStageId | null;
  isLoading: boolean;
}): GenerationStageState {
  if (failedStage === stageId) {
    return "error";
  }

  if (!generationStage) {
    return "pending";
  }

  const activeIndex = GENERATION_STAGES.findIndex(
    (stage) => stage.id === generationStage
  );
  const currentIndex = GENERATION_STAGES.findIndex((stage) => stage.id === stageId);

  if (currentIndex < 0 || activeIndex < 0) {
    return "pending";
  }

  if (currentIndex < activeIndex) {
    return "done";
  }

  if (currentIndex === activeIndex) {
    return isLoading ? "active" : "done";
  }

  return "pending";
}

const DEFAULT_STYLE = "noir";
const STYLE_STORAGE_KEY = "comic-style-preference";
const PROMPT_STORAGE_KEY = "comic-prompt-draft";

const QUICK_START_RECIPES = [
  {
    id: "fast-action",
    title: "Fast Action",
    subtitle: "Energy · Motion · Stakes",
    prompt:
      "A rogue courier races through a rain-soaked neon market while masked drones close in. Keep it kinetic and cinematic.",
  },
  {
    id: "mystery-noir",
    title: "Mystery Noir",
    subtitle: "Tense · Noir · Measured",
    prompt:
      "A curious teenage hacker uncovers a dangerous conspiracy through a haunted modern town. Keep it cinematic, emotional, and easy to follow.",
  },
  {
    id: "heartfelt-adventure",
    title: "Heartfelt Adventure",
    subtitle: "Warm · Character-driven",
    prompt:
      "Two estranged siblings reunite to protect their floating hometown from an ancient storm spirit. Balance wonder with heartfelt dialogue.",
  },
] as const;

const SPARK_GENRES = getGenres();

async function readJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function ComicCreationForm({
  prompt,
  setPrompt,
  style: initialStyle,
  setStyle: setParentStyle,
  characterFiles,
  setCharacterFiles,
  isLoading,
  setIsLoading,
  isAdvancedMode = false,
  simpleStep = "story",
  onSimpleStepChange,
  onStatusChange,
  showFirstRunHints = false,
  onDismissHints,
  onFirstRunCompleted,
  simpleModeV2Enabled = false,
  onGenerationStateChange,
  onCreateSuccess,
}: ComicCreationFormProps) {
  const router = useRouter();
  const [loadingStep, setLoadingStep] = useState(0);
  const { toast } = useToast();
  const { uploadToS3 } = usePresignedUpload();
  const { isSignedIn, isLoaded } = useAuth();
  const { openSignIn } = useClerk();
  const [apiKey, setApiKey] = useApiKey();
  const hasApiKey = !!apiKey;
  const [previews, setPreviews] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState<number | null>(null);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [panelLayout, setPanelLayout] = useState(DEFAULT_PANEL_LAYOUT_ID);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [promptValidationMessage, setPromptValidationMessage] = useState<string | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [sparkGenreFilter, setSparkGenreFilter] = useState<string | null>(null);
  const [displayedSparks, setDisplayedSparks] = useState<StorySpark[]>(() => {
    // Show 3 random sparks initially
    const shuffled = [...STORY_SPARKS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  });
  const [sparkHistory, setSparkHistory] = useState<string[]>([]);
  const [legacyProgress, setLegacyProgress] = useState<GenerationProgressSnapshot>({
    generationStage: null,
    failedStage: null,
    isLoading: false,
    isAutoRetrying: false,
    elapsedSeconds: 0,
    lastGenerationError: null,
    lastRequestId: null,
    hasAutoRetried: false,
    currentStageLabel: "Ready when you are.",
  });

  const isGuidedSimpleMode = simpleModeV2Enabled && !isAdvancedMode;
  const showOptionalControls = isAdvancedMode || showAdvancedControls;

  // Initialize style with initial value, load from localStorage after mount.
  const [style, setStyle] = useState(initialStyle || DEFAULT_STYLE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitializedPromptRef = useRef(false);

  const canProceedFromStory =
    prompt.trim().length >= 20 || (!!selectedRecipeId && prompt.trim().length > 0);

  const loadingSteps = [
    "Checking credits...",
    "Uploading references...",
    "Drawing your page...",
    "Saving story...",
  ];

  const helperTextByStep: Record<CreateStep, string> = {
    story: "Start with one clear opening moment. You can refine style next.",
    visual: "Optional step: add references and lock visual direction.",
    review: "Confirm summary and run generation.",
  };

  useEffect(() => {
    if (isLoading) {
      setShowStyleDropdown(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!showOptionalControls) {
      setShowStyleDropdown(false);
    }
  }, [showOptionalControls]);

  useEffect(() => {
    onGenerationStateChange?.(legacyProgress);
  }, [legacyProgress, onGenerationStateChange]);

  useEffect(() => {
    if (!legacyProgress.isLoading) {
      return;
    }

    const interval = window.setInterval(() => {
      setLegacyProgress((current) => ({
        ...current,
        elapsedSeconds: current.elapsedSeconds + 1,
      }));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [legacyProgress.isLoading]);

  useEffect(() => {
    if (!isGuidedSimpleMode || simpleStep !== "story") {
      setPromptValidationMessage(null);
    }
  }, [isGuidedSimpleMode, simpleStep]);

  useEffect(() => {
    // Auto-focus the textarea when component mounts.
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Persist prompt to localStorage.
  useEffect(() => {
    if (prompt.trim()) {
      localStorage.setItem(PROMPT_STORAGE_KEY, prompt);
    }
  }, [prompt]);

  // Restore prompt / starter recipe only once on mount.
  useEffect(() => {
    if (hasInitializedPromptRef.current) return;

    const savedPrompt = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (savedPrompt && !prompt.trim()) {
      setPrompt(savedPrompt);
      hasInitializedPromptRef.current = true;
      return;
    }

    if (isGuidedSimpleMode && !prompt.trim()) {
      const defaultRecipe = QUICK_START_RECIPES[1] ?? QUICK_START_RECIPES[0];
      setSelectedRecipeId(defaultRecipe.id);
      setPrompt(defaultRecipe.prompt);
    }

    hasInitializedPromptRef.current = true;
  }, [isGuidedSimpleMode, prompt, setPrompt]);

  // Load style preference from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(STYLE_STORAGE_KEY);
    if (saved) {
      setStyle(saved);
    }
  }, []);

  // Save style to localStorage and sync with parent.
  useEffect(() => {
    localStorage.setItem(STYLE_STORAGE_KEY, style);
    setParentStyle(style);
  }, [style, setParentStyle]);

  // Fetch credits on mount.
  useEffect(() => {
    if (isSignedIn && !hasApiKey) {
      const fetchCredits = async () => {
        try {
          const response = await fetch("/api/check-credits", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ hasApiKey: false }),
          });
          const data = await readJsonSafely(response);
          if (response.ok && data?.creditsRemaining !== undefined) {
            setCreditsRemaining(data.creditsRemaining);
          }
        } catch (error) {
          console.error("Error fetching credits:", error);
        }
      };
      fetchCredits();
    } else if (hasApiKey) {
      setCreditsRemaining(null);
    }
  }, [isSignedIn, hasApiKey]);

  // Keyboard shortcut for form submission.
  useKeyboardShortcut(
    () => {
      if (isLoading || !prompt.trim()) return;

      if (!isSignedIn) {
        openSignIn();
        return;
      }

      if (isGuidedSimpleMode && simpleStep !== "review") {
        if (simpleStep === "story") {
          if (!canProceedFromStory) {
            setPromptValidationMessage(
              "Add a little more detail so we can build your opening page."
            );
            return;
          }
          onSimpleStepChange?.("visual");
          return;
        }

        onSimpleStepChange?.("review");
        return;
      }

      void handleCreate();
    },
    { disabled: isLoading || !isLoaded }
  );

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const validationResults = Array.from(newFiles).map((file) => ({
      file,
      validation: validateFileForUpload(file, true),
    }));

    validationResults.forEach(({ validation }) => {
      if (!validation.valid && validation.error) {
        toast({
          title: "Invalid file",
          description: validation.error,
          variant: "destructive",
          duration: 4000,
        });
      }
    });

    const validFiles = validationResults
      .filter(({ validation }) => validation.valid)
      .map(({ file }) => file);

    if (validFiles.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const totalFiles = [...characterFiles, ...validFiles].slice(0, 2);

    setCharacterFiles(totalFiles);

    const newPreviews: string[] = [];
    totalFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newPreviews[index] = e.target?.result as string;
        if (newPreviews.filter(Boolean).length === totalFiles.length) {
          setPreviews([...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    const newFiles = characterFiles.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setCharacterFiles(newFiles);
    setPreviews(newPreviews);
    setShowPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".dropdown-container")) {
        setShowStyleDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreate = async () => {
    if (!prompt.trim()) {
      setPromptValidationMessage("Prompt is required before generation.");
      if (isGuidedSimpleMode) {
        onSimpleStepChange?.("story");
      }
      toast({
        title: "Prompt required",
        description: "Please enter a prompt to generate your comic",
        variant: "destructive",
        duration: 3000,
      });
      onStatusChange?.("error", {
        stageIndex: 0,
        message: "Prompt is missing. Add a story setup and try again.",
      });
      setLegacyProgress((current) => ({
        ...current,
        generationStage: "check_credits",
        failedStage: "check_credits",
        isLoading: false,
        lastGenerationError: "Prompt required",
        currentStageLabel: "Prompt is missing.",
      }));
      return;
    }

    setIsLoading(true);
    setLoadingStep(0);
    setLegacyProgress({
      generationStage: "check_credits",
      failedStage: null,
      isLoading: true,
      isAutoRetrying: false,
      elapsedSeconds: 0,
      lastGenerationError: null,
      lastRequestId: null,
      hasAutoRetried: false,
      currentStageLabel: "Checking your generation credits.",
    });
    onStatusChange?.("generating", {
      stageIndex: 0,
      message: "Checking your generation credits.",
    });

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 3500);

    try {
      const hasApiKeyFlag = !!apiKey;
      if (!hasApiKeyFlag) {
        const creditsResponse = await fetch("/api/check-credits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ hasApiKey: hasApiKeyFlag }),
        });
        const creditsData = await readJsonSafely(creditsResponse);

        if (!creditsResponse.ok) {
          toast({
            title: "Error",
            description: "Failed to check credits",
            variant: "destructive",
          });
          onStatusChange?.("error", {
            stageIndex: 0,
            message: "Credit check failed. Please retry or add an API key.",
          });
          setLegacyProgress((current) => ({
            ...current,
            generationStage: "check_credits",
            failedStage: "check_credits",
            isLoading: false,
            lastGenerationError: "Failed to check credits",
            currentStageLabel: "Credit check failed.",
          }));
          clearInterval(stepInterval);
          setIsLoading(false);
          return;
        }

        if (creditsData?.creditsRemaining === 0) {
          setShowApiModal(true);
          onStatusChange?.("error", {
            stageIndex: 0,
            message: "No credits remaining. Add API key to continue.",
          });
          setLegacyProgress((current) => ({
            ...current,
            generationStage: "check_credits",
            failedStage: "check_credits",
            isLoading: false,
            lastGenerationError: "No credits remaining",
            currentStageLabel: "No credits remaining.",
          }));
          clearInterval(stepInterval);
          setIsLoading(false);
          return;
        }
      }

      setLegacyProgress((current) => ({
        ...current,
        generationStage: "upload_references",
        failedStage: null,
        isLoading: true,
        currentStageLabel:
          characterFiles.length > 0
            ? "Uploading your character references."
            : "No references selected, moving ahead.",
      }));
      onStatusChange?.("generating", {
        stageIndex: 1,
        message:
          characterFiles.length > 0
            ? "Uploading your character references."
            : "Skipping references and generating from your prompt.",
      });

      const characterUploads = await Promise.all(
        characterFiles.map((file) => uploadToS3(file).then(({ url }) => url))
      );

      setLegacyProgress((current) => ({
        ...current,
        generationStage: "generate_image",
        failedStage: null,
        isLoading: true,
        currentStageLabel: "Drawing your comic opening panel.",
      }));
      onStatusChange?.("generating", {
        stageIndex: 2,
        message: "Drawing your comic opening panel.",
      });

      const response = await fetch("/api/generate-comic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          ...(apiKey && { apiKey }),
          style,
          panelLayout,
          characterImages: characterUploads,
        }),
      });

      const responseData = await readJsonSafely(response);

      if (!response.ok) {
        if (response.status === 429 && responseData?.isRateLimited) {
          throw new Error(responseData.error);
        }
        throw new Error(responseData?.error || "Failed to create story");
      }

      setLegacyProgress((current) => ({
        ...current,
        generationStage: "save_story",
        failedStage: null,
        isLoading: true,
        lastRequestId:
          typeof responseData?.requestId === "string" ? responseData.requestId : null,
        currentStageLabel: "Saving your story to library.",
      }));
      onStatusChange?.("saving", {
        stageIndex: 3,
        message: "Saving your story and preparing the editor.",
      });

      localStorage.removeItem(PROMPT_STORAGE_KEY);
      clearInterval(stepInterval);
      onFirstRunCompleted?.();
      onStatusChange?.("done", {
        stageIndex: 3,
        message: "First page ready. Opening your editor.",
      });
      setLegacyProgress((current) => ({
        ...current,
        generationStage: "save_story",
        failedStage: null,
        isLoading: false,
        currentStageLabel: "Story saved. Redirecting to editor.",
      }));
      onCreateSuccess?.();
      toast({
        title: "Opening editor",
        description:
          "Your comic page is ready. You can refine details in the editor next.",
        duration: 2500,
      });

      const storySlug = responseData?.storySlug;
      if (!storySlug) {
        throw new Error("Story generated but no slug was returned.");
      }

      setTimeout(() => {
        setIsLoading(false);
        router.push(`/story/${storySlug}`);
      }, 350);
    } catch (error) {
      console.error("Error creating comic:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create comic. Please try again.";
      let title = "Creation failed";
      if (isContentPolicyViolation(errorMessage)) {
        title = "Content policy violation";
      }
      toast({
        title,
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
      onStatusChange?.("error", {
        stageIndex: 2,
        message: errorMessage,
      });
      setLegacyProgress((current) => ({
        ...current,
        generationStage: current.generationStage ?? "generate_image",
        failedStage: current.generationStage ?? "generate_image",
        isLoading: false,
        lastGenerationError: errorMessage,
        currentStageLabel: "Generation failed.",
      }));
      clearInterval(stepInterval);
      setIsLoading(false);
    }
  };

  const handleApiKeySubmit = (key: string) => {
    setApiKey(key);
    setShowApiModal(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = e.key === "Enter" || e.key === "\n" || e.keyCode === 13;
    const isModifierPressed = e.shiftKey || e.ctrlKey || e.metaKey;

    if (isEnter && isModifierPressed) {
      e.preventDefault();
      void handleCreate();
    }
  };

  const selectRecipe = (recipeId: string) => {
    const recipe = QUICK_START_RECIPES.find((entry) => entry.id === recipeId);
    if (!recipe) return;
    setSelectedRecipeId(recipe.id);
    setPrompt(recipe.prompt);
    setPromptValidationMessage(null);
  };

  const selectSpark = useCallback((spark: StorySpark) => {
    setSelectedRecipeId(spark.id);
    setPrompt(spark.prompt);
    setPromptValidationMessage(null);
    setSparkHistory((prev) => [...prev, spark.id]);
  }, [setPrompt]);

  const shuffleSparks = useCallback(() => {
    const pool = sparkGenreFilter
      ? STORY_SPARKS.filter((s) => s.genre === sparkGenreFilter)
      : STORY_SPARKS;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setDisplayedSparks(shuffled.slice(0, 3));
  }, [sparkGenreFilter]);

  const openVisualStep = () => {
    if (!canProceedFromStory) {
      setPromptValidationMessage(
        "Add a little more detail so we can build your opening page."
      );
      return;
    }
    onSimpleStepChange?.("visual");
  };

  const openReviewStep = () => {
    if (!canProceedFromStory) {
      onSimpleStepChange?.("story");
      setPromptValidationMessage(
        "Add a little more detail so we can build your opening page."
      );
      return;
    }
    onSimpleStepChange?.("review");
  };

  const renderCharacterAndStyleControls = () => (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border/40 bg-background/70 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
          {characterFiles.length > 0 ? (
            <div className="flex items-center gap-2">
              {previews.map((preview, index) => (
                <div key={index} className="relative group/thumb">
                  <button
                    type="button"
                    onClick={() => setShowPreview(index)}
                    className="h-10 w-10 overflow-hidden rounded-md border border-border/50 transition-colors hover:border-indigo/50"
                  >
                    <img
                      src={preview || "/placeholder.svg"}
                      alt={`Character ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isLoading) removeFile(index);
                    }}
                    disabled={isLoading}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100 disabled:opacity-50"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {characterFiles.length < 2 && (
                <button
                  type="button"
                  onClick={() => !isLoading && fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border/50 text-muted-foreground transition-colors hover:border-indigo/50 hover:text-white disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !isLoading && fileInputRef.current?.click()}
              disabled={isLoading}
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-white disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Characters</span>
              <span className="hidden text-muted-foreground/60 sm:inline">(Max 2)</span>
            </button>
          )}
        </div>

        <div className="relative dropdown-container w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              if (!isLoading) setShowStyleDropdown(!showStyleDropdown);
            }}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-white sm:w-auto"
          >
            <span>
              Style: {COMIC_STYLES.find((entry) => entry.id === style)?.name ?? "Noir"}
            </span>
          </button>

          {showStyleDropdown && (
            <div className="absolute bottom-full left-0 z-[90] mb-2 max-h-56 w-full overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-background p-1 shadow-2xl sm:left-auto sm:right-0 sm:w-52">
              {COMIC_STYLES.map((styleOption) => (
                <button
                  key={styleOption.id}
                  type="button"
                  onClick={() => {
                    setStyle(styleOption.id);
                    setShowStyleDropdown(false);
                  }}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition-colors ${style === styleOption.id
                    ? "bg-indigo/10 text-indigo"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    }`}
                >
                  <span>{styleOption.name}</span>
                  {style === styleOption.id && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Style controls visual tone. References improve character consistency.
      </p>
    </div>
  );

  const renderClassicControls = () => (
    <>
      {showOptionalControls ? (
        <div className="mt-3 border-t border-border/30 pt-3">{renderCharacterAndStyleControls()}</div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/30 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvancedControls(true)}
            className="text-xs text-muted-foreground transition-colors hover:text-white"
          >
            Add character references or change style
          </button>
          <span className="text-xs text-muted-foreground/70">
            {COMIC_STYLES.find((entry) => entry.id === style)?.name}
          </span>
        </div>
      )}
    </>
  );

  const renderGuidedStepContent = () => {
    if (simpleStep === "story") {
      return (
        <div className="space-y-4">
          {/* Genre filter chips */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setSparkGenreFilter(null); shuffleSparks(); }}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${!sparkGenreFilter
                ? "bg-white text-black"
                : "border border-border/60 text-muted-foreground hover:text-white"
                }`}
            >
              All
            </button>
            {SPARK_GENRES.map(({ genre, emoji }) => (
              <button
                key={genre}
                type="button"
                onClick={() => {
                  const next = sparkGenreFilter === genre ? null : genre;
                  setSparkGenreFilter(next);
                  const pool = next
                    ? STORY_SPARKS.filter((s) => s.genre === next)
                    : STORY_SPARKS;
                  const shuffled = [...pool].sort(() => Math.random() - 0.5);
                  setDisplayedSparks(shuffled.slice(0, 3));
                }}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${sparkGenreFilter === genre
                  ? "bg-white text-black"
                  : "border border-border/60 text-muted-foreground hover:text-white"
                  }`}
              >
                {emoji} {genre}
              </button>
            ))}
          </div>

          {/* Spark cards */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {displayedSparks.map((spark) => (
              <button
                key={spark.id}
                type="button"
                onClick={() => selectSpark(spark)}
                className={`rounded-lg border p-3 text-left transition-all ${selectedRecipeId === spark.id
                  ? "border-amber-300/60 bg-amber-500/10"
                  : "border-border/60 bg-background/50 hover:border-indigo/40 hover:bg-indigo/5"
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{spark.genreEmoji}</span>
                  <span className="text-[10px] text-muted-foreground">{spark.genre}</span>
                </div>
                <p className="mt-1.5 text-sm font-medium leading-snug text-white">
                  {spark.premise}
                </p>
              </button>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (promptValidationMessage && e.target.value.trim().length >= 20) {
                setPromptValidationMessage(null);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Pick a spark above, or write your own opening moment..."
            disabled={isLoading}
            className="h-36 w-full resize-none rounded-lg border border-border/60 bg-background/70 p-4 text-base leading-relaxed text-white outline-none ring-0 placeholder:text-muted-foreground/60 focus:border-indigo/50"
          />

          {promptValidationMessage && (
            <p className="text-xs text-rose-300">{promptValidationMessage}</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={shuffleSparks}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-indigo/40 hover:text-white"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle ideas
            </button>

            <Button
              type="button"
              onClick={openVisualStep}
              disabled={isLoading}
              className="bg-white text-black hover:bg-neutral-200"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    if (simpleStep === "visual") {
      const currentLayout = PANEL_LAYOUTS.find((l) => l.id === panelLayout);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current style</p>
              <div className="mt-2">
                <StylePreviewChip styleId={style} isSelected={true} />
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Character references</p>
              <p className="mt-1 text-sm font-medium text-white">{characterFiles.length}/2 uploaded</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/50 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">Character images and style</p>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            {renderCharacterAndStyleControls()}
          </div>

          <div className="rounded-lg border border-border/50 px-3 py-3">
            <div className="mb-3 flex items-center gap-2">
              <LayoutGrid className="h-3.5 w-3.5 text-indigo" />
              <p className="text-sm font-medium text-white">Panel layout</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PANEL_LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => setPanelLayout(layout.id)}
                  disabled={isLoading}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${panelLayout === layout.id
                    ? "border-indigo/60 bg-indigo/10 text-white"
                    : "border-border/60 bg-background/50 text-muted-foreground hover:border-indigo/40 hover:bg-indigo/5 hover:text-white"
                    }`}
                >
                  <PanelLayoutDiagram layoutId={layout.id} />
                  <p className="text-sm font-medium">{layout.name}</p>
                </button>
              ))}
            </div>
            {currentLayout && (
              <p className="mt-2 text-xs text-muted-foreground/70">
                {currentLayout.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSimpleStepChange?.("story")}
              className="text-muted-foreground hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <Button
              type="button"
              onClick={openReviewStep}
              disabled={isLoading}
              className="bg-white text-black hover:bg-neutral-200"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-background/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prompt summary</p>
          <p className="mt-2 text-sm leading-relaxed text-white">{prompt}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/70 px-2 py-1">
              Style: {COMIC_STYLES.find((entry) => entry.id === style)?.name ?? "Noir"}
            </span>
            <span className="rounded-full border border-border/70 px-2 py-1">
              References: {characterFiles.length}
            </span>
            <span className="rounded-full border border-border/70 px-2 py-1">
              Layout: {PANEL_LAYOUTS.find((l) => l.id === panelLayout)?.name ?? "5 Panels"}
            </span>
            <span className="rounded-full border border-border/70 px-2 py-1">
              Est. cost: {hasApiKey ? "~$0.01" : "1 credit"}
            </span>
          </div>
        </div>

        <Accordion type="single" collapsible>
          <AccordionItem value="review-controls" className="rounded-lg border border-border/50 px-3">
            <AccordionTrigger className="py-3 text-sm text-white hover:no-underline">
              Adjust style or references before generate
            </AccordionTrigger>
            <AccordionContent className="overflow-visible">
              <div className="pb-2">
                {renderCharacterAndStyleControls()}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <p className="text-xs text-muted-foreground">
          You can continue refining style and references in the editor after generation.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSimpleStepChange?.("visual")}
            className="text-muted-foreground hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {!isLoaded ? (
            <div className="h-10" />
          ) : isSignedIn ? (
            <Button
              onClick={() => {
                void handleCreate();
              }}
              disabled={isLoading || !prompt.trim()}
              className="bg-white px-8 py-2 text-black hover:bg-neutral-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{loadingSteps[loadingStep]}</span>
                </>
              ) : (
                <>
                  Generate first page
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <SignInButton mode="modal">
              <Button className="bg-white px-8 py-2 text-black hover:bg-neutral-200">
                Login to continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </SignInButton>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="group relative rounded-xl p-0.5 transition-colors focus-within:border-indigo/30 glass-panel sm:p-1">
        <div className="rounded-lg border border-border/50 bg-background/80 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="text-[10px] font-medium uppercase tracking-[0.02em] text-muted-foreground">
              {isGuidedSimpleMode
                ? simpleStep === "story"
                  ? "Step 1 · Story Setup"
                  : simpleStep === "visual"
                    ? "Step 2 · Visual Direction"
                    : "Step 3 · Review & Generate"
                : "Prompt"}
            </label>

            {!isAdvancedMode && !isGuidedSimpleMode && (
              <button
                type="button"
                onClick={() => setShowAdvancedControls((current) => !current)}
                className="text-[10px] uppercase tracking-[0.02em] text-indigo transition-colors hover:text-indigo-300"
              >
                {showOptionalControls ? "Hide Options" : "Advanced Options"}
              </button>
            )}
          </div>

          {showFirstRunHints && (
            <FirstRunHint text={helperTextByStep[simpleStep]} onDismiss={onDismissHints} />
          )}

          {isGuidedSimpleMode ? (
            <div className="mt-3">{renderGuidedStepContent()}</div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="A cyberpunk detective standing in neon rain, holding a glowing datapad, moody lighting, noir style..."
                disabled={isLoading}
                className="h-16 w-full resize-none border-none bg-transparent text-sm leading-relaxed text-white placeholder:text-muted-foreground/50 focus:outline-none"
              />

              {renderClassicControls()}

              <div className="pt-4">
                {!isLoaded ? (
                  <div className="h-10" />
                ) : isSignedIn ? (
                  <div className="flex w-full items-center justify-between gap-3">
                    <Button
                      onClick={() => {
                        void handleCreate();
                      }}
                      disabled={isLoading || !prompt.trim()}
                      className="flex items-center justify-center gap-3 rounded-md bg-white px-8 py-2 text-sm font-medium tracking-tight text-black transition-colors hover:bg-neutral-200"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm font-medium tracking-tight">
                            {loadingSteps[loadingStep]}
                          </span>
                        </>
                      ) : (
                        <>
                          Generate
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                    <div className="whitespace-nowrap text-xs text-muted-foreground">
                      {hasApiKey ? (
                        <>Using your API key (~$0.01 per comic)</>
                      ) : (
                        <>
                          {creditsRemaining !== null
                            ? `${creditsRemaining} credit${creditsRemaining === 1 ? "" : "s"} remaining`
                            : "Checking credits..."}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <SignInButton mode="modal">
                    <Button className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-8 py-2 text-sm font-medium tracking-tight text-black transition-colors hover:bg-neutral-200 sm:min-w-40 sm:w-auto">
                      Login to create your comic
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </SignInButton>
                )}
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {showPreview !== null && previews[showPreview] && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowPreview(null)}
        >
          <div className="z-101 relative max-h-[80vh] max-w-2xl rounded-xl p-4 glass-panel">
            <Button
              variant="ghost"
              size="icon"
              className="z-102 absolute right-2 top-2 h-8 w-8 hover:bg-white/10"
              onClick={() => setShowPreview(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <img
              src={previews[showPreview] || "/placeholder.svg"}
              alt="Character preview"
              className="h-full w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}

      <ApiKeyModal
        isOpen={showApiModal}
        onClose={() => setShowApiModal(false)}
        onSubmit={handleApiKeySubmit}
      />
    </>
  );
}

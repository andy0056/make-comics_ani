"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Loader2, BookUser, Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { requestJson, ClientApiError } from "@/lib/client-api";
import { useToast } from "@/hooks/use-toast";

type CharacterInput = {
  name: string;
  role: string;
  appearance: string;
  personality: string;
  speechStyle: string;
  referenceImageUrl: string;
  isLocked: boolean;
};

interface CharacterBibleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  storySlug: string;
  initialCharacters: CharacterInput[];
  availableCharacterImages: string[];
  onCharactersUpdated: (characters: CharacterInput[]) => void;
}

const CHARACTER_PRESETS: Array<{
  label: string;
  role: string;
  appearance: string;
  personality: string;
  speechStyle: string;
}> = [
  {
    label: "Hero",
    role: "Protagonist",
    appearance: "Distinct silhouette and recognizable outfit",
    personality: "Determined, morally grounded, and resourceful",
    speechStyle: "Direct and motivating",
  },
  {
    label: "Rival",
    role: "Antagonist",
    appearance: "Sharp features with controlled, imposing posture",
    personality: "Strategic, confident, and relentless",
    speechStyle: "Precise and threatening",
  },
  {
    label: "Mentor",
    role: "Guide",
    appearance: "Calm expression and iconic accessories",
    personality: "Patient, wise, and pragmatic",
    speechStyle: "Measured with short lessons",
  },
  {
    label: "Comic Relief",
    role: "Support",
    appearance: "Expressive face with energetic gestures",
    personality: "Playful, optimistic, and loyal",
    speechStyle: "Quick jokes with casual language",
  },
];

function emptyCharacter(): CharacterInput {
  return {
    name: "",
    role: "",
    appearance: "",
    personality: "",
    speechStyle: "",
    referenceImageUrl: "",
    isLocked: true,
  };
}

function normalizeCharacter(character: Partial<CharacterInput>): CharacterInput {
  return {
    name: character.name ?? "",
    role: character.role ?? "",
    appearance: character.appearance ?? "",
    personality: character.personality ?? "",
    speechStyle: character.speechStyle ?? "",
    referenceImageUrl: character.referenceImageUrl ?? "",
    isLocked: character.isLocked ?? true,
  };
}

export function CharacterBibleSheet({
  isOpen,
  onClose,
  storySlug,
  initialCharacters,
  availableCharacterImages,
  onCharactersUpdated,
}: CharacterBibleSheetProps) {
  const { toast } = useToast();
  const [characters, setCharacters] = useState<CharacterInput[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCharacters(initialCharacters.map((character) => normalizeCharacter(character)));
    setIsLoading(true);

    requestJson<{ characters: CharacterInput[] }>(
      `/api/stories/${storySlug}/characters`,
    )
      .then(({ data }) => {
        setCharacters(
          data.characters.map((character) => normalizeCharacter(character)),
        );
      })
      .catch(() => {
        // fall back to initialCharacters
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [initialCharacters, isOpen, storySlug]);

  const canAddMore = characters.length < 6;
  const hasCharacters = characters.length > 0;

  const normalizedForSave = useMemo(
    () =>
      characters
        .map((character) => ({
          ...character,
          name: character.name.trim(),
          role: character.role.trim(),
          appearance: character.appearance.trim(),
          personality: character.personality.trim(),
          speechStyle: character.speechStyle.trim(),
          referenceImageUrl: character.referenceImageUrl.trim(),
        }))
        .filter((character) => character.name.length > 0),
    [characters],
  );

  const validation = useMemo(() => {
    const errors = new Map<number, string[]>();
    const nameCounts = new Map<string, number>();

    characters.forEach((character) => {
      const normalizedName = character.name.trim().toLowerCase();
      if (!normalizedName) {
        return;
      }
      nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
    });

    characters.forEach((character, index) => {
      const rowErrors: string[] = [];
      const name = character.name.trim();
      const hasAnyContent = [
        character.name,
        character.role,
        character.appearance,
        character.personality,
        character.speechStyle,
        character.referenceImageUrl,
      ].some((value) => value.trim().length > 0);

      if (hasAnyContent && name.length === 0) {
        rowErrors.push("Name is required when character details are filled.");
      }
      if (name.length > 60) {
        rowErrors.push("Name should be 60 characters or less.");
      }
      if (name && (nameCounts.get(name.toLowerCase()) ?? 0) > 1) {
        rowErrors.push("Character names must be unique.");
      }
      if (rowErrors.length > 0) {
        errors.set(index, rowErrors);
      }
    });

    return {
      errors,
      hasBlockingErrors: errors.size > 0,
    };
  }, [characters]);

  const updateCharacter = (
    index: number,
    patch: Partial<CharacterInput>,
  ) => {
    setCharacters((prev) =>
      prev.map((character, currentIndex) =>
        currentIndex === index ? { ...character, ...patch } : character,
      ),
    );
  };

  const addPresetCharacter = (preset: (typeof CHARACTER_PRESETS)[number]) => {
    if (!canAddMore) {
      return;
    }

    setCharacters((prev) => [
      ...prev,
      {
        ...emptyCharacter(),
        name: `${preset.label} ${prev.length + 1}`,
        role: preset.role,
        appearance: preset.appearance,
        personality: preset.personality,
        speechStyle: preset.speechStyle,
        referenceImageUrl: "",
        isLocked: true,
      },
    ]);
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const { data } = await requestJson<{ characters: CharacterInput[] }>(
        `/api/stories/${storySlug}/characters`,
        {
          method: "PUT",
          body: { characters: normalizedForSave },
        },
      );
      const normalizedCharacters = data.characters.map((character) =>
        normalizeCharacter(character),
      );
      setCharacters(normalizedCharacters);
      onCharactersUpdated(normalizedCharacters);
      toast({
        title: "Character bible saved",
        description: "Continuity preferences are now active for new pages.",
        duration: 2200,
      });
      onClose();
    } catch (error) {
      const description =
        error instanceof ClientApiError
          ? error.requestId
            ? `${error.message} (ref: ${error.requestId})`
            : error.message
          : "Failed to save character bible.";
      toast({
        title: "Save failed",
        description,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl border-l border-white/10 comic-surface px-6">
        <SheetHeader className="pb-4 border-b border-white/10 px-0">
          <SheetTitle className="text-base font-medium text-white flex items-center gap-2 comic-title-gradient">
            <BookUser className="w-4 h-4 text-[#43c0ff]" />
            Character Bible
          </SheetTitle>
        </SheetHeader>

        <div className="pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Define stable character traits so new panels stay consistent.
          </p>

          <div className="rounded-lg comic-surface p-2.5">
            <p className="text-xs uppercase tracking-[0.02em] text-[#ff9954] mb-2">
              Quick Presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CHARACTER_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={!canAddMore || isSaving}
                  onClick={() => addPresetCharacter(preset)}
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:text-white hover:border-[#43c0ff]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-lg comic-surface p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading character bible...
            </div>
          ) : null}

          {!isLoading && !hasCharacters ? (
            <div className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
              No saved characters yet. Add at least one to lock continuity.
            </div>
          ) : null}

          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
            {characters.map((character, index) => (
              <div
                key={index}
                className="rounded-lg comic-surface p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm uppercase tracking-[0.02em] text-muted-foreground">
                    Character {index + 1}
                  </p>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() =>
                      setCharacters((prev) =>
                        prev.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  value={character.name}
                  onChange={(event) =>
                    updateCharacter(index, { name: event.target.value })
                  }
                  placeholder="Name (required)"
                  className="w-full bg-background border border-border/60 rounded-md px-2 py-1.5 text-sm"
                />
                {validation.errors.get(index)?.map((error) => (
                  <p key={error} className="text-xs text-destructive">
                    {error}
                  </p>
                ))}
                <input
                  value={character.role}
                  onChange={(event) =>
                    updateCharacter(index, { role: event.target.value })
                  }
                  placeholder="Role (e.g. protagonist, mentor, rival)"
                  className="w-full bg-background border border-border/60 rounded-md px-2 py-1.5 text-sm"
                />
                <textarea
                  value={character.appearance}
                  onChange={(event) =>
                    updateCharacter(index, { appearance: event.target.value })
                  }
                  placeholder="Appearance traits to preserve"
                  className="w-full bg-background border border-border/60 rounded-md px-2 py-1.5 text-sm min-h-14"
                />
                <textarea
                  value={character.personality}
                  onChange={(event) =>
                    updateCharacter(index, { personality: event.target.value })
                  }
                  placeholder="Personality and behavior traits"
                  className="w-full bg-background border border-border/60 rounded-md px-2 py-1.5 text-sm min-h-14"
                />
                <input
                  value={character.speechStyle}
                  onChange={(event) =>
                    updateCharacter(index, { speechStyle: event.target.value })
                  }
                  placeholder="Speech style (tone, vocabulary, catchphrases)"
                  className="w-full bg-background border border-border/60 rounded-md px-2 py-1.5 text-sm"
                />

                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.02em] text-muted-foreground">
                    Linked Reference Image
                  </p>
                  <div className="flex items-center gap-2">
                    {character.referenceImageUrl ? (
                      <>
                        <img
                          src={character.referenceImageUrl || "/placeholder.svg"}
                          alt={`${character.name || `Character ${index + 1}`} reference`}
                          className="w-10 h-10 rounded-md object-cover border border-border/60"
                        />
                        <button
                          type="button"
                          onClick={() => updateCharacter(index, { referenceImageUrl: "" })}
                          className="text-xs text-muted-foreground hover:text-white transition-colors"
                        >
                          Clear link
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No image linked yet.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {availableCharacterImages.map((url) => {
                      const isSelected = character.referenceImageUrl === url;
                      return (
                        <button
                          key={`${index}-${url}`}
                          type="button"
                          onClick={() => updateCharacter(index, { referenceImageUrl: url })}
                          className={`relative w-10 h-10 rounded-md overflow-hidden border transition-colors ${
                            isSelected
                              ? "border-[#43c0ff] ring-1 ring-[#43c0ff]/60"
                              : "border-border/60 hover:border-[#43c0ff]/50"
                          }`}
                          title="Link this image"
                        >
                          <img
                            src={url}
                            alt="Story character reference"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>

                  {availableCharacterImages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Generate pages with character references first to reuse them here.
                    </p>
                  ) : null}

                  <div className="relative">
                    <Link2 className="w-3 h-3 absolute left-2 top-2 text-muted-foreground" />
                    <input
                      value={character.referenceImageUrl}
                      onChange={(event) =>
                        updateCharacter(index, {
                          referenceImageUrl: event.target.value,
                        })
                      }
                      placeholder="Or paste image URL manually"
                      className="w-full bg-background border border-border/60 rounded-md pl-7 pr-2 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={character.isLocked}
                    onChange={(event) =>
                      updateCharacter(index, { isLocked: event.target.checked })
                    }
                  />
                  Lock continuity traits
                </label>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setCharacters((prev) => [...prev, emptyCharacter()])}
              disabled={!canAddMore || isSaving}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Character
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading || validation.hasBlockingErrors}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" />
                  Save Bible
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

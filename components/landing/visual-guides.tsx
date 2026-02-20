"use client";

/**
 * Visual mini-diagram for each panel layout option.
 * Shows a simplified grid representation so users can see what they're choosing.
 */
export function PanelLayoutDiagram({ layoutId }: { layoutId: string }) {
    const diagrams: Record<string, React.ReactNode> = {
        "3-panel": (
            <svg viewBox="0 0 48 64" fill="none" className="h-full w-full">
                <rect x="2" y="2" width="44" height="30" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="2" y="34" width="21" height="28" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="34" width="21" height="28" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
            </svg>
        ),
        "4-panel": (
            <svg viewBox="0 0 48 64" fill="none" className="h-full w-full">
                <rect x="2" y="2" width="21" height="28" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="2" width="21" height="28" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="2" y="34" width="21" height="28" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="34" width="21" height="28" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
            </svg>
        ),
        "5-panel": (
            <svg viewBox="0 0 48 64" fill="none" className="h-full w-full">
                <rect x="2" y="2" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="2" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="2" y="22" width="44" height="20" rx="2" className="fill-indigo/30 stroke-indigo/50" strokeWidth="1.5" />
                <rect x="2" y="44" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="44" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
            </svg>
        ),
        "6-panel": (
            <svg viewBox="0 0 48 64" fill="none" className="h-full w-full">
                <rect x="2" y="2" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="2" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="2" y="22" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="22" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="2" y="44" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
                <rect x="25" y="44" width="21" height="18" rx="2" className="fill-indigo/20 stroke-indigo/40" strokeWidth="1" />
            </svg>
        ),
    };

    return (
        <div className="h-10 w-8">
            {diagrams[layoutId] || diagrams["5-panel"]}
        </div>
    );
}

/**
 * Style preview colors and visual cues — since we can't ship sample images,
 * we use distinctive color palettes to give users a visual sense of each style.
 */
const STYLE_VISUALS: Record<string, { gradient: string; label: string; description: string }> = {
    "american-modern": {
        gradient: "from-red-500 via-blue-500 to-yellow-400",
        label: "Bold & Heroic",
        description: "Vibrant colors, dynamic poses, superhero energy",
    },
    manga: {
        gradient: "from-gray-100 via-gray-400 to-black",
        label: "Clean & Expressive",
        description: "Black & white linework, screen tones, big emotions",
    },
    noir: {
        gradient: "from-gray-900 via-gray-700 to-gray-400",
        label: "Dark & Moody",
        description: "Deep shadows, high contrast, detective atmosphere",
    },
    vintage: {
        gradient: "from-amber-300 via-orange-400 to-red-400",
        label: "Classic & Warm",
        description: "Retro Ben-Day dots, 1950s golden age feel",
    },
    webtoon: {
        gradient: "from-pink-300 via-purple-300 to-cyan-300",
        label: "Modern & Polished",
        description: "Clean digital art, soft gradients, contemporary style",
    },
    "anime-cinematic": {
        gradient: "from-violet-500 via-fuchsia-500 to-orange-400",
        label: "Epic & Cinematic",
        description: "Dramatic lighting, lens flares, high-impact energy",
    },
};

export function StylePreviewChip({ styleId, isSelected }: { styleId: string; isSelected: boolean }) {
    const visual = STYLE_VISUALS[styleId];
    if (!visual) return null;

    return (
        <div className="flex items-center gap-2.5">
            <div
                className={`h-8 w-8 flex-shrink-0 rounded-md bg-gradient-to-br ${visual.gradient} ${isSelected ? "ring-2 ring-indigo ring-offset-1 ring-offset-background" : ""
                    }`}
            />
            <div className="min-w-0">
                <p className={`text-xs font-medium ${isSelected ? "text-white" : "text-muted-foreground"}`}>
                    {visual.label}
                </p>
                <p className="text-[10px] text-muted-foreground/70 leading-tight">
                    {visual.description}
                </p>
            </div>
        </div>
    );
}

"use client";

const STEPS = [
    {
        emoji: "✍️",
        label: "Write",
        description: "Describe your scene",
        accent: "bg-background",
        border: "border-border",
        glow: "shadow-[4px_4px_0px_0px_var(--color-comic-yellow)]",
        rotation: "-rotate-1",
    },
    {
        emoji: "🎨",
        label: "Style",
        description: "Pick a visual style",
        accent: "bg-background",
        border: "border-border",
        glow: "shadow-[4px_4px_0px_0px_var(--color-comic-cyan)]",
        rotation: "rotate-2",
    },
    {
        emoji: "💥",
        label: "Boom!",
        description: "AI renders your panels",
        accent: "bg-background",
        border: "border-border",
        glow: "shadow-[4px_4px_0px_0px_var(--color-comic-yellow)]",
        rotation: "-rotate-1",
    },
];

export function HowItWorks() {
    return (
        <section className="py-12 sm:py-16 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
                <h2 className="text-center text-sm uppercase tracking-[0.2em] text-muted-foreground/60 mb-8">
                    How it works
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    {STEPS.map((step, i) => (
                        <div key={step.label} className="relative group">
                            {/* Connector line (hidden on mobile, shown between cards on desktop) */}
                            {i < STEPS.length - 1 && (
                                <div className="hidden sm:block absolute top-1/2 -right-3 sm:-right-3 w-6 h-px bg-gradient-to-r from-border/50 to-transparent z-10" />
                            )}
                            <div
                                className={`relative rounded-xl border-2 ${step.border} ${step.accent} p-6 text-center transition-all duration-300 hover:scale-[1.03] ${step.glow} ${step.rotation}`}
                            >
                                {/* Step number badge */}
                                <div className="absolute -top-3 -left-3 bg-white border-2 border-black rounded-full w-8 h-8 flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] z-10">
                                    <span className="text-sm font-bold text-black">
                                        {i + 1}
                                    </span>
                                </div>

                                <span className="text-4xl block mb-3" role="img">
                                    {step.emoji}
                                </span>
                                <h3 className="text-lg font-bold text-white tracking-tight mb-1">
                                    {step.label}
                                </h3>
                                <p className="text-xs text-muted-foreground/80">
                                    {step.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

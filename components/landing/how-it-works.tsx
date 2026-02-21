"use client";

const STEPS = [
    {
        emoji: "✍️",
        label: "Write",
        description: "Describe your scene",
        accent: "from-indigo-500/20 to-purple-500/20",
        border: "border-indigo-500/30",
        glow: "shadow-indigo-500/10",
    },
    {
        emoji: "🎨",
        label: "Style",
        description: "Pick a visual style",
        accent: "from-pink-500/20 to-rose-500/20",
        border: "border-pink-500/30",
        glow: "shadow-pink-500/10",
    },
    {
        emoji: "💥",
        label: "Boom!",
        description: "AI renders your panels",
        accent: "from-amber-500/20 to-orange-500/20",
        border: "border-amber-500/30",
        glow: "shadow-amber-500/10",
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
                                className={`relative rounded-xl border ${step.border} bg-gradient-to-br ${step.accent} p-6 text-center transition-all duration-300 hover:scale-[1.03] hover:shadow-lg ${step.glow}`}
                            >
                                {/* Step number badge */}
                                <div className="absolute -top-2.5 left-4 bg-background border border-border/50 rounded-full w-5 h-5 flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-muted-foreground">
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

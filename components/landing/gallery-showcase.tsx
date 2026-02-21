"use client";

const GALLERY_ITEMS = [
    {
        src: "/gallery/noir.png",
        style: "Noir",
        prompt: "A detective in a rain-soaked city",
        color: "from-neutral-500/30 to-neutral-800/30",
    },
    {
        src: "/gallery/manga.png",
        style: "Manga",
        prompt: "A student discovers magical powers",
        color: "from-slate-500/30 to-slate-800/30",
    },
    {
        src: "/gallery/cinematic.png",
        style: "Cinematic Anime",
        prompt: "A cyberpunk hero on a neon rooftop",
        color: "from-cyan-500/30 to-indigo-800/30",
    },
    {
        src: "/gallery/superhero.png",
        style: "American Comic",
        prompt: "A caped hero saves the city",
        color: "from-red-500/30 to-blue-800/30",
    },
];

export function GalleryShowcase() {
    return (
        <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
            <div className="max-w-5xl mx-auto">
                <h2 className="text-center text-sm uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
                    Gallery
                </h2>
                <p className="text-center text-muted-foreground/50 text-xs mb-8">
                    Every style. One prompt. Instant panels.
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {GALLERY_ITEMS.map((item) => (
                        <div
                            key={item.style}
                            className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border-2 border-border shadow-[4px_4px_0px_0px_var(--color-comic-yellow)] hover:shadow-[6px_6px_0px_0px_var(--color-comic-cyan)] hover:-translate-y-1"
                        >
                            {/* Image */}
                            <img
                                src={item.src}
                                alt={`${item.style} comic example`}
                                className="w-full aspect-square object-cover transition-all duration-500 group-hover:brightness-110"
                                loading="lazy"
                            />

                            {/* Overlay */}
                            <div
                                className={`absolute inset-0 bg-gradient-to-t ${item.color} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3`}
                            >
                                <span className="text-white text-sm font-bold tracking-tight">
                                    {item.style}
                                </span>
                                <span className="text-white/70 text-[10px] leading-tight mt-0.5">
                                    &ldquo;{item.prompt}&rdquo;
                                </span>
                            </div>

                            {/* Style badge (always visible) */}
                            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5">
                                <span className="text-[10px] font-medium text-white/90 uppercase tracking-wider">
                                    {item.style}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

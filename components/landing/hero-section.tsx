"use client";

interface LandingHeroProps {
  isAdvancedMode?: boolean;
}

export function LandingHero({ isAdvancedMode = false }: LandingHeroProps) {
  return (
    <header className="relative py-8 sm:py-12 md:py-16 lg:py-0 overflow-hidden">
      {/* Comic-book halftone texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: "8px 8px",
        }}
      />

      {/* Starburst accent behind title */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none opacity-[0.06]">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <polygon
            points="100,10 115,75 180,60 125,100 170,155 105,125 100,190 95,125 30,155 75,100 20,60 85,75"
            fill="currentColor"
          />
        </svg>
      </div>

      <div className="relative z-10">
        <div className="lg:text-left text-center">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-foreground uppercase mb-4 sm:mb-5 tracking-wide font-heading font-semibold leading-tight sm:leading-[5.2rem]">
            Create stunning{" "}
            <span className="text-indigo font-semibold relative">
              comics
              {/* Underline swoosh */}
              <svg
                className="absolute -bottom-1 left-0 w-full h-3 text-indigo/40"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 8 Q50 0, 100 6 T200 4"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="text-muted-foreground leading-relaxed max-w-md mx-auto lg:mx-0 tracking-[-0.02em] px-4 sm:px-0 text-sm">
            Describe your scene, choose a style, and let AI render professional
            comic panels instantly.
          </p>
        </div>
      </div>
    </header>
  );
}

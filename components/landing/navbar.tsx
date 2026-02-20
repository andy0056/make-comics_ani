"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { User, Plus, LogOut } from "lucide-react";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut, useAuth, useClerk } from "@clerk/nextjs";

export function Navbar() {
  const { isLoaded } = useAuth();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const isOnStoriesPage = pathname === "/stories";

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({ redirectUrl: "/" });
  };

  if (!isLoaded)
    return <div className="h-14 sm:h-16 w-full border-b border-border/50" />;

  return (
    <nav className="w-full h-14 sm:h-16 border-b border-border/50 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-50 bg-background/80 backdrop-blur-md">
      <Link
        href="/"
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        <span className="text-2xl sm:text-3xl" role="img" aria-label="KaBoom">
          💥
        </span>
        <span className="text-white font-heading tracking-[0.005em] text-lg sm:text-xl font-bold">
          KaBoom
        </span>
      </Link>

      <div className="flex items-center gap-2 sm:gap-3">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 glass-panel glass-panel-hover transition-all text-xs rounded-md cursor-pointer">
              <span className="text-muted-foreground text-xs sm:text-sm tracking-tight">
                Sign In
              </span>
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          {isOnStoriesPage ? (
            <Link href="/">
              <button className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 bg-white hover:bg-neutral-200 text-black transition-all text-xs rounded-md cursor-pointer font-medium">
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-black text-xs sm:text-sm hidden sm:inline tracking-tight">
                  Create New
                </span>
              </button>
            </Link>
          ) : (
            <Link href="/stories">
              <button className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 glass-panel glass-panel-hover transition-all text-xs rounded-md cursor-pointer">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-muted-foreground text-xs sm:text-sm hidden sm:inline tracking-tight">
                  My Stories
                </span>
              </button>
            </Link>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 glass-panel hover:bg-red-500/10 hover:border-red-500/30 transition-all text-xs rounded-md cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-muted-foreground text-xs sm:text-sm hidden sm:inline tracking-tight">
              {signingOut ? "..." : "Sign Out"}
            </span>
          </button>
        </SignedIn>
      </div>
    </nav>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { StoryLoader } from "@/components/ui/story-loader";
import { COMIC_STYLES } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Story {
  id: string;
  title: string;
  slug: string;
  style: string;
  createdAt: string;
  pageCount: number;
  coverImage: string | null;
  lastUpdated?: string;
}

type SortOption = "newest" | "oldest" | "most-pages";

export default function StoriesPage() {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [styleFilter, setStyleFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [deletingStorySlug, setDeletingStorySlug] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStories = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/stories");
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sign in to view your stories");
          return;
        }
        throw new Error("Failed to fetch stories");
      }
      const data = await res.json();
      setStories(data.stories || []);
    } catch {
      setError("Failed to load stories. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const handleDeleteStory = async (slug: string) => {
    try {
      const res = await fetch(`/api/stories/${slug}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete story");
      }
      setStories((prev) => prev.filter((s) => s.slug !== slug));
      toast({
        title: "Story deleted",
        description: "The story has been permanently removed.",
      });
    } catch (error) {
      console.error("Error deleting story:", error);
      toast({
        title: "Error",
        description: "Failed to delete story. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingStorySlug(null);
    }
  };

  // Filtered and sorted stories
  const filteredStories = stories
    .filter((story) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!story.title.toLowerCase().includes(query)) return false;
      }
      if (styleFilter && story.style !== styleFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "most-pages":
          return b.pageCount - a.pageCount;
        case "newest":
        default:
          return new Date(b.lastUpdated || b.createdAt).getTime() - new Date(a.lastUpdated || a.createdAt).getTime();
      }
    });

  const activeStyles = [...new Set(stories.map((s) => s.style))];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-background/95">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Your Stories</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stories.length > 0
                ? `${stories.length} ${stories.length === 1 ? "story" : "stories"} · ${stories.reduce((sum, s) => sum + s.pageCount, 0)} total pages`
                : "Your comic library"}
            </p>
          </div>
          <Button
            onClick={() => router.push("/")}
            className="gap-2 bg-white text-black hover:bg-neutral-200"
          >
            <Plus className="h-4 w-4" />
            New Story
          </Button>
        </div>

        {/* Search and Filters */}
        {stories.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search stories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border/50 bg-background/80 pl-10 pr-4 text-sm text-white outline-none placeholder:text-muted-foreground/60 focus:border-indigo/50"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${showFilters || styleFilter
                  ? "border-indigo/60 bg-indigo/10 text-white"
                  : "border-border/50 text-muted-foreground hover:border-indigo/40 hover:text-white"
                  }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>

            {showFilters && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-background/60 p-3">
                <span className="text-xs text-muted-foreground">Style:</span>
                <button
                  onClick={() => setStyleFilter(null)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${!styleFilter
                    ? "bg-white text-black"
                    : "border border-border/60 text-muted-foreground hover:text-white"
                    }`}
                >
                  All
                </button>
                {activeStyles.map((styleId) => {
                  const styleMeta = COMIC_STYLES.find((s) => s.id === styleId);
                  return (
                    <button
                      key={styleId}
                      onClick={() => setStyleFilter(styleFilter === styleId ? null : styleId)}
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${styleFilter === styleId
                        ? "bg-white text-black"
                        : "border border-border/60 text-muted-foreground hover:text-white"
                        }`}
                    >
                      {styleMeta?.name || styleId}
                    </button>
                  );
                })}

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="rounded-md border border-border/50 bg-background px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="most-pages">Most pages</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <StoryLoader />
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              onClick={fetchStories}
              className="border-border/60 text-white hover:bg-white/5"
            >
              Try again
            </Button>
          </div>
        ) : filteredStories.length === 0 && stories.length === 0 ? (
          /* Empty state — first time user */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border/40 bg-gradient-to-br from-indigo/20 to-purple-500/10">
              <BookOpen className="h-10 w-10 text-indigo" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white">
              Your library is empty
            </h2>
            <p className="mb-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Create your first AI-powered comic in under a minute.
              Describe your story, pick a style, and watch it come to life.
            </p>
            <Button
              onClick={() => router.push("/")}
              className="gap-2 bg-white px-6 text-black hover:bg-neutral-200"
            >
              <Plus className="h-4 w-4" />
              Create your first comic
            </Button>
          </div>
        ) : filteredStories.length === 0 ? (
          /* No filter results */
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <p className="text-muted-foreground">No stories match your filters</p>
            <button
              onClick={() => { setSearchQuery(""); setStyleFilter(null); }}
              className="text-sm text-indigo hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          /* Story grid */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredStories.map((story) => {
              const styleMeta = COMIC_STYLES.find((s) => s.id === story.style);
              const isRecent =
                story.lastUpdated &&
                Date.now() - new Date(story.lastUpdated).getTime() < 24 * 60 * 60 * 1000;

              return (
                <button
                  key={story.id}
                  onClick={() => router.push(`/story/${story.slug}`)}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-border/40 bg-background/60 transition-all hover:border-indigo/40 hover:shadow-lg hover:shadow-indigo/5"
                >
                  {/* Cover image */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-background to-background/60">
                    {story.coverImage ? (
                      <img
                        src={story.coverImage}
                        alt={story.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <BookOpen className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    {/* Badges */}
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      {isRecent && (
                        <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                          Recent
                        </span>
                      )}
                    </div>

                    {/* Delete button (shows on hover) */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingStorySlug(story.slug);
                      }}
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-md transition-all hover:bg-red-500/80 group-hover:opacity-100"
                      aria-label="Delete story"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col p-3">
                    <h3 className="mb-1 line-clamp-2 text-left text-sm font-medium text-white group-hover:text-indigo transition-colors">
                      {story.title}
                    </h3>
                    <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{styleMeta?.name || story.style}</span>
                      <span>{story.pageCount} {story.pageCount === 1 ? "page" : "pages"}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={!!deletingStorySlug} onOpenChange={(open) => !open && setDeletingStorySlug(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Story</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this story? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingStorySlug && handleDeleteStory(deletingStorySlug)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

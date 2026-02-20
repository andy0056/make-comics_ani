"use client";

import { useState, useEffect } from "react";
import { BookOpen, Share2, ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMIC_STYLES } from "@/lib/constants";
import Link from "next/link";

interface SharedStory {
    id: string;
    title: string;
    slug: string;
    description?: string;
    style: string;
    createdAt: string;
}

interface SharedPage {
    pageNumber: number;
    generatedImageUrl: string | null;
}

export function SharePageClient({ storySlug }: { storySlug: string }) {
    const [story, setStory] = useState<SharedStory | null>(null);
    const [pages, setPages] = useState<SharedPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchStory = async () => {
            try {
                const res = await fetch(`/api/share/${storySlug}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        setError("Story not found");
                    } else {
                        setError("Failed to load story");
                    }
                    return;
                }
                const data = await res.json();
                setStory(data.story);
                setPages(data.pages || []);
            } catch {
                setError("Something went wrong");
            } finally {
                setLoading(false);
            }
        };
        fetchStory();
    }, [storySlug]);

    const handleShare = async () => {
        const shareUrl = window.location.href;
        if (navigator.share) {
            await navigator.share({
                title: story?.title || "Check out this comic",
                url: shareUrl,
            });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-background/95">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading comic...</p>
                </div>
            </div>
        );
    }

    if (error || !story) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-background to-background/95">
                <BookOpen className="h-12 w-12 text-muted-foreground/40" />
                <h1 className="text-xl font-semibold text-white">{error || "Story not found"}</h1>
                <Link href="/">
                    <Button variant="outline" className="gap-2 border-border/60 text-white hover:bg-white/5">
                        <ArrowLeft className="h-4 w-4" />
                        Go home
                    </Button>
                </Link>
            </div>
        );
    }

    const styleMeta = COMIC_STYLES.find((s) => s.id === story.style);
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

    return (
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
                <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
                    <Link href="/" className="text-sm font-semibold text-white hover:text-indigo transition-colors">
                        KaBoom
                    </Link>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleShare}
                            className="gap-1.5 text-muted-foreground hover:text-white"
                        >
                            <Share2 className="h-3.5 w-3.5" />
                            {copied ? "Copied!" : "Share"}
                        </Button>
                        <Link href="/">
                            <Button
                                size="sm"
                                className="gap-1.5 bg-white text-black hover:bg-neutral-200"
                            >
                                Create yours
                                <ExternalLink className="h-3 w-3" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Story info */}
            <div className="mx-auto max-w-4xl px-4 py-8">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                        {story.title}
                    </h1>
                    {story.description && (
                        <p className="mt-2 text-sm text-muted-foreground">{story.description}</p>
                    )}
                    <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/60 px-2.5 py-1">
                            {styleMeta?.name || story.style}
                        </span>
                        <span>{sortedPages.length} {sortedPages.length === 1 ? "page" : "pages"}</span>
                    </div>
                </div>

                {/* Comic pages */}
                <div className="space-y-6">
                    {sortedPages.map((page) => (
                        <div
                            key={page.pageNumber}
                            className="overflow-hidden rounded-xl border border-border/30 bg-background/60 shadow-2xl shadow-black/20"
                        >
                            {page.generatedImageUrl ? (
                                <img
                                    src={page.generatedImageUrl}
                                    alt={`Page ${page.pageNumber}`}
                                    className="w-full"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="flex h-64 items-center justify-center">
                                    <p className="text-muted-foreground">Page {page.pageNumber}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-12 flex flex-col items-center gap-4 border-t border-border/30 pt-8 text-center">
                    <p className="text-sm text-muted-foreground">
                        Made with{" "}
                        <Link href="/" className="font-medium text-indigo hover:underline">
                            KaBoom
                        </Link>
                    </p>
                    <Link href="/">
                        <Button className="gap-2 bg-white text-black hover:bg-neutral-200">
                            Create your own comic
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}

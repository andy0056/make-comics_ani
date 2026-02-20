"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquarePlus, X, Send, Smile, ThumbsUp, ThumbsDown, Meh } from "lucide-react";

const EMOJIS = [
    { value: "love", icon: ThumbsUp, label: "Love it", color: "text-emerald-400" },
    { value: "meh", icon: Meh, label: "It's okay", color: "text-amber-400" },
    { value: "issue", icon: ThumbsDown, label: "Has issues", color: "text-rose-400" },
] as const;

interface FeedbackEntry {
    rating: string;
    message: string;
    page: string;
    timestamp: string;
    userAgent: string;
}

export function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [rating, setRating] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isOpen, rating]);

    const handleSubmit = () => {
        if (!rating) return;

        const entry: FeedbackEntry = {
            rating,
            message: message.trim(),
            page: window.location.pathname,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
        };

        // Store locally for now — can be wired to an API later
        const existing = JSON.parse(localStorage.getItem("mc-feedback") || "[]");
        existing.push(entry);
        localStorage.setItem("mc-feedback", JSON.stringify(existing));

        // Also log to console for development visibility
        console.info("[Feedback]", entry);

        setSubmitted(true);
        setTimeout(() => {
            setIsOpen(false);
            setSubmitted(false);
            setRating(null);
            setMessage("");
        }, 1500);
    };

    return (
        <>
            {/* Floating trigger button */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-50 flex h-10 items-center gap-2 rounded-full border border-border/40 bg-background/90 px-4 text-xs text-muted-foreground shadow-lg backdrop-blur-xl transition-all hover:border-indigo/40 hover:text-white hover:shadow-indigo/10"
                aria-label="Give feedback"
            >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Feedback</span>
            </button>

            {/* Feedback modal */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-end p-4 sm:items-center sm:justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Panel */}
                    <div className="relative z-10 w-full max-w-sm rounded-xl border border-border/50 bg-background p-5 shadow-2xl">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute right-3 top-3 text-muted-foreground hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        {submitted ? (
                            <div className="flex flex-col items-center gap-2 py-6 text-center">
                                <Smile className="h-8 w-8 text-emerald-400" />
                                <p className="font-medium text-white">Thanks for your feedback!</p>
                                <p className="text-xs text-muted-foreground">
                                    It helps us make MakeComics better.
                                </p>
                            </div>
                        ) : (
                            <>
                                <h3 className="mb-1 text-sm font-semibold text-white">
                                    How&apos;s your experience?
                                </h3>
                                <p className="mb-4 text-xs text-muted-foreground">
                                    We&apos;re in beta — your feedback shapes the product.
                                </p>

                                {/* Rating */}
                                <div className="mb-4 flex gap-2">
                                    {EMOJIS.map(({ value, icon: Icon, label, color }) => (
                                        <button
                                            key={value}
                                            onClick={() => setRating(value)}
                                            className={`flex flex-1 flex-col items-center gap-1 rounded-lg border py-3 transition-colors ${rating === value
                                                    ? "border-indigo/60 bg-indigo/10"
                                                    : "border-border/50 hover:border-indigo/30 hover:bg-white/5"
                                                }`}
                                        >
                                            <Icon className={`h-5 w-5 ${rating === value ? color : "text-muted-foreground"}`} />
                                            <span className="text-[10px] text-muted-foreground">{label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Message */}
                                <textarea
                                    ref={textareaRef}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Tell us more (optional)..."
                                    rows={3}
                                    className="mb-3 w-full resize-none rounded-lg border border-border/50 bg-background/50 p-3 text-sm text-white outline-none placeholder:text-muted-foreground/50 focus:border-indigo/50"
                                />

                                {/* Submit */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={!rating}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Send className="h-3.5 w-3.5" />
                                    Send feedback
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

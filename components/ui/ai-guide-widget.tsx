"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useParams } from "next/navigation";
import { MessageCircle, X, Send, Bot, Sparkles, Zap, HelpCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMeta = {
    finishReason: string | null;
    retryCount: number;
    isTruncated: boolean;
    canContinue: boolean;
};

type Message = {
    role: "user" | "assistant";
    content: string;
    meta?: ChatMeta;
};

const CONTINUE_TRUNCATED_PROMPT = "Continue the previous answer from exactly where you stopped. Do not repeat prior text.";

const getSuggestedActions = (pathname: string) => {
    if (pathname === "/stories") {
        return [
            { icon: Sparkles, label: "Manage stories", text: "How do I edit or delete my existing stories?" },
            { icon: Zap, label: "Start new ideas", text: "I want to start a new comic. Give me 3 random premise ideas." },
        ];
    }
    if (pathname.startsWith("/story/")) {
        return [
            { icon: Sparkles, label: "Next scene ideas", text: "What's a good cliffhanger or action sequence for the next panel?" },
            { icon: HelpCircle, label: "Editor tools", text: "How do the Character Bible and Universe tabs work?" },
        ];
    }
    return [
        { icon: Sparkles, label: "Help me write a prompt", text: "I need help writing a prompt for a cyberpunk detective story." },
        { icon: Zap, label: "Brainstorm ideas", text: "Can you give me 3 random comic book premise ideas?" },
        { icon: HelpCircle, label: "How do styles work?", text: "What's the difference between Noir and Cinematic Anime styles?" },
    ];
};

export function AIGuideWidget() {
    const pathname = usePathname() || "/";
    const params = useParams() || {};
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Hey there! I'm the **KaBoom Bot**. 💥\n\nI can help you brainstorm story ideas, refine your prompts, or figure out how to use the editor. What are you working on?",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    // This effect hides the widget's native events from Radix UI's global document listeners.
    // Radix Dialog normally steals focus and prevents pointer events outside of it. By stopping
    // propagation here, Radix never sees the clicks/keystrokes, allowing native copy/paste
    // and text selection to work flawlessly even when a Dialog is open!
    useEffect(() => {
        const widget = document.getElementById("kaboom-bot-widget");
        if (!widget) return;

        const stopEvent = (e: Event) => {
            if (e.type === "keydown") {
                const ke = e as KeyboardEvent;
                // Exempt standard clipboard/editing shortcuts so the OS can copy/paste/select natively
                if ((ke.metaKey || ke.ctrlKey) && ["c", "v", "x", "a", "z"].includes(ke.key.toLowerCase())) {
                    return;
                }
            }
            e.stopPropagation();
        };

        widget.addEventListener("pointerdown", stopEvent);
        widget.addEventListener("mousedown", stopEvent);
        widget.addEventListener("keydown", stopEvent);
        widget.addEventListener("focusin", stopEvent);

        return () => {
            widget.removeEventListener("pointerdown", stopEvent);
            widget.removeEventListener("mousedown", stopEvent);
            widget.removeEventListener("keydown", stopEvent);
            widget.removeEventListener("focusin", stopEvent);
        };
    }, []);

    const handleSend = async (text: string = input) => {
        if (!text.trim() || isLoading) return;

        const userMessage: Message = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const contextMsg = `Current Route: ${pathname}\nRoute Params: ${JSON.stringify(params, null, 2)}`;
            const storySlug = params.storySlug as string | undefined;

            const response = await fetch("/api/chat/guide", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    context: contextMsg,
                    storySlug: storySlug || null
                }),
            });

            if (!response.ok) throw new Error("Failed to fetch response");

            const data = await response.json();
            const meta: ChatMeta | undefined = data?.meta
                ? {
                    finishReason: typeof data.meta.finishReason === "string" ? data.meta.finishReason : null,
                    retryCount: typeof data.meta.retryCount === "number" ? data.meta.retryCount : 0,
                    isTruncated: Boolean(data.meta.isTruncated),
                    canContinue: Boolean(data.meta.canContinue),
                }
                : undefined;

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: typeof data.reply === "string" && data.reply.trim()
                        ? data.reply
                        : "Sorry, I couldn't process that right now. 💥",
                    meta,
                },
            ]);
        } catch (error) {
            console.error("Chat error:", error);
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Oops! My circuits got jammed. Try asking me again in a second! 🤖⚡",
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Simple markdown parser for bold text in chat
    const renderMarkdown = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="text-white">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    const latestAssistantIndex = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === "assistant") return i;
        }
        return -1;
    })();

    if (pathname.startsWith("/story/")) {
        return null;
    }

    return (
        <div id="kaboom-bot-widget" data-kaboom-bot-root="true" className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-[340px] sm:w-[380px] origin-bottom-right animate-in fade-in slide-in-from-bottom-5 overflow-hidden rounded-xl border-2 border-border bg-background shadow-[6px_6px_0px_0px_var(--color-comic-yellow)] flex flex-col h-[500px] max-h-[80vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b-2 border-border bg-indigo/10 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                <Bot className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white tracking-tight leading-none">KaBoom Bot</h3>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Your AI Comic Guide</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsOpen(false)}
                            className="h-8 w-8 text-muted-foreground hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "flex w-full",
                                    msg.role === "user" ? "justify-end" : "justify-start"
                                )}
                            >
                                <div
                                    className={cn(
                                        "relative group max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap select-text selection:bg-indigo-500/30",
                                        msg.role === "user"
                                            ? "bg-indigo text-white rounded-br-none"
                                            : "bg-muted/50 text-muted-foreground border border-border/50 rounded-bl-none pr-8"
                                    )}
                                >
                                    {renderMarkdown(msg.content)}
                                    {msg.role === "assistant" &&
                                        idx === latestAssistantIndex &&
                                        msg.meta?.isTruncated &&
                                        msg.meta?.canContinue && (
                                            <div className="mt-2 flex items-center gap-2 text-[11px]">
                                                <span className="text-amber-400/90">Response was shortened.</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSend(CONTINUE_TRUNCATED_PROMPT)}
                                                    disabled={isLoading}
                                                    className="rounded px-1.5 py-0.5 border border-border/50 bg-background/60 text-indigo hover:text-white disabled:opacity-50"
                                                >
                                                    Continue
                                                </button>
                                            </div>
                                        )}
                                    {msg.role === "assistant" && (
                                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Send to Editor Button */}
                                            {pathname.includes("/story/") && (
                                                <button
                                                    onClick={() => {
                                                        const event = new CustomEvent('kaboom:use-prompt', { detail: msg.content });
                                                        document.dispatchEvent(event);
                                                    }}
                                                    className="p-1.5 rounded-md bg-background/80 text-indigo hover:bg-indigo hover:text-white shadow-sm border border-border/50"
                                                    title="Send to Editor"
                                                >
                                                    <Sparkles className="h-3 w-3" />
                                                </button>
                                            )}
                                            {/* Copy Button */}
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(msg.content);
                                                    setCopiedIndex(idx);
                                                    setTimeout(() => setCopiedIndex(null), 2000);
                                                }}
                                                className="p-1.5 rounded-md bg-background/80 text-muted-foreground hover:bg-background hover:text-white shadow-sm border border-border/50"
                                                title="Copy to clipboard"
                                            >
                                                {copiedIndex === idx ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex w-full justify-start">
                                <div className="max-w-[85%] rounded-lg rounded-bl-none bg-muted/50 px-3 py-2 text-sm border border-border/50">
                                    <div className="flex gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-.15s]" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-.3s]" />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Actions (only show if few messages to save space) */}
                    {messages.length < 3 && !isLoading && (
                        <div className="px-4 pb-2">
                            <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                                Suggested
                            </h4>
                            <div className="flex flex-col gap-1.5">
                                {getSuggestedActions(pathname).map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(action.text)}
                                        className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-neutral-800 hover:text-white text-left"
                                    >
                                        <action.icon className="h-3 w-3 shrink-0 text-indigo" />
                                        <span className="truncate">{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="border-t-2 border-border p-3 bg-background">
                        <div className="relative flex items-center">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask KaBoom Bot anything..."
                                disabled={isLoading}
                                className="w-full resize-none rounded-md border border-border/60 bg-background/50 py-2.5 pl-3 pr-10 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-indigo disabled:opacity-50 min-h-[44px] max-h-[120px]"
                                rows={1}
                            />
                            <Button
                                size="icon"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isLoading}
                                className={cn(
                                    "absolute right-1 bottom-1 h-8 w-8 rounded-sm",
                                    input.trim() && !isLoading ? "bg-indigo text-white hover:bg-indigo-600" : "bg-transparent text-muted-foreground hover:bg-white/5"
                                )}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="group flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-indigo text-white shadow-[4px_4px_0px_0px_var(--color-comic-cyan)] transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_var(--color-comic-cyan)] active:translate-y-0 active:shadow-[2px_2px_0px_0px_var(--color-comic-cyan)]"
                title="Ask KaBoom Bot"
            >
                {isOpen ? (
                    <X className="h-6 w-6" />
                ) : (
                    <MessageCircle className="h-6 w-6 group-hover:scale-110 transition-transform" />
                )}
            </button>
        </div>
    );
}

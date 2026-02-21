"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useParams } from "next/navigation";
import { Send, Bot, Sparkles, Zap, HelpCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Message = {
    role: "user" | "assistant";
    content: string;
};

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

export function AIGuideSidePanel() {
    const pathname = usePathname() || "/";
    const params = useParams() || {};
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
        scrollToBottom();
    }, [messages]);

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

            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: data.reply },
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

    return (
        <div id="kaboom-bot-side-panel" data-kaboom-bot-root="true" className="flex flex-col w-80 lg:w-96 border-l border-border bg-muted/20 h-full shrink-0">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border/60 bg-background/50 backdrop-blur-sm shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo/10 text-indigo flex-shrink-0">
                    <Bot className="h-4 w-4" />
                </div>
                <div>
                    <h3 className="font-semibold text-sm">KaBoom Bot</h3>
                    <p className="text-xs text-muted-foreground">Your AI Comic Guide</p>
                </div>
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
                <div className="px-4 pb-2 shrink-0">
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
            <div className="border-t border-border/60 p-3 bg-background/50 backdrop-blur-sm shrink-0">
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
    );
}

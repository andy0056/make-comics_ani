import type { Metadata } from "next";
import { SharePageClient } from "./share-page-client";

interface SharePageProps {
    params: Promise<{ storySlug: string }>;
    searchParams: Promise<{ token?: string | string[] }>;
}

function getTokenParam(token: string | string[] | undefined): string {
    if (typeof token === "string") {
        return token;
    }

    if (Array.isArray(token) && token.length > 0) {
        return token[0] ?? "";
    }

    return "";
}

export async function generateMetadata({ params, searchParams }: SharePageProps): Promise<Metadata> {
    const [{ storySlug }, { token: rawToken }] = await Promise.all([params, searchParams]);
    const token = getTokenParam(rawToken);

    if (!token) {
        return { title: "Story Not Found | KaBoom" };
    }

    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const apiUrl = new URL(`/api/share/${storySlug}`, baseUrl);
        apiUrl.searchParams.set("token", token);

        const res = await fetch(apiUrl.toString(), {
            cache: "no-store",
        });

        if (!res.ok) {
            return { title: "Story Not Found | KaBoom" };
        }

        const data = await res.json();
        const story = data.story;
        const coverImage = data.pages?.[0]?.generatedImageUrl;

        return {
            title: `${story.title} | KaBoom`,
            description: story.description || `A ${story.style} comic created with KaBoom`,
            openGraph: {
                title: story.title,
                description: story.description || `A ${story.style} comic created with KaBoom`,
                images: coverImage ? [{ url: coverImage, width: 864, height: 1184 }] : [],
                type: "article",
            },
            twitter: {
                card: "summary_large_image",
                title: story.title,
                description: story.description || `A ${story.style} comic created with KaBoom`,
                images: coverImage ? [coverImage] : [],
            },
        };
    } catch {
        return { title: "KaBoom" };
    }
}

export default async function SharePage({ params, searchParams }: SharePageProps) {
    const [{ storySlug }, { token: rawToken }] = await Promise.all([params, searchParams]);
    return <SharePageClient storySlug={storySlug} token={getTokenParam(rawToken)} />;
}

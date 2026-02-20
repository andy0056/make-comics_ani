import type { Metadata } from "next";
import { SharePageClient } from "./share-page-client";

interface SharePageProps {
    params: Promise<{ storySlug: string }>;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
    const { storySlug } = await params;

    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/share/${storySlug}`, {
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

export default async function SharePage({ params }: SharePageProps) {
    const { storySlug } = await params;
    return <SharePageClient storySlug={storySlug} />;
}

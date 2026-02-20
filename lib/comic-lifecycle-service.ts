import {
  createPage,
  createStory,
  getLastPageImage,
  getNextPageNumber,
} from "@/lib/db-actions";
import { type Page, type Story } from "@/lib/schema";
import {
  getOwnedStoryById,
  getOwnedStoryWithPagesBySlug,
} from "@/lib/story-access";

type LifecycleFailure = {
  ok: false;
  status: 403 | 404;
  error: string;
};

type PrepareGenerateComicLifecycleSuccess = {
  ok: true;
  story: Story;
  page: Page;
  referenceImages: string[];
  isNewStory: boolean;
};

type PrepareAddPageLifecycleSuccess = {
  ok: true;
  story: Story;
  pages: Page[];
  page: Page;
  pageNumber: number;
  isRedraw: boolean;
  referenceImages: string[];
  previousPages: Array<{ prompt: string }>;
};

export type PrepareGenerateComicLifecycleResult =
  | PrepareGenerateComicLifecycleSuccess
  | LifecycleFailure;

export type PrepareAddPageLifecycleResult =
  | PrepareAddPageLifecycleSuccess
  | LifecycleFailure;

export async function prepareGenerateComicLifecycle({
  storyId,
  userId,
  prompt,
  style,
  characterImages,
  usesOwnApiKey,
}: {
  storyId?: string;
  userId: string;
  prompt: string;
  style: string;
  characterImages: string[];
  usesOwnApiKey: boolean;
}): Promise<PrepareGenerateComicLifecycleResult> {
  const referenceImages: string[] = [];

  if (storyId) {
    const storyAccess = await getOwnedStoryById({
      storyId,
      userId,
      unauthorizedMode: "unauthorized",
    });
    if (!storyAccess.ok) {
      return storyAccess;
    }

    const nextPageNumber = await getNextPageNumber(storyId);
    const page = await createPage({
      storyId,
      pageNumber: nextPageNumber,
      prompt,
      characterImageUrls: characterImages,
    });

    if (nextPageNumber > 1) {
      const lastPageImage = await getLastPageImage(storyId);
      if (lastPageImage) {
        referenceImages.push(lastPageImage);
      }
    }

    referenceImages.push(...characterImages);

    return {
      ok: true,
      story: storyAccess.story,
      page,
      referenceImages,
      isNewStory: false,
    };
  }

  const story = await createStory({
    title: prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt,
    description: undefined,
    userId,
    style,
    usesOwnApiKey,
  });

  const page = await createPage({
    storyId: story.id,
    pageNumber: 1,
    prompt,
    characterImageUrls: characterImages,
  });

  referenceImages.push(...characterImages);

  return {
    ok: true,
    story,
    page,
    referenceImages,
    isNewStory: true,
  };
}

export async function prepareAddPageLifecycle({
  storySlug,
  userId,
  pageId,
  prompt,
  characterImages,
}: {
  storySlug: string;
  userId: string;
  pageId?: string;
  prompt: string;
  characterImages: string[];
}): Promise<PrepareAddPageLifecycleResult> {
  const storyAccess = await getOwnedStoryWithPagesBySlug({
    storySlug,
    userId,
    unauthorizedMode: "unauthorized",
  });

  if (!storyAccess.ok) {
    return storyAccess;
  }

  const { story, pages } = storyAccess;
  let page: Page;
  let pageNumber: number;
  let isRedraw = false;

  if (pageId) {
    isRedraw = true;
    const existingPage = pages.find((candidate) => candidate.id === pageId);
    if (!existingPage) {
      return { ok: false, status: 404, error: "Page not found" };
    }
    page = existingPage;
    pageNumber = existingPage.pageNumber;
  } else {
    pageNumber = await getNextPageNumber(story.id);
    page = await createPage({
      storyId: story.id,
      pageNumber,
      prompt,
      characterImageUrls: characterImages,
    });
  }

  const referenceImages: string[] = [];
  if (pageNumber > 1) {
    const previousPage = pages.find(
      (candidate) => candidate.pageNumber === pageNumber - 1,
    );
    if (previousPage?.generatedImageUrl) {
      referenceImages.push(previousPage.generatedImageUrl);
    }
  }
  referenceImages.push(...characterImages);

  const relevantPages = isRedraw
    ? pages.filter((candidate) => candidate.pageNumber < pageNumber)
    : pages;
  const previousPages = relevantPages.map((candidate) => ({
    prompt: candidate.prompt,
  }));

  return {
    ok: true,
    story,
    pages,
    page,
    pageNumber,
    isRedraw,
    referenceImages,
    previousPages,
  };
}

"use client";

import { useState, useEffect } from "react";
import { AIGuideSidePanel } from "@/components/editor/ai-guide-side-panel";
import { useParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@clerk/nextjs";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { PageSidebar } from "@/components/editor/page-sidebar";
import { ComicCanvas } from "@/components/editor/comic-canvas";
import { PageInfoSheet } from "@/components/editor/page-info-sheet";
import { GeneratePageModal } from "@/components/editor/generate-page-modal";
import { CharacterBibleSheet } from "@/components/editor/character-bible-sheet";
import { UniverseSheet } from "@/components/editor/universe-sheet";
import { PublishSheet } from "@/components/editor/publish-sheet";
import { StoryLoader } from "@/components/ui/story-loader";
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

interface PageData {
  id: number; // pageNumber for component compatibility
  title: string;
  image: string;
  prompt: string;
  characterUploads?: string[];
  style: string;
  dbId?: string; // actual database UUID
}

interface StoryData {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  style: string;
  userId?: string | null;
  isOwner?: boolean;
}

const BOT_PANEL_STORAGE_KEY = "kaboom:story-bot-open";

function readBotPanelPreference(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(BOT_PANEL_STORAGE_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    return null;
  }

  return null;
}

function writeBotPanelPreference(isOpen: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BOT_PANEL_STORAGE_KEY, String(isOpen));
  } catch {
    // Ignore storage write failures (private mode / quota / blocked storage).
  }
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function StoryEditorClient() {
  const params = useParams();
  const slug = params.storySlug as string;
  const { isSignedIn, isLoaded } = useAuth();

  const [story, setStory] = useState<StoryData | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showCharacterBible, setShowCharacterBible] = useState(false);
  const [showUniverseSheet, setShowUniverseSheet] = useState(false);
  const [showPublishSheet, setShowPublishSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  const [showRedrawDialog, setShowRedrawDialog] = useState(false);
  const [loadingPageId, setLoadingPageId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existingCharacterImages, setExistingCharacterImages] = useState<
    string[]
  >([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { toast } = useToast();
  const isAdvancedMode = false;
  const [lastPanelLayout, setLastPanelLayout] = useState("5-panel");
  const [isBotPanelOpen, setIsBotPanelOpen] = useState(true);


  const handleTitleUpdate = (newTitle: string) => {
    setStory(prev => prev ? { ...prev, title: newTitle } : null);
  };

  useEffect(() => {
    const storedPreference = readBotPanelPreference();
    if (storedPreference !== null) {
      setIsBotPanelOpen(storedPreference);
      return;
    }

    const isMobileOrTablet = window.matchMedia("(max-width: 1023px)").matches;
    const defaultIsOpen = !isMobileOrTablet;
    setIsBotPanelOpen(defaultIsOpen);
    writeBotPanelPreference(defaultIsOpen);
  }, []);

  const handleToggleBotPanel = () => {
    setIsBotPanelOpen((prev) => {
      const next = !prev;
      writeBotPanelPreference(next);
      return next;
    });
  };

  const handleCloseBotPanel = () => {
    setIsBotPanelOpen(false);
    writeBotPanelPreference(false);
  };

  // Load story and pages from API
  useEffect(() => {
    const loadStoryData = async () => {
      try {
        setLoadError(null);
        const response = await fetch(`/api/stories/${slug}`);
        if (!response.ok) {
          let errorMessage = "Failed to load story.";
          try {
            const errorData = await response.json();
            if (typeof errorData?.error === "string" && errorData.error.trim()) {
              errorMessage = errorData.error.trim();
            }
          } catch {
            if (response.status === 404) {
              errorMessage = "Story not found.";
            } else if (response.status === 401) {
              errorMessage = "Authentication required.";
            } else if (response.status === 403) {
              errorMessage = "You do not have access to this story.";
            }
          }

          throw new Error(errorMessage);
        }

        const result = await response.json();

        const {
          story: storyData,
          pages: pagesData,
          isOwner: ownerStatus,
        } = result;

        setStory(storyData);
        setLoadError(null);
        setIsOwner(ownerStatus ?? false); // Default to false if undefined
        setPages(
          pagesData.map((page: any) => ({
            id: page.pageNumber,
            title: storyData.title,
            image: page.generatedImageUrl || "",
            prompt: page.prompt,
            characterUploads: page.characterImageUrls,
            style: storyData.style || "noir",
            dbId: page.id,
          }))
        );

        // Load existing character images for reuse
        const uniqueImages = [
          ...new Set(
            pagesData.flatMap((page: any) => page.characterImageUrls || [])
          ),
        ];
        setExistingCharacterImages(uniqueImages as string[]);
      } catch (error) {
        console.error("Error loading story:", error);
        const description =
          error instanceof Error
            ? error.message
            : "Failed to load story data.";
        setLoadError(description);
        toast({
          title: "Error loading story",
          description,
          variant: "destructive",
          duration: 4000,
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (slug) {
      loadStoryData();
    }
  }, [slug, toast]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      if (showGenerateModal) {
        return;
      }

      // Don't trigger shortcuts if user is typing in an input field
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-kaboom-bot-root="true"]')) {
        return;
      }

      const selectedText = window.getSelection()?.toString().trim();
      if (selectedText) {
        return;
      }

      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentPage((prev) => (prev < pages.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentPage((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentPage((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentPage((prev) => (prev < pages.length - 1 ? prev + 1 : prev));
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setShowInfoSheet(true);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleAddPage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pages.length, showGenerateModal]);


  const handleAddPage = async () => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    // Check credits universally
    try {
      const response = await fetch('/api/check-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Error",
          description: "Failed to check credits",
          variant: "destructive",
        });
        return;
      }

      if (data.creditsRemaining > 0) {
        setShowGenerateModal(true);
      } else {
        toast({
          title: "Out of credits",
          description: "You have exhausted your weekly generations. Check back soon!",
          variant: "destructive",
          duration: 4000,
        });
      }
    } catch (error) {
      console.error("Error checking credits:", error);
      toast({
        title: "Error",
        description: "Failed to check credits",
        variant: "destructive",
      });
    }
  };

  const handleRedrawPage = () => {
    if (!isLoaded || !isSignedIn) {
      return;
    }
    setShowRedrawDialog(true);
  };

  const confirmRedrawPage = async () => {
    setShowRedrawDialog(false);

    const currentPageData = pages[currentPage];
    if (!currentPageData) return;

    setLoadingPageId(currentPage);

    try {
      const idempotencyKey = createIdempotencyKey();
      const response = await fetch("/api/add-page", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          storyId: story?.slug,
          pageId: currentPageData.dbId, // Add pageId to override existing page
          prompt: currentPageData.prompt,
          characterImages: currentPageData.characterUploads || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to redraw page");
      }

      const result = await response.json();

      // Update the current page with the new image
      setPages((prevPages) =>
        prevPages.map((page, index) =>
          index === currentPage ? { ...page, image: result.imageUrl } : page
        )
      );

      toast({
        title: "Page redrawn successfully",
        description: "The page has been regenerated with a fresh image.",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error redrawing page:", error);
      toast({
        title: "Failed to redraw page",
        description:
          error instanceof Error ? error.message : "Failed to redraw page",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoadingPageId(null);
    }
  };


  const downloadPDF = async () => {
    if (!story || pages.length === 0) return;

    setIsGeneratingPDF(true);

    try {
      const response = await fetch(`/api/download-pdf?storySlug=${story.slug}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate PDF");
      }

      // Create blob from response and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PDF downloaded",
        description: "Your comic has been downloaded as a PDF.",
        duration: 3000,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Failed to generate PDF",
        description: "An error occurred while generating the PDF.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDeletePage = (pageIndex: number) => {
    setPageToDelete(pageIndex);
    setShowDeleteDialog(true);
  };

  const confirmDeletePage = async () => {
    if (pageToDelete === null) return;

    const pageData = pages[pageToDelete];
    if (!pageData) return;

    setShowDeleteDialog(false);

    try {
      const response = await fetch("/api/delete-page", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storySlug: story?.slug,
          pageId: pageData.dbId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete page");
      }

      // Remove the page from state
      setPages((prevPages) => {
        const newPages = prevPages.filter((_, index) => index !== pageToDelete);
        // Adjust currentPage if necessary
        if (currentPage >= newPages.length) {
          setCurrentPage(Math.max(0, newPages.length - 1));
        } else if (currentPage > pageToDelete) {
          setCurrentPage(currentPage - 1);
        }
        return newPages;
      });

      toast({
        title: "Page deleted successfully",
        description: "The page has been removed from your comic.",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error deleting page:", error);
      toast({
        title: "Failed to delete page",
        description:
          error instanceof Error ? error.message : "Failed to delete page",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setPageToDelete(null);
    }
  };


  const handleGeneratePage = async (data: {
    prompt: string;
    characterUrls?: string[];
    panelLayout?: string;
  }): Promise<void> => {

    // Remember the panel layout choice for future pages
    if (data.panelLayout) {
      setLastPanelLayout(data.panelLayout);
    }

    // Add new page mode
    const idempotencyKey = createIdempotencyKey();
    const response = await fetch("/api/add-page", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        storyId: story?.slug,
        prompt: data.prompt,
        panelLayout: data.panelLayout,
        characterImages: data.characterUrls || [],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate page");
    }

    const result = await response.json();

    // Update character images list with new ones
    const newCharacterUrls = data.characterUrls || [];
    setExistingCharacterImages((prev) => {
      const combined = [...prev, ...newCharacterUrls];
      // Remove duplicates while preserving order
      const unique = Array.from(new Set(combined));
      return unique;
    });

    setPages((prevPages) => [
      ...prevPages,
      {
        id: pages.length + 1,
        title: story?.title || "",
        image: result.imageUrl,
        prompt: data.prompt,
        characterUploads: data.characterUrls || [],
        style: story?.style || "noir",
        dbId: result.pageId,
      },
    ]);
    setCurrentPage(pages.length);

    setShowGenerateModal(false);
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <StoryLoader />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-white">{loadError || "Story not found"}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <EditorToolbar
        storySlug={story.slug}
        title={story.title}
        onContinueStory={handleAddPage}
        onDownloadPDF={downloadPDF}
        isGeneratingPDF={isGeneratingPDF}
        isOwner={isOwner}
        onTitleUpdate={handleTitleUpdate}
        onOpenCharacterBible={() => setShowCharacterBible(true)}
        onOpenUniverse={() => setShowUniverseSheet(true)}
        onOpenPublish={() => setShowPublishSheet(true)}
        isBotPanelOpen={isBotPanelOpen}
        onToggleBotPanel={handleToggleBotPanel}
      />

      <div className="flex-1 flex overflow-hidden">
        <PageSidebar
          pages={pages}
          currentPage={currentPage}
          onPageSelect={setCurrentPage}
          onAddPage={handleAddPage}
          loadingPageId={loadingPageId}
          isOwner={isOwner}
        />
        <ComicCanvas
          page={pages[currentPage]}
          pageIndex={currentPage}
          storySlug={story.slug}
          totalPages={pages.length}
          isLoading={loadingPageId === currentPage}
          isOwner={isOwner}
          onInfoClick={() => setShowInfoSheet(true)}
          onRedrawClick={handleRedrawPage}
          onDeletePage={() => handleDeletePage(currentPage)}
          onNextPage={() =>
            setCurrentPage((prev) =>
              prev < pages.length - 1 ? prev + 1 : prev
            )
          }
          onPrevPage={() =>
            setCurrentPage((prev) => (prev > 0 ? prev - 1 : prev))
          }
        />
        <AIGuideSidePanel
          isOpen={isBotPanelOpen}
          onClose={handleCloseBotPanel}
        />
      </div>

      <GeneratePageModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onGenerate={handleGeneratePage}
        pageNumber={pages.length + 1}
        isAdvancedMode={isAdvancedMode}
        existingCharacters={existingCharacterImages}
        lastPageCharacters={
          pages.length > 0 && pages[pages.length - 1]?.characterUploads
            ? pages[pages.length - 1].characterUploads || []
            : []
        }
        previousPageCharacters={
          pages.length > 1 && pages[pages.length - 2]?.characterUploads
            ? pages[pages.length - 2].characterUploads || []
            : []
        }
        previousPagePrompt={
          pages.length > 0 ? pages[pages.length - 1]?.prompt || "" : ""
        }
        previousPageImage={
          pages.length > 0 ? pages[pages.length - 1]?.image || "" : ""
        }
        defaultPanelLayout={lastPanelLayout}
      />
      <PageInfoSheet
        isOpen={showInfoSheet}
        onClose={() => setShowInfoSheet(false)}
        page={pages[currentPage]}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete page{" "}
              {pageToDelete !== null ? pageToDelete + 1 : ""}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePage}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRedrawDialog} onOpenChange={setShowRedrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redraw Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to redraw page {currentPage + 1}? This will regenerate the image for this page with a fresh result.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRedrawPage}>
              Redraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Advanced Creator Sheets */}
      <CharacterBibleSheet
        isOpen={showCharacterBible}
        onClose={() => setShowCharacterBible(false)}
        storySlug={slug}
        initialCharacters={[]}
        availableCharacterImages={existingCharacterImages}
        onCharactersUpdated={() => { }}
      />
      <UniverseSheet
        isOpen={showUniverseSheet}
        onClose={() => setShowUniverseSheet(false)}
        storySlug={slug}
        canManageCollaborators={isOwner}
      />
      <PublishSheet
        isOpen={showPublishSheet}
        onClose={() => setShowPublishSheet(false)}
        storySlug={slug}
        onDownloadPDF={downloadPDF}
        isGeneratingPDF={isGeneratingPDF}
      />
    </div>
  );
}

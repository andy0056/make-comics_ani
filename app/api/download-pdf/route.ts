import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStoryWithPagesBySlug } from "@/lib/db-actions";
import { jsPDF } from "jspdf";
import {
  downloadPdfQuerySchema,
  getRequestValidationErrorMessage,
} from "@/lib/api-request-validation";
import { validateSourceImageUrl } from "@/lib/s3-upload";

const MAX_PDF_IMAGES = 120;
const MAX_PDF_IMAGE_BYTES = 20 * 1024 * 1024;
const PDF_IMAGE_FETCH_TIMEOUT_MS = 15_000;

class PdfInputValidationError extends Error {}

async function fetchPdfImageBuffer(url: string): Promise<Buffer> {
  let sourceUrl: URL;
  try {
    sourceUrl = validateSourceImageUrl(url);
  } catch {
    throw new PdfInputValidationError("Invalid page image URL for PDF export.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl.toString(), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${sourceUrl.toString()}`);
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      ?.toLowerCase();
    if (!contentType || !contentType.startsWith("image/")) {
      throw new PdfInputValidationError("Invalid image content type for PDF export.");
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_PDF_IMAGE_BYTES) {
        throw new PdfInputValidationError("Image too large for PDF export.");
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      throw new PdfInputValidationError("Image data is empty.");
    }
    if (buffer.length > MAX_PDF_IMAGE_BYTES) {
      throw new PdfInputValidationError("Image too large for PDF export.");
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = downloadPdfQuerySchema.safeParse({
      storySlug: searchParams.get("storySlug"),
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: getRequestValidationErrorMessage(parsedQuery.error) },
        { status: 400 },
      );
    }
    const { storySlug } = parsedQuery.data;

    const result = await getStoryWithPagesBySlug(storySlug);
    if (!result) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const { story, pages } = result;
    if (story.userId !== userId) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const images = pages
      .map((page: { generatedImageUrl: string | null }) => page.generatedImageUrl)
      .filter((url: string) => url && url !== "/placeholder.svg");

    if (images.length === 0) {
      return NextResponse.json(
        { error: "No images to download" },
        { status: 400 },
      );
    }
    if (images.length > MAX_PDF_IMAGES) {
      return NextResponse.json(
        { error: "Too many pages to export in a single PDF." },
        { status: 400 },
      );
    }

    // Fetch all images server-side
    const imagePromises = images.map((url: string) => fetchPdfImageBuffer(url));

    const imageBuffers = await Promise.all(imagePromises);

    // Create PDF
    const pdf = new jsPDF();

    for (let i = 0; i < imageBuffers.length; i++) {
      if (i > 0) pdf.addPage();

      const imgBuffer = imageBuffers[i];
      const imgData = `data:image/jpeg;base64,${imgBuffer.toString("base64")}`;

      // For simplicity, assume images fit the page; in production you might want to scale
      pdf.addImage(imgData, "JPEG", 10, 10, 190, 277); // A4 portrait size minus margins

      // Add "Created by Make Comics" at the bottom
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      const text = "Created by Created with KaBoom";
      const textX = 105;
      const textY = 290;
      pdf.text(text, textX, textY, { align: "center" });
      const dimensions = pdf.getTextDimensions(text);
      pdf.link(
        textX - dimensions.w / 2,
        textY - dimensions.h / 2,
        dimensions.w,
        dimensions.h,
        { url: "https://www.kaboom.app/" },
      );
    }

    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));

    // Sanitize filename to only contain ASCII characters
    const safeFilename = story.title
      .replace(/[^\u0020-\u007E]/g, "") // Remove non-ASCII characters
      .replace(/[<>:"/\\|?*]/g, "-") // Replace invalid filename characters
      .trim() || "comic";

    // Return PDF as response
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof PdfInputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}

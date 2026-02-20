import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { POST as s3UploadHandler } from "next-s3-upload/route";

const REQUIRED_S3_ENV_VARS = [
  "S3_UPLOAD_KEY",
  "S3_UPLOAD_SECRET",
  "S3_UPLOAD_BUCKET",
  "S3_UPLOAD_REGION",
] as const;

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length === 0 ||
    normalized.includes("your_") ||
    normalized.includes("replace") ||
    normalized.includes("changeme") ||
    normalized.includes("placeholder")
  );
}

function getS3ConfigurationError() {
  const missingOrPlaceholder = REQUIRED_S3_ENV_VARS.filter((key) => {
    const value = process.env[key];
    return !value || isPlaceholderValue(value);
  });

  if (missingOrPlaceholder.length === 0) {
    return null;
  }

  return `Missing or invalid S3 configuration: ${missingOrPlaceholder.join(", ")}`;
}

function getUploadFailureMessage() {
  return "Upload initialization failed. Check S3 credentials and bucket permissions.";
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const configError = getS3ConfigurationError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const response = await s3UploadHandler(request);
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok && !contentType.includes("application/json")) {
      return NextResponse.json(
        { error: getUploadFailureMessage() },
        { status: response.status || 500 },
      );
    }

    return response;
  } catch (error) {
    console.error("S3 upload route error:", error);
    return NextResponse.json(
      { error: getUploadFailureMessage() },
      { status: 500 },
    );
  }
}

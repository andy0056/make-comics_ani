import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_OBJECT_KEY_LENGTH = 512;

type S3UploadConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let cachedS3Client: S3Client | null = null;

function readRequiredEnv(name: "S3_UPLOAD_KEY" | "S3_UPLOAD_SECRET" | "S3_UPLOAD_BUCKET" | "S3_UPLOAD_REGION") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required S3 environment variable: ${name}`);
  }
  return value;
}

function getS3UploadConfig(): S3UploadConfig {
  return {
    accessKeyId: readRequiredEnv("S3_UPLOAD_KEY"),
    secretAccessKey: readRequiredEnv("S3_UPLOAD_SECRET"),
    bucket: readRequiredEnv("S3_UPLOAD_BUCKET"),
    region: readRequiredEnv("S3_UPLOAD_REGION"),
  };
}

function getS3Client(config: S3UploadConfig): S3Client {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  cachedS3Client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedS3Client;
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;
  if (first === 10 || first === 127 || first === 0) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }

  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "localhost.localdomain"
  ) {
    return true;
  }

  if (normalized.includes(":")) {
    return isPrivateIPv6(normalized);
  }

  return isPrivateIPv4(normalized);
}

export function validateSourceImageUrl(imageUrl: string): URL {
  const parsedUrl = new URL(imageUrl);

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Source image URL must use HTTPS");
  }

  if (isPrivateHostname(parsedUrl.hostname)) {
    throw new Error("Source image URL hostname is not allowed");
  }

  return parsedUrl;
}

export function sanitizeS3ObjectKey(key: string): string {
  const normalized = key.trim().replace(/^\/+/, "");

  if (normalized.length === 0 || normalized.length > MAX_OBJECT_KEY_LENGTH) {
    throw new Error("Invalid S3 object key");
  }

  const hasControlCharacters = [...normalized].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

  if (
    normalized.includes("..") ||
    normalized.includes("\\") ||
    hasControlCharacters
  ) {
    throw new Error("Invalid S3 object key");
  }

  if (!/^[a-zA-Z0-9/_\-.]+$/.test(normalized)) {
    throw new Error("Invalid S3 object key");
  }

  return normalized;
}

function getContentType(contentTypeHeader: string | null): string {
  const raw = contentTypeHeader?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!raw.startsWith("image/")) {
    throw new Error("Source response is not an image");
  }

  return raw;
}

function encodeS3KeyForUrl(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchSourceImageBuffer(sourceUrl: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl.toString(), {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch source image: ${response.status}`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_IMAGE_BYTES) {
        throw new Error("Source image too large");
      }
    }

    const contentType = getContentType(response.headers.get("content-type"));
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    if (imageBuffer.length === 0) {
      throw new Error("Source image is empty");
    }

    if (imageBuffer.length > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error("Source image too large");
    }

    return { imageBuffer, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

export async function uploadImageToS3(
  imageUrl: string,
  key: string,
): Promise<string> {
  try {
    const sourceUrl = validateSourceImageUrl(imageUrl);
    const objectKey = sanitizeS3ObjectKey(key);
    const config = getS3UploadConfig();
    const s3Client = getS3Client(config);

    const { imageBuffer, contentType } = await fetchSourceImageBuffer(sourceUrl);
    const prefixedKey = `comics/${objectKey}`;

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: prefixedKey,
      Body: imageBuffer,
      ContentType: contentType,
      Metadata: {
        "app-name": "make-comics",
        type: "comic-page",
      },
    });

    await s3Client.send(command);

    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodeS3KeyForUrl(prefixedKey)}`;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("Failed to upload image to S3");
  }
}

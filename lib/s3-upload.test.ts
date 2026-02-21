import { describe, expect, it } from "vitest";
import { sanitizeS3ObjectKey, validateSourceImageUrl } from "@/lib/s3-upload";

describe("lib/s3-upload", () => {
  describe("validateSourceImageUrl", () => {
    it("accepts https public URLs", () => {
      const url = validateSourceImageUrl("https://cdn.example.com/image.png");
      expect(url.toString()).toBe("https://cdn.example.com/image.png");
    });

    it("rejects non-https URLs", () => {
      expect(() => validateSourceImageUrl("http://cdn.example.com/image.png")).toThrow(
        "Source image URL must use HTTPS",
      );
    });

    it("rejects localhost and private hosts", () => {
      expect(() => validateSourceImageUrl("https://localhost/image.png")).toThrow(
        "Source image URL hostname is not allowed",
      );
      expect(() => validateSourceImageUrl("https://10.1.2.3/image.png")).toThrow(
        "Source image URL hostname is not allowed",
      );
      expect(() => validateSourceImageUrl("https://172.20.1.1/image.png")).toThrow(
        "Source image URL hostname is not allowed",
      );
      expect(() => validateSourceImageUrl("https://192.168.1.1/image.png")).toThrow(
        "Source image URL hostname is not allowed",
      );
      expect(() => validateSourceImageUrl("https://[::1]/image.png")).toThrow(
        "Source image URL hostname is not allowed",
      );
    });
  });

  describe("sanitizeS3ObjectKey", () => {
    it("normalizes and accepts valid keys", () => {
      expect(sanitizeS3ObjectKey(" /story-1/page-1.jpg ")).toBe("story-1/page-1.jpg");
    });

    it("rejects traversal and invalid characters", () => {
      expect(() => sanitizeS3ObjectKey("../secret")).toThrow("Invalid S3 object key");
      expect(() => sanitizeS3ObjectKey("story-1\\page-1.jpg")).toThrow(
        "Invalid S3 object key",
      );
      expect(() => sanitizeS3ObjectKey("story 1/page.jpg")).toThrow(
        "Invalid S3 object key",
      );
    });
  });
});

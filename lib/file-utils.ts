export function validateFileForUpload(file: File, rejectWebP: boolean = true): { valid: boolean; error?: string } {
  // Reject WebP files
  if (rejectWebP && (file.type === "image/webp" || file.name.toLowerCase().endsWith('.webp'))) {
    return {
      valid: false,
      error: "WebP files not supported. Please upload PNG, JPG, or JPEG files instead of WebP."
    }
  }

  // Check if file is an image
  if (!file.type.startsWith("image/")) {
    return {
      valid: false,
      error: "Only image files are supported."
    }
  }

  return { valid: true }
}

export function generateFilePreview(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  })
}
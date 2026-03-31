/**
 * Client-side image compression and validation utilities.
 *
 * Compresses photos before upload to reduce memory pressure and storage costs.
 * A typical 12MB phone photo compresses to ~1-2MB at 1920px max width, 0.8 quality.
 */

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB raw input limit
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export type ImageValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/** Check if a file is HEIC/HEIF format (by type or extension) */
export function isHeicFile(file: File): boolean {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/** Validate file type and size before processing */
export function validateImage(file: File): ImageValidationResult {
  // Check HEIC by extension too since some browsers report empty type for HEIC
  const isHeic = isHeicFile(file);
  if (!isHeic && !ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, or HEIC.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `File too large (${sizeMB}MB). Maximum is 15MB.` };
  }
  return { valid: true };
}

/**
 * Compress an image file using canvas.
 * Returns a JPEG data URL at the specified max width and quality.
 */
export function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only downscale, never upscale
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = url;
  });
}

/**
 * Convert a HEIC file to JPEG via the server-side conversion endpoint.
 * Falls back to trying canvas (works on Safari which supports HEIC natively).
 */
export async function convertHeicToJpeg(file: File): Promise<string> {
  // First try: server-side conversion
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/inspections/convert-heic", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    // Fall through to canvas fallback
  }

  // Fallback: try loading directly (works in Safari which supports HEIC)
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(img.width, 1920);
      canvas.height = Math.round((img.height * canvas.width) / img.width);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not available")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot load HEIC file. Your browser may not support this format."));
    };
    img.src = url;
  });
}

/**
 * Compress a data URL string (e.g. from camera capture).
 * Returns a compressed JPEG data URL.
 */
export function compressDataUrl(
  dataUrl: string,
  maxWidth: number = 1920,
  quality: number = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}

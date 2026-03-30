/**
 * Client-side image compression and validation utilities.
 *
 * Compresses photos before upload to reduce memory pressure and storage costs.
 * A typical 12MB phone photo compresses to ~1-2MB at 1920px max width, 0.8 quality.
 */

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB raw input limit
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ImageValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/** Validate file type and size before processing */
export function validateImage(file: File): ImageValidationResult {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.` };
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

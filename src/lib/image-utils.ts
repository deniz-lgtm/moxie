/**
 * Client-side image compression and validation utilities.
 *
 * Compresses photos before upload to reduce memory pressure and storage costs.
 * A typical 12MB phone photo compresses to ~1-2MB at 1920px max width, 0.8 quality.
 */

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB raw input limit
const MAX_PANORAMA_SIZE = 30 * 1024 * 1024; // 30MB for 360 camera output
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

/** Check if an image's aspect ratio suggests equirectangular (360) projection */
export function isLikelyEquirectangular(width: number, height: number): boolean {
  const ratio = width / height;
  return ratio >= 1.8 && ratio <= 2.2;
}

/** Validate a panorama file (higher size limit than regular photos) */
export function validatePanorama(file: File): ImageValidationResult {
  const isHeic = isHeicFile(file);
  if (!isHeic && !ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, or HEIC.` };
  }
  if (file.size > MAX_PANORAMA_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `File too large (${sizeMB}MB). Maximum for 360 photos is 30MB.` };
  }
  return { valid: true };
}

/**
 * Compress a 360 panorama image. Uses a higher resolution cap (4096px)
 * since equirectangular images need more pixels for acceptable viewer quality.
 */
export function compressPanorama(
  file: File,
  maxWidth: number = 4096,
  quality: number = 0.7,
): Promise<string> {
  return compressImage(file, maxWidth, quality);
}

// ── Photo timestamp stamp ──────────────────────────

export type PhotoStampOptions = {
  /** Primary label rendered above the timestamp (e.g. "Moxie Management"). */
  label?: string;
  /** Secondary label rendered below the primary label (e.g. "Unit 12B – Kitchen"). */
  secondary?: string;
  /** Date used for the timestamp. Defaults to `new Date()`. */
  date?: Date;
};

/**
 * Burn a date/time stamp (and optional label) directly onto a photo.
 *
 * Draws a small translucent plaque in the bottom-left corner of the image so
 * the timestamp travels with the file — it cannot be removed by copying or
 * cropping the photo in a simple way. Used for chain-of-custody documentation
 * on move-out inspection photos.
 *
 * Input/output are JPEG data URLs.
 */
export function stampPhoto(
  dataUrl: string,
  options: PhotoStampOptions = {},
  quality: number = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);

      // Stamp geometry — scale with the image so it reads well on any resolution.
      const dim = Math.min(canvas.width, canvas.height);
      const pad = Math.max(12, Math.round(dim * 0.015));
      const primarySize = Math.max(14, Math.round(dim * 0.028));
      const timeSize = Math.max(16, Math.round(dim * 0.034));
      const secondarySize = Math.max(12, Math.round(dim * 0.022));

      const date = options.date ?? new Date();
      const timeLine = date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const primaryLine = options.label || "Moxie Management";
      const secondaryLine = options.secondary || "";

      // Measure widest line so the plaque fits snugly.
      ctx.font = `600 ${primarySize}px -apple-system, system-ui, sans-serif`;
      const primaryWidth = ctx.measureText(primaryLine).width;
      ctx.font = `700 ${timeSize}px -apple-system, system-ui, sans-serif`;
      const timeWidth = ctx.measureText(timeLine).width;
      ctx.font = `400 ${secondarySize}px -apple-system, system-ui, sans-serif`;
      const secondaryWidth = secondaryLine ? ctx.measureText(secondaryLine).width : 0;

      const plaqueWidth =
        Math.max(primaryWidth, timeWidth, secondaryWidth) + pad * 2;
      const plaqueHeight =
        pad * 2 +
        primarySize +
        6 +
        timeSize +
        (secondaryLine ? 6 + secondarySize : 0);
      const x = pad;
      const y = canvas.height - plaqueHeight - pad;

      // Translucent dark plaque + subtle maroon accent bar for brand continuity.
      ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
      ctx.fillRect(x, y, plaqueWidth, plaqueHeight);
      ctx.fillStyle = "#9d1535";
      ctx.fillRect(x, y, Math.max(3, Math.round(dim * 0.004)), plaqueHeight);

      // Text: primary, then timestamp, then secondary.
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "top";

      let textY = y + pad;
      ctx.font = `600 ${primarySize}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(primaryLine, x + pad, textY);
      textY += primarySize + 6;

      ctx.font = `700 ${timeSize}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(timeLine, x + pad, textY);
      textY += timeSize + 6;

      if (secondaryLine) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = `400 ${secondarySize}px -apple-system, system-ui, sans-serif`;
        ctx.fillText(secondaryLine, x + pad, textY);
      }

      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image for stamping"));
    img.src = dataUrl;
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

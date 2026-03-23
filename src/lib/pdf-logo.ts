/**
 * Moxie Management — Logo loader for PDF generation
 *
 * Loads the company logo from /moxie-logo.png and caches it as base64
 * for embedding in jsPDF documents. Falls back gracefully if not found.
 */

let cachedLogo: string | null = null;

/**
 * Load the Moxie Management logo as a base64 data URL.
 * Caches after first load. Returns null if logo file not available.
 */
export async function loadLogoBase64(): Promise<string | null> {
  if (cachedLogo !== null) return cachedLogo;

  try {
    const res = await fetch("/moxie-logo.png");
    if (!res.ok) {
      cachedLogo = "";
      return null;
    }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogo = reader.result as string;
        resolve(cachedLogo);
      };
      reader.onerror = () => {
        cachedLogo = "";
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    cachedLogo = "";
    return null;
  }
}

/**
 * Moxie Management — Logo loader for PDF generation
 *
 * Checks localStorage for a custom-uploaded logo URL first, then falls
 * back to /moxie-logo.png. Caches after first load.
 */

let cachedLogo: string | null = null;

/** Call after uploading a new Moxie logo so the next PDF picks it up. */
export function invalidateLogoCache(): void {
  cachedLogo = null;
}

/**
 * Load the Moxie Management logo as a base64 data URL.
 * Caches after first load. Returns null if no logo is available.
 */
export async function loadLogoBase64(): Promise<string | null> {
  if (cachedLogo !== null) return cachedLogo || null;

  const storedUrl =
    typeof window !== "undefined" ? localStorage.getItem("moxie_logo_url") : null;

  // If stored value is already a data URL, return it directly.
  if (storedUrl?.startsWith("data:")) {
    cachedLogo = storedUrl;
    return cachedLogo;
  }

  const logoSrc = storedUrl || "/moxie-logo.png";

  try {
    const res = await fetch(logoSrc);
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

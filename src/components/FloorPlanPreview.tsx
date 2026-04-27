"use client";

export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.startsWith("data:application/pdf");
}

type Props = {
  url: string;
  alt?: string;
  className?: string;
};

export function FloorPlanPreview({ url, alt = "Floor plan", className = "" }: Props) {
  if (isPdfUrl(url)) {
    return (
      <object
        data={`${url}#toolbar=0&navpanes=0`}
        type="application/pdf"
        className={className}
        aria-label={alt}
      >
        <a href={url} target="_blank" rel="noreferrer" className="text-accent underline text-sm">
          Open PDF in new tab
        </a>
      </object>
    );
  }
  return <img src={url} alt={alt} className={className} />;
}

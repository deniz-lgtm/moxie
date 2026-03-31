"use client";

import { useRef, useEffect, useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";

interface PanoramaViewerProps {
  imageUrl: string;
  className?: string;
  onRemove?: () => void;
}

/**
 * Interactive 360 panorama viewer using Pannellum.
 * Displays an equirectangular JPEG with pan/zoom/drag controls.
 * Loaded client-side only (requires DOM + WebGL).
 */
export function PanoramaViewer({ imageUrl, className = "", onRemove }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    async function initViewer() {
      // Dynamically load pannellum CSS
      if (!document.querySelector('link[href*="pannellum"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/pannellum/pannellum.css";
        document.head.appendChild(link);
      }

      // Dynamically load pannellum JS
      if (!(window as any).pannellum) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/pannellum/pannellum.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load pannellum"));
          document.head.appendChild(script);
        });
      }

      if (destroyed || !containerRef.current) return;

      const pannellum = (window as any).pannellum;
      viewerRef.current = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: imageUrl,
        autoLoad: true,
        autoRotate: 2,
        hfov: 100,
        showControls: false,
        mouseZoom: true,
        draggable: true,
        friction: 0.15,
        compass: false,
      });

      viewerRef.current.on("load", () => {
        if (!destroyed) setIsLoaded(true);
      });
    }

    initViewer().catch(console.error);

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch { /* noop */ }
        viewerRef.current = null;
      }
    };
  }, [imageUrl]);

  const toggleFullscreen = () => setIsFullscreen((f) => !f);

  const wrapperClass = isFullscreen
    ? "fixed inset-0 z-50 bg-black"
    : `relative rounded-lg overflow-hidden ${className}`;

  return (
    <div className={wrapperClass}>
      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-lg">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-2" />
            <p className="text-white/50 text-xs">Loading 360 view...</p>
          </div>
        </div>
      )}

      {/* Pannellum container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: isFullscreen ? "100vh" : "200px" }}
      />

      {/* Overlay controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
        <button
          onClick={toggleFullscreen}
          className="w-7 h-7 bg-black/60 backdrop-blur rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
        >
          {isFullscreen ? (
            <Minimize2 size={14} className="text-white" />
          ) : (
            <Maximize2 size={14} className="text-white" />
          )}
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            className="w-7 h-7 bg-red-500/80 backdrop-blur rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
          >
            <X size={14} className="text-white" />
          </button>
        )}
      </div>

      {/* Label */}
      <div className="absolute bottom-2 left-2 z-10">
        <span className="text-[10px] bg-blue-600/80 text-white px-2 py-0.5 rounded-full font-medium backdrop-blur">
          360° Room Overview
        </span>
      </div>
    </div>
  );
}

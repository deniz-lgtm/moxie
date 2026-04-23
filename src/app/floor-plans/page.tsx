"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { validateImage, compressImage, isHeicFile, convertHeicToJpeg } from "@/lib/image-utils";
import type { Unit } from "@/lib/types";

type FloorPlan = {
  id: string;
  property_name: string;
  unit_id: string | null;
  unit_name: string;
  label: string;
  storage_url: string;
  created_at: string;
};

export default function FloorPlansPage() {
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [label, setLabel] = useState("Floor Plan");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [fpRes, unitsRes] = await Promise.all([
          fetch("/api/floor-plans").then((r) => r.json()),
          fetch("/api/appfolio/units").then((r) => r.json()),
        ]);
        setFloorPlans(fpRes.floor_plans || []);
        setUnits(unitsRes.units || []);
      } catch (err) {
        console.error("[FloorPlans] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImage(file);
    if (!validation.valid) {
      setUploadError(validation.error || "Invalid file");
      return;
    }
    setUploadError(null);

    try {
      let dataUrl: string;
      if (isHeicFile(file)) {
        const converted = await convertHeicToJpeg(file);
        if (converted.startsWith("blob:")) {
          const resp = await fetch(converted);
          const blob = await resp.blob();
          dataUrl = await compressImage(new File([blob], "plan.jpg", { type: "image/jpeg" }), 1920, 0.85);
          URL.revokeObjectURL(converted);
        } else {
          dataUrl = converted;
        }
      } else {
        dataUrl = await compressImage(file, 1920, 0.85);
      }
      setPendingDataUrl(dataUrl);
      setPreviewUrl(dataUrl);
    } catch {
      setUploadError("Failed to process image. Please try again.");
    }
  }

  async function handleUpload() {
    if (!pendingDataUrl || !selectedUnitId || !selectedProperty) {
      setUploadError("Please select a unit and image.");
      return;
    }

    const unit = units.find((u) => u.id === selectedUnitId);
    if (!unit) return;

    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/floor-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: pendingDataUrl,
          propertyName: unit.propertyName,
          unitId: unit.id,
          unitName: unit.unitName || unit.displayName,
          label,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Upload failed");
        return;
      }
      setFloorPlans((prev) => [data.floor_plan, ...prev]);
      setShowUpload(false);
      setSelectedProperty("");
      setSelectedUnitId("");
      setLabel("Floor Plan");
      setPreviewUrl(null);
      setPendingDataUrl(null);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/floor-plans?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setFloorPlans((prev) => prev.filter((fp) => fp.id !== id));
    }
    setDeleteConfirm(null);
  }

  const propertyNames = [...new Set(floorPlans.map((fp) => fp.property_name))].sort();
  const filteredUnits = selectedProperty ? units.filter((u) => u.propertyName === selectedProperty) : [];

  let displayed = floorPlans;
  if (propertyFilter !== "all") displayed = displayed.filter((fp) => fp.property_name === propertyFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    displayed = displayed.filter(
      (fp) => fp.unit_name.toLowerCase().includes(q) || fp.property_name.toLowerCase().includes(q) || fp.label.toLowerCase().includes(q)
    );
  }

  // Group by property
  const byProperty = displayed.reduce<Record<string, FloorPlan[]>>((acc, fp) => {
    if (!acc[fp.property_name]) acc[fp.property_name] = [];
    acc[fp.property_name].push(fp);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inspections" className="text-xs font-medium text-accent hover:underline">
            &larr; Inspections
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Floor Plans Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-load floor plans by unit — they auto-populate during move-out inspections so inspectors don&apos;t need to upload on site.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="shrink-0 min-h-[44px] px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 transition-colors shadow-sm"
        >
          + Upload Floor Plan
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Upload Floor Plan</h2>
            <button onClick={() => { setShowUpload(false); setPreviewUrl(null); setPendingDataUrl(null); setUploadError(null); }} className="text-muted-foreground hover:text-foreground text-xs">
              Cancel
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Property *</label>
              <select
                value={selectedProperty}
                onChange={(e) => { setSelectedProperty(e.target.value); setSelectedUnitId(""); }}
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 min-h-[44px] bg-card focus:border-accent focus:ring-1 focus:ring-accent/20"
              >
                <option value="">Select property...</option>
                {[...new Set(units.map((u) => u.propertyName))].sort().map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Unit *</label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                disabled={!selectedProperty}
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 min-h-[44px] bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 disabled:opacity-40"
              >
                <option value="">{selectedProperty ? "Select unit..." : "Select property first"}</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.unitName || u.displayName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Floor Plan, Unit Layout, 2BR"
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 min-h-[44px] bg-card focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Image *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[44px] px-3 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors"
              >
                {previewUrl ? "Replace image" : "Choose image"}
              </button>
            </div>
          </div>

          {previewUrl && (
            <div className="rounded-xl border border-border overflow-hidden max-h-64">
              <img src={previewUrl} alt="Preview" className="w-full object-contain max-h-64 bg-muted/30" />
            </div>
          )}

          {uploadError && (
            <p className="text-sm text-red-500">{uploadError}</p>
          )}

          <button
            onClick={handleUpload}
            disabled={!pendingDataUrl || !selectedUnitId || uploading}
            className="min-h-[44px] px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {uploading ? "Uploading..." : "Save Floor Plan"}
          </button>
        </div>
      )}

      {/* Filters */}
      {floorPlans.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search unit or property..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] text-sm border border-border rounded-xl px-3.5 py-2.5 min-h-[44px] bg-card focus:border-accent focus:ring-1 focus:ring-accent/20"
          />
          {propertyNames.length > 1 && (
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="text-sm border border-border rounded-xl px-3 py-2.5 min-h-[44px] bg-card focus:border-accent focus:ring-1 focus:ring-accent/20"
            >
              <option value="all">All Properties</option>
              {propertyNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-muted-foreground">{displayed.length} plan{displayed.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
              <div className="aspect-[4/3] bg-muted rounded-lg mb-3" />
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
          <p className="text-sm font-semibold">No floor plans yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Upload floor plans for each unit. They&apos;ll auto-load when inspectors start a move-out inspection.
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 transition-colors shadow-sm"
          >
            + Upload First Floor Plan
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byProperty).map(([propertyName, plans]) => (
            <div key={propertyName}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{propertyName}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {plans.map((fp) => (
                  <div key={fp.id} className="bg-card rounded-xl border border-border overflow-hidden group" style={{ boxShadow: "var(--shadow-sm)" }}>
                    <a href={fp.storage_url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-muted/30 overflow-hidden">
                      <img
                        src={fp.storage_url}
                        alt={fp.label}
                        className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                      />
                    </a>
                    <div className="p-3">
                      <p className="text-sm font-medium truncate">{fp.unit_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{fp.label}</p>
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(fp.created_at).toLocaleDateString()}
                        </p>
                        {deleteConfirm === fp.id ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(fp.id)} className="text-xs font-medium text-red-600 hover:underline">
                              Confirm
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-xs text-muted-foreground hover:underline">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(fp.id)}
                            className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors p-1"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

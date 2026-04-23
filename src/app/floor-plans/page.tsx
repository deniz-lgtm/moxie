"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

type BulkFile = {
  id: string;
  file: File;
  previewUrl: string;
  dataUrl: string | null;
  filenameBase: string;
  matchedUnit: Unit | null;
  matchConfidence: "high" | "low" | null;
  selectedUnitId: string;
  label: string;
  status: "pending" | "processing" | "uploading" | "done" | "error";
  error?: string;
};

// Normalize a string for fuzzy matching: lowercase, strip extension, replace
// hyphens/underscores/dots with spaces, collapse whitespace.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[^.]+$/, "")       // strip file extension
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchUnitToFilename(
  filename: string,
  units: Unit[]
): { unit: Unit | null; confidence: "high" | "low" | null } {
  const norm = normalizeForMatch(filename);

  // Exact match first
  for (const u of units) {
    const uNorm = normalizeForMatch(u.unitName || u.displayName);
    if (uNorm === norm || norm.includes(uNorm) || uNorm.includes(norm)) {
      return { unit: u, confidence: "high" };
    }
  }

  // Word-overlap scoring
  const filenameWords = norm.split(" ").filter((w) => w.length > 2);
  if (filenameWords.length === 0) return { unit: null, confidence: null };

  let bestUnit: Unit | null = null;
  let bestScore = 0;

  for (const u of units) {
    const uNorm = normalizeForMatch(u.unitName || u.displayName);
    const unitWords = uNorm.split(" ").filter((w) => w.length > 2);
    const matches = filenameWords.filter(
      (w) => unitWords.includes(w) || uNorm.includes(w)
    ).length;
    const score = matches / Math.max(filenameWords.length, unitWords.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestUnit = u;
    }
  }

  if (bestScore >= 0.4) return { unit: bestUnit, confidence: "low" };
  return { unit: null, confidence: null };
}

export default function FloorPlansPage() {
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Single upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [label, setLabel] = useState("Floor Plan");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk upload state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);

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

  // ── Single upload ──────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      const validation = validateImage(file);
      if (!validation.valid) { setUploadError(validation.error || "Invalid file"); return; }
    }
    setUploadError(null);
    try {
      const dataUrl = await processImageFile(file);
      setPendingDataUrl(dataUrl);
      setPreviewUrl(isPdf ? null : dataUrl);
    } catch { setUploadError("Failed to process file."); }
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
      const fp = await uploadFloorPlan(pendingDataUrl, unit, label);
      setFloorPlans((prev) => [fp, ...prev]);
      resetSingleForm();
    } catch (e: any) {
      setUploadError(e.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function resetSingleForm() {
    setShowUpload(false);
    setSelectedProperty("");
    setSelectedUnitId("");
    setLabel("Floor Plan");
    setPreviewUrl(null);
    setPendingDataUrl(null);
  }

  // ── Bulk upload ────────────────────────────────────

  async function processImageFile(file: File): Promise<string> {
    // PDFs: read directly as base64 data URL, no compression
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read PDF"));
        reader.readAsDataURL(file);
      });
    }
    if (isHeicFile(file)) {
      const converted = await convertHeicToJpeg(file);
      if (converted.startsWith("blob:")) {
        const resp = await fetch(converted);
        const blob = await resp.blob();
        const dataUrl = await compressImage(new File([blob], "plan.jpg", { type: "image/jpeg" }), 1920, 0.85);
        URL.revokeObjectURL(converted);
        return dataUrl;
      }
      return converted;
    }
    return compressImage(file, 1920, 0.85);
  }

  async function uploadFloorPlan(dataUrl: string, unit: Unit, lbl: string): Promise<FloorPlan> {
    const res = await fetch("/api/floor-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        propertyName: unit.propertyName,
        unitId: unit.id,
        unitName: unit.unitName || unit.displayName,
        label: lbl,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.floor_plan;
  }

  const processBulkFiles = useCallback(
    async (files: File[]) => {
      const newEntries: BulkFile[] = files.map((file) => {
        const filenameBase = file.name.replace(/\.[^.]+$/, "");
        const { unit, confidence } = matchUnitToFilename(file.name, units);
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl: isPdf ? "" : URL.createObjectURL(file),
          dataUrl: null,
          filenameBase,
          matchedUnit: unit,
          matchConfidence: confidence,
          selectedUnitId: unit?.id || "",
          label: "Floor Plan",
          status: "processing" as const,
        };
      });

      setBulkFiles((prev) => [...prev, ...newEntries]);

      // Compress images in the background
      for (const entry of newEntries) {
        try {
          const dataUrl = await processImageFile(entry.file);
          setBulkFiles((prev) =>
            prev.map((bf) =>
              bf.id === entry.id ? { ...bf, dataUrl, previewUrl: dataUrl, status: "pending" } : bf
            )
          );
        } catch {
          setBulkFiles((prev) =>
            prev.map((bf) =>
              bf.id === entry.id ? { ...bf, status: "error", error: "Failed to process image" } : bf
            )
          );
        }
      }
    },
    [units] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleBulkFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processBulkFiles(files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        /heic|heif|\.pdf$/i.test(f.name)
    );
    if (files.length) processBulkFiles(files);
  }

  async function uploadAll() {
    const toUpload = bulkFiles.filter(
      (bf) => bf.status === "pending" && bf.dataUrl && bf.selectedUnitId
    );
    if (toUpload.length === 0) return;

    setBulkUploading(true);
    setBulkProgress(0);
    let done = 0;

    for (const bf of toUpload) {
      const unit = units.find((u) => u.id === bf.selectedUnitId);
      if (!unit || !bf.dataUrl) {
        setBulkFiles((prev) =>
          prev.map((b) => (b.id === bf.id ? { ...b, status: "error", error: "No unit assigned" } : b))
        );
        done++;
        setBulkProgress(Math.round((done / toUpload.length) * 100));
        continue;
      }

      setBulkFiles((prev) =>
        prev.map((b) => (b.id === bf.id ? { ...b, status: "uploading" } : b))
      );

      try {
        const fp = await uploadFloorPlan(bf.dataUrl, unit, bf.label);
        setFloorPlans((prev) => [fp, ...prev]);
        setBulkFiles((prev) =>
          prev.map((b) => (b.id === bf.id ? { ...b, status: "done" } : b))
        );
      } catch (err: any) {
        setBulkFiles((prev) =>
          prev.map((b) => (b.id === bf.id ? { ...b, status: "error", error: err.message } : b))
        );
      }

      done++;
      setBulkProgress(Math.round((done / toUpload.length) * 100));
    }

    setBulkUploading(false);
  }

  function closeBulk() {
    // Revoke any object URLs we created
    bulkFiles.forEach((bf) => {
      if (bf.previewUrl.startsWith("blob:")) URL.revokeObjectURL(bf.previewUrl);
    });
    setBulkFiles([]);
    setShowBulk(false);
    setBulkProgress(0);
  }

  // ── Filtering ──────────────────────────────────────

  const propertyNames = [...new Set(floorPlans.map((fp) => fp.property_name))].sort();
  const filteredUnits = selectedProperty ? units.filter((u) => u.propertyName === selectedProperty) : [];

  let displayed = floorPlans;
  if (propertyFilter !== "all") displayed = displayed.filter((fp) => fp.property_name === propertyFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    displayed = displayed.filter(
      (fp) =>
        fp.unit_name.toLowerCase().includes(q) ||
        fp.property_name.toLowerCase().includes(q) ||
        fp.label.toLowerCase().includes(q)
    );
  }

  const byProperty = displayed.reduce<Record<string, FloorPlan[]>>((acc, fp) => {
    if (!acc[fp.property_name]) acc[fp.property_name] = [];
    acc[fp.property_name].push(fp);
    return acc;
  }, {});

  async function handleDelete(id: string) {
    await fetch(`/api/floor-plans?id=${id}`, { method: "DELETE" });
    setFloorPlans((prev) => prev.filter((fp) => fp.id !== id));
    setDeleteConfirm(null);
  }

  const pendingCount = bulkFiles.filter((bf) => bf.status === "pending" && bf.selectedUnitId).length;
  const unassignedCount = bulkFiles.filter((bf) => bf.status === "pending" && !bf.selectedUnitId).length;
  const doneCount = bulkFiles.filter((bf) => bf.status === "done").length;

  // ── Render ─────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inspections" className="text-xs font-medium text-accent hover:underline">
            &larr; Inspections
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Floor Plans Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-load floor plans by unit — they auto-populate during move-out inspections.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setShowBulk(true); setShowUpload(false); }}
            className="min-h-[44px] px-4 py-2.5 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors"
          >
            Bulk Upload
          </button>
          <button
            onClick={() => { setShowUpload(true); setShowBulk(false); }}
            className="min-h-[44px] px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 transition-colors shadow-sm"
          >
            + Upload
          </button>
        </div>
      </div>

      {/* ── Bulk Upload Panel ── */}
      {showBulk && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Bulk Upload</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Drop multiple floor plans — the app tries to match filenames to units automatically.
              </p>
            </div>
            <button onClick={closeBulk} className="text-xs text-muted-foreground hover:text-foreground min-h-[44px] px-3">
              Close
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`mx-6 mt-4 border-2 border-dashed rounded-xl text-center py-8 transition-colors cursor-pointer ${
              dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-muted/30"
            }`}
            onClick={() => bulkInputRef.current?.click()}
          >
            <input
              ref={bulkInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif,application/pdf,.pdf"
              className="hidden"
              onChange={handleBulkFileInput}
            />
            <p className="text-sm font-medium">
              {dragOver ? "Drop files here" : "Drag & drop files, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, HEIC, PDF — name files after the unit (e.g. "1234 Figueroa.pdf") for auto-matching
            </p>
          </div>

          {/* File list */}
          {bulkFiles.length > 0 && (
            <div className="px-6 pb-6 mt-4 space-y-3">
              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{bulkFiles.length} file{bulkFiles.length !== 1 ? "s" : ""}</span>
                {unassignedCount > 0 && (
                  <span className="text-amber-600 font-medium">{unassignedCount} need{unassignedCount === 1 ? "s" : ""} unit assignment</span>
                )}
                {doneCount > 0 && (
                  <span className="text-green-600 font-medium">{doneCount} uploaded</span>
                )}
              </div>

              {/* Per-file rows */}
              {bulkFiles.map((bf) => {
                const unit = units.find((u) => u.id === bf.selectedUnitId);
                const propName = unit?.propertyName || "";
                const propUnits = propName ? units.filter((u) => u.propertyName === propName) : units;

                return (
                  <div
                    key={bf.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${
                      bf.status === "done"
                        ? "border-green-200 bg-green-50/40"
                        : bf.status === "error"
                        ? "border-red-200 bg-red-50/30"
                        : bf.matchedUnit && bf.selectedUnitId
                        ? "border-border bg-card"
                        : "border-amber-200 bg-amber-50/30"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-14 rounded-lg border border-border overflow-hidden shrink-0 bg-muted/30 flex items-center justify-center">
                      {bf.previewUrl ? (
                        <img src={bf.previewUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold text-red-500">PDF</span>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-medium truncate max-w-[180px]">{bf.filenameBase}</p>
                        {bf.status === "processing" && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Processing…</span>
                        )}
                        {bf.matchConfidence === "high" && bf.status !== "done" && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Auto-matched</span>
                        )}
                        {bf.matchConfidence === "low" && bf.status !== "done" && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Low confidence</span>
                        )}
                        {!bf.matchedUnit && bf.status === "pending" && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Needs assignment</span>
                        )}
                        {bf.status === "done" && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓ Uploaded</span>
                        )}
                        {bf.status === "uploading" && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Uploading…</span>
                        )}
                        {bf.status === "error" && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{bf.error || "Error"}</span>
                        )}
                      </div>

                      {bf.status !== "done" && bf.status !== "uploading" && (
                        <div className="flex gap-2 flex-wrap">
                          {/* Property selector */}
                          <select
                            value={unit?.propertyName || ""}
                            onChange={(e) => {
                              setBulkFiles((prev) =>
                                prev.map((b) => b.id === bf.id ? { ...b, selectedUnitId: "" } : b)
                              );
                            }}
                            className="text-xs border border-border rounded-lg px-2 py-1.5 min-h-[34px] bg-card"
                          >
                            <option value="">Property…</option>
                            {[...new Set(units.map((u) => u.propertyName))].sort().map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>

                          {/* Unit selector */}
                          <select
                            value={bf.selectedUnitId}
                            onChange={(e) =>
                              setBulkFiles((prev) =>
                                prev.map((b) => b.id === bf.id ? { ...b, selectedUnitId: e.target.value, matchedUnit: units.find((u) => u.id === e.target.value) || null } : b)
                              )
                            }
                            className={`text-xs border rounded-lg px-2 py-1.5 min-h-[34px] bg-card flex-1 min-w-[120px] ${
                              !bf.selectedUnitId ? "border-amber-300" : "border-border"
                            }`}
                          >
                            <option value="">Assign unit…</option>
                            {(unit?.propertyName
                              ? units.filter((u) => u.propertyName === unit.propertyName)
                              : units
                            ).map((u) => (
                              <option key={u.id} value={u.id}>{u.unitName || u.displayName}</option>
                            ))}
                          </select>

                          {/* Label */}
                          <input
                            type="text"
                            value={bf.label}
                            onChange={(e) =>
                              setBulkFiles((prev) =>
                                prev.map((b) => b.id === bf.id ? { ...b, label: e.target.value } : b)
                              )
                            }
                            className="text-xs border border-border rounded-lg px-2 py-1.5 min-h-[34px] bg-card w-28"
                            placeholder="Label"
                          />

                          {/* Remove */}
                          <button
                            onClick={() =>
                              setBulkFiles((prev) => prev.filter((b) => b.id !== bf.id))
                            }
                            className="text-xs text-muted-foreground/50 hover:text-red-500 min-h-[34px] px-2"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Upload all button */}
              {pendingCount > 0 && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={uploadAll}
                    disabled={bulkUploading}
                    className="min-h-[44px] px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {bulkUploading
                      ? `Uploading… ${bulkProgress}%`
                      : `Upload ${pendingCount} Floor Plan${pendingCount !== 1 ? "s" : ""}`}
                  </button>
                  {unassignedCount > 0 && (
                    <p className="text-xs text-amber-600">
                      {unassignedCount} file{unassignedCount !== 1 ? "s" : ""} without a unit will be skipped
                    </p>
                  )}
                </div>
              )}
              {bulkUploading && (
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${bulkProgress}%` }}
                  />
                </div>
              )}
              {doneCount > 0 && doneCount === bulkFiles.filter((bf) => bf.status !== "error").length && !bulkUploading && (
                <div className="flex items-center justify-between py-2 px-3 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-sm text-green-800 font-medium">All uploads complete!</p>
                  <button onClick={closeBulk} className="text-xs font-medium text-green-700 hover:underline min-h-[40px] px-2">
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Single Upload Form ── */}
      {showUpload && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Upload Floor Plan</h2>
            <button onClick={() => { setShowUpload(false); setPreviewUrl(null); setPendingDataUrl(null); setUploadError(null); }} className="text-muted-foreground hover:text-foreground text-xs min-h-[40px] px-2">
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
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">File *</label>
              <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif,application/pdf,.pdf" className="hidden" onChange={handleFileSelect} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[44px] px-3 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors"
              >
                {pendingDataUrl ? "Replace file" : "Choose image or PDF"}
              </button>
            </div>
          </div>

          {previewUrl ? (
            <div className="rounded-xl border border-border overflow-hidden max-h-64">
              <img src={previewUrl} alt="Preview" className="w-full object-contain max-h-64 bg-muted/30" />
            </div>
          ) : pendingDataUrl ? (
            <div className="rounded-xl border border-border bg-muted/20 flex items-center gap-3 px-4 py-3">
              <span className="text-2xl font-bold text-red-500">PDF</span>
              <span className="text-sm text-muted-foreground">PDF file ready to upload</span>
            </div>
          ) : null}

          {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

          <button
            onClick={handleUpload}
            disabled={!pendingDataUrl || !selectedUnitId || uploading}
            className="min-h-[44px] px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {uploading ? "Uploading..." : "Save Floor Plan"}
          </button>
        </div>
      )}

      {/* ── Filters ── */}
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

      {/* ── Floor Plans Grid ── */}
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
            Upload floor plans for each unit. They auto-load when inspectors start a move-out inspection.
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => setShowBulk(true)}
              className="px-4 py-2 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors"
            >
              Bulk Upload
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 transition-colors shadow-sm"
            >
              + Upload First Floor Plan
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byProperty).map(([propertyName, plans]) => (
            <div key={propertyName}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{propertyName}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {plans.map((fp) => (
                  <div key={fp.id} className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
                    <a href={fp.storage_url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-muted/30 overflow-hidden flex items-center justify-center">
                      {fp.storage_url.toLowerCase().endsWith(".pdf") ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-3xl font-extrabold text-red-500">PDF</span>
                          <span className="text-xs text-muted-foreground">Click to open</span>
                        </div>
                      ) : (
                        <img
                          src={fp.storage_url}
                          alt={fp.label}
                          className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                        />
                      )}
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
                            <button onClick={() => handleDelete(fp.id)} className="text-xs font-medium text-red-600 hover:underline">Confirm</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
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

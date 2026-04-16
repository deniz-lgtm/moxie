"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, ChevronRight, ChevronLeft, Plus, X, Image, RotateCcw, Loader2, Globe } from "lucide-react";
import { validateImage, compressImage, compressDataUrl, isHeicFile, convertHeicToJpeg, validatePanorama, compressPanorama, isLikelyEquirectangular, stampPhoto } from "@/lib/image-utils";
import { PanoramaViewer } from "@/components/PanoramaViewer";

export interface CameraPhoto {
  id: string;
  url: string;
  timestamp: string;
  aiAnalysis?: {
    item: string;
    condition: string;
    description: string;
    estimatedCost: number;
  } | null;
}

export interface CameraRoom {
  id: string;
  name: string;
  photos: CameraPhoto[];
  notes: string;
  panoramaUrl?: string | null;
}

interface InspectionCameraProps {
  rooms: CameraRoom[];
  onRoomsChange: (rooms: CameraRoom[]) => void;
  onComplete: (rooms: CameraRoom[]) => void;
  onCancel?: () => void;
  title?: string;
  allowAddRoom?: boolean;
  showNotes?: boolean;
  enableAiAnalysis?: boolean;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * TruePic Vision-style guided camera flow.
 * Shows one room at a time with a large camera viewfinder,
 * "Next Room" / "Previous Room" navigation, and photo gallery per room.
 */
export function InspectionCamera({
  rooms,
  onRoomsChange,
  onComplete,
  onCancel,
  title = "Inspection Walk",
  allowAddRoom = true,
  showNotes = true,
  enableAiAnalysis = false,
}: InspectionCameraProps) {
  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panoramaInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Track pending stream so we can assign it after video element renders
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const [showPanoramaViewer, setShowPanoramaViewer] = useState(false);

  const currentRoom = rooms[currentRoomIdx];
  const isLastRoom = currentRoomIdx === rooms.length - 1;
  const isFirstRoom = currentRoomIdx === 0;
  const totalPhotos = rooms.reduce((sum, r) => sum + r.photos.length, 0);

  // When isCapturing becomes true and we have a pending stream, assign it to the video element
  useEffect(() => {
    if (isCapturing && pendingStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = pendingStreamRef.current;
      pendingStreamRef.current = null;
    }
  }, [isCapturing]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      // Store stream and set capturing — the useEffect above will assign srcObject after render
      pendingStreamRef.current = stream;
      setIsCapturing(true);
    } catch {
      // Camera not available — fall back to file upload
      fileInputRef.current?.click();
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    pendingStreamRef.current = null;
    setIsCapturing(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // AI analysis for a photo
  async function analyzePhotoWithAI(photoUrl: string, roomName: string): Promise<CameraPhoto["aiAnalysis"]> {
    try {
      const res = await fetch("/api/inspections/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: photoUrl, roomName, itemName: "auto-detect" }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.condition) {
        return {
          item: data.detected_item || `${roomName} - Detected Issue`,
          condition: data.condition,
          description: data.description || "",
          estimatedCost: data.total_estimated_cost || 0,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Capture photo from camera (capped at 1920px width), then burn a time/room
  // stamp into the image so the timestamp travels with the file.
  async function capturePhoto() {
    if (!videoRef.current || !canvasRef.current || !currentRoom) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Cap resolution to 1920px width
    const maxWidth = 1920;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const rawDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    try {
      const stamped = await stampPhoto(rawDataUrl, {
        label: "Moxie Management",
        secondary: currentRoom.name,
      });
      addPhotoToRoom(stamped);
    } catch {
      // If stamping fails for any reason, fall back to the raw capture.
      addPhotoToRoom(rawDataUrl);
    }
  }

  // Handle file upload (gallery picker, no camera) with validation + compression + HEIC
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !currentRoom) return;
    const files = Array.from(e.target.files);
    e.target.value = "";

    for (const file of files) {
      const validation = validateImage(file);
      if (!validation.valid) {
        console.warn("[Camera] Skipping invalid file:", validation.error);
        continue;
      }
      try {
        let dataUrl: string;
        if (isHeicFile(file)) {
          const converted = await convertHeicToJpeg(file);
          if (converted.startsWith("blob:")) {
            const resp = await fetch(converted);
            const blob = await resp.blob();
            dataUrl = await compressImage(new File([blob], "photo.jpg", { type: "image/jpeg" }), 1920, 0.8);
            URL.revokeObjectURL(converted);
          } else {
            dataUrl = converted;
          }
        } else {
          dataUrl = await compressImage(file, 1920, 0.8);
        }
        // Burn timestamp + room onto the photo (uses file's lastModified if available).
        try {
          const stamped = await stampPhoto(dataUrl, {
            label: "Moxie Management",
            secondary: currentRoom.name,
            date: file.lastModified ? new Date(file.lastModified) : new Date(),
          });
          addPhotoToRoom(stamped);
        } catch {
          addPhotoToRoom(dataUrl);
        }
      } catch (err) {
        console.error("[Camera] Failed to process photo:", err);
      }
    }
  }

  // Handle 360 panorama upload
  async function handlePanoramaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !currentRoom) return;
    const file = e.target.files[0];
    e.target.value = "";

    const validation = validatePanorama(file);
    if (!validation.valid) {
      console.warn("[Camera] Invalid panorama:", validation.error);
      return;
    }

    try {
      const dataUrl = await compressPanorama(file);

      // Check aspect ratio to warn if it doesn't look like a 360 photo
      const img = new window.Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = dataUrl;
      });

      if (!isLikelyEquirectangular(img.width, img.height)) {
        const proceed = window.confirm(
          "This image doesn't appear to be a 360 photo (expected ~2:1 aspect ratio). Upload anyway?"
        );
        if (!proceed) return;
      }

      const updated = rooms.map((r, i) =>
        i === currentRoomIdx ? { ...r, panoramaUrl: dataUrl } : r
      );
      onRoomsChange(updated);
    } catch (err) {
      console.error("[Camera] Failed to process panorama:", err);
    }
  }

  function removePanorama() {
    const updated = rooms.map((r, i) =>
      i === currentRoomIdx ? { ...r, panoramaUrl: null } : r
    );
    onRoomsChange(updated);
    setShowPanoramaViewer(false);
  }

  function addPhotoToRoom(url: string) {
    const photo: CameraPhoto = {
      id: newId(),
      url,
      timestamp: new Date().toISOString(),
      aiAnalysis: null,
    };
    const updated = rooms.map((r, i) =>
      i === currentRoomIdx ? { ...r, photos: [...r.photos, photo] } : r
    );
    onRoomsChange(updated);
    // AI analysis is deferred — runs in batch when the walk is finished
  }

  // Batch analyze all photos across all rooms, then call onComplete
  async function batchAnalyzeAndComplete() {
    if (!enableAiAnalysis) {
      onComplete(rooms);
      return;
    }

    setIsBatchAnalyzing(true);
    const photosToAnalyze: { roomIdx: number; photoIdx: number; url: string; roomName: string }[] = [];
    rooms.forEach((room, ri) => {
      room.photos.forEach((photo, pi) => {
        if (!photo.aiAnalysis) {
          photosToAnalyze.push({ roomIdx: ri, photoIdx: pi, url: photo.url, roomName: room.name });
        }
      });
    });

    setAnalyzingCount(photosToAnalyze.length);
    let updatedRooms = [...rooms.map((r) => ({ ...r, photos: [...r.photos] }))];

    // Analyze in parallel batches of 3
    const batchSize = 3;
    for (let i = 0; i < photosToAnalyze.length; i += batchSize) {
      const batch = photosToAnalyze.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(({ url, roomName }) => analyzePhotoWithAI(url, roomName))
      );
      results.forEach((analysis, j) => {
        const { roomIdx, photoIdx } = batch[j];
        if (analysis) {
          updatedRooms[roomIdx].photos[photoIdx] = {
            ...updatedRooms[roomIdx].photos[photoIdx],
            aiAnalysis: analysis,
          };
        }
      });
      setAnalyzingCount((c) => c - batch.length);
      onRoomsChange(updatedRooms.map((r) => ({ ...r })));
    }

    setIsBatchAnalyzing(false);
    setAnalyzingCount(0);
    onComplete(updatedRooms);
  }

  function removePhoto(photoId: string) {
    const updated = rooms.map((r, i) =>
      i === currentRoomIdx
        ? { ...r, photos: r.photos.filter((p) => p.id !== photoId) }
        : r
    );
    onRoomsChange(updated);
  }

  function updateRoomNotes(notes: string) {
    const updated = rooms.map((r, i) =>
      i === currentRoomIdx ? { ...r, notes } : r
    );
    onRoomsChange(updated);
  }

  function goToNextRoom() {
    stopCamera();
    setShowPanoramaViewer(false);
    if (isLastRoom) {
      batchAnalyzeAndComplete();
    } else {
      setCurrentRoomIdx((i) => i + 1);
    }
  }

  function goToPrevRoom() {
    stopCamera();
    setShowPanoramaViewer(false);
    if (!isFirstRoom) setCurrentRoomIdx((i) => i - 1);
  }

  function addNewRoom() {
    if (!newRoomName.trim()) return;
    const newRoom: CameraRoom = {
      id: newId(),
      name: newRoomName.trim(),
      photos: [],
      notes: "",
      panoramaUrl: null,
    };
    onRoomsChange([...rooms, newRoom]);
    setNewRoomName("");
    setShowAddRoom(false);
    setCurrentRoomIdx(rooms.length);
  }

  if (!currentRoom) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col overscroll-contain touch-manipulation"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Hidden elements */}
      <canvas ref={canvasRef} className="hidden" />
      {/* File input WITHOUT capture attribute — opens gallery/file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />
      {/* 360 panorama file input */}
      <input
        ref={panoramaInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePanoramaUpload}
        className="hidden"
      />

      {/* Top bar — large tap targets for mobile */}
      <div className="bg-black/80 backdrop-blur-sm px-3 py-2.5 flex items-center justify-between text-white">
        <button
          onClick={() => { stopCamera(); onCancel?.(); }}
          disabled={isBatchAnalyzing}
          className="text-white/80 hover:text-white text-sm flex items-center gap-1 px-2 py-2 -ml-2 min-h-[44px] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <X size={20} /> <span className="hidden sm:inline">Exit</span>
        </button>
        <div className="text-center min-w-0 flex-1 px-2">
          <p className="text-[10px] text-white/60 uppercase tracking-wider truncate">{title}</p>
          <p className="text-[11px] text-white/40">
            Room {currentRoomIdx + 1}/{rooms.length} &middot; {totalPhotos} photo{totalPhotos !== 1 ? "s" : ""}
            {isBatchAnalyzing && analyzingCount > 0 && (
              <span className="ml-2 text-yellow-400">
                <Loader2 size={10} className="inline animate-spin mr-1" />
                {analyzingCount} left
              </span>
            )}
          </p>
        </div>
        <button
          onClick={goToNextRoom}
          className="text-sm font-semibold text-green-400 hover:text-green-300 px-2 py-2 -mr-2 min-h-[44px]"
        >
          {isLastRoom ? "Finish" : "Skip"}
        </button>
      </div>

      {/* Room name - large, prominent, mobile-tight */}
      <div className="bg-gradient-to-b from-black/80 to-transparent px-4 pt-3 pb-2 sm:pt-4 sm:pb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-white text-center">{currentRoom.name}</h2>
        <p className="text-white/50 text-center text-xs mt-0.5">
          {currentRoom.photos.length} photo{currentRoom.photos.length !== 1 ? "s" : ""} taken
          {currentRoom.panoramaUrl ? (
            <span className="ml-2 text-blue-400">· 360° captured</span>
          ) : null}
        </p>
      </div>

      {/* Camera viewfinder / Photo area */}
      <div className="flex-1 relative overflow-hidden">
        {isCapturing ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Capture button overlay — safe-area inset on the bottom for notched phones */}
            <div
              className="absolute left-0 right-0 flex items-center justify-center gap-8 sm:gap-10"
              style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              {/* Photo count / exit capture */}
              {currentRoom.photos.length > 0 ? (
                <button
                  onClick={stopCamera}
                  className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-base font-bold border border-white/30 active:scale-95 transition-all"
                >
                  {currentRoom.photos.length}
                </button>
              ) : (
                <div className="w-14 h-14" aria-hidden />
              )}
              {/* Shutter button — bigger for thumb reach */}
              <button
                onClick={capturePhoto}
                className="w-24 h-24 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 active:scale-90 transition-all flex items-center justify-center"
                aria-label="Capture photo"
              >
                <div className="w-[72px] h-[72px] rounded-full bg-white" />
              </button>
              {/* Flip to gallery */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border border-white/30 active:scale-95 transition-all"
                aria-label="Choose from gallery"
              >
                <Image size={20} className="text-white" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-4 px-6">
            {/* 360 Panorama viewer */}
            {currentRoom.panoramaUrl && !showPanoramaViewer && (
              <button
                onClick={() => setShowPanoramaViewer(true)}
                className="w-full max-w-lg relative rounded-lg overflow-hidden border border-blue-500/30 hover:border-blue-400/50 transition-colors"
              >
                <img src={currentRoom.panoramaUrl} alt="360 panorama" className="w-full h-20 object-cover opacity-70" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="text-white text-xs font-medium bg-blue-600/80 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <Globe size={12} /> View 360° Panorama
                  </span>
                </div>
              </button>
            )}
            {currentRoom.panoramaUrl && showPanoramaViewer && (
              <div className="w-full max-w-lg h-[40vh]">
                <PanoramaViewer
                  imageUrl={currentRoom.panoramaUrl}
                  onRemove={removePanorama}
                  className="h-full"
                />
                <button
                  onClick={() => setShowPanoramaViewer(false)}
                  className="mt-1 text-white/40 text-xs hover:text-white/70 w-full text-center"
                >
                  Collapse viewer
                </button>
              </div>
            )}
            {/* Photo thumbnails grid — larger tiles on mobile for easier review */}
            {currentRoom.photos.length > 0 ? (
              <div className="w-full max-w-lg overflow-y-auto max-h-[55vh] px-2 -webkit-overflow-scrolling-touch">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {currentRoom.photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden group bg-black">
                      <img src={photo.url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1.5 right-1.5 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-md active:scale-95 transition-all"
                        aria-label="Remove photo"
                      >
                        <X size={16} className="text-white" />
                      </button>
                      {photo.aiAnalysis && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-1">
                          <p className="font-medium truncate">{photo.aiAnalysis.item}</p>
                          <p className="text-yellow-300">{photo.aiAnalysis.condition} {photo.aiAnalysis.estimatedCost > 0 ? `· $${photo.aiAnalysis.estimatedCost}` : ""}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <Camera size={48} className="text-white/30 mx-auto mb-3" />
                <p className="text-white/50 text-sm">No photos yet for {currentRoom.name}</p>
                <p className="text-white/30 text-xs mt-1">Tap the camera button or upload photos</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes area */}
      {showNotes && !isCapturing && (
        <div className="bg-gray-900 px-4 py-2 border-t border-white/10">
          <input
            type="text"
            placeholder={`Notes for ${currentRoom.name}...`}
            value={currentRoom.notes}
            onChange={(e) => updateRoomNotes(e.target.value)}
            className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 placeholder-white/30 border border-white/10 focus:border-white/30 focus:outline-none"
          />
        </div>
      )}

      {/* Bottom controls — mobile-first, big tap targets */}
      <div className="bg-black/90 backdrop-blur-sm px-3 sm:px-4 py-3 sm:py-4 space-y-2.5">
        {/* Camera / Upload buttons — only show when not capturing */}
        {!isCapturing && (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-3">
            <button
              onClick={startCamera}
              className="col-span-3 sm:col-auto flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-[#9d1535] text-white rounded-xl text-sm font-semibold hover:bg-[#b91c42] active:scale-[0.98] transition-all min-h-[48px]"
            >
              <Camera size={20} /> Open Camera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 px-3 py-3 sm:py-2.5 bg-white/10 text-white rounded-xl text-xs sm:text-sm hover:bg-white/20 active:scale-[0.98] transition-all min-h-[48px]"
            >
              <Image size={18} /> <span className="hidden xs:inline sm:inline">Gallery</span><span className="xs:hidden sm:hidden">Upload</span>
            </button>
            <button
              onClick={() => panoramaInputRef.current?.click()}
              className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-3 sm:py-2.5 bg-blue-600/30 text-blue-300 rounded-xl text-xs sm:text-sm hover:bg-blue-600/50 border border-blue-500/30 active:scale-[0.98] transition-all min-h-[48px]"
            >
              <Globe size={18} /> Upload 360°
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={goToPrevRoom}
            disabled={isFirstRoom}
            className="flex items-center gap-1 px-2.5 sm:px-4 py-2.5 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm min-h-[44px]"
          >
            <ChevronLeft size={20} /> <span className="hidden sm:inline">Previous Room</span><span className="sm:hidden">Prev</span>
          </button>

          {allowAddRoom && !isCapturing && (
            <div className="flex items-center min-w-0">
              {showAddRoom ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addNewRoom()}
                    placeholder="Room name..."
                    className="bg-white/10 text-white text-xs rounded px-2 py-1.5 w-24 sm:w-28 placeholder-white/30 border border-white/10"
                    autoFocus
                  />
                  <button onClick={addNewRoom} className="text-green-400 text-xs font-medium px-2 py-1.5">Add</button>
                  <button onClick={() => setShowAddRoom(false)} className="text-white/40 text-xs px-1 py-1.5">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddRoom(true)}
                  className="flex items-center gap-1 text-white/50 hover:text-white/80 text-[11px] sm:text-xs px-2 py-2"
                >
                  <Plus size={14} /> <span className="hidden sm:inline">Add </span>Room
                </button>
              )}
            </div>
          )}

          <button
            onClick={goToNextRoom}
            className="flex items-center gap-1 px-3 sm:px-4 py-2.5 bg-green-600 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-green-500 active:scale-[0.98] transition-all min-h-[44px]"
          >
            <span className="hidden sm:inline">{isLastRoom ? "Finish Walk" : "Next Room"}</span>
            <span className="sm:hidden">{isLastRoom ? "Finish" : "Next"}</span>
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Room dots indicator — larger taps */}
        <div className="flex justify-center gap-1.5 pt-1 flex-wrap">
          {rooms.map((room, i) => (
            <button
              key={room.id}
              onClick={() => { if (!isBatchAnalyzing) { stopCamera(); setCurrentRoomIdx(i); } }}
              className={`h-2 rounded-full transition-all ${
                i === currentRoomIdx
                  ? "w-7 bg-white"
                  : room.photos.length > 0
                  ? "w-2 bg-green-500"
                  : "w-2 bg-white/30"
              }`}
              title={`${room.name} (${room.photos.length} photos)`}
            />
          ))}
        </div>
      </div>

      {/* Batch analysis overlay */}
      {isBatchAnalyzing && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
          <Loader2 size={48} className="text-white animate-spin mb-4" />
          <h3 className="text-white text-xl font-bold">Analyzing Photos</h3>
          <p className="text-white/60 text-sm mt-2">
            {analyzingCount} photo{analyzingCount !== 1 ? "s" : ""} remaining...
          </p>
          <p className="text-white/40 text-xs mt-4">AI is detecting damage and estimating costs</p>
        </div>
      )}
    </div>
  );
}

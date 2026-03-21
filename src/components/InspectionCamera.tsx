"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, ChevronRight, ChevronLeft, Plus, X, Image, RotateCcw, Loader2 } from "lucide-react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Track pending stream so we can assign it after video element renders
  const pendingStreamRef = useRef<MediaStream | null>(null);

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

  // Capture photo from camera
  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current || !currentRoom) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    addPhotoToRoom(dataUrl);
  }

  // Handle file upload (gallery picker, no camera)
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !currentRoom) return;
    Array.from(e.target.files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        addPhotoToRoom(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function addPhotoToRoom(url: string) {
    const photoId = newId();
    const photo: CameraPhoto = {
      id: photoId,
      url,
      timestamp: new Date().toISOString(),
      aiAnalysis: null,
    };
    const updated = rooms.map((r, i) =>
      i === currentRoomIdx ? { ...r, photos: [...r.photos, photo] } : r
    );
    onRoomsChange(updated);

    // Run AI analysis in background if enabled
    if (enableAiAnalysis && currentRoom) {
      setAnalyzingCount((c) => c + 1);
      analyzePhotoWithAI(url, currentRoom.name).then((analysis) => {
        setAnalyzingCount((c) => c - 1);
        if (analysis) {
          // Update the photo with AI analysis — use functional update pattern via onRoomsChange
          onRoomsChange(
            rooms.map((r, i) =>
              i === currentRoomIdx
                ? {
                    ...r,
                    photos: [...r.photos.filter((p) => p.id !== photoId), { ...photo, aiAnalysis: analysis }],
                  }
                : r
            )
          );
        }
      });
    }
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
    if (isLastRoom) {
      onComplete(rooms);
    } else {
      setCurrentRoomIdx((i) => i + 1);
    }
  }

  function goToPrevRoom() {
    stopCamera();
    if (!isFirstRoom) setCurrentRoomIdx((i) => i - 1);
  }

  function addNewRoom() {
    if (!newRoomName.trim()) return;
    const newRoom: CameraRoom = {
      id: newId(),
      name: newRoomName.trim(),
      photos: [],
      notes: "",
    };
    onRoomsChange([...rooms, newRoom]);
    setNewRoomName("");
    setShowAddRoom(false);
    setCurrentRoomIdx(rooms.length);
  }

  if (!currentRoom) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hidden elements */}
      <canvas ref={canvasRef} className="hidden" />
      {/* File input WITHOUT capture attribute — opens gallery/file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top bar */}
      <div className="bg-black/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between text-white">
        <button
          onClick={() => { stopCamera(); onCancel?.(); }}
          className="text-white/80 hover:text-white text-sm flex items-center gap-1"
        >
          <X size={18} /> Exit
        </button>
        <div className="text-center">
          <p className="text-xs text-white/60 uppercase tracking-wider">{title}</p>
          <p className="text-xs text-white/40">
            Room {currentRoomIdx + 1} of {rooms.length} &middot; {totalPhotos} total photos
            {analyzingCount > 0 && (
              <span className="ml-2 text-yellow-400">
                <Loader2 size={10} className="inline animate-spin mr-1" />
                Analyzing {analyzingCount}...
              </span>
            )}
          </p>
        </div>
        <button
          onClick={goToNextRoom}
          className="text-sm font-medium text-green-400 hover:text-green-300"
        >
          {isLastRoom ? "Finish" : "Skip"}
        </button>
      </div>

      {/* Room name - large, prominent */}
      <div className="bg-gradient-to-b from-black/80 to-transparent px-4 py-4">
        <h2 className="text-2xl font-bold text-white text-center">{currentRoom.name}</h2>
        <p className="text-white/50 text-center text-sm mt-1">
          {currentRoom.photos.length} photo{currentRoom.photos.length !== 1 ? "s" : ""} taken
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
            {/* Capture button overlay */}
            <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-6">
              {/* Photo count badge */}
              {currentRoom.photos.length > 0 && (
                <button
                  onClick={stopCamera}
                  className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-sm font-bold border border-white/30"
                >
                  {currentRoom.photos.length}
                </button>
              )}
              {/* Shutter button */}
              <button
                onClick={capturePhoto}
                className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 active:scale-95 transition-all flex items-center justify-center"
              >
                <div className="w-14 h-14 rounded-full bg-white" />
              </button>
              {/* Flip to gallery */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border border-white/30"
              >
                <Image size={18} className="text-white" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-4 px-6">
            {/* Photo thumbnails grid */}
            {currentRoom.photos.length > 0 ? (
              <div className="w-full max-w-lg overflow-y-auto max-h-[60vh] px-2">
                <div className="grid grid-cols-3 gap-2">
                  {currentRoom.photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden group">
                      <img src={photo.url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} className="text-white" />
                      </button>
                      {photo.aiAnalysis && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-1">
                          <p className="font-medium truncate">{photo.aiAnalysis.item}</p>
                          <p className="text-yellow-300">{photo.aiAnalysis.condition} {photo.aiAnalysis.estimatedCost > 0 ? `· $${photo.aiAnalysis.estimatedCost}` : ""}</p>
                        </div>
                      )}
                      {!photo.aiAnalysis && (
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                          {new Date(photo.timestamp).toLocaleTimeString()}
                        </span>
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

      {/* Bottom controls */}
      <div className="bg-black/90 backdrop-blur-sm px-4 py-4 space-y-3">
        {/* Camera / Upload buttons — only show when not capturing */}
        {!isCapturing && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#9d1535] text-white rounded-lg text-sm font-medium hover:bg-[#b91c42] transition-colors"
            >
              <Camera size={18} /> Open Camera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20"
            >
              <Image size={18} /> Upload Photos
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevRoom}
            disabled={isFirstRoom}
            className="flex items-center gap-1 px-4 py-2 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >
            <ChevronLeft size={18} /> Previous Room
          </button>

          {allowAddRoom && !isCapturing && (
            <div className="flex items-center">
              {showAddRoom ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addNewRoom()}
                    placeholder="Room name..."
                    className="bg-white/10 text-white text-xs rounded px-2 py-1.5 w-28 placeholder-white/30 border border-white/10"
                    autoFocus
                  />
                  <button onClick={addNewRoom} className="text-green-400 text-xs font-medium px-2">Add</button>
                  <button onClick={() => setShowAddRoom(false)} className="text-white/40 text-xs px-1">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddRoom(true)}
                  className="flex items-center gap-1 text-white/50 hover:text-white/80 text-xs"
                >
                  <Plus size={14} /> Add Room
                </button>
              )}
            </div>
          )}

          <button
            onClick={goToNextRoom}
            className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500"
          >
            {isLastRoom ? "Finish Walk" : "Next Room"} <ChevronRight size={18} />
          </button>
        </div>

        {/* Room dots indicator */}
        <div className="flex justify-center gap-1.5 pt-1">
          {rooms.map((room, i) => (
            <button
              key={room.id}
              onClick={() => { stopCamera(); setCurrentRoomIdx(i); }}
              className={`h-1.5 rounded-full transition-all ${
                i === currentRoomIdx
                  ? "w-6 bg-white"
                  : room.photos.length > 0
                  ? "w-1.5 bg-green-500"
                  : "w-1.5 bg-white/30"
              }`}
              title={`${room.name} (${room.photos.length} photos)`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

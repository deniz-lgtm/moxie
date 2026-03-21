"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, ChevronRight, ChevronLeft, Plus, X, Image, RotateCcw } from "lucide-react";

export interface CameraPhoto {
  id: string;
  url: string;
  timestamp: string;
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
}: InspectionCameraProps) {
  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentRoom = rooms[currentRoomIdx];
  const isLastRoom = currentRoomIdx === rooms.length - 1;
  const isFirstRoom = currentRoomIdx === 0;
  const totalPhotos = rooms.reduce((sum, r) => sum + r.photos.length, 0);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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

  // Handle file upload
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
    const photo: CameraPhoto = {
      id: newId(),
      url,
      timestamp: new Date().toISOString(),
    };
    const updated = rooms.map((r, i) =>
      i === currentRoomIdx ? { ...r, photos: [...r.photos, photo] } : r
    );
    onRoomsChange(updated);
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
    setCurrentRoomIdx(rooms.length); // navigate to the new room
  }

  if (!currentRoom) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hidden elements */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
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
                      <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                        {new Date(photo.timestamp).toLocaleTimeString()}
                      </span>
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

        {/* Camera capture button overlay (when camera is active) */}
        {isCapturing && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center">
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 active:scale-95 transition-all flex items-center justify-center"
            >
              <div className="w-14 h-14 rounded-full bg-white" />
            </button>
          </div>
        )}
      </div>

      {/* Notes area */}
      {showNotes && (
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
        {/* Camera / Upload buttons */}
        <div className="flex items-center justify-center gap-4">
          {isCapturing ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20"
            >
              <RotateCcw size={16} /> View Photos
            </button>
          ) : (
            <>
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
                <Image size={18} /> Upload
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevRoom}
            disabled={isFirstRoom}
            className="flex items-center gap-1 px-4 py-2 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >
            <ChevronLeft size={18} /> Previous Room
          </button>

          {allowAddRoom && (
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

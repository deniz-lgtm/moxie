"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal structural types for the Web Speech API (not in lib.dom).
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type RecorderState = "idle" | "recording" | "stopping" | "error";

export type UseMeetingRecorderResult = {
  state: RecorderState;
  transcript: string;
  interimTranscript: string;
  durationSeconds: number;
  supportsLiveTranscription: boolean;
  error: string | null;
  audioBlob: Blob | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  setTranscript: (t: string) => void;
};

/**
 * Records audio via MediaRecorder and, when available, produces a live
 * transcript using the browser's SpeechRecognition API. The transcript
 * and the audio blob are independent — a caller may persist either or
 * both. If SpeechRecognition isn't supported the recorder still captures
 * audio and the user can paste / type a transcript.
 */
export function useMeetingRecorder(): UseMeetingRecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const shouldRestartRef = useRef<boolean>(false);

  const supportsLiveTranscription = Boolean(getSpeechRecognition());

  const reset = useCallback(() => {
    setState("idle");
    setTranscript("");
    setInterimTranscript("");
    setDurationSeconds(0);
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];
    finalTranscriptRef.current = "";
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
      };
      recorder.start(1000);

      startedAtRef.current = Date.now();
      tickRef.current = setInterval(() => {
        setDurationSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 500);

      const SR = getSpeechRecognition();
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.onresult = (event) => {
          let interim = "";
          let finalAddition = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i] as ArrayLike<{ transcript: string }> & { isFinal?: boolean };
            const chunk = (res[0] as { transcript: string }).transcript;
            if (res.isFinal) finalAddition += chunk + " ";
            else interim += chunk;
          }
          if (finalAddition) {
            finalTranscriptRef.current = (finalTranscriptRef.current + finalAddition).replace(/\s+/g, " ");
            setTranscript(finalTranscriptRef.current.trim());
          }
          setInterimTranscript(interim);
        };
        rec.onerror = (e) => {
          // Common transient errors: "no-speech", "aborted". Don't surface those.
          if (e.error && !/no-speech|aborted|network/i.test(e.error)) {
            setError(`Transcription: ${e.error}`);
          }
        };
        rec.onend = () => {
          // Browsers (esp. Chrome) cut off recognition periodically. If we're
          // still recording, restart it transparently.
          if (shouldRestartRef.current) {
            try {
              rec.start();
            } catch {
              // Ignore — will be retried on next tick.
            }
          }
        };
        shouldRestartRef.current = true;
        recognitionRef.current = rec;
        try {
          rec.start();
        } catch {
          // already started
        }
      }

      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not access microphone";
      setError(msg);
      setState("error");
    }
  }, []);

  const stop = useCallback(async () => {
    setState("stopping");
    shouldRestartRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    setInterimTranscript("");
    setState("idle");
  }, []);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  return {
    state,
    transcript,
    interimTranscript,
    durationSeconds,
    supportsLiveTranscription,
    error,
    audioBlob,
    start,
    stop,
    reset,
    setTranscript,
  };
}

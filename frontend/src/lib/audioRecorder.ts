/**
 * audioRecorder.ts — Live cough recording via MediaRecorder API.
 *
 * Owner: Rayyan (Edge Architect)
 *
 * Records audio from the device microphone for a specified duration.
 * Returns a Blob that can be directly uploaded or stored in IndexedDB.
 *
 * No dependencies — uses browser-native APIs only.
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RecordingCallbacks {
  /** Called when recording starts */
  onStart?: () => void;
  /** Called every second with remaining time in seconds */
  onTick?: (remainingSeconds: number) => void;
  /** Called when recording finishes */
  onStop?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let activeRecorder: MediaRecorder | null = null;

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Record audio from the device microphone for a specified duration.
 *
 * @param durationMs - Recording duration in milliseconds (default: 10 seconds)
 * @param callbacks  - Optional lifecycle callbacks for UI updates
 * @returns A Blob containing the recorded audio in WebM format
 */
export async function recordAudio(
  durationMs: number = 10000,
  callbacks?: RecordingCallbacks
): Promise<Blob> {
  // Request microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Determine best supported MIME type
  const mimeType = MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : "audio/ogg";

  const recorder = new MediaRecorder(stream, { mimeType });
  activeRecorder = recorder;
  const chunks: Blob[] = [];

  return new Promise<Blob>((resolve, reject) => {
    // Collect audio data as it arrives
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    // When recording stops, combine all chunks into one Blob
    recorder.onstop = () => {
      // Release the microphone
      stream.getTracks().forEach((track) => track.stop());
      activeRecorder = null;

      const blob = new Blob(chunks, { type: mimeType });
      console.log(
        `[AudioRecorder] Recording complete: ${blob.size} bytes, ${mimeType}`
      );
      callbacks?.onStop?.();
      resolve(blob);
    };

    recorder.onerror = (event) => {
      stream.getTracks().forEach((track) => track.stop());
      activeRecorder = null;

      const error = new Error(`Recording failed: ${event}`);
      callbacks?.onError?.(error);
      reject(error);
    };

    // Start recording
    recorder.start();
    callbacks?.onStart?.();
    console.log(
      `[AudioRecorder] Recording started (${durationMs / 1000}s)...`
    );

    // Countdown timer for UI
    const totalSeconds = Math.ceil(durationMs / 1000);
    let elapsed = 0;
    const tickInterval = setInterval(() => {
      elapsed++;
      const remaining = totalSeconds - elapsed;
      callbacks?.onTick?.(remaining);
      if (remaining <= 0) {
        clearInterval(tickInterval);
      }
    }, 1000);

    // Auto-stop after the specified duration
    setTimeout(() => {
      clearInterval(tickInterval);
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, durationMs);
  });
}

/**
 * Stop an active recording early.
 */
export function stopRecording(): void {
  if (activeRecorder && activeRecorder.state === "recording") {
    activeRecorder.stop();
  }
}

/**
 * Check if a recording is currently in progress.
 */
export function isRecording(): boolean {
  return activeRecorder?.state === "recording";
}

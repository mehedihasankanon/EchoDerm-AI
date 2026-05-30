/**
 * syncManager.ts — Store-and-Forward offline sync engine.
 *
 * Owner: Rayyan (Edge Architect)
 *
 * When online: sends diagnostics directly to the backend.
 * When offline: queues them in IndexedDB and auto-syncs when internet returns.
 *
 * Dependencies: localforage (npm install localforage)
 */

import localforage from "localforage";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

localforage.config({
  name: "EchoDermAI",
  storeName: "offline_sync_store",
  description: "Offline queue for diagnostic payloads",
});

const API_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:8000";

const QUEUE_KEY = "diagnostic_queue";
const MAX_RETRIES = 3;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface QueuedItem {
  id: string;
  timestamp: number;
  patientId: string;
  imageBlob: Blob;
  imageMimeType: string;
  audioBlob: Blob;
  audioMimeType: string;
  status: "pending" | "sending" | "failed";
  retryCount: number;
}

export interface DiagnosisResponse {
  patient_id: string;
  diagnosis: {
    primary_diagnosis: string;
    confidence_score: number;
    visual_findings: string;
    acoustic_findings: string;
    differential_notes: string;
    recommended_next_steps: string[];
  };
}

export interface SyncCallbacks {
  onQueueChanged: (count: number) => void;
  onOnlineStatusChanged: (online: boolean) => void;
  onSyncResult: (result: DiagnosisResponse) => void;
  onSyncError: (itemId: string, error: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let isFlushing = false;
let callbacks: SyncCallbacks | null = null;

// ═══════════════════════════════════════════════════════════════
// QUEUE OPS
// ═══════════════════════════════════════════════════════════════

async function readQueue(): Promise<QueuedItem[]> {
  return (await localforage.getItem<QueuedItem[]>(QUEUE_KEY)) ?? [];
}

async function writeQueue(queue: QueuedItem[]): Promise<void> {
  await localforage.setItem(QUEUE_KEY, queue);
}

async function notifyQueueChanged(): Promise<void> {
  if (callbacks?.onQueueChanged) {
    const queue = await readQueue();
    callbacks.onQueueChanged(queue.length);
  }
}

// ═══════════════════════════════════════════════════════════════
// ENQUEUE
// ═══════════════════════════════════════════════════════════════

export async function enqueue(
  patientId: string,
  imageFile: File | Blob,
  audioFile: File | Blob,
): Promise<QueuedItem> {
  const queue = await readQueue();
  const item: QueuedItem = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    patientId: patientId || `anon-${Date.now()}`,
    imageBlob: imageFile,
    imageMimeType: imageFile.type || "image/jpeg",
    audioBlob: audioFile,
    audioMimeType: audioFile.type || "audio/wav",
    status: "pending",
    retryCount: 0,
  };
  queue.push(item);
  await writeQueue(queue);
  await notifyQueueChanged();
  console.log(`[SyncManager] ENQUEUE id=${item.id} queueSize=${queue.length}`);
  return item;
}

// ═══════════════════════════════════════════════════════════════
// SEND ONE ITEM
// ═══════════════════════════════════════════════════════════════

async function sendOne(item: QueuedItem): Promise<DiagnosisResponse | null> {
  try {
    const form = new FormData();
    form.append("image", item.imageBlob, `rash.${item.imageMimeType.split("/")[1] || "jpg"}`);
    form.append("audio", item.audioBlob, `cough.${item.audioMimeType.split("/")[1] || "wav"}`);
    form.append("patient_id", item.patientId);

    const response = await fetch(`${API_URL}/analyze`, { method: "POST", body: form });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${response.status}`);
    }

    return (await response.json()) as DiagnosisResponse;
  } catch (error: any) {
    console.error(`[SyncManager] sendOne failed for ${item.id}:`, error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// FLUSH QUEUE
// ═══════════════════════════════════════════════════════════════

export async function flushQueue(): Promise<void> {
  if (isFlushing || !navigator.onLine) return;
  isFlushing = true;

  try {
    let queue = await readQueue();

    while (queue.length > 0 && navigator.onLine) {
      const item = queue[0];

      if (item.retryCount >= MAX_RETRIES) {
        queue.shift();
        await writeQueue(queue);
        await notifyQueueChanged();
        callbacks?.onSyncError?.(item.id, "Max retries exceeded");
        queue = await readQueue();
        continue;
      }

      item.status = "sending";
      await writeQueue(queue);

      const result = await sendOne(item);

      if (result) {
        queue.shift();
        await writeQueue(queue);
        await notifyQueueChanged();
        callbacks?.onSyncResult?.(result);
      } else {
        item.status = "failed";
        item.retryCount++;
        await writeQueue(queue);
        const backoffMs = Math.pow(2, item.retryCount) * 1000;
        await new Promise(r => setTimeout(r, backoffMs));
      }

      queue = await readQueue();
    }
  } finally {
    isFlushing = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SUBMIT (Main entry point for the UI)
// ═══════════════════════════════════════════════════════════════

export async function submitDiagnostic(
  patientId: string,
  imageFile: File | Blob,
  audioFile: File | Blob,
): Promise<DiagnosisResponse | null> {
  if (navigator.onLine) {
    // Online: try direct send
    const directItem: QueuedItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      patientId: patientId || `anon-${Date.now()}`,
      imageBlob: imageFile,
      imageMimeType: imageFile.type || "image/jpeg",
      audioBlob: audioFile,
      audioMimeType: audioFile.type || "audio/wav",
      status: "sending",
      retryCount: 0,
    };

    const result = await sendOne(directItem);
    if (result) return result;

    // Direct send failed — enqueue for retry
    console.log("[SyncManager] Direct send failed, enqueueing...");
  }

  // Offline or failed: enqueue
  await enqueue(patientId, imageFile, audioFile);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// INIT (Call once on app startup)
// ═══════════════════════════════════════════════════════════════

export async function initSync(cb: SyncCallbacks): Promise<void> {
  callbacks = cb;

  // Notify initial queue size
  await notifyQueueChanged();

  // Set initial online status
  callbacks.onOnlineStatusChanged(navigator.onLine);

  // Listen for connectivity changes
  window.addEventListener("online", () => {
    callbacks?.onOnlineStatusChanged(true);
    flushQueue();
  });

  window.addEventListener("offline", () => {
    callbacks?.onOnlineStatusChanged(false);
  });

  // Flush any items left from a previous session
  if (navigator.onLine) {
    flushQueue();
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════

export async function getQueueCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
  await notifyQueueChanged();
}

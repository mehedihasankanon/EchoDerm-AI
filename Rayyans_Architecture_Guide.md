# Rayyan's Architecture Guide — EchoDerm AI Edge/Offline System

> **Author:** Generated for Rayyan (Edge Architect)
> **Prerequisite:** C++ competitive programming. Zero web dev.
> **Goal:** Understand the full offline sync architecture, then have the exact code ready to ship.

---

# PART 1: THE C++ TRANSLATOR

## 1.1 — JavaScript Async: Promises and `async/await`

### The Problem You Already Understand

In C++, when you call a blocking function — say, reading a file with `std::ifstream` — your thread stops. It waits. Nothing else runs until the I/O completes. In competitive programming this is fine because you have one task. In a web browser, **you have one thread** (the "main thread"), and if it blocks, the entire UI freezes. The user can't tap buttons. The screen stops rendering. The browser shows a "page unresponsive" dialog.

JavaScript solves this with **non-blocking I/O**. Every I/O operation (network call, file read, database write) returns **immediately** with a "ticket" — a Promise — that says: "I will give you the result later."

### Direct Translation Table

| C++ Concept | JavaScript Equivalent | Notes |
|---|---|---|
| `std::future<T>` | `Promise<T>` | A handle to a value that doesn't exist yet. |
| `future.get()` (blocks) | `await promise` (suspends, doesn't block) | `await` yields control back to the event loop. Other code can run. |
| `std::async(func)` | `async function func()` | Marks a function as "this function will use `await` inside." |
| `std::thread` | Does not exist in browser JS | There is ONE thread. `async/await` is cooperative multitasking, not parallelism. |
| `std::mutex` | Not needed (single thread) | But you still get race conditions from interleaved async operations. More on this below. |
| `try { } catch (std::exception& e)` | `try { } catch (error)` | Identical semantics. `await` can throw. |
| `void` return | `async` functions always return `Promise<void>` | Even if you write `async function foo(): Promise<void>`, the caller gets a Promise. |

### Code Comparison

**C++ (blocking):**
```cpp
#include <future>

std::string fetch_data(const std::string& url) {
    // This blocks the calling thread until the HTTP response arrives.
    auto response = http_client.get(url);  // blocks here
    return response.body;                   // resumes here
}

int main() {
    auto future = std::async(std::launch::async, fetch_data, "http://api.com/data");
    std::string result = future.get();  // blocks main thread
    std::cout << result << std::endl;
}
```

**TypeScript (non-blocking):**
```typescript
async function fetchData(url: string): Promise<string> {
    // `fetch` returns immediately with a Promise.
    // `await` suspends THIS function (not the thread) until the Promise resolves.
    const response = await fetch(url);  // suspends here, UI keeps running
    const body = await response.text(); // suspends again for body parsing
    return body;                         // resumes, returns wrapped in Promise
}

// Calling it:
async function main() {
    const result: string = await fetchData("http://api.com/data");
    console.log(result);
}
```

### The Critical Mental Model

Think of `await` as **cooperative yielding in a coroutine**, not as blocking. When you write:

```typescript
const a = await fetchFromNetwork();   // yields to event loop
const b = await writeToDatabase(a);   // yields to event loop
console.log(b);                        // runs after both complete
```

The execution is:
1. Start `fetchFromNetwork()`. It fires the HTTP request and **yields**.
2. The browser event loop runs other things (UI rendering, button handlers).
3. HTTP response arrives. The event loop **resumes** this function.
4. Start `writeToDatabase(a)`. It writes and **yields**.
5. Event loop runs other things again.
6. Database write completes. The event loop **resumes** this function.
7. `console.log(b)` runs.

**This is NOT multithreading.** There is no preemption. There are no data races on primitive operations. But there ARE logical race conditions if two async flows modify the same data structure — which is exactly the bug we'll guard against in the sync engine.

### Error Handling

```typescript
async function riskyOperation(): Promise<void> {
    try {
        const result = await mightFail();  // if the Promise rejects, we jump to catch
    } catch (error) {
        // `error` is the rejection reason — analogous to a thrown exception
        console.error("Operation failed:", error);
    }
}
```

This is identical to C++ `try/catch`. No surprises.

---

## 1.2 — REST APIs and JSON: Serialized Structs Over a Socket

### What Is a REST API?

You already know how to send data through a TCP socket. A REST API is just a **convention** on top of HTTP (which is on top of TCP) for how the client and server talk to each other.

Think of it like this:

| TCP/Socket (what you know) | REST API (what the web uses) |
|---|---|
| You open a socket to `server:port` | The browser opens an HTTP connection to `server:port/path` |
| You send raw bytes with a protocol you invent | You send an HTTP request with a standardized format |
| You define your own message types | HTTP defines methods: `GET` (read), `POST` (write), `PUT` (update), `DELETE` (remove) |
| You serialize structs manually (`memcpy`, protobuf, etc.) | You serialize data as **JSON** (text-based, human-readable) |

### What Is JSON?

JSON is a **text serialization format** for nested key-value maps and arrays. It is to JavaScript what protobuf is to C++ — but human-readable.

**C++ struct:**
```cpp
struct DiagnosisResult {
    std::string primary_diagnosis;  // "Measles" or "Dengue"
    double confidence_score;         // 0.0 to 1.0
    std::string visual_findings;
    std::string acoustic_findings;
    std::vector<std::string> recommended_next_steps;
};
```

**Same thing in JSON:**
```json
{
  "primary_diagnosis": "Measles",
  "confidence_score": 0.87,
  "visual_findings": "Maculopapular rash on trunk, spreading cephalocaudally",
  "acoustic_findings": "Barking, nonproductive cough with stridor",
  "recommended_next_steps": ["Administer Vitamin A", "Isolate patient"]
}
```

**Parsing in TypeScript:**
```typescript
// Deserialize (like protobuf ParseFromString)
const obj = JSON.parse(jsonString);
console.log(obj.primary_diagnosis); // "Measles"

// Serialize (like protobuf SerializeToString)
const jsonString = JSON.stringify(obj);
```

### The Specific HTTP Call You Care About

When the health worker taps "Analyze," the frontend sends this HTTP request to Kanon's backend:

```
POST http://localhost:8000/analyze
Content-Type: multipart/form-data

Form fields:
  image: <binary JPEG data>     ← the rash photo
  audio: <binary WAV data>      ← the cough recording
  patient_id: "patient-123"     ← a string
```

In C++ terms, this is equivalent to:
```cpp
// Pseudocode — what the HTTP request does conceptually
int sock = connect("localhost", 8000);
send(sock, "POST /analyze HTTP/1.1\r\n");
send(sock, "Content-Type: multipart/form-data; boundary=----XYZZY\r\n\r\n");
send(sock, "------XYZZY\r\nContent-Disposition: form-data; name=\"image\"\r\n\r\n");
send(sock, image_bytes, image_size);
send(sock, "------XYZZY\r\nContent-Disposition: form-data; name=\"audio\"\r\n\r\n");
send(sock, audio_bytes, audio_size);
send(sock, "------XYZZY\r\nContent-Disposition: form-data; name=\"patient_id\"\r\n\r\n");
send(sock, "patient-123");
send(sock, "------XYZZY--\r\n");
```

In JavaScript, the `fetch` API and `FormData` object handle all that serialization for you:

```typescript
const formData = new FormData();
formData.append("image", imageBlob, "rash.jpg");
formData.append("audio", audioBlob, "cough.wav");
formData.append("patient_id", "patient-123");

const response = await fetch("http://localhost:8000/analyze", {
  method: "POST",
  body: formData,
  // NOTE: Do NOT manually set Content-Type. The browser sets it
  // with the correct multipart boundary string automatically.
});

const result = await response.json(); // parse JSON response body
```

---

## 1.3 — Python in 3 Bullets (So You Can Read Kanon's Code)

**Bullet 1: Syntax is pseudocode.**
Python uses indentation instead of `{ }`. `def` instead of the return type. Type hints are optional annotations, not enforced.
```python
# C++:  int add(int a, int b) { return a + b; }
# Python:
def add(a: int, b: int) -> int:
    return a + b
```

**Bullet 2: `async def` + `await` is identical to TypeScript.**
Kanon's backend uses `async def` for route handlers. When you see `await image.read()`, it's the same cooperative yielding you learned above. FastAPI runs these in an event loop (like JavaScript's event loop, but in Python using `asyncio`).

The AI model is **Gemini 3.1 Flash Lite** (not 1.5 Flash — we upgraded). The SDK is `google-genai` (not the old `google-generativeai`). The import and call pattern:
```python
# OLD (don't use):
# import google.generativeai as genai
# model = genai.GenerativeModel("gemini-1.5-flash")
# response = model.generate_content(...)

# NEW (what Kanon's code uses):
from google import genai
from google.genai import types

client = genai.Client()  # reads GOOGLE_API_KEY from environment

# Inside an async route handler:
response = await client.aio.models.generate_content(
    model='gemini-3.1-flash-lite',
    contents=[image_part, audio_part, prompt_text],
    config=types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=2048,
    ),
)
result_text = response.text
```

The FastAPI route handler looks like this:
```python
@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),  # File upload parameter
    audio: UploadFile = File(...),  # File upload parameter
    patient_id: str = Form(None),   # String form field
):
    image_bytes = await image.read()  # Read file bytes (like recv on a socket)
    audio_bytes = await audio.read()
    # ... call Gemini 3.1 Flash Lite, save to DB, return JSON ...
    return {"patient_id": pid, "diagnosis": result}
```

**Bullet 2.5: Kanon's database uses `httpx`, not `supabase-py`.**
Kanon's `database.py` talks to Supabase via raw REST calls using `httpx.AsyncClient()`. This is like using `libcurl` instead of a Supabase-specific C++ SDK:
```python
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

async def save_diagnosis(patient_id: str, diagnosis: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/diagnoses",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
            json={"patient_id": patient_id, "result": diagnosis},
        )
```
Why `httpx`? It's `async`-native (like `aiohttp` but cleaner). The `supabase-py` library had sync-only issues. Direct REST is more transparent — you can see exactly what headers are sent.

**Bullet 3: What you're sending Kanon.**
When you look at `main.py`, the `/analyze` route expects three form fields: `image` (binary file), `audio` (binary file, now accepts `audio/webm` from MediaRecorder), `patient_id` (string). It returns a JSON object: `{ "patient_id": "...", "diagnosis": { ... } }`. That's the contract. Your `FormData` in JavaScript must match these exact field names or the server rejects it with HTTP 422 (Unprocessable Entity).

---

---

# PART 2: THE OFFLINE QUEUE ALGORITHM

## 2.1 — Problem Statement (Codeforces Style)

> **Problem: Store-and-Forward Sync**
>
> You are given a stream of diagnostic payloads `P₁, P₂, ..., Pₙ` that arrive at unpredictable times. Each payload `Pᵢ` consists of:
> - `image`: a binary blob (10 KB – 5 MB)
> - `audio`: a binary blob (50 KB – 10 MB)
> - `patient_id`: a string
> - `timestamp`: creation time
>
> You have an unreliable network connection to a remote server. The connection toggles between `ONLINE` and `OFFLINE` states at arbitrary times.
>
> **Requirements:**
> 1. When `ONLINE`: Send `Pᵢ` directly to the server via HTTP POST. If the POST fails mid-flight (network drops during transmission), enqueue `Pᵢ` locally.
> 2. When `OFFLINE`: Enqueue `Pᵢ` in a persistent local store (survives browser refresh/close).
> 3. When state transitions from `OFFLINE → ONLINE`: Flush the queue by sending all pending payloads to the server **in FIFO order**, one at a time.
> 4. **Invariant 1 (No Data Loss):** Every payload must eventually be delivered. If the browser is closed and reopened, undelivered payloads must still be in the queue.
> 5. **Invariant 2 (No Double Delivery):** A payload must be removed from the queue **only after** receiving HTTP 200 from the server. If the network drops during the POST, the payload remains in the queue.
> 6. **Invariant 3 (No Race Conditions):** Only one sync loop may run at a time. If the user triggers sync while a sync is already in progress, the second call is a no-op.
> 7. **Invariant 4 (Backpressure):** Do not fire all N payloads in parallel. Send one, wait for response, send next. This prevents overwhelming the server and avoids partial-failure chaos.
>
> **Constraints:**
> - Single-threaded environment (browser main thread).
> - Queue must persist across page reloads (use IndexedDB).
> - Maximum payload count: ~50 per session (hackathon scope).
> - Retry budget: 3 attempts per payload with exponential backoff.

### Complexity Analysis

- **Enqueue:** O(1) amortized (append to array, write to IndexedDB).
- **Dequeue:** O(n) worst case (rewrite array without the removed element). Acceptable for n ≤ 50.
- **Flush:** O(n) network round trips, sequential. Total time = n × (RTT + server processing time).
- **Space:** O(n × max_payload_size). Worst case: 50 × 15 MB = 750 MB. IndexedDB can handle this (browsers allow ≥ 1 GB).

---

## 2.2 — IndexedDB: Your Persistent Queue

### Conceptual Model

```
IndexedDB ≈ std::map<std::string, std::any> stored on disk

- Persists across browser restarts (unlike std::map in RAM).
- Can store binary blobs (Blob/File objects), not just strings.
- Asynchronous API (all reads/writes return Promises).
- Browser-native, no installation needed.
```

**The raw IndexedDB API is verbose and painful** (it uses callbacks and event listeners from the 2011 era). We use a wrapper library called `localforage` that gives us a clean `async/await` interface:

```typescript
import localforage from "localforage";

// Write (analogous to map[key] = value, but async and persistent)
await localforage.setItem("my_key", myData);

// Read (analogous to map.at(key), but async)
const data = await localforage.getItem("my_key");

// Delete (analogous to map.erase(key))
await localforage.removeItem("my_key");
```

Under the hood, `localforage` uses IndexedDB (the browser's built-in database). You never touch IndexedDB directly.

### Our Data Structure

We store the queue as a **single array** under one key:

```typescript
// Stored in IndexedDB under key "diagnostic_queue"
type Queue = QueuedItem[];

interface QueuedItem {
  id: string;            // UUID — unique identifier for deduplication
  timestamp: number;     // Date.now() — for FIFO ordering
  patientId: string;
  imageBlob: Blob;       // Raw binary data of the JPEG
  imageMimeType: string; // "image/jpeg"
  audioBlob: Blob;       // Raw binary data of the WAV
  audioMimeType: string; // "audio/wav"
  status: "pending" | "sending" | "failed";
  retryCount: number;    // Tracks attempts for exponential backoff
}
```

**Why a single array and not one key per item?**
Simplicity. With n ≤ 50, O(n) read/write of the entire array is negligible. It avoids managing key namespaces. For a hackathon, this is the right tradeoff.

---

## 2.3 — The Logic Flow (Detailed)

### A. Network State Detection

The browser provides two mechanisms:

```typescript
// 1. Property: Check current state (like polling a flag)
if (navigator.onLine) { /* connected */ }
else { /* disconnected */ }

// 2. Events: React to state changes (like signal handlers / callbacks)
window.addEventListener("online", () => {
  // Fires when connection is restored
  // Equivalent to: a callback registered on a network-state observable
  flushQueue();
});

window.addEventListener("offline", () => {
  // Fires when connection is lost
  // Just log it. Don't do anything destructive.
});
```

> **Warning:** `navigator.onLine` can lie. It returns `true` if the device has any network interface up, even if the interface has no internet access. This is why we also handle POST failures as "maybe offline" and enqueue on failure.

### B. Enqueue (User is Offline or POST Failed)

```
enqueue(patientId, imageFile, audioFile):
    item = new QueuedItem(uuid(), now(), patientId, imageFile, audioFile, "pending", 0)
    queue = readFromIndexedDB("diagnostic_queue") ?? []
    queue.push(item)           // O(1) append
    writeToIndexedDB("diagnostic_queue", queue)
    return item
```

This is `std::queue::push()` but persistent.

### C. Flush Queue (Network Restored)

This is the core algorithm. Study it like a competitive programming solution.

```
flushQueue():
    // GUARD 1: Mutex (prevent concurrent flushes)
    if (isFlushing) return      // equivalent to try_lock() failing
    isFlushing = true

    // GUARD 2: Network check
    if (!navigator.onLine):
        isFlushing = false
        return

    try:
        queue = readFromIndexedDB("diagnostic_queue")

        while queue.length > 0 AND navigator.onLine:
            item = queue[0]                    // peek front (FIFO)

            if item.retryCount >= MAX_RETRIES:
                // Dead letter: skip this item, move to back of queue
                // (or log and remove — your call)
                queue.shift()                  // remove from front
                writeToIndexedDB(queue)
                continue

            item.status = "sending"
            writeToIndexedDB(queue)            // persist status change

            response = HTTP_POST("/analyze", item)

            if response.status == 200:
                // SUCCESS: remove from queue (dequeue)
                queue.shift()                  // O(n) but n ≤ 50
                writeToIndexedDB(queue)
                emitEvent("sync-result", response.body)
            else:
                // FAILURE: increment retry, apply backoff
                item.status = "failed"
                item.retryCount++
                writeToIndexedDB(queue)
                sleep(2^retryCount * 1000ms)   // exponential backoff

            // Re-read queue in case external modification occurred
            queue = readFromIndexedDB("diagnostic_queue")

    finally:
        isFlushing = false      // always release the "mutex"
```

### D. Race Condition Analysis

**Race Condition 1: Two flushes running simultaneously.**
Scenario: User goes online → `flushQueue()` starts → user clicks manual sync → second `flushQueue()` starts. Both try to send `queue[0]`. The patient gets diagnosed twice.
Solution: The `isFlushing` boolean guard. Since JavaScript is single-threaded, checking and setting this boolean is atomic. There is no TOCTOU race.

**Race Condition 2: Enqueue during flush.**
Scenario: Flush is processing `queue[0]`. Meanwhile, the user submits a new scan. `enqueue()` appends to the queue. The flush loop's cached `queue` variable is stale.
Solution: We re-read the queue from IndexedDB at the end of each loop iteration. New items will be picked up.

**Race Condition 3: Network drops mid-POST.**
Scenario: `fetch()` is in flight. WiFi drops. The `fetch` call throws a network error (TypeError). The item was already marked "sending."
Solution: The `catch` block marks it back to "failed" and increments `retryCount`. It stays in the queue. Next flush attempt will retry.

### E. Serialization of Blobs

A `Blob` is JavaScript's equivalent of `std::vector<uint8_t>` — a raw byte buffer with a MIME type label. When the user picks a file through the camera (`<input type="file">`), the browser gives you a `File` object, which extends `Blob`.

```typescript
// File inherits from Blob. You don't need to "serialize" it.
// You just store it directly in IndexedDB. localforage handles the binary storage.

const file: File = inputElement.files[0];
// file.name → "IMG_20260527.jpg"
// file.type → "image/jpeg"
// file.size → 45000 (bytes)
// file itself → the raw JPEG bytes

// Store it:
await localforage.setItem("my_image", file);

// Retrieve it (it comes back as a Blob, not a File, but that's fine):
const blob: Blob = await localforage.getItem("my_image");
```

When you POST it to the server, `FormData.append()` accepts both `File` and `Blob`:

```typescript
const formData = new FormData();
formData.append("image", blob, "rash.jpg");  // third arg = filename
// The browser handles binary serialization into the HTTP body.
```

---

---

# PART 3: THE CODE INJECTION

## 3.1 — Complete `syncManager.ts` (Production-Ready, Every Line Commented)

Create this file at: `frontend/src/lib/syncManager.ts`

```typescript
/**
 * syncManager.ts
 *
 * Owner: Rayyan (Edge Architect)
 *
 * This module implements the complete Store-and-Forward offline sync system.
 * It combines the queue (data structure) and the sync engine (flush algorithm)
 * into a single, self-contained module.
 *
 * Dependencies:
 *   - localforage (npm install localforage)
 *
 * Integration:
 *   - Tamim calls `submitDiagnostic()` from the UI's "Analyze" button handler.
 *   - Tamim calls `initSync()` once on app startup.
 *   - This module handles everything else automatically.
 */

// ═══════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════

// localforage: a wrapper around IndexedDB that gives us async get/set.
// Think of it as a persistent std::unordered_map<string, any> on disk.
import localforage from "localforage";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

// Configure the IndexedDB database name and store name.
// This is like naming your database file in SQLite.
localforage.config({
  name: "EchoDermAI",                 // database name
  storeName: "offline_sync_store",    // table name (IndexedDB "object store")
  description: "Offline queue for diagnostic payloads",
});

// The URL of Kanon's FastAPI backend (powered by Gemini 3.1 Flash Lite).
// import.meta.env.VITE_API_URL reads from frontend/.env file.
// Falls back to localhost if not set.
const API_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:8000";

// The key under which we store the queue array in IndexedDB.
// One key, one array. Simple.
const QUEUE_KEY = "diagnostic_queue";

// Maximum retry attempts per item before we stop trying.
const MAX_RETRIES = 3;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * One item in the offline queue.
 * Think of this as a struct:
 *
 * struct QueuedItem {
 *   string id;
 *   int64_t timestamp;
 *   string patientId;
 *   vector<uint8_t> imageBlob;    // stored as Blob in JS
 *   string imageMimeType;
 *   vector<uint8_t> audioBlob;
 *   string audioMimeType;
 *   enum Status { PENDING, SENDING, FAILED } status;
 *   int retryCount;
 * };
 */
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

/**
 * The shape of the diagnosis result returned by the backend.
 * This matches the JSON Kanon's /analyze endpoint returns.
 */
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

/**
 * Callback types for the UI to react to sync events.
 */
export interface SyncCallbacks {
  onQueueChanged: (count: number) => void;       // queue size changed
  onOnlineStatusChanged: (online: boolean) => void; // network state changed
  onSyncResult: (result: DiagnosisResponse) => void; // a synced item got a result
  onSyncError: (itemId: string, error: string) => void; // a synced item failed
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

// This boolean acts as a mutex (spinlock guard).
// Since JS is single-threaded, there is no TOCTOU race on this variable.
// It prevents two flushQueue() calls from running concurrently.
let isFlushing = false;

// Stored callbacks from the UI. Set during initSync().
let callbacks: SyncCallbacks | null = null;

// ═══════════════════════════════════════════════════════════════
// QUEUE OPERATIONS (Data Structure Layer)
// ═══════════════════════════════════════════════════════════════

/**
 * Read the entire queue from IndexedDB.
 * Returns [] if nothing stored yet (first run).
 *
 * Equivalent to:
 *   vector<QueuedItem> readQueue() {
 *     auto q = db.get("diagnostic_queue");
 *     return q.has_value() ? q.value() : vector<QueuedItem>{};
 *   }
 */
async function readQueue(): Promise<QueuedItem[]> {
  const queue = await localforage.getItem<QueuedItem[]>(QUEUE_KEY);
  return queue ?? []; // ?? is the "nullish coalescing operator" — like value_or({})
}

/**
 * Write the entire queue back to IndexedDB.
 * This overwrites the previous value.
 *
 * After every mutation (push, shift, status update), we call this
 * to persist the change. If the browser crashes between mutations,
 * we lose at most one status update — the item stays in the queue
 * (safe side of the invariant).
 */
async function writeQueue(queue: QueuedItem[]): Promise<void> {
  await localforage.setItem(QUEUE_KEY, queue);
}

/**
 * Notify the UI that the queue size changed.
 * Tamim's React component uses this to update the "X items pending" counter.
 */
async function notifyQueueChanged(): Promise<void> {
  if (callbacks?.onQueueChanged) {
    const queue = await readQueue();
    callbacks.onQueueChanged(queue.length);
  }
}

// ═══════════════════════════════════════════════════════════════
// ENQUEUE (Public API — called by the submit handler)
// ═══════════════════════════════════════════════════════════════

/**
 * Add a diagnostic payload to the offline queue.
 *
 * This is std::queue::push(). The item is appended to the back.
 * It is persisted immediately in IndexedDB.
 *
 * @param patientId  - The patient identifier string
 * @param imageFile  - The File object from the camera input
 * @param audioFile  - The File object from the audio input
 * @returns The queued item (for UI confirmation)
 */
export async function enqueue(
  patientId: string,
  imageFile: File | Blob,
  audioFile: File | Blob,
): Promise<QueuedItem> {
  // Read current queue from IndexedDB
  const queue = await readQueue();

  // Construct the new item
  const item: QueuedItem = {
    // crypto.randomUUID() generates a v4 UUID.
    // Available in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+).
    id: crypto.randomUUID(),

    // Date.now() returns milliseconds since Unix epoch.
    // Used for FIFO ordering and debugging.
    timestamp: Date.now(),

    // Patient identifier from the UI form
    patientId: patientId || `anon-${Date.now()}`,

    // The raw binary data. File extends Blob, so both types work.
    // IndexedDB/localforage can store Blobs natively — no base64 encoding needed.
    imageBlob: imageFile,
    imageMimeType: imageFile.type || "image/jpeg",

    audioBlob: audioFile,
    audioMimeType: audioFile.type || "audio/wav",

    // Initial state
    status: "pending",
    retryCount: 0,
  };

  // Append to the back of the queue (FIFO: first in, first out)
  queue.push(item);

  // Persist to IndexedDB
  await writeQueue(queue);

  // Tell the UI the count changed
  await notifyQueueChanged();

  console.log(
    `[SyncManager] ENQUEUE id=${item.id} patient=${item.patientId} ` +
    `queueSize=${queue.length}`
  );

  return item;
}

// ═══════════════════════════════════════════════════════════════
// SEND ONE ITEM (Network Layer)
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt to POST one queued item to Kanon's backend.
 *
 * Returns the parsed JSON response on success, or null on failure.
 * On failure, the item's status and retryCount are updated in IndexedDB.
 *
 * This function does NOT remove the item from the queue.
 * The caller (flushQueue) handles removal on success.
 */
async function sendOne(item: QueuedItem): Promise<DiagnosisResponse | null> {
  try {
    // Build the multipart form — this is what Kanon's FastAPI expects.
    // FormData is the browser's built-in multipart/form-data builder.
    // It's analogous to constructing a serialized protobuf message.
    const form = new FormData();

    // "image" must match the parameter name in Kanon's @app.post("/analyze")
    // The third argument is the filename — required for the server to
    // correctly detect the MIME type.
    form.append(
      "image",
      item.imageBlob,
      `rash.${item.imageMimeType.split("/")[1] || "jpg"}`
    );

    // "audio" must match the parameter name in Kanon's route.
    form.append(
      "audio",
      item.audioBlob,
      `cough.${item.audioMimeType.split("/")[1] || "wav"}`
    );

    // "patient_id" must match the Form(...) parameter in Kanon's route.
    form.append("patient_id", item.patientId);

    // Fire the HTTP POST.
    // IMPORTANT: Do NOT set the Content-Type header manually.
    // The browser must set it to "multipart/form-data; boundary=..."
    // with the auto-generated boundary string. If you set it yourself,
    // the boundary won't match and the server will reject the request.
    const response = await fetch(`${API_URL}/analyze`, {
      method: "POST",
      body: form,
    });

    // Check the HTTP status code.
    // 200-299 = success. Anything else = failure.
    if (!response.ok) {
      // Server returned an error (4xx or 5xx).
      // Read the error body for debugging.
      const errorBody = await response.text().catch(() => "no body");
      console.error(
        `[SyncManager] SEND FAILED id=${item.id} ` +
        `status=${response.status} body=${errorBody}`
      );
      return null;
    }

    // Parse the JSON response body.
    // This is Kanon's { patient_id, diagnosis } object.
    const data: DiagnosisResponse = await response.json();

    console.log(
      `[SyncManager] SEND OK id=${item.id} ` +
      `diagnosis=${data.diagnosis.primary_diagnosis}`
    );

    return data;
  } catch (error) {
    // This catch block fires on NETWORK errors:
    // - WiFi dropped mid-request (TypeError: Failed to fetch)
    // - DNS resolution failed
    // - Server unreachable
    // It does NOT fire on HTTP 4xx/5xx — those are handled above.
    console.error(
      `[SyncManager] SEND NETWORK ERROR id=${item.id}`,
      error
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// FLUSH QUEUE (The Core Algorithm)
// ═══════════════════════════════════════════════════════════════

/**
 * Process the entire queue, sending items one by one in FIFO order.
 *
 * This is the main sync loop. It:
 * 1. Acquires the "mutex" (isFlushing flag).
 * 2. Reads the queue from IndexedDB.
 * 3. For each item (front to back):
 *    a. Marks it as "sending".
 *    b. POSTs it to the backend.
 *    c. On success: removes it from the queue (dequeue).
 *    d. On failure: marks it as "failed", increments retryCount,
 *       applies exponential backoff, then tries the next item.
 * 4. Releases the "mutex".
 *
 * INVARIANTS MAINTAINED:
 * - No double delivery: item is removed only after HTTP 200.
 * - No data loss: item stays in queue if anything fails.
 * - No concurrent flushes: isFlushing guard prevents this.
 * - Backpressure: items are sent sequentially, not in parallel.
 */
export async function flushQueue(): Promise<void> {
  // ── GUARD 1: Mutex ────────────────────────────────────────
  // If another flush is already running, bail out immediately.
  // Since JS is single-threaded, this check-and-set is atomic.
  if (isFlushing) {
    console.log("[SyncManager] FLUSH SKIPPED — already in progress");
    return;
  }

  // ── GUARD 2: Network check ────────────────────────────────
  if (!navigator.onLine) {
    console.log("[SyncManager] FLUSH SKIPPED — offline");
    return;
  }

  // Acquire the "mutex"
  isFlushing = true;
  console.log("[SyncManager] FLUSH START");

  try {
    // Read the queue. We re-read after each iteration because
    // enqueue() might have added new items while we were awaiting.
    let queue = await readQueue();

    // ── Main loop: process items front-to-back ──────────────
    while (queue.length > 0) {

      // Check network before each send.
      // If we went offline mid-flush, stop gracefully.
      if (!navigator.onLine) {
        console.log("[SyncManager] FLUSH PAUSED — went offline mid-loop");
        break;
      }

      // Peek at the front of the queue (FIFO).
      const item = queue[0];

      // ── Skip items that exceeded retry budget ─────────────
      if (item.retryCount >= MAX_RETRIES) {
        console.warn(
          `[SyncManager] ITEM ABANDONED id=${item.id} ` +
          `after ${MAX_RETRIES} retries`
        );
        // Remove the dead item from the front.
        queue.shift();
        await writeQueue(queue);
        await notifyQueueChanged();

        // Notify UI about the permanent failure
        callbacks?.onSyncError(
          item.id,
          `Failed after ${MAX_RETRIES} attempts. Patient: ${item.patientId}`
        );

        // Continue to next item
        continue;
      }

      // ── Mark as "sending" (persisted) ─────────────────────
      item.status = "sending";
      await writeQueue(queue);

      // ── Attempt the POST ──────────────────────────────────
      const result = await sendOne(item);

      if (result !== null) {
        // ── SUCCESS ─────────────────────────────────────────
        // Remove the item from the front of the queue.
        // This is the ONLY place where an item is removed.
        // The invariant "no data loss" depends on this being
        // AFTER a confirmed 200 OK.
        queue.shift();
        await writeQueue(queue);
        await notifyQueueChanged();

        // Notify the UI so Tamim can display the diagnosis
        callbacks?.onSyncResult(result);
      } else {
        // ── FAILURE ─────────────────────────────────────────
        // Mark as failed, increment retry counter.
        item.status = "failed";
        item.retryCount += 1;
        await writeQueue(queue);

        // Exponential backoff: 2^retryCount seconds.
        // retry 1 → 2s, retry 2 → 4s, retry 3 → 8s (then abandoned)
        const delayMs = Math.pow(2, item.retryCount) * 1000;
        console.log(
          `[SyncManager] BACKOFF id=${item.id} ` +
          `retry=${item.retryCount}/${MAX_RETRIES} delay=${delayMs}ms`
        );

        // Sleep for the backoff duration.
        // This is `await new Promise(resolve => setTimeout(resolve, ms))`.
        // It's the JS equivalent of std::this_thread::sleep_for().
        // During this sleep, the event loop is free — the UI is responsive.
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Re-read the queue from IndexedDB.
      // This picks up any new items that enqueue() added while we were
      // awaiting the POST or the backoff sleep.
      queue = await readQueue();
    }

    console.log("[SyncManager] FLUSH COMPLETE — queue is empty");
  } finally {
    // ── Release the "mutex" — ALWAYS, even if an exception occurred ──
    // This is like a C++ RAII lock guard's destructor.
    isFlushing = false;
    await notifyQueueChanged();
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: submitDiagnostic (Called from UI)
// ═══════════════════════════════════════════════════════════════

/**
 * The main entry point that Tamim calls when the user taps "Analyze."
 *
 * Decision logic:
 *   if ONLINE → try direct POST
 *     if POST succeeds → return result immediately
 *     if POST fails    → enqueue (fallback to offline path)
 *   if OFFLINE → enqueue directly
 *
 * Returns the diagnosis result if online and successful,
 * or null if the payload was queued for later.
 */
export async function submitDiagnostic(
  patientId: string,
  imageFile: File,
  audioFile: File,
): Promise<DiagnosisResponse | null> {

  // ── OFFLINE PATH ──────────────────────────────────────────
  if (!navigator.onLine) {
    console.log("[SyncManager] OFFLINE — enqueueing");
    await enqueue(patientId, imageFile, audioFile);
    return null; // null signals "queued, no result yet"
  }

  // ── ONLINE PATH ───────────────────────────────────────────
  console.log("[SyncManager] ONLINE — attempting direct send");

  // Build FormData for the direct POST
  const form = new FormData();
  form.append("image", imageFile);
  form.append("audio", audioFile);
  form.append("patient_id", patientId || `anon-${Date.now()}`);

  try {
    const response = await fetch(`${API_URL}/analyze`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: DiagnosisResponse = await response.json();
    console.log("[SyncManager] DIRECT SEND OK");
    return data;

  } catch (error) {
    // Direct send failed (server down, network flaky, etc.)
    // Fall back to the offline queue. The item is NOT lost.
    console.warn("[SyncManager] DIRECT SEND FAILED — enqueueing as fallback", error);
    await enqueue(patientId, imageFile, audioFile);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: getQueueCount
// ═══════════════════════════════════════════════════════════════

/**
 * Returns the current number of items in the offline queue.
 * Tamim uses this to display "X items waiting to sync" in the UI.
 */
export async function getQueueCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: getQueueItems (for debug/display)
// ═══════════════════════════════════════════════════════════════

/**
 * Returns metadata about all queued items (without the heavy blobs).
 * Useful for a debug panel or queue status display.
 */
export async function getQueueItems(): Promise<
  Array<{
    id: string;
    patientId: string;
    timestamp: number;
    status: string;
    retryCount: number;
  }>
> {
  const queue = await readQueue();
  return queue.map((item) => ({
    id: item.id,
    patientId: item.patientId,
    timestamp: item.timestamp,
    status: item.status,
    retryCount: item.retryCount,
  }));
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: clearQueue (Debug Only)
// ═══════════════════════════════════════════════════════════════

/**
 * Wipe the entire queue. For debugging/testing ONLY.
 * In production, you would never call this.
 */
export async function clearQueue(): Promise<void> {
  await writeQueue([]);
  await notifyQueueChanged();
  console.log("[SyncManager] QUEUE CLEARED (debug)");
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION (Called Once on App Startup)
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize the sync system. Call this ONCE in your React app's
 * root component (inside a useEffect with [] dependency array).
 *
 * This:
 * 1. Registers online/offline event listeners.
 * 2. If we start online and there are queued items, flushes them.
 * 3. Stores the callback functions for UI notifications.
 *
 * @param cb — An object of callback functions. Tamim provides these
 *             to wire the sync engine to his React state.
 * @returns A cleanup function to remove event listeners (for React's
 *          useEffect return).
 */
export function initSync(cb: SyncCallbacks): () => void {
  // Store callbacks for the UI
  callbacks = cb;

  // ── Event handler: browser went online ────────────────────
  const handleOnline = () => {
    console.log("[SyncManager] EVENT: online");
    cb.onOnlineStatusChanged(true);

    // Automatically flush the queue when connectivity returns.
    // This is the "forward" part of "store-and-forward."
    flushQueue();
  };

  // ── Event handler: browser went offline ───────────────────
  const handleOffline = () => {
    console.log("[SyncManager] EVENT: offline");
    cb.onOnlineStatusChanged(false);
  };

  // Register the event listeners on the window object.
  // These are like signal handlers — they fire asynchronously
  // when the browser detects a network state change.
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // If we start online and there are items in the queue
  // (e.g., the user closed the browser while offline and reopened
  // it while online), flush immediately.
  if (navigator.onLine) {
    flushQueue();
  }

  // Fire initial queue count
  notifyQueueChanged();

  console.log("[SyncManager] INITIALIZED");

  // Return a cleanup function.
  // React's useEffect calls this when the component unmounts.
  // It removes the event listeners to prevent memory leaks.
  // This is analogous to a C++ destructor.
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    callbacks = null;
    console.log("[SyncManager] DESTROYED (cleanup)");
  };
}
```

---

## 3.2 — Integration: Where and How Tamim Hooks This Up

### The Contract Between You and Tamim

Tell Tamim exactly this:

> "Tamim, here's what you need to do in `App.tsx`:
>
> 1. **Import** four things from my module:
>    `import { initSync, submitDiagnostic, getQueueCount, flushQueue } from "./lib/syncManager";`
>
> 2. **Call `initSync()` once** inside a `useEffect(() => { ... }, [])` with your state-setter callbacks.
>
> 3. **Replace** your submit handler. Instead of calling `fetch` directly, call `submitDiagnostic(patientId, imageFile, audioFile)`. I handle online/offline automatically. If I return `null`, show 'queued'. If I return data, show the diagnosis.
>
> 4. **Add a manual sync button** that calls `flushQueue()`. This is a backup in case the auto-sync doesn't trigger."

### Exact React Integration Code

This is what goes into Tamim's `App.tsx` (or equivalent root component):

```tsx
// ═══════════════════════════════════════════════════════════
// Imports from Rayyan's sync module
// ═══════════════════════════════════════════════════════════
import { useEffect, useState, useRef } from "react";
import {
  initSync,
  submitDiagnostic,
  getQueueCount,
  flushQueue,
  DiagnosisResponse,
} from "./lib/syncManager";

function App() {
  // ── React State ─────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse["diagnosis"] | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  // Refs for the file inputs (Tamim wires these to his upload cards)
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const [patientId, setPatientId] = useState("");

  // ── Initialize Rayyan's sync engine on app startup ──────
  useEffect(() => {
    const cleanup = initSync({
      // Called whenever the queue size changes
      onQueueChanged: (count) => {
        setQueueCount(count);
      },

      // Called when network state toggles
      onOnlineStatusChanged: (online) => {
        setIsOnline(online);
      },

      // Called when a previously-queued item gets a result back
      onSyncResult: (result) => {
        setDiagnosis(result.diagnosis);
        setStatusMessage(
          `✅ Synced result for patient ${result.patient_id}`
        );
      },

      // Called when a queued item permanently fails
      onSyncError: (itemId, error) => {
        setStatusMessage(`❌ Sync failed: ${error}`);
      },
    });

    // React cleanup: remove event listeners when component unmounts
    return cleanup;
  }, []); // Empty array = run once on mount

  // ── The "Analyze" button handler ────────────────────────
  async function handleAnalyze() {
    // Get the files from the input refs
    const imageFile = imageRef.current?.files?.[0];
    const audioFile = audioRef.current?.files?.[0];

    if (!imageFile || !audioFile) {
      setStatusMessage("⚠️ Please select both an image and audio file.");
      return;
    }

    setIsLoading(true);
    setStatusMessage("");
    setDiagnosis(null);

    try {
      // Call Rayyan's submitDiagnostic.
      // It decides: online → direct POST, offline → enqueue.
      const result = await submitDiagnostic(patientId, imageFile, audioFile);

      if (result !== null) {
        // Got an immediate result (we were online)
        setDiagnosis(result.diagnosis);
        setStatusMessage("✅ Analysis complete!");
      } else {
        // Payload was queued (we were offline or the POST failed)
        setStatusMessage("📡 Saved offline. Will sync when connected.");
      }
    } catch (error) {
      setStatusMessage(`❌ Unexpected error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Manual sync button handler ──────────────────────────
  async function handleManualSync() {
    if (!navigator.onLine) {
      setStatusMessage("📡 Still offline. Cannot sync.");
      return;
    }
    setStatusMessage("🔄 Syncing...");
    await flushQueue();
    setStatusMessage("✅ Sync complete.");
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-black text-center py-2 text-sm font-bold">
          📡 You are offline — data will sync when connected
        </div>
      )}

      {/* Queue counter + manual sync */}
      {queueCount > 0 && (
        <div className="bg-blue-700 text-white text-center py-2 text-sm flex justify-center items-center gap-3">
          <span>🔄 {queueCount} item{queueCount !== 1 ? "s" : ""} waiting to sync</span>
          {isOnline && (
            <button
              onClick={handleManualSync}
              className="bg-white text-blue-700 px-3 py-1 rounded text-xs font-bold"
            >
              Sync Now
            </button>
          )}
        </div>
      )}

      {/* Status message */}
      {statusMessage && (
        <div className="text-center py-2 text-sm text-gray-300">
          {statusMessage}
        </div>
      )}

      {/* === Tamim builds the rest of the UI here === */}
      {/* Patient ID input, image upload card, audio upload card,
          Analyze button (calls handleAnalyze), results display, etc. */}

      {/* Example: hidden file inputs that Tamim's UI cards trigger */}
      <input ref={imageRef} type="file" accept="image/*" capture="environment" hidden />
      <input ref={audioRef} type="file" accept="audio/*" hidden />

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={isLoading}
        className="w-full bg-gradient-to-r from-teal-500 to-green-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50"
      >
        {isLoading ? "⏳ Analyzing..." : "🔍 Analyze Symptoms"}
      </button>

      {/* Diagnosis result (Tamim builds DiagnosisResult component) */}
      {diagnosis && (
        <pre className="bg-gray-800 p-4 rounded mt-4 text-sm overflow-auto">
          {JSON.stringify(diagnosis, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default App;
```

---

## 3.3 — Talking to Kanon: The API Contract Cheat Sheet

Print this table and hand it to Kanon. It's the exact interface between your code and his:

```
┌───────────────────────────────────────────────────────────────────┐
│              API CONTRACT: Frontend → Backend                     │
│              (Backend uses Gemini 3.1 Flash Lite)                 │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Endpoint:    POST /analyze                                       │
│  URL:         http://<kanon's-server>:8000/analyze                │
│                                                                   │
│  Content-Type: multipart/form-data (set by browser, NOT us)       │
│                                                                   │
│  Form Fields:                                                     │
│  ┌──────────────┬──────────┬───────────────────────────────────┐  │
│  │ Field Name   │ Type     │ Description                       │  │
│  ├──────────────┼──────────┼───────────────────────────────────┤  │
│  │ image        │ File     │ JPEG/PNG of skin rash             │  │
│  │ audio        │ File     │ WAV/MP3/WebM of cough             │  │
│  │              │          │ ⚠ audio/webm is now accepted!     │  │
│  │              │          │ (MediaRecorder outputs webm)      │  │
│  │ patient_id   │ string   │ Patient ID (optional)             │  │
│  └──────────────┴──────────┴───────────────────────────────────┘  │
│                                                                   │
│  Allowed Audio MIME Types:                                        │
│    audio/wav, audio/mpeg, audio/mp3, audio/webm                   │
│    (Kanon's main.py: allowed_audio_types set)                     │
│                                                                   │
│  Response (HTTP 200):                                             │
│  {                                                                │
│    "patient_id": "string",                                        │
│    "diagnosis": {                                                 │
│      "primary_diagnosis": "Measles" | "Dengue",                  │
│      "confidence_score": float,    // 0.0 – 1.0                  │
│      "visual_findings": "string",                                 │
│      "acoustic_findings": "string",                               │
│      "differential_notes": "string",                              │
│      "recommended_next_steps": ["string", ...]                    │
│    }                                                              │
│  }                                                                │
│                                                                   │
│  Error Responses:                                                 │
│    400 → Bad file type or empty file                              │
│    422 → Missing required field (check field names!)              │
│    502 → Gemini 3.1 Flash Lite API call failed                    │
│                                                                   │
│  Backend Stack:                                                   │
│    - google-genai SDK (from google import genai)                  │
│    - httpx for Supabase REST calls (not supabase-py)              │
│    - FastAPI + uvicorn                                            │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3.4 — Testing the Offline Flow on a Real Phone

### Step 1: Get Kanon's Backend Running

```bash
cd echoderm-ai/backend
.\venv\Scripts\activate             # Windows
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 2: Get Tamim's Frontend Running (Accessible on Local Network)

```bash
cd echoderm-ai/frontend
npm run dev -- --host
```

Note the `Network: http://192.168.x.x:5173` URL.

### Step 3: Set the API URL

Create/edit `frontend/.env`:
```
VITE_API_URL=http://192.168.x.x:8000
```
(Use the same IP — your computer's local WiFi IP.)

### Step 4: Open on Phone → Run the Test

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `http://192.168.x.x:5173` on phone Chrome | App loads |
| 2 | Upload image + audio, tap Analyze (while online) | Diagnosis appears immediately |
| 3 | Turn on **Airplane Mode** | Yellow "offline" banner appears |
| 4 | Upload image + audio, tap Analyze | Message: "Saved offline." Queue counter: "1 item" |
| 5 | Submit again while offline | Queue counter: "2 items" |
| 6 | Turn off Airplane Mode | Queue counter counts down: 2 → 1 → 0. Diagnosis appears. |
| 7 | Force-close the browser, reopen the URL | Queue counter should show any remaining items (persistence test) |

### Step 5: Test Audio Recording (MediaRecorder → audio/webm)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tap the "Record Cough" button | Browser asks for microphone permission |
| 2 | Grant permission, cough into mic | Recording indicator shows |
| 3 | Wait for auto-stop (10s) or tap stop | Blob of type `audio/webm` is created |
| 4 | Submit with the recorded audio | Backend accepts `audio/webm` (Kanon added it to `allowed_audio_types`) |

### Step 6: Test Llama Offline Mode

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go offline (Airplane Mode) | Offline banner + Llama text input appears |
| 2 | Type symptoms: "fever, rash on chest, red eyes" | Llama processes locally — no network needed |
| 3 | Wait 5-15 seconds | Preliminary triage text appears with disclaimer |
| 4 | Also upload image + audio while offline | Files queue in IndexedDB as before |
| 5 | Go back online | Files sync to Gemini 3.1 Flash Lite. Full AI result replaces preliminary Llama text |

> **First-time Llama load:** The model (~500 MB) downloads once and caches in browser storage. Subsequent loads are instant from cache. On a mid-range phone, initial download takes 2-5 min on 4G.

### Step 7: Debug with Browser DevTools

On your computer, open Chrome DevTools → **Application** tab → **IndexedDB** → `EchoDermAI` → `offline_sync_store`. You can see the raw queue data there.

Also check the **Console** tab for all the `[SyncManager]` log lines.

For Llama: check **Console** for `[LlamaEngine]` logs and **Application** → **Cache Storage** for the cached model weights.

---

## 3.5 — Summary: The Invariants You Guarantee

As Edge Architect, these are the guarantees you make to the team:

| # | Invariant | How It's Enforced |
|---|-----------|-------------------|
| 1 | **No data loss** | Payloads are persisted in IndexedDB before the UI says "saved." Items are only removed after HTTP 200. |
| 2 | **No double delivery** | `queue.shift()` (removal) happens only inside the `if (result !== null)` block — i.e., after confirmed success. |
| 3 | **No concurrent flushes** | `isFlushing` boolean guard, checked at the top of `flushQueue()`. Single-threaded JS makes this atomic. |
| 4 | **Backpressure** | Sequential sends (one `await` per item), not parallel `Promise.all()`. Server sees one request at a time. |
| 5 | **Persistence** | `localforage` writes to IndexedDB, which survives browser close, page refresh, and device restart. |
| 6 | **Graceful degradation** | If direct POST fails, we silently enqueue. The user never sees an unrecoverable error. |
| 7 | **Automatic recovery** | The `online` event listener triggers `flushQueue()` automatically. No user action needed. |
| 8 | **Offline text triage** | When offline, Llama 3.2 1B gives immediate preliminary advice for typed symptoms. Files still queue for Gemini. |

---

---

# PART 4: LLAMA OFFLINE ENGINE (Your Second Module)

## 4.1 — What Is WebLLM?

You know how in competitive programming, you sometimes precompute a big table and store it in memory so lookups are O(1)? WebLLM is the extreme version of that — it loads an entire neural network's weights into your GPU's memory and runs inference locally.

**WebLLM** is a library by the MLC team (Machine Learning Compilation) that runs **quantized LLMs** directly in the browser using **WebGPU** — the browser's new GPU compute API.

C++ analogy:
- **WebGPU** ≈ Vulkan/CUDA compute shaders, but standardized for browsers. It gives JavaScript access to the GPU's shader cores for general-purpose computation.
- **Quantized model** ≈ Compressing `float32` weights to `int4` (4-bit). Like using `short` instead of `int` — you lose precision but the model fits in 500 MB instead of 4 GB.
- **WebLLM** ≈ A runtime that compiles the model to GPU shader code (WGSL), loads quantized weights, and runs the forward pass on the GPU. Think of it as "TensorRT but for browsers."

### Why This Matters for EchoDerm

Our target users are health workers in rural Bangladesh. They go offline for hours. With WebLLM, when they type symptoms into the app, they get **immediate preliminary triage text** — no internet required. The response comes from the phone's own GPU.

## 4.2 — Why Llama 3.2 1B?

| Model | Parameters | Quantized Size | Quality | Fits on Phone? |
|-------|-----------|----------------|---------|----------------|
| Llama 3.2 1B | 1 billion | ~500 MB (q4f16) | Basic but usable for triage | ✅ Yes |
| Llama 3.2 3B | 3 billion | ~1.5 GB | Better | ⚠️ Tight on low-end |
| Llama 3.1 8B | 8 billion | ~4 GB | Great | ❌ Too large |

We use **Llama-3.2-1B-Instruct-q4f16_1-MLC** — the smallest model that can produce coherent medical triage text. The `q4f16` means: weights are 4-bit quantized, activations use float16. The `MLC` suffix means it's pre-compiled for WebLLM's runtime.

In CP terms: it's like choosing the algorithm with the smallest constant factor that still gives correct output within the time limit.

## 4.3 — The Architecture: What Runs Where

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S DEVICE                           │
│                                                                 │
│  ┌───────────────┐    ┌─────────────────┐    ┌──────────────┐  │
│  │ Tamim's UI    │───▶│ Rayyan's        │───▶│ syncManager  │  │
│  │               │    │ llamaEngine.ts  │    │ .ts          │  │
│  │ "I have a     │    │                 │    │              │  │
│  │  rash and     │    │ Processes TEXT  │    │ Queues FILES │  │
│  │  fever"       │    │ immediately    │    │ for later    │  │
│  │  + photo      │    │ via Llama      │    │ sync         │  │
│  │  + audio      │    │                 │    │              │  │
│  └───────────────┘    └────────┬────────┘    └──────┬───────┘  │
│                                │                     │          │
│                                ▼                     │          │
│                     ┌──────────────────┐             │          │
│                     │ GPU (WebGPU)     │             │          │
│                     │ Llama 3.2 1B     │             │          │
│                     │ inference        │             │          │
│                     └──────────────────┘             │          │
│                                                      │          │
│                     ┌──────────────────┐             │          │
│                     │ IndexedDB        │◀────────────┘          │
│                     │ (offline queue)  │                        │
│                     └──────────────────┘                        │
└──────────────────────────────────┬──────────────────────────────┘
                                   │ When online ↓
                          ┌────────▼────────┐
                          │ Kanon's Backend  │
                          │ Gemini 3.1       │
                          │ Flash Lite       │
                          │ (full analysis)  │
                          └─────────────────┘
```

**The rule is simple:**
- **Text symptoms** → Llama handles immediately (offline OK)
- **Image/audio files** → Queue for Gemini (need internet)
- When internet returns → Gemini does the full multimodal analysis and its result **supersedes** the Llama preliminary text

## 4.4 — Complete `llamaEngine.ts` (Every Line Explained)

Create this file at: `frontend/src/lib/llamaEngine.ts`

```typescript
/**
 * llamaEngine.ts
 *
 * Owner: Rayyan (Edge Architect)
 *
 * This module manages the Llama 3.2 1B model running locally in the browser
 * via WebLLM. It provides offline text triage when there is no internet.
 *
 * Dependencies:
 *   - @mlc-ai/web-llm (npm install @mlc-ai/web-llm)
 *
 * C++ Mental Model:
 *   Think of this as a GPU compute kernel manager. You load the "program"
 *   (model weights) onto the GPU once, then invoke it repeatedly with
 *   different inputs (symptom descriptions). Like loading a CUDA kernel.
 */

// ═══════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════

// CreateMLCEngine: Factory function that downloads, compiles, and loads
// the model onto the GPU. Like cudaMalloc + cudaMemcpy for the weights.
//
// MLCEngine: The engine instance. Like a handle to a loaded CUDA context.
import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

// The engine instance — null until initLlama() is called.
// In C++ terms: MLCEngine* engine = nullptr;
let engine: MLCEngine | null = null;

// Guard to prevent multiple simultaneous init calls.
// Same pattern as isFlushing in syncManager.ts.
let isLoading = false;

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

// The model ID. This string tells WebLLM which pre-compiled model
// to download from its CDN. Think of it as a package name.
// "q4f16_1" = 4-bit weight quantization, float16 activations, variant 1.
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

// The system prompt — this sets the model's "personality" and constraints.
// In C++ terms: this is the constant preamble prepended to every query,
// like a configuration header that shapes all output.
const MEDICAL_SYSTEM_PROMPT = `You are EchoDerm AI (Offline Mode). You are a preliminary triage assistant for rural health workers in Bangladesh.

You are running locally on the device with NO internet connection. You can only process TEXT descriptions of symptoms — you CANNOT see images or hear audio.

Based on the symptom description, provide:
1. Whether symptoms suggest Measles or Dengue (or uncertain)
2. Immediate actions the health worker should take
3. Danger signs to watch for
4. A clear disclaimer that this is PRELIMINARY and a full AI analysis will run when internet returns

Keep your response short, simple, and actionable. Use simple English suitable for community health workers.`;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Download and initialize the Llama model on the GPU.
 *
 * C++ analogy:
 *   This is like:
 *     1. dlopen("llama_model.so")        — download the compiled model
 *     2. cudaMalloc(&weights, 500MB)     — allocate GPU memory
 *     3. cudaMemcpy(weights, data, ...)  — load weights onto GPU
 *
 * This takes 30-120 seconds on first call (downloads ~500 MB).
 * Subsequent calls are fast (model is cached in browser storage).
 *
 * @param onProgress — optional callback with download/load progress (0.0 to 1.0)
 *                     Tamim uses this to show a progress bar.
 */
export async function initLlama(onProgress?: (progress: number) => void): Promise<void> {
  // Guard: if already loaded or currently loading, bail out.
  // Same as: if (engine != nullptr || is_loading) return;
  if (engine || isLoading) return;
  isLoading = true;
  try {
    // CreateMLCEngine does ALL the heavy lifting:
    // 1. Downloads model weights from CDN (cached after first download)
    // 2. Compiles the model to WebGPU shader code (WGSL)
    // 3. Loads weights into GPU memory
    // 4. Returns a ready-to-use engine
    //
    // initProgressCallback fires during download/compilation.
    // report.progress goes from 0.0 to 1.0.
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        onProgress?.(report.progress);
      },
    });
  } finally {
    // Always clear the loading flag, even if init fails.
    // This is the RAII pattern — finally = destructor.
    isLoading = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// INFERENCE: OFFLINE TRIAGE
// ═══════════════════════════════════════════════════════════════

/**
 * Run offline triage on a text description of symptoms.
 *
 * C++ analogy:
 *   This is like calling a CUDA kernel:
 *     kernel<<<grid, block>>>(input_tokens, output_tokens);
 *   The GPU processes the tokens and returns generated text.
 *
 * The function sends the system prompt + user symptoms to the model
 * and returns the generated triage advice.
 *
 * @param symptoms — plain text description of patient symptoms
 * @returns Generated triage advice text
 * @throws Error if engine not initialized
 */
export async function offlineTriage(symptoms: string): Promise<string> {
  // Null check — like asserting a pointer is valid before dereferencing.
  if (!engine) {
    throw new Error("Llama engine not initialized. Call initLlama() first.");
  }

  // engine.chat.completions.create() mirrors the OpenAI Chat API format.
  // WebLLM deliberately uses the same interface so code is portable.
  //
  // messages array = the conversation context:
  //   - "system" message: sets behavior (our medical prompt)
  //   - "user" message: the actual symptoms
  //
  // temperature: 0.3 = low randomness. We want consistent, conservative
  //   medical advice, not creative writing. 0.0 = deterministic,
  //   1.0 = maximum randomness. Think of it as the "epsilon" in
  //   epsilon-greedy exploration.
  //
  // max_tokens: 512 = maximum output length in tokens (~380 words).
  //   Prevents the model from rambling. Like setting a buffer size.
  const response = await engine.chat.completions.create({
    messages: [
      { role: "system", content: MEDICAL_SYSTEM_PROMPT },
      { role: "user", content: `Patient symptoms: ${symptoms}` },
    ],
    temperature: 0.3,
    max_tokens: 512,
  });

  // Extract the generated text from the response.
  // response.choices[0] is the first (and only) completion.
  // ?.message?.content safely navigates the nested object.
  // || "fallback" provides a default if anything is null/undefined.
  return response.choices[0]?.message?.content || "Unable to generate triage advice.";
}

// ═══════════════════════════════════════════════════════════════
// STATUS CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if the Llama engine is loaded and ready for inference.
 *
 * C++ analogy: return engine != nullptr;
 *
 * Tamim uses this to decide whether to show the text triage input
 * or a "Loading AI model..." message.
 */
export function isLlamaReady(): boolean {
  return engine !== null;
}
```

### Function-by-Function Breakdown (C++ Analogies)

| Function | C++ Equivalent | What It Does |
|----------|---------------|---------------|
| `initLlama()` | `dlopen()` + `cudaMalloc()` + `cudaMemcpy()` | Downloads model (~500 MB, cached), compiles to GPU shaders, loads weights into VRAM. One-time cost. |
| `offlineTriage(symptoms)` | `kernel<<<grid,block>>>(input, output)` | Runs the neural network forward pass on the GPU. Takes ~5-15 seconds on a mid-range phone. |
| `isLlamaReady()` | `return engine != nullptr;` | Simple null check. Lets the UI know if inference is available. |

### Memory Model

```
┌─────────────────────────────────────────────┐
│                 Browser Process              │
│                                              │
│  JS Heap (RAM):                              │
│    engine ─────────────┐                     │
│    isLoading: bool     │                     │
│                        ▼                     │
│  ┌──────────────────────────────┐            │
│  │ MLCEngine instance           │            │
│  │  - tokenizer (in RAM)       │            │
│  │  - config metadata          │            │
│  └──────────┬───────────────────┘            │
│             │ references                     │
│             ▼                                │
│  ┌──────────────────────────────┐            │
│  │ GPU Memory (VRAM)            │            │
│  │  - Model weights (~500 MB)  │            │
│  │  - KV cache (grows per tok) │            │
│  │  - Compute shaders (WGSL)   │            │
│  └──────────────────────────────┘            │
│                                              │
│  Cache Storage (disk):                       │
│    - Downloaded model files    │             │
│    - Persists across restarts  │             │
└─────────────────────────────────────────────┘
```

## 4.5 — Audio Recording: `audioRecorder.ts`

This is your other new module. It captures cough audio directly from the microphone using the browser's MediaRecorder API.

Create this file at: `frontend/src/lib/audioRecorder.ts`

```typescript
/**
 * audioRecorder.ts
 *
 * Owner: Rayyan (Edge Architect)
 *
 * Records audio from the device microphone and returns it as a Blob.
 * The output format is audio/webm (what MediaRecorder produces).
 * Kanon's backend accepts audio/webm.
 *
 * C++ Mental Model:
 *   getUserMedia()  ≈ open("/dev/audio", O_RDONLY)  — acquire device handle
 *   MediaRecorder   ≈ std::ofstream with buffered writes
 *   Blob            ≈ std::vector<uint8_t> with a MIME type label
 *   stream.getTracks().forEach(t => t.stop()) ≈ close(fd)
 */

/**
 * Record audio from the microphone for a specified duration.
 *
 * C++ analogy:
 *   int fd = open("/dev/audio", O_RDONLY);   // getUserMedia
 *   char buffer[CHUNK_SIZE];                  // chunks array
 *   while (recording) {
 *     read(fd, buffer, CHUNK_SIZE);           // ondataavailable
 *     output.write(buffer, CHUNK_SIZE);
 *   }
 *   close(fd);                                // stream.getTracks().stop()
 *   return output;                            // resolve(Blob)
 *
 * @param durationMs — how long to record in milliseconds (default: 10 seconds)
 * @returns A Blob containing the recorded audio in audio/webm format
 */
export async function recordAudio(durationMs: number = 10000): Promise<Blob> {
  // ── Step 1: Open the microphone ────────────────────────────
  // navigator.mediaDevices.getUserMedia() prompts the user for
  // microphone permission and returns a MediaStream.
  //
  // C++ analogy: int fd = open("/dev/audio", O_RDONLY);
  // This is async because the browser shows a permission dialog
  // and waits for user approval. The Promise resolves when the
  // user clicks "Allow."
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // ── Step 2: Create the recorder ────────────────────────────
  // MediaRecorder wraps the stream and encodes audio data into
  // a container format (webm by default).
  //
  // C++ analogy: std::ofstream recorder("output.webm", std::ios::binary);
  // The mimeType option specifies the output container format.
  // audio/webm uses the Opus codec — efficient, widely supported.
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

  // ── Step 3: Set up the data buffer ─────────────────────────
  // chunks collects pieces of encoded audio as they become available.
  // Like a std::vector<std::vector<uint8_t>> that we concatenate at the end.
  const chunks: Blob[] = [];

  // ── Step 4: Return a Promise that resolves when recording ends ──
  // This wraps the callback-based MediaRecorder API in a Promise
  // so we can use await. Like wrapping a C callback in a std::future.
  return new Promise((resolve, reject) => {

    // Called periodically as audio data is encoded.
    // Each chunk is a small Blob of encoded audio.
    // C++ analogy: the read() callback in an async I/O loop.
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Called when recording stops (either by timeout or manual stop).
    // We concatenate all chunks into a single Blob and resolve.
    // C++ analogy: close the file, return the buffer.
    recorder.onstop = () => {
      // CRITICAL: Stop all tracks to release the microphone.
      // If you don't do this, the mic stays open (like a leaked fd).
      // The red recording indicator in the browser stays on.
      stream.getTracks().forEach((track) => track.stop());

      // Concatenate chunks into a single Blob with the correct MIME type.
      // Like: std::vector<uint8_t> result;
      //       for (auto& chunk : chunks) result.insert(result.end(), chunk.begin(), chunk.end());
      resolve(new Blob(chunks, { type: "audio/webm" }));
    };

    // Error handler — unlikely but possible (mic disconnected, etc.)
    recorder.onerror = (e) => reject(e);

    // ── Step 5: Start recording ──────────────────────────────
    recorder.start();

    // ── Step 6: Auto-stop after duration ─────────────────────
    // setTimeout schedules a callback after durationMs milliseconds.
    // Like setting an alarm with alarm() or timer_create() in POSIX.
    // We check recorder.state because the user might have stopped
    // recording manually before the timeout fires.
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, durationMs);
  });
}
```

### How It Integrates

When the user taps "Record Cough" in Tamim's UI:
1. `recordAudio(10000)` is called → starts recording for 10 seconds
2. Returns a `Blob` of type `audio/webm`
3. This Blob goes to either:
   - **Online:** `submitDiagnostic(patientId, imageFile, audioBlob)` → direct POST to Kanon's backend
   - **Offline:** `enqueue(patientId, imageFile, audioBlob)` → stored in IndexedDB

The `audioMimeType` field in the `QueuedItem` will be `"audio/webm"`. Kanon's backend already accepts this — he added `"audio/webm"` to `allowed_audio_types` in `main.py`.

## 4.6 — Integration: How Llama + SyncManager + AudioRecorder Work Together

Here's the complete decision tree when the user taps "Analyze":

```
User taps "Analyze"
│
├─ Has image/audio files?
│   ├─ YES + ONLINE  → submitDiagnostic() → direct POST → Gemini 3.1 Flash Lite
│   ├─ YES + OFFLINE → enqueue() → IndexedDB (syncs when online)
│   └─ NO files      → skip (or show error)
│
├─ Has typed symptoms text?
│   ├─ YES + OFFLINE + Llama ready → offlineTriage(symptoms) → immediate preliminary result
│   ├─ YES + OFFLINE + Llama NOT ready → show "Loading AI model..."
│   ├─ YES + ONLINE  → skip Llama, send everything to Gemini directly
│   └─ NO text       → skip
│
└─ When online returns:
    └─ flushQueue() → Gemini full analysis → result SUPERSEDES Llama's preliminary text
```

Here's how Tamim wires this in the UI:

```tsx
import { initLlama, offlineTriage, isLlamaReady } from "./lib/llamaEngine";
import { recordAudio } from "./lib/audioRecorder";
import { submitDiagnostic, initSync } from "./lib/syncManager";

// In the component:
const [llamaReady, setLlamaReady] = useState(false);
const [llamaProgress, setLlamaProgress] = useState(0);
const [prelimResult, setPrelimResult] = useState<string | null>(null);
const [symptoms, setSymptoms] = useState("");

// Start loading Llama in background on app mount
useEffect(() => {
  initLlama((progress) => {
    setLlamaProgress(progress);
    if (progress >= 1) setLlamaReady(true);
  });
}, []);

// Modified analyze handler:
async function handleAnalyze() {
  // 1. If offline and has symptoms text → run Llama
  if (!navigator.onLine && symptoms.trim() && isLlamaReady()) {
    const prelimText = await offlineTriage(symptoms);
    setPrelimResult(prelimText); // Show immediately
  }

  // 2. If has files → submit to sync manager (handles online/offline)
  if (imageFile && audioFile) {
    const result = await submitDiagnostic(patientId, imageFile, audioFile);
    if (result) {
      setPrelimResult(null); // Clear Llama result — Gemini's is authoritative
      setDiagnosis(result.diagnosis);
    }
  }
}

// Record audio handler:
async function handleRecordCough() {
  const audioBlob = await recordAudio(10000); // 10 seconds
  setAudioFile(audioBlob); // Store for submission
}
```

## 4.7 — The Safety Disclaimer

This is critical for a medical AI tool:

> **Every Llama response includes a disclaimer** (baked into the system prompt) that says this is PRELIMINARY and a full AI analysis will run when internet returns. The system prompt enforces this — the model cannot skip it.
>
> When Gemini's result comes back (after sync), the UI **replaces** the Llama preliminary text with Gemini's full multimodal analysis. Tamim's UI makes this transition clear to the health worker.
>
> **Llama CANNOT analyze images or audio.** It only processes text. This is a deliberate architectural constraint — a 1B parameter model running in-browser is not capable of reliable medical image analysis. That's Gemini's job.

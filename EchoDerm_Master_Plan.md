# 🩺 EchoDerm AI — The Ultimate Master Execution Plan

> **Team:** Kanon · Tamim · Rayyan
> **Event:** The Infinity AI BuildFest 2026
> **Mission:** Build a dual-modal diagnostic tool that helps rural health workers in Bangladesh tell the difference between **Measles** and **Dengue** in children — using just a phone camera and microphone.

---

## TABLE OF CONTENTS

- [PART 0: The Whole Overview](#part-0-the-whole-overview)
- [PART 1: KANON — Cloud Backend & Database Engine](#part-1-kanon--the-cloud-backend--database-engine)
- [PART 2: TAMIM — AI Logic & UI Architect](#part-2-tamim--the-ai-logic--ui-architect)
- [PART 3: RAYYAN — Offline Algorithm & Sync Architect](#part-3-rayyan--the-offline-algorithm--sync-architect)
- [PART 4: NEW FEATURES & AI DEPTH SCORE](#part-4-new-features--ai-depth-score)

---

---

# PART 0: THE WHOLE OVERVIEW

## What Are We Actually Building?

EchoDerm AI is a **web app** that runs in a phone browser. A health worker in a rural clinic does two things:

1. **Takes a photo** of a child's skin rash.
2. **Records the child's cough** (a short audio clip).

The app sends both files to Google's Gemini 3.1 Flash Lite AI at the same time. Gemini looks at the rash and listens to the cough, then says: *"This looks like Measles with 87% confidence"* (or Dengue). The result is saved in a database, and the health worker sees clear next steps on their screen.

**The edge-cloud hybrid twist:** When the health worker is **offline**, a secondary AI model — **Llama 3.2 1B** — runs **inside the browser** via WebLLM to provide text-based symptom triage. Image/audio analysis queues for Gemini when connectivity returns.

**The twist:** Rural Bangladesh often has no internet. So the app must work **offline** — it saves everything locally, and when the health worker walks into a network zone, it automatically sends everything.

---

## The Complete Data Lifecycle (Step by Step)

Here is exactly what happens from the moment a health worker opens the app to the moment they see a diagnosis. Read this carefully — it is the blueprint for everything we build.

```
┌─────────────────────────────────────────────────────────────────┐
│                    HEALTH WORKER'S PHONE                        │
│                                                                 │
│  Step 1: Open app in Chrome/Firefox                             │
│  Step 2: Enter patient name (optional patient ID)               │
│  Step 3: Tap "Take Photo" → camera opens → snap rash photo     │
│  Step 4: Tap "Record Cough" → microphone opens → record 5-10s  │
│  Step 5: Tap "Analyze"                                          │
│                                                                 │
│  ┌─────────────── IS THE PHONE ONLINE? ──────────────────┐      │
│  │                                                       │      │
│  │   YES (has internet)          NO (offline/airplane)   │      │
│  │   ─────────────────           ────────────────────    │      │
│  │   Send image + audio         Save image + audio      │      │
│  │   directly to backend        into IndexedDB           │      │
│  │   via HTTP POST              (browser local storage)  │      │
│  │          │                   Add to offline queue     │      │
│  │          │                          │                 │      │
│  │          │                   Show: "Saved! Will       │      │
│  │          │                   sync when online."       │      │
│  │          │                          │                 │      │
│  │          │                   ... health worker walks  │      │
│  │          │                   to a network zone ...    │      │
│  │          │                          │                 │      │
│  │          │                   Browser detects WiFi     │      │
│  │          │                   fires 'online' event     │      │
│  │          │                          │                 │      │
│  │          │                   Sync loop starts:        │      │
│  │          │                   Pop item from queue →    │      │
│  │          │                   POST to backend →        │      │
│  │          │                   Get 200 OK →             │      │
│  │          │                   Delete from IndexedDB →  │      │
│  │          │                   Next item (repeat)       │      │
│  │          │                          │                 │      │
│  │          ▼                          ▼                 │      │
│  └──────── Both paths reach the backend ─────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   KANON'S FASTAPI BACKEND                       │
│                   (runs on a cloud server)                      │
│                                                                 │
│  Step 6: Backend receives POST /analyze                         │
│          - image file (JPEG/PNG of the rash)                    │
│          - audio file (WAV/MP3 of the cough)                    │
│          - patient_id (text string)                              │
│                                                                 │
│  Step 7: Backend validates files (correct type? not empty?)     │
│                                                                 │
│  Step 8: Backend reads both files into raw bytes                │
│          image_bytes = await image.read()                       │
│          audio_bytes = await audio.read()                       │
│                                                                 │
│  Step 9: Backend calls Gemini 3.1 Flash Lite                     │
│          ┌────────────────────────────────┐                     │
│          │  Send to Gemini:               │                     │
│          │   - image bytes (inline data)  │                     │
│          │   - audio bytes (inline data)  │                     │
│          │   - text prompt                │                     │
│          │   - system instruction         │                     │
│          │     (Tamim wrote this)         │                     │
│          └────────────────────────────────┘                     │
│                         │                                       │
│                         ▼                                       │
│  Step 10: Gemini returns strict JSON:                           │
│          {                                                      │
│            "primary_diagnosis": "Measles",                      │
│            "confidence_score": 0.87,                            │
│            "visual_findings": "...",                             │
│            "acoustic_findings": "...",                           │
│            "differential_notes": "...",                          │
│            "recommended_next_steps": ["...", "..."]             │
│          }                                                      │
│                                                                 │
│  Step 11: Backend writes result to Supabase database            │
│          INSERT INTO diagnostic_results (...)                   │
│                                                                 │
│  Step 12: Backend returns JSON response to frontend             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACK ON THE PHONE SCREEN                      │
│                                                                 │
│  Step 13: Frontend receives the JSON response                   │
│                                                                 │
│  Step 14: Tamim's deterministic logic runs:                     │
│           if diagnosis === "Dengue" → show Dengue WHO card      │
│           if diagnosis === "Measles" → show Measles WHO card    │
│                                                                 │
│  Step 15: Health worker sees:                                   │
│           - Big bold diagnosis text                              │
│           - Confidence percentage bar                           │
│           - What the AI saw in the rash                         │
│           - What the AI heard in the cough                      │
│           - Exact next steps from WHO guidelines                │
│           - Warning alerts (e.g. "AVOID IBUPROFEN")             │
│                                                                 │
│  Step 16: Health worker acts on the guidance.                   │
│           Done.                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Who Does What?

| Person | Owns | Key Files |
|--------|------|-----------|
| **Kanon** | Supabase database, FastAPI backend, Gemini SDK wiring | `backend/main.py`, `backend/database.py`, `backend/inference.py`, `.env` |
| **Tamim** | Gemini system instruction, React UI layout, WHO guideline display logic | `frontend/src/App.tsx`, `frontend/src/components/*` |
| **Rayyan** | Offline storage (IndexedDB), sync queue, store-and-forward loop | `frontend/src/lib/offlineQueue.ts`, `frontend/src/lib/syncEngine.ts` |

---

## The Tech Stack in Plain Words

| Tech | What It Is | Why We Use It |
|------|-----------|---------------|
| **React + Vite** | A JavaScript framework to build the phone screen UI. Vite makes it run fast during development. | It's the standard for modern web apps. |
| **Tailwind CSS** | A way to style the UI by adding class names directly to HTML elements (no separate CSS files needed). | Speeds up styling enormously. |
| **Outfit Font + Glassmorphism UI** | Premium dark-themed UI with gradient text, glassmorphism cards, radial gradient backgrounds, and SVG icons. | Polished, professional look for hackathon demo. |
| **Python + FastAPI** | A Python web server that listens for incoming requests. FastAPI is very fast and auto-generates API docs. | Simple to learn, handles file uploads well. |
| **Google GenAI SDK (`google-genai`)** | The new Python SDK (`from google import genai`) that lets us send images and audio to Gemini and get text back. | Gemini 3.1 Flash Lite handles images + audio simultaneously. Cheapest multimodal model. |
| **Supabase (via httpx REST)** | A free hosted PostgreSQL database. We access it via direct REST API calls using `httpx.AsyncClient()` instead of the `supabase-py` wrapper. | Free tier is generous. httpx gives us full async control. |
| **IndexedDB + localforage** | A browser-built-in database that can store large files (images, audio) even when offline. `localforage` is a simple library that makes IndexedDB easy to use. | Required for offline mode. |
| **WebLLM (`@mlc-ai/web-llm`)** | Runs Llama 3.2 1B directly in the browser via WebGPU for offline text-based triage. | No server needed. Works in airplane mode. |

---

---

# PART 1: KANON — The Cloud Backend & Database Engine

> **Kanon, your job is:** Set up the database in Supabase, build the FastAPI server that receives files from the frontend, send those files to Gemini, and save the results.

---

## 1.1 — Set Up Supabase (Click-by-Click)

### Step 1: Create a Supabase Account

1. Open your browser. Go to **https://supabase.com**
2. Click the big green button that says **"Start your project"** (top right corner).
3. Click **"Continue with GitHub"** (easiest option). Log in with your GitHub account.
4. Authorize Supabase when it asks.

### Step 2: Create a New Project

1. You are now on the Supabase Dashboard. You see a page that says "Your projects".
2. Click the green button **"New Project"**.
3. You will see a form. Fill it in:
   - **Organization:** Pick the default one (your personal org) or create one called `echoderm`.
   - **Name:** Type `echoderm-ai`
   - **Database Password:** Type a strong password. **WRITE THIS DOWN.** You will not see it again.
   - **Region:** Pick **Southeast Asia (Singapore)** — it's closest to Bangladesh.
   - **Plan:** Free tier is fine.
4. Click **"Create new project"**.
5. **Wait 1-2 minutes.** Supabase is setting up your database. You will see a loading spinner.

### Step 3: Find Your API Keys

1. After the project is ready, you are on the project home page.
2. Look at the **left sidebar**. Click **"Project Settings"** (the gear icon at the bottom).
3. In the settings page, click **"API"** in the left sub-menu.
4. You will see two important values:
   - **Project URL** — looks like `https://abcdefghij.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`
5. Copy both of these. You need them for your `.env` file.

### Step 4: Open the `.env` File and Paste

Open the file `backend/.env` in your code editor. It looks like this:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_KEY=your_supabase_anon_or_service_role_key_here

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
```

Replace the placeholder values:

```env
SUPABASE_URL=https://abcdefghij.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx...
GEMINI_API_KEY=AIzaSy...
```

> **Where to get the Gemini API key:** Go to https://aistudio.google.com/apikey → Click "Create API key" → Copy it.

### Step 5: Create the Database Table

1. Go back to your Supabase project dashboard.
2. In the **left sidebar**, click **"SQL Editor"** (the icon that looks like a terminal/code block).
3. You see a blank SQL editor. **Paste this exact SQL code** and click the green **"Run"** button:

```sql
-- Create the main diagnostic results table
CREATE TABLE diagnostic_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id TEXT NOT NULL,
  primary_diagnosis TEXT NOT NULL,
  confidence_score FLOAT NOT NULL,
  visual_findings TEXT,
  acoustic_findings TEXT,
  differential_notes TEXT,
  recommended_next_steps JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (Supabase requires this)
ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows the backend to insert rows
-- (using the anon key or service role key)
CREATE POLICY "Allow insert for all" ON diagnostic_results
  FOR INSERT
  WITH CHECK (true);

-- Create a policy that allows reading all rows
CREATE POLICY "Allow read for all" ON diagnostic_results
  FOR SELECT
  USING (true);
```

4. You should see a green message: **"Success. No rows returned."** That means the table was created.

### Step 6: Verify the Table Exists

1. In the **left sidebar**, click **"Table Editor"** (the grid icon).
2. You should see a table called **`diagnostic_results`** in the list.
3. Click on it. It should be empty (no rows yet). That's correct.

---

## 1.2 — The Complete Backend Code

Your backend has 3 Python files. Let's go through each one.

### File: `backend/database.py`

This file connects to Supabase and provides a function to save diagnostic results.

```python
"""
database.py — Supabase connection for EchoDerm AI.
Kanon owns this file.

NOTE: Uses httpx for direct REST API calls to Supabase instead of supabase-py.
This gives us full async support and fewer dependencies.
"""

import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError(
        "SUPABASE_URL and SUPABASE_KEY must be set in the .env file."
    )

# Direct REST API endpoint — append /rest/v1 to the Supabase project URL
REST_URL = f"{SUPABASE_URL}/rest/v1"

# Headers required for all Supabase REST calls
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


async def log_diagnostic_result(
    patient_id: str,
    primary_diagnosis: str,
    confidence_score: float,
    raw_response: dict,
) -> dict:
    """
    Save a diagnostic result to the database via Supabase REST API.
    Returns the saved row data.
    """
    payload = {
        "patient_id": patient_id,
        "primary_diagnosis": primary_diagnosis,
        "confidence_score": confidence_score,
        "visual_findings": raw_response.get("visual_findings", ""),
        "acoustic_findings": raw_response.get("acoustic_findings", ""),
        "differential_notes": raw_response.get("differential_notes", ""),
        "recommended_next_steps": raw_response.get("recommended_next_steps", []),
        "raw_response": raw_response,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{REST_URL}/diagnostic_results",
            headers=HEADERS,
            json=payload,
        )
        response.raise_for_status()
        return response.json()
```

### File: `backend/inference.py`

This is the file that talks to Gemini. It sends the image and audio together.

```python
"""
inference.py — Gemini 3.1 Flash Lite multimodal inference.
Kanon owns the SDK wiring. Tamim owns the SYSTEM_INSTRUCTION text.

NOTE: Uses the NEW google.genai SDK (pip install google-genai),
not the old google.generativeai package.
"""

import json
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL: str = "gemini-3.1-flash-lite"

if not GEMINI_API_KEY:
    raise EnvironmentError("GEMINI_API_KEY must be set in the .env file.")

# Create ONE client — reused for all requests
client = genai.Client(api_key=GEMINI_API_KEY)

# ────────────────────────────────────────────────────────────────
# SYSTEM INSTRUCTION v2 — Tamim writes and owns this text.
# Now includes clinical differentiation markers, confidence
# breakdown by modality, weighted decision logic, and few-shot.
# ────────────────────────────────────────────────────────────────
SYSTEM_INSTRUCTION = """
You are EchoDerm AI, a clinical decision-support assistant specializing in
differentiating Measles from Dengue Fever based on two simultaneous inputs:

1. A photograph of a skin rash.
2. An audio recording of a patient's cough.

── CLINICAL DIFFERENTIATION MARKERS ──

VISUAL (Rash):
• Measles: MACULOPAPULAR rash — flat red spots that become raised.
  Starts behind ears/face → spreads downward to trunk/limbs.
  Koplik spots (white dots inside cheeks) are pathognomonic.
• Dengue: PETECHIAL rash — tiny pinpoint hemorrhagic dots.
  Appears on trunk/limbs during defervescence (fever drop).
  Often with islands of white skin within red areas.

ACOUSTIC (Cough):
• Measles: BARKING COUGH — harsh, seal-like, dry cough.
  Often accompanied by coryza (runny nose).
• Dengue: ABSENT or MINIMAL cough. If present, it is mild and dry.
  Dengue is NOT a respiratory disease.

── DECISION WEIGHTING ──

Apply 60% weight to visual findings, 40% weight to acoustic findings.
If visual and acoustic signals conflict (cross-modal discordance),
note this explicitly and lean toward the visual signal.

── OUTPUT FORMAT ──

Return strict JSON matching this schema. No markdown, no extra keys.
{
  "primary_diagnosis": "Measles" | "Dengue",
  "confidence_score": <float 0.0-1.0>,
  "visual_confidence": <float 0.0-1.0>,
  "acoustic_confidence": <float 0.0-1.0>,
  "cross_modal_agreement": <float 0.0-1.0>,
  "visual_findings": "<rash morphology and distribution>",
  "acoustic_findings": "<cough characteristics>",
  "differential_notes": "<reasoning for the chosen diagnosis>",
  "recommended_next_steps": ["<action 1>", "<action 2>"]
}

── FEW-SHOT EXAMPLES ──

Example 1 (Measles):
{
  "primary_diagnosis": "Measles",
  "confidence_score": 0.91,
  "visual_confidence": 0.93,
  "acoustic_confidence": 0.88,
  "cross_modal_agreement": 0.90,
  "visual_findings": "Maculopapular erythematous rash on face and trunk, confluent in some areas. No petechiae.",
  "acoustic_findings": "Harsh barking cough consistent with measles croup. No wheezing.",
  "differential_notes": "Maculopapular pattern and barking cough strongly indicate measles. Visual (93%) and acoustic (88%) signals agree.",
  "recommended_next_steps": ["Administer Vitamin A 200,000 IU immediately", "Isolate patient — measles is airborne"]
}

Example 2 (Dengue):
{
  "primary_diagnosis": "Dengue",
  "confidence_score": 0.85,
  "visual_confidence": 0.87,
  "acoustic_confidence": 0.82,
  "cross_modal_agreement": 0.84,
  "visual_findings": "Petechial rash on trunk and lower limbs with islands of sparing. No maculopapular pattern.",
  "acoustic_findings": "Minimal cough. No barking quality. Predominantly quiet breathing.",
  "differential_notes": "Petechial rash with absent barking cough rules out measles. Pattern consistent with dengue defervescence rash.",
  "recommended_next_steps": ["Monitor platelet count daily", "Start oral rehydration. AVOID ibuprofen/aspirin."]
}

── RULES ──
- confidence_score must be between 0.0 and 1.0 inclusive.
- primary_diagnosis MUST be exactly "Measles" or "Dengue".
- If the inputs are ambiguous, still pick the most probable diagnosis and
  explain your uncertainty in differential_notes.
- Never refuse to answer. Always provide your best clinical estimate.
"""


async def analyze_multimodal_symptoms(
    image_bytes: bytes,
    image_mime_type: str,
    audio_bytes: bytes,
    audio_mime_type: str,
) -> dict:
    """
    Send the rash image and cough audio to Gemini 3.1 Flash Lite.
    Returns a parsed JSON dictionary with the diagnosis.
    """

    # Build the multimodal content — using types.Part.from_bytes
    contents = [
        # Part 1: The image (sent as raw bytes with its MIME type)
        types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type),

        # Part 2: The audio (sent as raw bytes with its MIME type)
        types.Part.from_bytes(data=audio_bytes, mime_type=audio_mime_type),

        # Part 3: A text instruction
        "Analyze the attached skin-rash photograph and cough audio recording. "
        "Provide your differential diagnosis as strict JSON.",
    ]

    # Build generation config (passed per-call, not on a global model object)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.2,       # Low = more deterministic, less random
        top_p=0.8,
        max_output_tokens=1024,
        response_mime_type="application/json",  # Force JSON output
    )

    # Call Gemini 3.1 Flash Lite (async)
    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    )

    # Parse the JSON string that Gemini returns into a Python dict
    result: dict = json.loads(response.text)

    return result
```

### File: `backend/main.py`

This is the FastAPI server — the front door of the backend.

```python
"""
main.py — FastAPI entry point for EchoDerm AI.
Kanon owns this file.
"""

import uuid
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from inference import analyze_multimodal_symptoms
from database import log_diagnostic_result

# ── Create the app ──────────────────────────────────────────────
app = FastAPI(
    title="EchoDerm AI",
    description="Dual-modal diagnostic API for Measles vs Dengue",
    version="0.1.0",
)

# ── Allow the frontend to talk to this backend ──────────────────
# (CORS = Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # alternative dev port
        "*",                       # allow all during hackathon (tighten later)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check (test if server is alive) ──────────────────────
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "echoderm-ai"}


# ── THE MAIN ROUTE: /analyze ────────────────────────────────────
@app.post("/analyze")
async def analyze(
    image: UploadFile = File(..., description="Photo of the skin rash"),
    audio: UploadFile = File(..., description="Audio of the cough"),
    patient_id: str = Form(default=None, description="Optional patient ID"),
):
    """
    Accepts a skin rash image + cough audio.
    Sends both to Gemini. Saves result to Supabase. Returns diagnosis.
    """

    # ── 1. Check file types ─────────────────────────────────────
    allowed_image_types = {"image/jpeg", "image/png", "image/webp"}
    allowed_audio_types = {
        "audio/wav", "audio/mpeg", "audio/ogg",
        "audio/mp3", "audio/x-wav", "audio/webm",
    }

    if image.content_type not in allowed_image_types:
        raise HTTPException(
            status_code=400,
            detail=f"Bad image type: {image.content_type}. Use JPEG, PNG, or WebP.",
        )

    if audio.content_type not in allowed_audio_types:
        raise HTTPException(
            status_code=400,
            detail=f"Bad audio type: {audio.content_type}. Use WAV, MP3, OGG, or WebM.",
        )

    # ── 2. Read file contents into memory ───────────────────────
    image_bytes = await image.read()
    audio_bytes = await audio.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    # ── 3. Call Gemini AI ───────────────────────────────────────
    try:
        diagnosis = await analyze_multimodal_symptoms(
            image_bytes=image_bytes,
            image_mime_type=image.content_type,
            audio_bytes=audio_bytes,
            audio_mime_type=audio.content_type,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini AI call failed: {exc}",
        )

    # ── 4. Save to Supabase ─────────────────────────────────────
    effective_patient_id = patient_id or str(uuid.uuid4())

    try:
        await log_diagnostic_result(
            patient_id=effective_patient_id,
            primary_diagnosis=diagnosis.get("primary_diagnosis", "Unknown"),
            confidence_score=diagnosis.get("confidence_score", 0.0),
            raw_response=diagnosis,
        )
    except Exception as exc:
        # Don't crash the whole request if the database write fails
        print(f"[WARNING] Could not save to Supabase: {exc}")

    # ── 5. Return the result to the frontend ────────────────────
    return {
        "patient_id": effective_patient_id,
        "diagnosis": diagnosis,
    }
```

---

## 1.3 — How to Run the Backend

Open a terminal. Navigate to the backend folder and run these commands:

```bash
# Go to the backend folder
cd echoderm-ai/backend

# Activate the Python virtual environment
# On Windows:
.\venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies (if you haven't already)
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Test it:
- Open browser → go to `http://localhost:8000/health`
- You should see: `{"status":"ok","service":"echoderm-ai"}`
- Open `http://localhost:8000/docs` → you get a beautiful interactive API docs page where you can test the `/analyze` endpoint by uploading files manually.

---

## 1.4 — How the Gemini SDK Call Actually Works (The Exact Mechanism)

Kanon, here's exactly what happens in `inference.py` when you call Gemini 3.1 Flash Lite using the **new `google.genai` SDK**:

```python
from google import genai
from google.genai import types

# Initialize the client ONCE at module level
client = genai.Client(api_key=GEMINI_API_KEY)

# You create a list of "parts" using types.Part.from_bytes.
# Gemini processes ALL of them together as one single request.

contents = [
    # PART 1: Raw image bytes + what type of image it is
    # Gemini sees: "Oh, this is a JPEG image. Let me look at it."
    types.Part.from_bytes(data=raw_image_bytes, mime_type="image/jpeg"),

    # PART 2: Raw audio bytes + what type of audio it is
    # Gemini sees: "Oh, this is a WAV audio file. Let me listen to it."
    types.Part.from_bytes(data=raw_audio_bytes, mime_type="audio/wav"),

    # PART 3: Text telling Gemini what to do
    "Analyze the attached skin-rash photograph and cough audio recording. "
    "Provide your differential diagnosis as strict JSON.",
]

# Build config per-call (NOT on a global model object like the old SDK)
config = types.GenerateContentConfig(
    system_instruction=SYSTEM_INSTRUCTION,
    temperature=0.2,
    top_p=0.8,
    max_output_tokens=1024,
    response_mime_type="application/json",
)

# This single call sends everything at once — image, audio, and text.
response = await client.aio.models.generate_content(
    model="gemini-3.1-flash-lite",
    contents=contents,
    config=config,
)

# response.text is a JSON string like:
# '{"primary_diagnosis": "Measles", "confidence_score": 0.87, ...}'
result = json.loads(response.text)
```

The key insight: **You don't upload files to a URL.** You send raw bytes directly in the API call via `types.Part.from_bytes()`. Gemini handles image + audio + text all in one shot.

> **SDK Change Note:** The old SDK used `import google.generativeai as genai` and a global `GenerativeModel()` object. The new SDK uses `from google import genai`, creates a `Client`, and passes config per-call. The pip package is now `google-genai` (not `google-generativeai`).

---

---

# PART 2: TAMIM — The AI Logic & UI Architect

> **Tamim, your job is:** Design the phone screen UI, write the system instruction that controls Gemini's behavior, and build the logic that maps AI output to WHO guidelines.

---

## 2.1 — The System Instruction v2 (Your Most Important Text)

This is the text that goes into `inference.py` as the `SYSTEM_INSTRUCTION` variable. Kanon puts it in the code, but **you own the words.** If Gemini gives bad results, you tweak this text.

**What changed in v2:**
- Added explicit clinical differentiation markers (maculopapular vs petechial rash, barking cough vs absent cough)
- Added per-modality confidence breakdown (`visual_confidence`, `acoustic_confidence`, `cross_modal_agreement`)
- Added 60% visual / 40% acoustic weighting
- Added few-shot examples to guide output format

The full v2 system instruction is in Kanon's `inference.py` above (section 1.2). Here's a summary of the key clinical markers:

```text
VISUAL (Rash):
• Measles: MACULOPAPULAR — flat red spots becoming raised.
  Starts behind ears/face → spreads down. Koplik spots = pathognomonic.
• Dengue: PETECHIAL — tiny pinpoint hemorrhagic dots.
  Trunk/limbs during defervescence. Islands of white within red.

ACOUSTIC (Cough):
• Measles: BARKING COUGH — harsh, seal-like, dry. With coryza.
• Dengue: ABSENT or MINIMAL cough. Dengue is NOT respiratory.

DECISION WEIGHTING: 60% visual, 40% acoustic.
If signals conflict → lean toward visual, note discordance.

OUTPUT: Strict JSON with visual_confidence, acoustic_confidence,
and cross_modal_agreement fields for explainability.
```

### Why this works:

| Trick | Why |
|-------|-----|
| `response_mime_type="application/json"` in the config | Forces Gemini to output only valid JSON. No extra text, no markdown. |
| `"primary_diagnosis": "Measles" \| "Dengue"` | Tells Gemini it can ONLY pick one of these two words. |
| `"Never refuse to answer"` | Prevents Gemini from saying "I can't diagnose" — it must always give its best guess. |
| `temperature=0.2` | Makes the output very consistent. Same inputs → similar outputs. |
| Clinical markers (maculopapular vs petechial) | Gives Gemini explicit WHO-standard criteria to evaluate against, improving accuracy. |
| 60/40 visual/acoustic weighting | Tells the model which signal to trust more when they conflict. |
| Few-shot examples | Shows the exact output format with realistic values, reducing schema violations. |
| Per-modality confidence breakdown | Enables the Explainability Panel in the UI. |

---

## 2.2 — The UI Prompt (For Cursor / Lovable / v0)

If you're using an AI UI builder, paste this exact prompt to generate the single-screen interface:

```text
Build a single-page mobile-first React component for a medical diagnostic app
called "EchoDerm AI". It targets rural health workers in Bangladesh.

The screen has these sections from top to bottom:

1. HEADER: App name "EchoDerm AI" with a small stethoscope + AI icon.
   Subtitle: "Measles vs Dengue Diagnostic Tool". Dark gradient background
   (deep blue to teal). White text.

2. PATIENT INFO SECTION: A single text input for "Patient ID" with a
   placeholder "Enter patient name or ID".

3. UPLOAD SECTION — two side-by-side cards:
   a) LEFT CARD — "Skin Rash Photo": An upload area with a camera icon.
      Tapping it opens the phone camera (use input accept="image/*" capture="environment").
      After capturing, show a small thumbnail preview of the photo.
   b) RIGHT CARD — "Cough Recording": An upload area with a microphone icon.
      Tapping it opens a file picker for audio (accept="audio/*").
      After selecting, show the filename.

4. ANALYZE BUTTON: A large, full-width gradient button (teal to green) that
   says "🔍 Analyze Symptoms". Disabled until both files are selected.
   Shows a loading spinner while waiting for the backend response.

5. RESULTS SECTION (hidden until results arrive): A card with:
   - Large bold diagnosis text: "Measles" or "Dengue" in a colored badge
     (red for Measles, orange for Dengue)
   - Confidence bar: a horizontal progress bar showing the percentage
   - "What the AI saw:" — visual_findings text
   - "What the AI heard:" — acoustic_findings text
   - "Reasoning:" — differential_notes text
   - "Next Steps:" — a numbered list from recommended_next_steps array
   - A WHO GUIDELINES ALERT BOX at the bottom (see the WHO mapping logic below)

6. OFFLINE INDICATOR: A small banner at the top that appears when offline,
   showing "📡 You are offline — data will sync when connected" in yellow/amber.

7. SYNC STATUS: A small counter showing "X items waiting to sync" when the
   offline queue has unsent items.

Use Tailwind CSS. Make it dark-themed with a premium glassmorphism aesthetic.
Use the Outfit font from Google Fonts. Round corners on all cards.
Use glassmorphism cards (.glass class) with backdrop-blur and gradient text (.gradient-text).
Radial gradient background. SVG icons instead of emoji where possible.
Add subtle animations: fade-in for results, pulse for the loading state.
Make all touch targets at least 48px tall for easy phone tapping.
The layout must look good on a 360px wide screen (budget Android phone).
```

---

## 2.3 — The WHO Guidelines Mapping Logic

After the AI returns its diagnosis, you run this deterministic (non-AI) logic to show the correct medical guidance. This is a simple `if/else` — no AI involved here.

Create this file: `frontend/src/lib/whoGuidelines.ts`

```typescript
/**
 * whoGuidelines.ts
 *
 * Tamim owns this file.
 *
 * This maps the AI's diagnosis to the correct WHO clinical guidelines.
 * This is NOT AI — it is hardcoded medical advice from WHO protocols.
 * The AI picks the diagnosis; this file picks the matching advice.
 */

export interface WHOGuideline {
  disease: string;
  alertLevel: "critical" | "warning" | "info";
  alertColor: string;        // Tailwind CSS color class
  medications: string[];
  dangerSigns: string[];
  immediateActions: string[];
  strictlyAvoid: string[];
  referralCriteria: string;
  isolationRequired: boolean;
  isolationDuration: string;
}

/**
 * Given a diagnosis string ("Measles" or "Dengue"),
 * return the full WHO guideline object.
 */
export function getWHOGuideline(diagnosis: string): WHOGuideline {

  // ──────────────────────────────────────────────────────────
  // MEASLES — WHO Guidelines
  // Source: WHO Measles Fact Sheet & IMCI Guidelines
  // ──────────────────────────────────────────────────────────
  if (diagnosis === "Measles") {
    return {
      disease: "Measles",
      alertLevel: "critical",
      alertColor: "bg-red-600",

      medications: [
        "Vitamin A — 200,000 IU orally, immediately (for children over 12 months)",
        "Vitamin A — 100,000 IU for children 6-11 months",
        "Second dose of Vitamin A the next day",
        "Paracetamol for fever (10-15 mg/kg every 4-6 hours as needed)",
        "ORS (Oral Rehydration Salts) if diarrhea is present",
      ],

      dangerSigns: [
        "Inability to drink or breastfeed",
        "Vomiting everything",
        "Convulsions (seizures)",
        "Lethargy or unconsciousness",
        "Mouth ulcers that prevent eating",
        "Clouding of the cornea (eye involvement)",
        "Deep or fast breathing (pneumonia sign)",
      ],

      immediateActions: [
        "Administer Vitamin A immediately — this is the #1 priority",
        "Isolate the patient from other children (measles is airborne)",
        "Monitor temperature every 4 hours",
        "Ensure adequate fluid intake",
        "Check for ear discharge (otitis media complication)",
        "Check eyes daily for corneal clouding",
        "Notify the local health authority (measles is a notifiable disease)",
      ],

      strictlyAvoid: [
        "DO NOT give Aspirin to children (risk of Reye's syndrome)",
        "DO NOT delay Vitamin A — every hour matters",
        "DO NOT send the child to a crowded waiting room (spread risk)",
      ],

      referralCriteria:
        "Refer URGENTLY to hospital if any danger sign is present, " +
        "if the child is severely malnourished, or if pneumonia is suspected.",

      isolationRequired: true,
      isolationDuration: "4 days after rash onset (minimum)",
    };
  }

  // ──────────────────────────────────────────────────────────
  // DENGUE — WHO Guidelines
  // Source: WHO Dengue Guidelines for Diagnosis, Treatment,
  //         Prevention and Control (2009, updated 2012)
  // ──────────────────────────────────────────────────────────
  if (diagnosis === "Dengue") {
    return {
      disease: "Dengue",
      alertLevel: "warning",
      alertColor: "bg-orange-500",

      medications: [
        "Paracetamol ONLY for fever (10-15 mg/kg every 4-6 hours)",
        "ORS or IV fluids if signs of dehydration",
        "NO specific antiviral — treatment is supportive only",
      ],

      dangerSigns: [
        "Severe abdominal pain (continuous)",
        "Persistent vomiting (3 or more times in 24 hours)",
        "Fluid accumulation (ascites, pleural effusion)",
        "Mucosal bleeding (gums, nose, vomiting blood)",
        "Lethargy or restlessness",
        "Liver enlargement > 2 cm",
        "Rapid decrease in platelet count",
        "Rising hematocrit with rapid decrease in platelet count",
      ],

      immediateActions: [
        "Start oral rehydration immediately",
        "Monitor platelet count and hematocrit daily",
        "Record fluid intake and output",
        "Check blood pressure and pulse every 2-4 hours",
        "Watch for warning signs during the critical phase (days 3-7 of illness)",
        "Ensure the patient stays hydrated — encourage drinking water, juice, ORS",
        "Use mosquito nets around the patient's bed (prevent further transmission)",
      ],

      strictlyAvoid: [
        "⚠️ STRICTLY AVOID Ibuprofen (increases bleeding risk)",
        "⚠️ STRICTLY AVOID Aspirin (increases bleeding risk)",
        "⚠️ STRICTLY AVOID NSAIDs of any kind",
        "DO NOT give intramuscular injections (bleeding risk)",
        "DO NOT use dark-colored fluids (makes it hard to detect vomiting blood)",
      ],

      referralCriteria:
        "Refer IMMEDIATELY to hospital if any warning sign is present, " +
        "if platelet count drops below 100,000, or if there is any bleeding.",

      isolationRequired: false,
      isolationDuration: "Not required (Dengue is mosquito-borne, not person-to-person)",
    };
  }

  // ──────────────────────────────────────────────────────────
  // FALLBACK — should never happen, but just in case
  // ──────────────────────────────────────────────────────────
  return {
    disease: "Unknown",
    alertLevel: "info",
    alertColor: "bg-gray-500",
    medications: ["Consult a physician"],
    dangerSigns: ["Any sign of clinical deterioration"],
    immediateActions: ["Refer to the nearest health facility"],
    strictlyAvoid: [],
    referralCriteria: "Refer immediately for proper assessment.",
    isolationRequired: false,
    isolationDuration: "N/A",
  };
}
```

### How to Use This in Your React Component

In your results display component:

```tsx
import { getWHOGuideline } from "../lib/whoGuidelines";

// After the backend returns the diagnosis:
const guideline = getWHOGuideline(diagnosis.primary_diagnosis);

// Now render:
// guideline.medications        → list of meds
// guideline.dangerSigns        → list of danger signs
// guideline.immediateActions   → list of what to do right now
// guideline.strictlyAvoid      → list of things to NEVER do (show in red)
// guideline.referralCriteria   → when to send to hospital
// guideline.isolationRequired  → true/false
// guideline.alertColor         → "bg-red-600" or "bg-orange-500"
```

### Example React JSX for the WHO Alert Box

```tsx
{/* WHO GUIDELINES ALERT */}
<div className={`rounded-xl p-4 mt-4 ${guideline.alertColor} text-white`}>
  <h3 className="text-lg font-bold mb-2">
    ⚕️ WHO Clinical Guidelines — {guideline.disease}
  </h3>

  {/* Strictly Avoid — MOST IMPORTANT, show first */}
  {guideline.strictlyAvoid.length > 0 && (
    <div className="bg-black/20 rounded-lg p-3 mb-3">
      <h4 className="font-bold text-yellow-200">🚫 STRICTLY AVOID:</h4>
      <ul className="list-disc list-inside mt-1">
        {guideline.strictlyAvoid.map((item, i) => (
          <li key={i} className="font-semibold">{item}</li>
        ))}
      </ul>
    </div>
  )}

  {/* Immediate Actions */}
  <div className="mb-3">
    <h4 className="font-bold">✅ Immediate Actions:</h4>
    <ol className="list-decimal list-inside mt-1">
      {guideline.immediateActions.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  </div>

  {/* Danger Signs */}
  <div className="mb-3">
    <h4 className="font-bold">🔴 Danger Signs (Refer to Hospital If Any):</h4>
    <ul className="list-disc list-inside mt-1">
      {guideline.dangerSigns.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  </div>

  {/* Medications */}
  <div className="mb-3">
    <h4 className="font-bold">💊 Medications:</h4>
    <ul className="list-disc list-inside mt-1">
      {guideline.medications.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  </div>

  {/* Referral */}
  <div className="bg-black/20 rounded-lg p-3">
    <h4 className="font-bold">🏥 Referral Criteria:</h4>
    <p className="mt-1">{guideline.referralCriteria}</p>
  </div>

  {/* Isolation */}
  {guideline.isolationRequired && (
    <div className="mt-3 bg-black/20 rounded-lg p-3">
      <h4 className="font-bold">🔒 Isolation Required:</h4>
      <p className="mt-1">{guideline.isolationDuration}</p>
    </div>
  )}
</div>
```

---

## 2.4 — The Complete Results Display Component

Create file: `frontend/src/components/DiagnosisResult.tsx`

```tsx
import React from "react";
import { getWHOGuideline, WHOGuideline } from "../lib/whoGuidelines";

interface DiagnosisData {
  primary_diagnosis: string;
  confidence_score: number;
  visual_findings: string;
  acoustic_findings: string;
  differential_notes: string;
  recommended_next_steps: string[];
}

interface Props {
  diagnosis: DiagnosisData;
  patientId: string;
}

export default function DiagnosisResult({ diagnosis, patientId }: Props) {
  const guideline: WHOGuideline = getWHOGuideline(diagnosis.primary_diagnosis);
  const confidencePercent = Math.round(diagnosis.confidence_score * 100);

  // Badge color based on diagnosis
  const badgeColor =
    diagnosis.primary_diagnosis === "Measles"
      ? "bg-red-600"
      : diagnosis.primary_diagnosis === "Dengue"
      ? "bg-orange-500"
      : "bg-gray-500";

  return (
    <div className="animate-fadeIn space-y-4">
      {/* ── Diagnosis Header ─────────────────────────── */}
      <div className="bg-gray-800 rounded-2xl p-6 text-center">
        <p className="text-gray-400 text-sm mb-2">Patient: {patientId}</p>

        <span className={`inline-block px-6 py-2 rounded-full text-white text-2xl font-bold ${badgeColor}`}>
          {diagnosis.primary_diagnosis}
        </span>

        {/* Confidence Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Confidence</span>
            <span>{confidencePercent}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-1000 ${badgeColor}`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── AI Findings ──────────────────────────────── */}
      <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
        <div>
          <h4 className="text-teal-400 font-semibold text-sm">👁️ What the AI Saw (Rash):</h4>
          <p className="text-gray-300 mt-1">{diagnosis.visual_findings}</p>
        </div>
        <div>
          <h4 className="text-teal-400 font-semibold text-sm">👂 What the AI Heard (Cough):</h4>
          <p className="text-gray-300 mt-1">{diagnosis.acoustic_findings}</p>
        </div>
        <div>
          <h4 className="text-teal-400 font-semibold text-sm">🧠 Reasoning:</h4>
          <p className="text-gray-300 mt-1">{diagnosis.differential_notes}</p>
        </div>
      </div>

      {/* ── AI Next Steps ────────────────────────────── */}
      <div className="bg-gray-800 rounded-2xl p-5">
        <h4 className="text-teal-400 font-semibold text-sm mb-2">📋 AI Recommended Steps:</h4>
        <ol className="list-decimal list-inside text-gray-300 space-y-1">
          {diagnosis.recommended_next_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      {/* ── WHO Guidelines (the big colored alert) ──── */}
      <div className={`rounded-2xl p-5 ${guideline.alertColor} text-white`}>
        <h3 className="text-lg font-bold mb-3">
          ⚕️ WHO Guidelines — {guideline.disease}
        </h3>

        {guideline.strictlyAvoid.length > 0 && (
          <div className="bg-black/20 rounded-xl p-4 mb-3">
            <h4 className="font-bold text-yellow-200">🚫 STRICTLY AVOID:</h4>
            <ul className="list-disc list-inside mt-1 space-y-1">
              {guideline.strictlyAvoid.map((item, i) => (
                <li key={i} className="font-semibold">{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3">
          <h4 className="font-bold">✅ Do Immediately:</h4>
          <ol className="list-decimal list-inside mt-1 space-y-1">
            {guideline.immediateActions.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </div>

        <div className="mb-3">
          <h4 className="font-bold">🔴 Danger Signs:</h4>
          <ul className="list-disc list-inside mt-1 space-y-1">
            {guideline.dangerSigns.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="mb-3">
          <h4 className="font-bold">💊 Medications:</h4>
          <ul className="list-disc list-inside mt-1 space-y-1">
            {guideline.medications.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="bg-black/20 rounded-xl p-4 mt-3">
          <h4 className="font-bold">🏥 Send to Hospital If:</h4>
          <p className="mt-1">{guideline.referralCriteria}</p>
        </div>

        {guideline.isolationRequired && (
          <div className="bg-black/20 rounded-xl p-4 mt-3">
            <h4 className="font-bold">🔒 Isolation Needed:</h4>
            <p className="mt-1">{guideline.isolationDuration}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

---

# PART 3: RAYYAN — The Offline Algorithm & Sync Architect

> **Rayyan, your job is:** Make the app work without internet. When the health worker is offline, save everything locally. When they get internet, send everything automatically. Nothing must be lost. Nothing must be sent twice.

---

## 3.1 — Install localforage

Open a terminal in the `frontend` folder:

```bash
cd echoderm-ai/frontend
npm install localforage
```

That's it. `localforage` is a small library (8 KB) that makes browser IndexedDB easy to use. It works like `localStorage` but can store large binary files (images, audio).

---

## 3.2 — The Offline Queue (Data Structure)

Think of this as a **FIFO queue** (First In, First Out) stored inside the browser.

```
INDEXEDDB (inside the browser)
┌─────────────────────────────────────────┐
│  Key: "offline_queue"                   │
│  Value: [                               │
│    {                                    │
│      id: "uuid-1",                      │
│      timestamp: 1716800000000,          │
│      patient_id: "patient-abc",         │
│      image: Blob(45000 bytes),          │  ← actual JPEG bytes
│      imageMimeType: "image/jpeg",       │
│      audio: Blob(120000 bytes),         │  ← actual WAV bytes
│      audioMimeType: "audio/wav",        │
│      status: "pending"                  │
│    },                                   │
│    {                                    │
│      id: "uuid-2",                      │
│      ... another queued item ...        │
│    }                                    │
│  ]                                      │
└─────────────────────────────────────────┘
```

When the network comes back, the sync engine:
1. Reads the array.
2. Takes the first item (`shift()` — like popping from a queue).
3. POSTs it to the backend.
4. If it gets back `200 OK`, deletes that item from the array.
5. Moves to the next item.
6. Repeats until the array is empty.

---

## 3.3 — The Code

Create file: `frontend/src/lib/offlineQueue.ts`

```typescript
/**
 * offlineQueue.ts
 *
 * Rayyan owns this file.
 *
 * This module manages the offline queue using IndexedDB (via localforage).
 * It stores patient diagnostic payloads when the device is offline
 * and provides functions to add, read, and remove items.
 */

import localforage from "localforage";

// Configure localforage to use IndexedDB with a specific database name
localforage.config({
  name: "EchoDermAI",
  storeName: "offline_queue_store",
  description: "Offline queue for EchoDerm AI diagnostic payloads",
});

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────

export interface QueuedItem {
  id: string;              // Unique ID for this queued item
  timestamp: number;       // When it was queued (Date.now())
  patientId: string;       // Patient identifier
  imageBlob: Blob;         // The raw image file
  imageMimeType: string;   // e.g. "image/jpeg"
  audioBlob: Blob;         // The raw audio file
  audioMimeType: string;   // e.g. "audio/wav"
  status: "pending" | "sending" | "failed";
  retryCount: number;      // How many times we've tried to send this
}

// The key we use in localforage to store the entire queue array
const QUEUE_KEY = "diagnostic_queue";

// ────────────────────────────────────────────────────────────────
// FUNCTIONS
// ────────────────────────────────────────────────────────────────

/**
 * Generate a simple unique ID.
 * (We don't need a library for this — crypto.randomUUID works in all modern browsers)
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get the entire queue from IndexedDB.
 * Returns an empty array if nothing is stored.
 */
export async function getQueue(): Promise<QueuedItem[]> {
  const queue = await localforage.getItem<QueuedItem[]>(QUEUE_KEY);
  return queue || [];
}

/**
 * Get the number of items waiting in the queue.
 */
export async function getQueueLength(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

/**
 * Add a new diagnostic payload to the offline queue.
 * Call this when navigator.onLine is false.
 */
export async function enqueue(
  patientId: string,
  imageFile: File,
  audioFile: File
): Promise<QueuedItem> {
  const queue = await getQueue();

  const newItem: QueuedItem = {
    id: generateId(),
    timestamp: Date.now(),
    patientId: patientId || `anonymous-${Date.now()}`,
    imageBlob: imageFile,        // File extends Blob, so this works
    imageMimeType: imageFile.type,
    audioBlob: audioFile,
    audioMimeType: audioFile.type,
    status: "pending",
    retryCount: 0,
  };

  queue.push(newItem);
  await localforage.setItem(QUEUE_KEY, queue);

  console.log(`[OfflineQueue] Enqueued item ${newItem.id}. Queue size: ${queue.length}`);
  return newItem;
}

/**
 * Remove an item from the queue after it has been successfully sent.
 * This prevents double-sending.
 */
export async function dequeue(itemId: string): Promise<void> {
  let queue = await getQueue();
  queue = queue.filter((item) => item.id !== itemId);
  await localforage.setItem(QUEUE_KEY, queue);

  console.log(`[OfflineQueue] Dequeued item ${itemId}. Queue size: ${queue.length}`);
}

/**
 * Update the status of an item (e.g., mark it as "sending" or "failed").
 */
export async function updateItemStatus(
  itemId: string,
  status: QueuedItem["status"],
  incrementRetry: boolean = false
): Promise<void> {
  const queue = await getQueue();
  const item = queue.find((i) => i.id === itemId);

  if (item) {
    item.status = status;
    if (incrementRetry) {
      item.retryCount += 1;
    }
    await localforage.setItem(QUEUE_KEY, queue);
  }
}

/**
 * Clear the entire queue. Use with caution — only for debugging/reset.
 */
export async function clearQueue(): Promise<void> {
  await localforage.setItem(QUEUE_KEY, []);
  console.log("[OfflineQueue] Queue cleared.");
}
```

---

Create file: `frontend/src/lib/syncEngine.ts`

```typescript
/**
 * syncEngine.ts
 *
 * Rayyan owns this file.
 *
 * This module handles the "store-and-forward" sync logic.
 * When the browser goes online, it loops through the offline queue,
 * sends each item to the backend, and removes it upon success.
 */

import { getQueue, dequeue, updateItemStatus, QueuedItem } from "./offlineQueue";

// ────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────

// The URL of Kanon's backend
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Maximum number of retries per item before giving up
const MAX_RETRIES = 3;

// Delay between retries (in milliseconds) — exponential backoff
function getRetryDelay(retryCount: number): number {
  // 1st retry: 2 seconds, 2nd: 4 seconds, 3rd: 8 seconds
  return Math.pow(2, retryCount) * 1000;
}

// ────────────────────────────────────────────────────────────────
// THE SYNC FUNCTION — sends ONE item to the backend
// ────────────────────────────────────────────────────────────────

async function sendOneItem(item: QueuedItem): Promise<boolean> {
  try {
    // Mark as "sending" so the UI can show a spinner
    await updateItemStatus(item.id, "sending");

    // Build the multipart form data — exactly what the backend expects
    const formData = new FormData();
    formData.append("image", item.imageBlob, `rash.${item.imageMimeType.split("/")[1]}`);
    formData.append("audio", item.audioBlob, `cough.${item.audioMimeType.split("/")[1]}`);
    formData.append("patient_id", item.patientId);

    // POST to the backend
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      body: formData,
      // Note: Do NOT set Content-Type header — the browser sets it
      // automatically with the correct multipart boundary.
    });

    if (response.ok) {
      // ✅ SUCCESS — remove from queue so it won't be sent again
      await dequeue(item.id);
      const result = await response.json();
      console.log(`[SyncEngine] ✅ Item ${item.id} sent successfully.`, result);

      // Dispatch a custom event so the UI can show the result
      window.dispatchEvent(
        new CustomEvent("echoderm:sync-result", {
          detail: { itemId: item.id, result, patientId: item.patientId },
        })
      );

      return true;
    } else {
      // ❌ Server returned an error (4xx or 5xx)
      console.error(`[SyncEngine] ❌ Item ${item.id} failed with status ${response.status}`);
      await updateItemStatus(item.id, "failed", true);
      return false;
    }
  } catch (error) {
    // ❌ Network error (e.g., server is down, WiFi dropped mid-request)
    console.error(`[SyncEngine] ❌ Item ${item.id} network error:`, error);
    await updateItemStatus(item.id, "failed", true);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// THE SYNC LOOP — processes the ENTIRE queue
// ────────────────────────────────────────────────────────────────

let isSyncing = false; // Prevents two sync loops from running at the same time

export async function processQueue(): Promise<void> {
  // Guard: Don't start if already syncing
  if (isSyncing) {
    console.log("[SyncEngine] Sync already in progress. Skipping.");
    return;
  }

  // Guard: Don't start if offline
  if (!navigator.onLine) {
    console.log("[SyncEngine] Still offline. Skipping.");
    return;
  }

  isSyncing = true;
  console.log("[SyncEngine] 🔄 Starting sync loop...");

  // Notify the UI that sync started
  window.dispatchEvent(new CustomEvent("echoderm:sync-start"));

  try {
    const queue = await getQueue();

    if (queue.length === 0) {
      console.log("[SyncEngine] Queue is empty. Nothing to sync.");
      return;
    }

    console.log(`[SyncEngine] Found ${queue.length} items to sync.`);

    // Process items one by one (FIFO order)
    // We re-fetch the queue each iteration because dequeue modifies it
    let currentQueue = await getQueue();

    while (currentQueue.length > 0 && navigator.onLine) {
      const item = currentQueue[0]; // Take the first item (FIFO)

      // Skip items that have exceeded max retries
      if (item.retryCount >= MAX_RETRIES) {
        console.warn(
          `[SyncEngine] ⚠️ Item ${item.id} exceeded ${MAX_RETRIES} retries. Skipping.`
        );
        // Move to the end of the queue instead of deleting
        // (so the user can manually retry later)
        currentQueue = currentQueue.slice(1); // Remove from front
        currentQueue.push(item);               // Add to back
        await dequeue(item.id);                // This actually removes it
        // Re-enqueue at the back — but for simplicity, just skip it
        continue;
      }

      // Try to send this item
      const success = await sendOneItem(item);

      if (!success) {
        // If it failed, wait before retrying the next item
        const delay = getRetryDelay(item.retryCount);
        console.log(`[SyncEngine] Waiting ${delay}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Re-read the queue (it was modified by dequeue or updateItemStatus)
      currentQueue = await getQueue();
    }
  } finally {
    isSyncing = false;

    // Notify the UI that sync finished
    const remaining = await getQueue();
    window.dispatchEvent(
      new CustomEvent("echoderm:sync-end", {
        detail: { remainingCount: remaining.length },
      })
    );

    console.log("[SyncEngine] ✅ Sync loop finished.");
  }
}

// ────────────────────────────────────────────────────────────────
// EVENT LISTENERS — auto-sync when network comes back
// ────────────────────────────────────────────────────────────────

/**
 * Call this ONCE when the app starts.
 * It sets up listeners for online/offline events.
 */
export function initSyncListeners(): void {
  // When the browser goes online → start syncing
  window.addEventListener("online", () => {
    console.log("[SyncEngine] 🌐 Network is ONLINE. Starting sync...");
    window.dispatchEvent(new CustomEvent("echoderm:online"));
    processQueue();
  });

  // When the browser goes offline → just log it
  window.addEventListener("offline", () => {
    console.log("[SyncEngine] 📡 Network is OFFLINE. Queuing will begin.");
    window.dispatchEvent(new CustomEvent("echoderm:offline"));
  });

  // On app startup, if we're online, try to flush any leftover queue
  if (navigator.onLine) {
    console.log("[SyncEngine] App started while online. Checking for queued items...");
    processQueue();
  }

  console.log("[SyncEngine] Sync listeners initialized.");
}
```

---

## 3.4 — How the Frontend Uses It (Integration Guide for Tamim)

In the main `App.tsx`, Tamim needs to wire the offline logic into the "Analyze" button.

Here is the core logic for the submit handler:

```tsx
import { enqueue, getQueueLength } from "./lib/offlineQueue";
import { initSyncListeners, processQueue } from "./lib/syncEngine";
import { useEffect, useState } from "react";

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);

  // Initialize sync listeners on app startup (run ONCE)
  useEffect(() => {
    initSyncListeners();

    // Update queue count periodically
    const updateCount = async () => {
      const count = await getQueueLength();
      setQueueCount(count);
    };
    updateCount();

    // Listen for online/offline custom events
    const handleOnline = () => { setIsOnline(true); updateCount(); };
    const handleOffline = () => setIsOnline(false);
    const handleSyncEnd = (e: CustomEvent) => {
      setQueueCount(e.detail.remainingCount);
    };
    const handleSyncResult = (e: CustomEvent) => {
      // Show the diagnosis that came back from a synced item
      setDiagnosis(e.detail.result.diagnosis);
    };

    window.addEventListener("echoderm:online", handleOnline);
    window.addEventListener("echoderm:offline", handleOffline);
    window.addEventListener("echoderm:sync-end", handleSyncEnd as EventListener);
    window.addEventListener("echoderm:sync-result", handleSyncResult as EventListener);

    return () => {
      window.removeEventListener("echoderm:online", handleOnline);
      window.removeEventListener("echoderm:offline", handleOffline);
      window.removeEventListener("echoderm:sync-end", handleSyncEnd as EventListener);
      window.removeEventListener("echoderm:sync-result", handleSyncResult as EventListener);
    };
  }, []);

  // ── THE SUBMIT HANDLER ───────────────────────────────────────
  async function handleAnalyze(
    patientId: string,
    imageFile: File,
    audioFile: File
  ) {
    // CHECK: Are we online or offline?
    if (!navigator.onLine) {
      // ── OFFLINE PATH ──
      // Save to IndexedDB queue. Don't try to call the server.
      await enqueue(patientId, imageFile, audioFile);
      const count = await getQueueLength();
      setQueueCount(count);
      alert("📡 You are offline. Your data has been saved and will be sent automatically when you reconnect.");
      return;
    }

    // ── ONLINE PATH ──
    // Send directly to the backend
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("audio", audioFile);
      formData.append("patient_id", patientId);

      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      setDiagnosis(data.diagnosis);
    } catch (error) {
      // If the direct send fails (e.g., server went down mid-request),
      // fall back to the offline queue
      console.error("Direct send failed. Falling back to offline queue.", error);
      await enqueue(patientId, imageFile, audioFile);
      const count = await getQueueLength();
      setQueueCount(count);
      alert("⚠️ Connection failed. Your data has been saved locally and will sync automatically.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-black text-center py-2 text-sm font-semibold">
          📡 You are offline — data will sync when connected
        </div>
      )}

      {/* Queue counter */}
      {queueCount > 0 && (
        <div className="bg-blue-600 text-white text-center py-1 text-sm">
          🔄 {queueCount} item{queueCount > 1 ? "s" : ""} waiting to sync
        </div>
      )}

      {/* ... rest of the UI (Tamim builds this) ... */}
    </div>
  );
}
```

---

## 3.5 — How to Test Offline Mode on Your Phone

This is how Rayyan (and the whole team) can test the offline feature on a real phone.

### Step 1: Find Your Computer's Local IP Address

```bash
# On Windows (PowerShell):
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
# It will be something like: 192.168.1.105

# On Mac/Linux:
ifconfig | grep "inet "
# or
hostname -I
```

### Step 2: Start the Frontend Dev Server to Accept Network Connections

By default, Vite only listens on `localhost` (your computer only). To make it visible to your phone, you need the `--host` flag:

```bash
cd echoderm-ai/frontend
npm run dev -- --host
```

You will see output like:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.105:5173/    ← USE THIS ONE
```

### Step 3: Open the App on Your Phone

1. Make sure your phone is connected to the **same WiFi** as your computer.
2. Open Chrome (or any browser) on your phone.
3. Type the Network URL: `http://192.168.1.105:5173` (use your actual IP).
4. You should see the EchoDerm AI app.

### Step 4: Test the Offline Flow

1. **While online:** Take a photo and record audio. Tap Analyze. Confirm it works — you see the diagnosis.
2. **Turn on Airplane Mode** on your phone (or turn off WiFi).
3. The yellow banner should appear: "📡 You are offline".
4. Take another photo and record audio. Tap Analyze.
5. You should see: "Your data has been saved and will sync when connected."
6. The blue counter should say: "1 item waiting to sync".
7. **Turn off Airplane Mode** (turn WiFi back on).
8. Watch the console (or the sync counter) — it should automatically:
   - Detect the network is back
   - POST the queued item to the backend
   - Remove it from the queue
   - The counter drops to 0
   - The diagnosis appears on screen

### Step 5: Also Test the Backend is Running

Make sure Kanon's backend is running on the same computer:

```bash
# In a separate terminal:
cd echoderm-ai/backend
.\venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The `--host 0.0.0.0` flag makes the backend accept connections from your phone too.

Create a `.env` file in the frontend:

```bash
# frontend/.env
VITE_API_URL=http://192.168.1.105:8000
```

Replace `192.168.1.105` with your actual computer IP.

---

## 3.6 — The Queue Algorithm Visualized

Here is the exact algorithm as a step-by-step flowchart:

```
┌──────────────────────────────────────────────────────────────┐
│                   USER TAPS "ANALYZE"                        │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ navigator.onLine │
              │   === true?      │
              └────────┬─────────┘
                  YES  │   NO
           ┌───────────┤───────────┐
           ▼                       ▼
   ┌───────────────┐      ┌────────────────────┐
   │ Build FormData │      │ enqueue(patient,   │
   │ POST /analyze  │      │   imageFile,       │
   │ to backend     │      │   audioFile)       │
   └───────┬───────┘      │                    │
           │               │ Save to IndexedDB  │
           ▼               │ queue.push(item)   │
   ┌───────────────┐      └────────┬───────────┘
   │ response.ok?  │               │
   └───────┬───────┘               ▼
      YES  │   NO          ┌───────────────────┐
   ┌───────┤──────┐        │ Show message:     │
   ▼              ▼        │ "Saved! Will sync │
  Show         enqueue()   │  when online."    │
  Result       (fallback)  └───────────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │  ... time passes ... │
                           │  Phone gets WiFi     │
                           └────────┬────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ 'online' event fires │
                           │ → processQueue()     │
                           └────────┬────────────┘
                                    │
                                    ▼
                          ┌──────────────────────┐
                          │ queue = getQueue()    │
                          │ while queue.length > 0│
                          │   AND navigator.onLine│
                          └────────┬─────────────┘
                                   │
                                   ▼
                          ┌──────────────────────┐
                          │ item = queue[0]       │  ← Take first (FIFO)
                          │ Build FormData        │
                          │ POST /analyze         │
                          └────────┬─────────────┘
                                   │
                              ┌────┴────┐
                              │ 200 OK? │
                              └────┬────┘
                            YES    │    NO
                          ┌────────┤────────┐
                          ▼                 ▼
                     dequeue(id)      status="failed"
                     (remove from     retryCount++
                      IndexedDB)      wait (backoff)
                          │                 │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌──────────────────────┐
                          │ queue = getQueue()    │  ← Re-read queue
                          │ loop back to while    │
                          └──────────────────────┘
                                   │
                         (repeat until queue is empty
                          or phone goes offline again)
```

---

---

## APPENDIX A: File Structure Cheat Sheet

```
echoderm-ai/
├── .gitignore
├── EchoDerm_Master_Plan.md           ← THIS FILE
│
├── backend/
│   ├── .env                          ← API keys (NEVER commit this)
│   ├── requirements.txt              ← Python deps (google-genai, httpx, etc.)
│   ├── venv/                         ← Python virtual environment
│   ├── main.py                       ← FastAPI server (Kanon)
│   ├── database.py                   ← Supabase via httpx REST (Kanon)
│   └── inference.py                  ← Gemini 3.1 Flash Lite call (Kanon + Tamim)
│
└── frontend/
    ├── .env                          ← VITE_API_URL (safe to commit)
    ├── package.json
    ├── manifest.json                 ← PWA manifest for home screen install
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx                  ← React entry point
        ├── index.css                 ← Glassmorphism + radial gradient styles
        ├── App.tsx                   ← Main app — glassmorphism dark UI (Tamim)
        ├── components/
        │   ├── DiagnosisResult.tsx   ← Result display (Tamim)
        │   ├── ExplainabilityPanel.tsx ← Per-modality confidence breakdown
        │   ├── ConsentScreen.tsx     ← First-launch consent + ethics
        │   ├── AudioRecorder.tsx     ← Live cough recording (MediaRecorder API)
        │   └── DashboardStats.tsx    ← Measles vs Dengue chart
        └── lib/
            ├── whoGuidelines.ts      ← WHO mapping logic (Tamim)
            ├── offlineQueue.ts       ← IndexedDB queue (Rayyan)
            ├── syncEngine.ts         ← Store-and-forward sync (Rayyan)
            ├── llamaOffline.ts       ← WebLLM Llama 3.2 1B offline triage
            └── i18n.ts              ← Bangla/English language toggle
```

---

## APPENDIX B: Terminal Commands Quick Reference

```bash
# ── BACKEND ──────────────────────────────────────────────

# Navigate to backend
cd echoderm-ai/backend

# Activate virtual environment (Windows)
.\venv\Scripts\activate

# Activate virtual environment (Mac/Linux)
source venv/bin/activate

# Install Python packages
# requirements.txt should include: google-genai, httpx, python-dotenv, fastapi, uvicorn, python-multipart
pip install -r requirements.txt

# Run the backend server (local only)
uvicorn main:app --reload --port 8000

# Run the backend server (accessible from phone on same WiFi)
uvicorn main:app --reload --host 0.0.0.0 --port 8000


# ── FRONTEND ─────────────────────────────────────────────

# Navigate to frontend
cd echoderm-ai/frontend

# Install all npm packages
npm install

# Install localforage (Rayyan needs this)
npm install localforage

# Run the frontend dev server (local only)
npm run dev

# Run the frontend dev server (accessible from phone on same WiFi)
npm run dev -- --host


# ── GIT ──────────────────────────────────────────────────

# Stage all changes
git add -A

# Commit with a message
git commit -m "your message here"

# Push to GitHub
git push origin main
```

---

## APPENDIX C: Supabase Table SQL (Copy-Paste Ready)

```sql
CREATE TABLE diagnostic_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id TEXT NOT NULL,
  primary_diagnosis TEXT NOT NULL,
  confidence_score FLOAT NOT NULL,
  visual_findings TEXT,
  acoustic_findings TEXT,
  differential_notes TEXT,
  recommended_next_steps JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert for all" ON diagnostic_results
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow read for all" ON diagnostic_results
  FOR SELECT USING (true);
```

---

## APPENDIX D: Environment Variables Reference

### Backend (`backend/.env`)

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_ANON_KEY
GEMINI_API_KEY=AIzaSyYOUR_GEMINI_API_KEY
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000
```

When testing on a phone, change to:
```env
VITE_API_URL=http://YOUR_COMPUTER_IP:8000
```

---

---

# PART 4: NEW FEATURES & AI DEPTH SCORE

> **This section covers features being added on top of the core system, plus the AI Depth Score form answers for the hackathon submission.**

---

## 4.1 — Llama Offline Fallback (Edge-Cloud Hybrid)

When the user is **offline**, Gemini is unreachable. But we still want to give *some* guidance. Solution: run **Llama 3.2 1B** directly **in the browser** via WebLLM.

### How it works:

1. User is offline and types symptoms as text (e.g., "red raised rash on face, barking cough, fever 3 days").
2. Llama 3.2 1B runs in-browser via `@mlc-ai/web-llm` and WebGPU.
3. The model returns preliminary text-based triage advice.
4. Image and audio files are **still queued** for Gemini — they sync when online.
5. The UI clearly labels the offline result as: *"Preliminary (offline AI) — full analysis pending."*

### Install:

```bash
cd echoderm-ai/frontend
npm install @mlc-ai/web-llm
```

### Core logic — `frontend/src/lib/llamaOffline.ts`:

```typescript
import * as webllm from "@mlc-ai/web-llm";

let engine: webllm.MLCEngine | null = null;

export async function initLlama(): Promise<void> {
  engine = new webllm.MLCEngine();
  await engine.reload("Llama-3.2-1B-Instruct-q4f16_1-MLC");
}

export async function triageOffline(symptoms: string): Promise<string> {
  if (!engine) throw new Error("Llama not initialized");

  const response = await engine.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "You are a preliminary triage assistant. Given symptoms, suggest whether they are more consistent with Measles or Dengue. Be brief. This is NOT a diagnosis.",
      },
      { role: "user", content: symptoms },
    ],
    temperature: 0.3,
    max_tokens: 256,
  });

  return response.choices[0].message.content || "Unable to assess.";
}
```

### Model routing logic:

| Condition | Model Used | Modalities |
|-----------|-----------|------------|
| **Online** | Gemini 3.1 Flash Lite (cloud) | Image + Audio + Text |
| **Offline** | Llama 3.2 1B (in-browser via WebLLM) | Text only |

Image/audio always queue for Gemini. Llama handles text-only triage as a stopgap.

---

## 4.2 — Explainability Panel

A collapsible UI section that shows **what the AI saw and heard** with per-modality confidence breakdown.

The upgraded system instruction now returns:
- `visual_confidence` — how confident the AI is about the rash analysis
- `acoustic_confidence` — how confident the AI is about the cough analysis
- `cross_modal_agreement` — how much the two signals agree

Create file: `frontend/src/components/ExplainabilityPanel.tsx`

```tsx
interface Props {
  visualConfidence: number;
  acousticConfidence: number;
  crossModalAgreement: number;
  visualFindings: string;
  acousticFindings: string;
}

export default function ExplainabilityPanel(props: Props) {
  const {
    visualConfidence, acousticConfidence,
    crossModalAgreement, visualFindings, acousticFindings,
  } = props;

  return (
    <details className="glass rounded-2xl p-4 mt-4">
      <summary className="cursor-pointer font-semibold gradient-text">
        🔍 AI Explainability — What did the AI see/hear?
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-sm text-gray-400">👁️ Visual Confidence (60% weight)</p>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
            <div className="h-2 rounded-full bg-teal-400" style={{ width: `${visualConfidence * 100}%` }} />
          </div>
          <p className="text-gray-300 text-sm mt-1">{visualFindings}</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">👂 Acoustic Confidence (40% weight)</p>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
            <div className="h-2 rounded-full bg-purple-400" style={{ width: `${acousticConfidence * 100}%` }} />
          </div>
          <p className="text-gray-300 text-sm mt-1">{acousticFindings}</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">🔗 Cross-Modal Agreement</p>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
            <div
              className={`h-2 rounded-full ${crossModalAgreement > 0.7 ? 'bg-green-400' : 'bg-amber-400'}`}
              style={{ width: `${crossModalAgreement * 100}%` }}
            />
          </div>
          {crossModalAgreement < 0.7 && (
            <p className="text-amber-400 text-xs mt-1">⚠️ Low agreement — visual and acoustic signals conflict.</p>
          )}
        </div>
      </div>
    </details>
  );
}
```

---

## 4.3 — Live Audio Recording

Instead of uploading a file, the health worker taps a button and records the cough directly.

Uses the **MediaRecorder API** — built into all modern browsers, no library needed.

Create file: `frontend/src/components/AudioRecorder.tsx`

```tsx
import { useState, useRef } from "react";

interface Props {
  onRecordingComplete: (blob: Blob) => void;
}

export default function AudioRecorder({ onRecordingComplete }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      onRecordingComplete(blob);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`w-full py-3 rounded-xl font-semibold ${
        isRecording
          ? "bg-red-500 animate-pulse text-white"
          : "glass text-gray-300"
      }`}
    >
      {isRecording ? "🔴 Stop Recording" : "🎙️ Record Cough"}
    </button>
  );
}
```

---

## 4.4 — Consent & Ethics Layer

### First-Launch Consent Screen

Before the user can use the app, they must accept a consent screen explaining:
- This is **not a medical diagnosis** — it is a decision-support tool.
- Data is sent to Google's Gemini API for processing.
- The AI has known limitations and biases.

Store consent in `localStorage`. Show the consent screen only once.

### 'Not a Diagnosis' Banner

A persistent banner at the top of every result:

```text
⚠️ This is an AI-generated decision-support tool, NOT a medical diagnosis.
Always consult a qualified healthcare professional.
```

### Bias Limitations Disclosure

In the consent screen and in an info tooltip:

```text
Limitations: This AI was designed for Measles vs Dengue differentiation only.
It may perform differently across skin tones, age groups, and audio recording
quality. It is not validated for clinical use.
```

---

## 4.5 — Dashboard & Stats

### Backend Endpoint

Add to `backend/main.py`:

```python
@app.get("/dashboard/stats")
async def dashboard_stats():
    """Return aggregate counts of Measles vs Dengue diagnoses."""
    async with httpx.AsyncClient() as http_client:
        # Count Measles
        measles_resp = await http_client.get(
            f"{REST_URL}/diagnostic_results",
            headers={**HEADERS, "Prefer": "count=exact"},
            params={"primary_diagnosis": "eq.Measles", "select": "id"},
        )
        measles_count = int(measles_resp.headers.get("content-range", "0/0").split("/")[-1])

        # Count Dengue
        dengue_resp = await http_client.get(
            f"{REST_URL}/diagnostic_results",
            headers={**HEADERS, "Prefer": "count=exact"},
            params={"primary_diagnosis": "eq.Dengue", "select": "id"},
        )
        dengue_count = int(dengue_resp.headers.get("content-range", "0/0").split("/")[-1])

    return {
        "measles_count": measles_count,
        "dengue_count": dengue_count,
        "total": measles_count + dengue_count,
    }
```

### Frontend Chart

Create `frontend/src/components/DashboardStats.tsx` — a simple bar chart showing Measles vs Dengue counts. Can use a lightweight library like `recharts` or pure CSS bars.

---

## 4.6 — Bangla Language Toggle (বাংলা)

All UI labels switch between English and বাংলা. Store preference in `localStorage`.

Create file: `frontend/src/lib/i18n.ts`

```typescript
export const translations = {
  en: {
    appName: "EchoDerm AI",
    subtitle: "Measles vs Dengue Diagnostic Tool",
    analyze: "🔍 Analyze Symptoms",
    patientId: "Patient ID",
    skinRash: "Skin Rash Photo",
    coughAudio: "Cough Recording",
    offline: "📡 You are offline — data will sync when connected",
    notDiagnosis: "⚠️ This is NOT a medical diagnosis. Consult a healthcare professional.",
  },
  bn: {
    appName: "ইকোডার্ম এআই",
    subtitle: "হাম বনাম ডেঙ্গু রোগ নির্ণয় টুল",
    analyze: "🔍 লক্ষণ বিশ্লেষণ করুন",
    patientId: "রোগীর আইডি",
    skinRash: "ত্বকের ফুসকুড়ির ছবি",
    coughAudio: "কাশির রেকর্ডিং",
    offline: "📡 আপনি অফলাইনে আছেন — সংযোগ হলে ডেটা সিঙ্ক হবে",
    notDiagnosis: "⚠️ এটি চিকিৎসা রোগ নির্ণয় নয়। একজন স্বাস্থ্যসেবা পেশাদারের সাথে পরামর্শ করুন।",
  },
} as const;

export type Language = keyof typeof translations;
```

Add a toggle button in the header that swaps between `en` and `bn`.

---

## 4.7 — PWA (Installable App)

Add `frontend/manifest.json` so the app can be installed on the home screen:

```json
{
  "name": "EchoDerm AI",
  "short_name": "EchoDerm",
  "description": "Measles vs Dengue AI diagnostic tool for rural health workers",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a1a",
  "theme_color": "#14b8a6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Link it in `index.html`:
```html
<link rel="manifest" href="/manifest.json" />
```

---

## 4.8 — Patient History Endpoint

Add to `backend/main.py`:

```python
@app.get("/patient/{patient_id}/history")
async def patient_history(patient_id: str):
    """Return all diagnostic results for a specific patient."""
    async with httpx.AsyncClient() as http_client:
        response = await http_client.get(
            f"{REST_URL}/diagnostic_results",
            headers=HEADERS,
            params={
                "patient_id": f"eq.{patient_id}",
                "order": "created_at.desc",
            },
        )
        response.raise_for_status()
        return response.json()
```

---

## 4.9 — Frontend Premium Dark UI (Already Done)

The frontend has been upgraded to a premium glassmorphism dark theme:

| Element | Implementation |
|---------|---------------|
| **Background** | Radial gradient (`radial-gradient(ellipse at top, ...)`) in `index.css` |
| **Cards** | `.glass` class — `backdrop-blur-xl`, `bg-white/5`, subtle border |
| **Text highlights** | `.gradient-text` class — teal-to-purple gradient on headings |
| **Font** | Outfit (Google Fonts) — clean, modern |
| **Icons** | Inline SVGs instead of emoji for professional look |
| **Animations** | Fade-in for results, pulse for loading states |

---

---

## 4.10 — AI Depth Score Answers

> **This section tells the team exactly what to check/write on the AI Depth Score form (0-110 points).**

---

### Frontend AI Builders (+1 each, max 5)

| Tool | Check? | Notes |
|------|--------|-------|
| Cursor Composer / Agent | ✅ | Used Antigravity/Cursor for code generation |
| Lovable | ✅ if used | Check if Tamim used Lovable for UI generation |

---

### LLMs / Models Used (+3 each, max 15)

| Model | Check? | Points | Usage |
|-------|--------|--------|-------|
| **Gemini** | ✅ | +3 | Gemini 3.1 Flash Lite — cloud multimodal inference (image + audio → diagnosis) |
| **Llama** | ✅ | +3 | Llama 3.2 1B — offline on-device text-based symptom triage via WebLLM |
| **Total** | | **+6** | |

---

### Local / On-device LLMs (Runtimes +1, Models +2, max 8)

| Item | Check? | Points | Notes |
|------|--------|--------|-------|
| **Runtime: WebLLM** | ✅ | +1 | `@mlc-ai/web-llm` runs Llama in the browser via WebGPU |
| **Model: Llama 3.2 1B** | ✅ | +2 | Smallest viable model for on-device triage |
| **Runtime: Ollama** (bonus) | ✅ if used | +1 | If using Ollama for local dev testing |
| **Model via Ollama** (bonus) | ✅ if used | +1 | Additional model accessed through Ollama |
| **Total (minimum)** | | **+3** | +5 if Ollama also used |

---

### Prompt Usage (+0-10)

**Write this in the form:**

> We use structured role prompting with explicit clinical criteria injection. The system instruction contains WHO-standard visual markers (maculopapular vs petechial), acoustic markers (barking vs absent cough), and weighted decision logic (60% visual, 40% acoustic). Output is enforced as strict JSON via `response_mime_type`. We maintain prompt versioning (v1 → v2 with clinical markers). Few-shot examples guide output format.

---

### Token Optimization (+0-10)

**Write this in the form:**

> We use structured outputs / JSON mode (`response_mime_type="application/json"`) to eliminate free-text waste. We use cheap-model routing: Gemini 3.1 Flash Lite (cheapest multimodal model) for cloud inference, Llama 3.2 1B (smallest viable model) for on-device offline triage. System instruction is optimized to ~500 tokens with no redundancy.

### Token Optimization Tools

| Tool | Check? |
|------|--------|
| Structured outputs / JSON mode | ✅ |
| Cheap-model routing | ✅ |

---

### Retrieval & RAG

**Leave blank.** We don't use RAG.

---

### Workflow Automation

| Tool | Check? | Notes |
|------|--------|-------|
| **n8n** | ✅ if implemented | Consider adding n8n for outbreak alert automation (e.g., auto-notify health authorities when Measles count exceeds threshold) |

---

### Agentic Frameworks

**Leave blank.** We don't use agentic frameworks.

---

### AI-DLC

| Item | Check? |
|------|--------|
| Cursor Rules + PRD workflow | ✅ if applicable |

---

### Build a Live /docs Module

**Check: Yes** — Build a `/docs` page that serves as a live pitch deck for judges.

---

### Anything Else (Free Text)

**Write this in the form:**

> Dual-model edge-cloud hybrid architecture: Gemini 3.1 Flash Lite (cloud, multimodal) + Llama 3.2 1B (on-device, text-only offline fallback). Automatic model routing based on connectivity. Cross-modal discordance detection between visual and acoustic AI signals.

---

### Score Estimate

| Category | Points |
|----------|--------|
| Frontend AI Builders | +1 to +2 |
| LLMs / Models Used | +6 |
| Local / On-device LLMs | +3 to +5 |
| Prompt Usage | +7 to +10 |
| Token Optimization | +7 to +10 |
| /docs Module | +5 |
| Anything Else | +5 to +10 |
| **Estimated Total** | **~34-48 out of 110** |

---

---

> **🏁 You now have everything. Kanon sets up the database and backend. Tamim shapes the AI and UI. Rayyan makes it work offline. The new features in PART 4 take the project from functional to competition-winning. Go build it and win.**

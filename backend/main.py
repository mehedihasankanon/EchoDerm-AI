"""
main.py — FastAPI entry point for EchoDerm AI.

Exposes a single POST /analyze endpoint that accepts simultaneous multipart
uploads of a skin‑rash image and a cough audio file, runs dual‑modal Gemini
inference, logs the result to Supabase, and returns the structured diagnosis.
"""

import uuid
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from inference import analyze_multimodal_symptoms
from database import log_diagnostic_result

# ── App initialisation ──────────────────────────────────────────────────────
app = FastAPI(
    title="EchoDerm AI",
    description=(
        "Dual‑modal diagnostic API — analyses skin‑rash images and cough audio "
        "to differentiate Measles from Dengue using Gemini 1.5 Flash."
    ),
    version="0.1.0",
)

# ── CORS — allow the Vite dev server and any future frontends ────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite default dev port
        "http://localhost:3000",   # common alt dev port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "service": "echoderm-ai"}


# ── Core diagnostic endpoint ────────────────────────────────────────────────
@app.post("/analyze")
async def analyze(
    image: UploadFile = File(..., description="Photograph of the skin rash"),
    audio: UploadFile = File(..., description="Audio recording of the cough"),
    patient_id: str = Form(
        default=None,
        description="Optional patient identifier. Auto‑generated if omitted.",
    ),
):
    """
    Accept a skin‑rash image and a cough audio file, run multimodal Gemini
    inference, persist the result to Supabase, and return the diagnosis.

    **Request**: `multipart/form-data`
    - `image` — image file (JPEG / PNG)
    - `audio` — audio file (WAV / MP3 / OGG)
    - `patient_id` (optional) — text identifier for the patient

    **Response**: JSON diagnostic object.
    """

    # ── Validate MIME types ──────────────────────────────────────────────────
    allowed_image_types = {"image/jpeg", "image/png", "image/webp"}
    allowed_audio_types = {"audio/wav", "audio/mpeg", "audio/ogg", "audio/mp3", "audio/x-wav"}

    if image.content_type not in allowed_image_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{image.content_type}'. "
                   f"Allowed: {', '.join(allowed_image_types)}",
        )

    if audio.content_type not in allowed_audio_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type '{audio.content_type}'. "
                   f"Allowed: {', '.join(allowed_audio_types)}",
        )

    # ── Read file bytes ──────────────────────────────────────────────────────
    image_bytes = await image.read()
    audio_bytes = await audio.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    # ── Run multimodal inference ─────────────────────────────────────────────
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
            detail=f"Gemini inference failed: {exc}",
        )

    # ── Persist to Supabase ──────────────────────────────────────────────────
    effective_patient_id = patient_id or str(uuid.uuid4())

    try:
        await log_diagnostic_result(
            patient_id=effective_patient_id,
            primary_diagnosis=diagnosis.get("primary_diagnosis", "Unknown"),
            confidence_score=diagnosis.get("confidence_score", 0.0),
            raw_response=diagnosis,
        )
    except Exception as exc:
        # Log but don't fail the request — the diagnosis was still produced
        print(f"[WARN] Failed to log result to Supabase: {exc}")

    # ── Return ───────────────────────────────────────────────────────────────
    return {
        "patient_id": effective_patient_id,
        "diagnosis": diagnosis,
    }

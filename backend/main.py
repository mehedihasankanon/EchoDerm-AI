"""
main.py — FastAPI entry point for EchoDerm AI.

Exposes diagnostic, dashboard, and patient history endpoints.
"""

import uuid
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from inference import analyze_multimodal_symptoms
from database import log_diagnostic_result, get_diagnostic_stats, get_patient_history

# ── App initialisation ──────────────────────────────────────────────────────
app = FastAPI(
    title="EchoDerm AI",
    description=(
        "Dual‑modal diagnostic API — analyses skin‑rash images and cough audio "
        "to differentiate Measles from Dengue using Gemini 3.1 Flash Lite."
    ),
    version="0.2.0",
)

# ── CORS — allow the Vite dev server and any future frontends ────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all during hackathon (tighten for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "service": "echoderm-ai", "model": "gemini-3.1-flash-lite"}


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
    inference, persist the result to Supabase, and return the diagnosis
    with ethical metadata and explainability information.
    """

    # ── Validate MIME types ──────────────────────────────────────────────────
    allowed_image_types = {"image/jpeg", "image/png", "image/webp"}
    allowed_audio_types = {
        "audio/wav", "audio/mpeg", "audio/ogg", "audio/mp3",
        "audio/x-wav", "audio/webm",
    }

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

    # ── Extract metadata (added by inference.py) ─────────────────────────────
    inference_metadata = diagnosis.pop("_metadata", {})

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

    # ── Return with ethical metadata ─────────────────────────────────────────
    return {
        "patient_id": effective_patient_id,
        "diagnosis": diagnosis,
        "metadata": {
            **inference_metadata,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "ethical_metadata": {
            "disclaimer": "This is a decision-support tool, NOT a clinical diagnosis. Always consult a qualified health professional.",
            "known_limitations": [
                "Accuracy may be lower for darker skin tones due to rash visibility variations",
                "Audio quality in noisy environments may reduce acoustic analysis accuracy",
                "Model has not been validated on a clinical dataset specific to Bangladesh",
                "This tool cannot detect co-infections or comorbidities",
            ],
            "bias_mitigations": [
                "System instruction includes markers applicable across skin tones",
                "Confidence score is reduced when image quality is poor",
                "Cross-modal discordance detection alerts when visual and acoustic signals conflict",
            ],
            "data_handling": "Images and audio are processed in-memory and not stored on the server. Only diagnostic results are logged.",
        },
    }


# ── Dashboard stats endpoint ────────────────────────────────────────────────
@app.get("/dashboard/stats")
async def dashboard_stats():
    """Return aggregate diagnostic statistics for the dashboard."""
    try:
        stats = await get_diagnostic_stats()
        return stats
    except Exception as exc:
        print(f"[WARN] Dashboard stats failed: {exc}")
        return {
            "total_scans": 0,
            "measles_count": 0,
            "dengue_count": 0,
            "period": "last_7_days",
            "error": str(exc),
        }


# ── Patient history endpoint ────────────────────────────────────────────────
@app.get("/patient/{patient_id}/history")
async def patient_history(patient_id: str):
    """Get all previous diagnoses for a patient."""
    try:
        history = await get_patient_history(patient_id)
        return {"patient_id": patient_id, "history": history}
    except Exception as exc:
        print(f"[WARN] Patient history failed: {exc}")
        return {"patient_id": patient_id, "history": [], "error": str(exc)}

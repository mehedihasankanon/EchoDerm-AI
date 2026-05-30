"""
main.py — FastAPI entry point for EchoDerm AI.

Architecture:
  - POST /analyze → LangGraph orchestrator (routes between Gemini & Edge)
  - GET  /health → Liveness probe with architecture info
  - GET  /dashboard/stats → Aggregate diagnostic counts
  - GET  /patient/{id}/history → Patient diagnostic history
  - GET  /docs-data → Live architecture documentation for /docs page
  - SSE  /mcp/sse → MCP server endpoint (WHO Protocol guardrails)
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from orchestrator import diagnostic_graph
from database import log_diagnostic_result, get_diagnostic_stats, get_patient_history, get_docs_config, update_docs_config
from schemas import DocsConfigUpdate
from fastapi import Header

load_dotenv()

# ── LangSmith tracing (optional) ────────────────────────────────────────────
# If LANGSMITH_API_KEY is set, LangGraph will automatically trace all graph
# executions. No additional code needed — just env vars.
LANGSMITH_TRACING = os.environ.get("LANGSMITH_TRACING", "false").lower() == "true"


# ── App initialisation ──────────────────────────────────────────────────────
app = FastAPI(
    title="EchoDerm AI",
    description=(
        "Enterprise-grade dual-modal diagnostic API — LangGraph orchestration, "
        "MCP guardrails, pgvector RAG, Pydantic-AI validation. "
        "Differentiates Measles from Dengue using Gemini 3.1 Flash Lite."
    ),
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
frontend_url = os.environ.get("FRONTEND_URL", "https://echo-derm-ai.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Liveness probe with architecture metadata."""
    return {
        "status": "ok",
        "service": "echoderm-ai",
        "version": "1.0.0",
        "architecture": {
            "orchestrator": "LangGraph",
            "cloud_model": "gemini-3.1-flash-lite",
            "edge_model": "llama-3.2-1b (WebLLM)",
            "guardrails": "MCP-WHO-Protocol-Server (3 tools)",
            "rag": "Supabase pgvector (Contextual + Agentic RAG)",
            "validation": "Pydantic v2 (backend) + Zod (frontend)",
            "tracing": "LangSmith" if LANGSMITH_TRACING else "disabled",
        },
    }


@app.post("/analyze")
async def analyze(
    image: UploadFile = File(..., description="Photograph of the skin rash"),
    audio: UploadFile = File(..., description="Audio recording of the cough"),
    patient_id: str = Form(
        default=None,
        description="Optional patient identifier. Auto-generated if omitted.",
    ),
    is_online: str = Form(
        default="true",
        description="Client connectivity status (from navigator.onLine).",
    ),
    zip_code: str = Form(
        default="",
        description="Patient postal/zip code for geographic context.",
    ),
):
    """
    Run the complete LangGraph diagnostic pipeline:
      route_decision → gemini_inference → rag_retrieval → mcp_guardrails → validate_output

    Accepts multipart/form-data with image + audio files.
    Returns a fully validated, RAG-grounded diagnosis with WHO guardrails.
    """

    # ── Validate MIME types ──────────────────────────────────────
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

    # ── Read file bytes ──────────────────────────────────────────
    image_bytes = await image.read()
    audio_bytes = await audio.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    # ── Prepare orchestrator state ───────────────────────────────
    effective_patient_id = patient_id or str(uuid.uuid4())
    online_flag = is_online.lower() not in ("false", "0", "no", "off")

    initial_state = {
        "image_bytes": image_bytes,
        "image_mime_type": image.content_type,
        "audio_bytes": audio_bytes,
        "audio_mime_type": audio.content_type,
        "patient_id": effective_patient_id,
        "zip_code": zip_code,
        "is_online": online_flag,
        "errors": [],
    }

    # ── Run LangGraph orchestrator ───────────────────────────────
    try:
        result_state = await diagnostic_graph.ainvoke(initial_state)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Orchestrator pipeline failed: {exc}",
        )

    # ── Extract the final response ───────────────────────────────
    final_response = result_state.get("final_response", {})

    # ── Persist to Supabase ──────────────────────────────────────
    diagnosis = final_response.get("diagnosis", {})
    try:
        await log_diagnostic_result(
            patient_id=effective_patient_id,
            primary_diagnosis=diagnosis.get("primary_diagnosis", "Unknown"),
            confidence_score=diagnosis.get("confidence_score", 0.0),
            raw_response=diagnosis,
            zip_code=zip_code,
        )
    except Exception as exc:
        print(f"[WARN] Failed to log result to Supabase: {exc}")

    # ── Return ───────────────────────────────────────────────────
    # Ensure patient_id is set in the response
    final_response["patient_id"] = effective_patient_id
    return final_response


# ══════════════════════════════════════════════════════════════════
# DASHBOARD & HISTORY
# ══════════════════════════════════════════════════════════════════

@app.get("/dashboard/stats")
async def dashboard_stats():
    """Return aggregate diagnostic statistics for the dashboard."""
    try:
        stats = await get_diagnostic_stats()
        return stats
    except Exception as exc:
        print(f"[WARN] Dashboard stats failed: {exc}")
        return {
            "total_scans": 0, "measles_count": 0,
            "dengue_count": 0, "period": "last_7_days",
            "error": str(exc),
        }


@app.get("/patient/{patient_id}/history")
async def patient_history(patient_id: str):
    """Get all previous diagnoses for a patient."""
    try:
        history = await get_patient_history(patient_id)
        return {"patient_id": patient_id, "history": history}
    except Exception as exc:
        print(f"[WARN] Patient history failed: {exc}")
        return {"patient_id": patient_id, "history": [], "error": str(exc)}


# ══════════════════════════════════════════════════════════════════
# LIVE DOCS DATA (for /docs pitch-deck page)
# ══════════════════════════════════════════════════════════════════

@app.get("/docs-data")
async def docs_data():
    """Return live architecture data for the frontend /docs module."""
    return {
        "project": "EchoDerm AI",
        "version": "1.0.0",
        "architecture": {
            "orchestrator": {
                "name": "LangGraph",
                "nodes": [
                    "route_decision", "gemini_inference",
                    "rag_retrieval", "mcp_guardrails",
                    "validate_output", "edge_fallback",
                ],
                "routing": "Conditional on navigator.onLine + payload",
            },
            "models": {
                "cloud": "Gemini 3.1 Flash Lite (multimodal)",
                "edge": "Llama 3.2 1B (WebLLM, text-only)",
            },
            "guardrails": {
                "name": "EchoDerm-WHO-Protocol-Server",
                "protocol": "MCP over SSE",
                "tools": [
                    "get_triage_protocol",
                    "check_medication_safety",
                    "query_regional_outbreaks",
                ],
            },
            "rag": {
                "database": "Supabase pgvector",
                "embedding_model": "text-embedding-004 (768d)",
                "strategy": "Contextual + Agentic RAG (multi-step)",
                "chunks": 10,
            },
            "validation": {
                "backend": "Pydantic v2",
                "frontend": "Zod",
            },
            "tracing": {
                "provider": "LangSmith",
                "enabled": LANGSMITH_TRACING,
            },
        },
    }

@app.get("/docs/config")
async def get_docs_config_endpoint():
    """Get the live configuration for the docs module, and evaluate visibility."""
    try:
        config = await get_docs_config()
        
        # Evaluate visibility
        is_visible = config.get("is_public", False)
        
        # Check date scheduling
        now = datetime.now(timezone.utc)
        
        start_date_str = config.get("start_date")
        if start_date_str:
            try:
                start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                if now < start_date:
                    is_visible = False
            except ValueError:
                pass
                
        end_date_str = config.get("end_date")
        if end_date_str:
            try:
                end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                if now > end_date:
                    is_visible = False
            except ValueError:
                pass
                
        return {
            "is_visible": is_visible,
            "raw_config": config
        }
    except Exception as exc:
        print(f"[WARN] Docs config fetch failed: {exc}")
        return {"is_visible": False, "raw_config": {}, "error": str(exc)}

@app.post("/docs/config")
async def update_docs_config_endpoint(
    config: DocsConfigUpdate,
    x_admin_password: str = Header(default=None, alias="X-Admin-Password")
):
    """Update docs config. Requires admin password."""
    expected_password = os.environ.get("ADMIN_PASSWORD", "echoderm2026")
    
    if x_admin_password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid admin password")
        
    try:
        updated = await update_docs_config(config.model_dump())
        return {"status": "success", "config": updated}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

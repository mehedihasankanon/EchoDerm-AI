"""
database.py — Supabase connection layer for EchoDerm AI.

Uses httpx for direct REST API calls to Supabase (avoids supabase-py's
heavy C dependencies that fail on Windows).

Modules:
  - Diagnostic result logging (with zip_code for geographic context)
  - Dashboard statistics
  - Patient history
  - pgvector semantic search for WHO guideline RAG
  - Outbreak cluster queries
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

# Build the REST API base URL
_REST_URL = ""
if SUPABASE_URL:
    _REST_URL = SUPABASE_URL.rstrip("/")
    if not _REST_URL.endswith("/rest/v1"):
        _REST_URL += "/rest/v1"


def _headers() -> dict:
    """Common headers for Supabase REST API calls."""
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# ══════════════════════════════════════════════════════════════════
# DIAGNOSTIC RESULTS
# ══════════════════════════════════════════════════════════════════

async def log_diagnostic_result(
    patient_id: str,
    primary_diagnosis: str,
    confidence_score: float,
    raw_response: dict,
    zip_code: str = "",
) -> dict:
    """
    Insert a diagnostic result row into the `diagnostic_results` table.
    Now includes zip_code for geographic outbreak tracking.
    """
    if not _REST_URL or not SUPABASE_KEY:
        print("[WARN] Supabase credentials not found. Skipping database log.")
        return {}

    payload = {
        "patient_id": patient_id,
        "primary_diagnosis": primary_diagnosis,
        "confidence_score": confidence_score,
        "raw_response": raw_response,
        "zip_code": zip_code,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_REST_URL}/diagnostic_results",
            json=payload,
            headers=_headers(),
        )

        if response.status_code >= 400:
            raise Exception(f"Supabase insert error: {response.text}")

        return response.json()


# ══════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ══════════════════════════════════════════════════════════════════

async def get_diagnostic_stats() -> dict:
    """
    Get aggregate diagnostic counts for the dashboard.
    Returns Measles vs Dengue counts from the last 7 days.
    """
    if not _REST_URL or not SUPABASE_KEY:
        return {
            "total_scans": 0, "measles_count": 0,
            "dengue_count": 0, "period": "last_7_days",
        }

    seven_days_ago = (
        datetime.now(timezone.utc) - timedelta(days=7)
    ).isoformat()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_REST_URL}/diagnostic_results",
            params={
                "select": "primary_diagnosis,created_at",
                "created_at": f"gte.{seven_days_ago}",
            },
            headers=_headers(),
        )

        if response.status_code >= 400:
            raise Exception(f"Supabase stats error: {response.text}")

        rows = response.json()
        measles_count = sum(
            1 for r in rows if r.get("primary_diagnosis") == "Measles"
        )
        dengue_count = sum(
            1 for r in rows if r.get("primary_diagnosis") == "Dengue"
        )

        return {
            "total_scans": len(rows),
            "measles_count": measles_count,
            "dengue_count": dengue_count,
            "period": "last_7_days",
        }


# ══════════════════════════════════════════════════════════════════
# PATIENT HISTORY
# ══════════════════════════════════════════════════════════════════

async def get_patient_history(patient_id: str) -> list:
    """Get all previous diagnoses for a specific patient."""
    if not _REST_URL or not SUPABASE_KEY:
        return []

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_REST_URL}/diagnostic_results",
            params={
                "select": "*",
                "patient_id": f"eq.{patient_id}",
                "order": "created_at.desc",
                "limit": "20",
            },
            headers=_headers(),
        )

        if response.status_code >= 400:
            raise Exception(f"Supabase history error: {response.text}")

        return response.json()


# ══════════════════════════════════════════════════════════════════
# PGVECTOR — WHO GUIDELINE SEMANTIC SEARCH
# ══════════════════════════════════════════════════════════════════

async def search_who_guidelines(
    query_embedding: list[float],
    top_k: int = 5,
    disease_filter: str | None = None,
) -> list[dict]:
    """
    Search the `who_guidelines` table using pgvector cosine similarity.

    Uses Supabase's RPC endpoint to call a SQL function that performs
    the vector similarity search. If the RPC function isn't set up yet,
    falls back to a basic text query.

    Args:
        query_embedding: 768-dimensional embedding vector from Gemini
        top_k: Number of chunks to retrieve
        disease_filter: Optional — filter to only "Measles" or "Dengue"

    Returns:
        List of dicts with keys: id, disease, section, content, similarity
    """
    if not _REST_URL or not SUPABASE_KEY:
        print("[WARN] Supabase not configured. Returning empty RAG results.")
        return []

    # Use the RPC endpoint for vector search
    rpc_url = _REST_URL.replace("/rest/v1", "/rest/v1/rpc/search_who_guidelines")

    rpc_payload: dict = {
        "query_embedding": query_embedding,
        "match_count": top_k,
    }
    if disease_filter:
        rpc_payload["disease_filter"] = disease_filter

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                rpc_url,
                json=rpc_payload,
                headers=_headers(),
            )

            if response.status_code >= 400:
                print(
                    f"[WARN] pgvector search failed ({response.status_code}): "
                    f"{response.text[:200]}"
                )
                return []

            rows = response.json()

            return [
                {
                    "id": str(row.get("id", "")),
                    "disease": row.get("disease", ""),
                    "section": row.get("section", ""),
                    "content": row.get("content", ""),
                    "similarity": round(row.get("similarity", 0.0), 4),
                    "metadata": row.get("metadata", {}),
                }
                for row in rows
            ]

    except Exception as exc:
        print(f"[WARN] pgvector search exception: {exc}")
        return []


async def insert_who_guideline(
    disease: str,
    section: str,
    content: str,
    embedding: list[float],
    metadata: dict | None = None,
) -> dict:
    """
    Insert a single WHO guideline chunk with its embedding into pgvector.
    Used by seed_vectors.py during setup.
    """
    if not _REST_URL or not SUPABASE_KEY:
        raise Exception("Supabase not configured. Cannot insert vector.")

    payload = {
        "disease": disease,
        "section": section,
        "content": content,
        "embedding": json.dumps(embedding),
        "metadata": metadata or {},
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_REST_URL}/who_guidelines",
            json=payload,
            headers=_headers(),
        )

        if response.status_code >= 400:
            raise Exception(f"Vector insert error: {response.text}")

        return response.json()


# ══════════════════════════════════════════════════════════════════
# DOCS MODULE CONFIGURATION (Fallback to local JSON)
# ══════════════════════════════════════════════════════════════════

DOCS_CONFIG_FILE = "docs_config.json"

async def get_docs_config() -> dict:
    """Fetch the configuration from local JSON to bypass SQL issues."""
    default_config = {
        "is_public": False,
        "start_date": None,
        "end_date": None,
        "team_members": []
    }
    
    if os.path.exists(DOCS_CONFIG_FILE):
        try:
            with open(DOCS_CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print(f"[WARN] Failed to read docs_config.json: {exc}")
            
    return default_config


async def update_docs_config(config_data: dict) -> dict:
    """Save the configuration to local JSON."""
    payload = {
        "is_public": config_data.get("is_public", False),
        "start_date": config_data.get("start_date"),
        "end_date": config_data.get("end_date"),
        "team_members": config_data.get("team_members", [])
    }
    
    try:
        with open(DOCS_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return payload
    except Exception as exc:
        raise Exception(f"Failed to write docs config: {exc}")

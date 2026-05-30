"""
database.py — Lightweight Supabase connection for EchoDerm AI.

Uses httpx instead of the official supabase-py library to avoid 
heavy C-based dependencies (like pyiceberg) that fail on some Windows systems.
"""

import os
from datetime import datetime, timedelta, timezone
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

# Ensure URL ends with /rest/v1/ for direct API access
if SUPABASE_URL and not SUPABASE_URL.endswith("/rest/v1"):
    # Strip trailing slash if present then add the rest path
    SUPABASE_URL = SUPABASE_URL.rstrip("/") + "/rest/v1"


def _headers() -> dict:
    """Common headers for Supabase REST API calls."""
    return {
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
    Insert a diagnostic result row into the `diagnostic_results` table using REST API.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[WARN] Supabase credentials not found. Skipping database log.")
        return {}

    payload = {
        "patient_id": patient_id,
        "primary_diagnosis": primary_diagnosis,
        "confidence_score": confidence_score,
        "raw_response": raw_response,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/diagnostic_results",
            json=payload,
            headers=_headers(),
        )
        
        if response.status_code >= 400:
            raise Exception(f"Supabase error: {response.text}")
            
        return response.json()


async def get_diagnostic_stats() -> dict:
    """
    Get aggregate diagnostic counts for the dashboard.
    Returns Measles vs Dengue counts from the last 7 days.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"total_scans": 0, "measles_count": 0, "dengue_count": 0, "period": "last_7_days"}

    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SUPABASE_URL}/diagnostic_results",
            params={
                "select": "primary_diagnosis,created_at",
                "created_at": f"gte.{seven_days_ago}",
            },
            headers=_headers(),
        )

        if response.status_code >= 400:
            raise Exception(f"Supabase stats error: {response.text}")

        rows = response.json()
        measles_count = sum(1 for r in rows if r.get("primary_diagnosis") == "Measles")
        dengue_count = sum(1 for r in rows if r.get("primary_diagnosis") == "Dengue")

        return {
            "total_scans": len(rows),
            "measles_count": measles_count,
            "dengue_count": dengue_count,
            "period": "last_7_days",
        }


async def get_patient_history(patient_id: str) -> list:
    """
    Get all previous diagnoses for a specific patient.
    Returns a list of diagnostic results ordered by most recent first.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SUPABASE_URL}/diagnostic_results",
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


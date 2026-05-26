"""
database.py — Lightweight Supabase connection for EchoDerm AI.

Uses httpx instead of the official supabase-py library to avoid 
heavy C-based dependencies (like pyiceberg) that fail on some Windows systems.
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

# Ensure URL ends with /rest/v1/ for direct API access
if SUPABASE_URL and not SUPABASE_URL.endswith("/rest/v1"):
    # Strip trailing slash if present then add the rest path
    SUPABASE_URL = SUPABASE_URL.rstrip("/") + "/rest/v1"

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

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/diagnostic_results",
            json=payload,
            headers=headers,
        )
        
        if response.status_code >= 400:
            raise Exception(f"Supabase error: {response.text}")
            
        return response.json()


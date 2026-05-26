"""
database.py — Supabase connection boilerplate for EchoDerm AI.

Provides a singleton Supabase client and helper functions for logging
diagnostic results to the `diagnostic_results` table.
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError(
        "SUPABASE_URL and SUPABASE_KEY must be set in the environment or .env file."
    )

# Singleton Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


async def log_diagnostic_result(
    patient_id: str,
    primary_diagnosis: str,
    confidence_score: float,
    raw_response: dict,
) -> dict:
    """
    Insert a diagnostic result row into the `diagnostic_results` table.

    Expected table schema (create in Supabase dashboard):
        id              uuid        DEFAULT gen_random_uuid()  PRIMARY KEY
        patient_id      text        NOT NULL
        primary_diagnosis text      NOT NULL
        confidence_score float8     NOT NULL
        raw_response    jsonb
        created_at      timestamptz DEFAULT now()

    Returns the inserted row data.
    """
    payload = {
        "patient_id": patient_id,
        "primary_diagnosis": primary_diagnosis,
        "confidence_score": confidence_score,
        "raw_response": raw_response,
    }

    response = (
        supabase.table("diagnostic_results")
        .insert(payload)
        .execute()
    )

    return response.data

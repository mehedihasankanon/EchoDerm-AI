"""
mcp_server.py — EchoDerm-WHO-Protocol-Server

A custom Python-based MCP (Model Context Protocol) server that exposes
localized WHO clinical triage guidelines and regional outbreak statistics
as executable tools for our LangGraph agents.

Instead of letting the LLM guess medical rules from its training weights,
our agents MUST invoke these tools to retrieve rigid, un-alterable clinical
workflows. This is the hard compliance boundary.

Protocol: JSON-RPC over SSE (Server-Sent Events)
Transport: HTTP SSE, mounted on the FastAPI app at /mcp/sse

Tools exposed:
  1. get_triage_protocol     — Strict WHO management steps for a disease
  2. check_medication_safety — Cross-reference against contraindicated drugs
  3. query_regional_outbreaks — Pull active cluster data from Supabase
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from mcp.server import Server
from mcp.types import Tool, TextContent

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

# Build REST URL
_REST_URL = ""
if SUPABASE_URL:
    _REST_URL = SUPABASE_URL.rstrip("/")
    if not _REST_URL.endswith("/rest/v1"):
        _REST_URL += "/rest/v1"


def _headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


# ══════════════════════════════════════════════════════════════════
# HARDCODED WHO PROTOCOLS — the AI cannot alter these
# ══════════════════════════════════════════════════════════════════

_WHO_PROTOCOLS: dict[str, dict] = {
    "Measles": {
        "disease": "Measles",
        "alert_level": "critical",
        "medications": [
            "Vitamin A — 200,000 IU orally, immediately (children >12 months)",
            "Vitamin A — 100,000 IU for children 6-11 months",
            "Second dose of Vitamin A the next day",
            "Paracetamol for fever (10-15 mg/kg every 4-6 hours as needed)",
            "ORS (Oral Rehydration Salts) if diarrhea is present",
        ],
        "danger_signs": [
            "Inability to drink or breastfeed",
            "Vomiting everything",
            "Convulsions (seizures)",
            "Lethargy or unconsciousness",
            "Mouth ulcers preventing eating",
            "Clouding of the cornea (eye involvement)",
            "Deep or fast breathing (pneumonia sign)",
        ],
        "immediate_actions": [
            "Administer Vitamin A immediately — #1 priority",
            "Isolate patient from other children (measles is airborne)",
            "Monitor temperature every 4 hours",
            "Ensure adequate fluid intake",
            "Check for ear discharge (otitis media complication)",
            "Check eyes daily for corneal clouding",
            "Notify local health authority (notifiable disease)",
        ],
        "strictly_avoid": [
            "DO NOT give Aspirin to children (risk of Reye's syndrome)",
            "DO NOT delay Vitamin A — every hour matters",
            "DO NOT send to crowded waiting room (spread risk)",
        ],
        "referral_criteria": (
            "Refer URGENTLY if any danger sign, severe malnutrition, "
            "or suspected pneumonia."
        ),
        "isolation_required": True,
        "isolation_duration": "4 days after rash onset (minimum)",
    },
    "Dengue": {
        "disease": "Dengue",
        "alert_level": "warning",
        "medications": [
            "Paracetamol ONLY for fever (10-15 mg/kg every 4-6 hours)",
            "ORS or IV fluids if dehydration signs present",
            "NO specific antiviral — treatment is supportive only",
        ],
        "danger_signs": [
            "Severe abdominal pain (continuous)",
            "Persistent vomiting (≥3 times in 24 hours)",
            "Fluid accumulation (ascites, pleural effusion)",
            "Mucosal bleeding (gums, nose, hematemesis)",
            "Lethargy or restlessness",
            "Liver enlargement >2 cm",
            "Rapid platelet count decrease",
            "Rising hematocrit with rapid platelet decrease",
        ],
        "immediate_actions": [
            "Start oral rehydration immediately",
            "Monitor platelet count and hematocrit daily",
            "Record fluid intake and output",
            "Check blood pressure and pulse every 2-4 hours",
            "Watch for warning signs during critical phase (days 3-7)",
            "Encourage fluid intake — water, juice, ORS",
            "Use mosquito nets around patient bed",
        ],
        "strictly_avoid": [
            "⚠️ STRICTLY AVOID Ibuprofen (increases bleeding risk)",
            "⚠️ STRICTLY AVOID Aspirin (increases bleeding risk)",
            "⚠️ STRICTLY AVOID ALL NSAIDs",
            "DO NOT give intramuscular injections (bleeding risk)",
            "DO NOT use dark-colored fluids (masks hematemesis)",
        ],
        "referral_criteria": (
            "Refer IMMEDIATELY if any warning sign, platelet <100,000, "
            "or any bleeding."
        ),
        "isolation_required": False,
        "isolation_duration": "Not required (mosquito-borne, not person-to-person)",
    },
}

# Contraindicated medications by disease
_CONTRAINDICATED: dict[str, set[str]] = {
    "Measles": {"aspirin", "ibuprofen"},
    "Dengue": {
        "aspirin", "ibuprofen", "naproxen", "diclofenac",
        "ketoprofen", "piroxicam", "indomethacin", "mefenamic acid",
    },
}

_SAFE_MEDICATIONS: dict[str, set[str]] = {
    "Measles": {"paracetamol", "acetaminophen", "vitamin a", "ors"},
    "Dengue": {"paracetamol", "acetaminophen", "ors", "iv fluids"},
}


# ══════════════════════════════════════════════════════════════════
# MCP SERVER DEFINITION
# ══════════════════════════════════════════════════════════════════

mcp = Server("echoderm-who-protocol-server")


@mcp.list_tools()
async def list_tools() -> list[Tool]:
    """Register the 3 MCP tools."""
    return [
        Tool(
            name="get_triage_protocol",
            description=(
                "Fetches strict WHO clinical triage management steps "
                "for Measles or Dengue. Returns medications, danger signs, "
                "immediate actions, contraindications, and referral criteria. "
                "The AI MUST call this tool and MUST NOT generate its own "
                "medical protocols."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "diagnosis": {
                        "type": "string",
                        "enum": ["Measles", "Dengue"],
                        "description": "The disease to fetch the WHO protocol for.",
                    }
                },
                "required": ["diagnosis"],
            },
        ),
        Tool(
            name="check_medication_safety",
            description=(
                "Cross-references a list of proposed medications against "
                "known contraindications for the given diagnosis. Flags "
                "dangerous drugs (e.g., NSAIDs for Dengue) and returns "
                "safe alternatives."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "diagnosis": {
                        "type": "string",
                        "enum": ["Measles", "Dengue"],
                        "description": "The diagnosed disease.",
                    },
                    "proposed_medications": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of medication names to check.",
                    },
                },
                "required": ["diagnosis", "proposed_medications"],
            },
        ),
        Tool(
            name="query_regional_outbreaks",
            description=(
                "Queries the Supabase database for active outbreak clusters "
                "in a given zip code. Returns case counts from the last 24 "
                "hours. Triggers an alert if ≥3 cases of the same disease "
                "are detected in the same zip code."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "zip_code": {
                        "type": "string",
                        "description": "The postal/zip code to query.",
                    }
                },
                "required": ["zip_code"],
            },
        ),
    ]


@mcp.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Dispatch tool calls to the appropriate handler."""
    import json

    if name == "get_triage_protocol":
        result = _handle_triage_protocol(arguments.get("diagnosis", ""))
    elif name == "check_medication_safety":
        result = _handle_medication_safety(
            arguments.get("diagnosis", ""),
            arguments.get("proposed_medications", []),
        )
    elif name == "query_regional_outbreaks":
        result = await _handle_regional_outbreaks(
            arguments.get("zip_code", "")
        )
    else:
        result = {"error": f"Unknown tool: {name}"}

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


# ══════════════════════════════════════════════════════════════════
# TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════

def _handle_triage_protocol(diagnosis: str) -> dict:
    """Tool 1: get_triage_protocol — returns hardcoded WHO steps."""
    protocol = _WHO_PROTOCOLS.get(diagnosis)
    if not protocol:
        return {
            "error": f"Unknown disease '{diagnosis}'. Supported: Measles, Dengue.",
            "fallback": "Refer patient to nearest health facility immediately.",
        }
    return protocol


def _handle_medication_safety(
    diagnosis: str, proposed_medications: list[str]
) -> dict:
    """Tool 2: check_medication_safety — cross-references contraindications."""
    contraindicated = _CONTRAINDICATED.get(diagnosis, set())
    safe_set = _SAFE_MEDICATIONS.get(diagnosis, set())

    result = {
        "diagnosis": diagnosis,
        "proposed_medications": proposed_medications,
        "safe": [],
        "contraindicated": [],
        "warnings": [],
    }

    for med in proposed_medications:
        med_lower = med.lower().strip()
        if any(c in med_lower for c in contraindicated):
            result["contraindicated"].append(med)
            if diagnosis == "Dengue":
                result["warnings"].append(
                    f"⚠️ {med} is an NSAID — STRICTLY CONTRAINDICATED for Dengue. "
                    f"NSAIDs increase bleeding risk and can cause fatal hemorrhaging."
                )
            else:
                result["warnings"].append(
                    f"⚠️ {med} is contraindicated for {diagnosis} in children."
                )
        elif any(s in med_lower for s in safe_set):
            result["safe"].append(med)
        else:
            result["safe"].append(med)
            result["warnings"].append(
                f"ℹ️ {med} is not in our reference database. Verify with a physician."
            )

    return result


async def _handle_regional_outbreaks(zip_code: str) -> dict:
    """Tool 3: query_regional_outbreaks — queries Supabase for clusters."""
    result = {
        "zip_code": zip_code,
        "active_clusters": [],
        "alert_triggered": False,
        "alert_message": "",
    }

    if not _REST_URL or not SUPABASE_KEY:
        result["alert_message"] = "Database not configured. Cannot query outbreaks."
        return result

    if not zip_code:
        result["alert_message"] = "No zip code provided."
        return result

    try:
        twenty_four_hours_ago = (
            datetime.now(timezone.utc) - timedelta(hours=24)
        ).isoformat()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_REST_URL}/diagnostic_results",
                params={
                    "select": "primary_diagnosis,created_at,zip_code",
                    "zip_code": f"eq.{zip_code}",
                    "created_at": f"gte.{twenty_four_hours_ago}",
                },
                headers=_headers(),
            )

            if response.status_code >= 400:
                result["alert_message"] = f"Database query failed: {response.text}"
                return result

            rows = response.json()

        # Count by disease
        counts: dict[str, int] = {}
        for row in rows:
            diag = row.get("primary_diagnosis", "Unknown")
            counts[diag] = counts.get(diag, 0) + 1

        for disease, count in counts.items():
            cluster = {
                "zip_code": zip_code,
                "disease": disease,
                "case_count": count,
                "latest_case": max(
                    (r["created_at"] for r in rows if r.get("primary_diagnosis") == disease),
                    default="",
                ),
                "earliest_case": min(
                    (r["created_at"] for r in rows if r.get("primary_diagnosis") == disease),
                    default="",
                ),
            }
            result["active_clusters"].append(cluster)

            # Trigger alert if ≥3 cases of same disease in same zip in 24h
            if count >= 3:
                result["alert_triggered"] = True
                result["alert_message"] = (
                    f"🚨 OUTBREAK ALERT: {count} {disease} cases detected in "
                    f"zip code {zip_code} within the last 24 hours. "
                    f"Notify regional health director immediately."
                )

    except Exception as exc:
        result["alert_message"] = f"Outbreak query error: {exc}"

    return result


# ══════════════════════════════════════════════════════════════════
# DIRECT FUNCTION CALLS (for LangGraph nodes to use without MCP)
# ══════════════════════════════════════════════════════════════════
# These are thin wrappers so the orchestrator can call the same
# logic without going through the MCP protocol overhead.

def get_triage_protocol(diagnosis: str) -> dict:
    """Direct call for LangGraph — returns WHO protocol dict."""
    return _handle_triage_protocol(diagnosis)


def check_medication_safety(
    diagnosis: str, proposed_medications: list[str]
) -> dict:
    """Direct call for LangGraph — checks medication contraindications."""
    return _handle_medication_safety(diagnosis, proposed_medications)


async def query_regional_outbreaks(zip_code: str) -> dict:
    """Direct call for LangGraph — queries outbreak clusters."""
    return await _handle_regional_outbreaks(zip_code)

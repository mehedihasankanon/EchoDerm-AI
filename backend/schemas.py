"""
schemas.py — Pydantic models for the entire EchoDerm AI pipeline.

These models enforce deterministic, typed JSON payloads across:
  - Gemini inference output (DiagnosisResult)
  - MCP server tool responses (WHOProtocol, MedicationSafety, RegionalOutbreak)
  - RAG retrieval chunks (RAGChunk)
  - LangGraph orchestrator state (OrchestratorState)
  - FastAPI request/response contracts (AnalyzeResponse)

If any AI model returns a payload that doesn't match these schemas,
Pydantic immediately rejects it — preventing hallucinated keys or
malformed structures from reaching the frontend.
"""

from __future__ import annotations

from enum import Enum
from typing import TypedDict
from pydantic import BaseModel, Field


# ══════════════════════════════════════════════════════════════════
# ENUMS
# ══════════════════════════════════════════════════════════════════

class Disease(str, Enum):
    MEASLES = "Measles"
    DENGUE = "Dengue"
    HEALTHY = "Healthy"


class CrossModalAgreement(str, Enum):
    CONCORDANT = "concordant"
    DISCORDANT = "discordant"


class AlertLevel(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class RouteDecision(str, Enum):
    CLOUD = "cloud"
    EDGE = "edge"


# ══════════════════════════════════════════════════════════════════
# GEMINI INFERENCE OUTPUT — what Gemini must return
# ══════════════════════════════════════════════════════════════════

class ConfidenceBreakdown(BaseModel):
    """Per-modality confidence scores for Explainable AI (XAI)."""
    visual_confidence: float = Field(ge=0.0, le=1.0, description="Confidence from rash photo analysis")
    acoustic_confidence: float = Field(ge=0.0, le=1.0, description="Confidence from cough audio analysis")
    cross_modal_agreement: CrossModalAgreement = Field(
        description="Whether visual and acoustic signals agree (concordant) or conflict (discordant)"
    )


class DiagnosisResult(BaseModel):
    """
    The strict JSON payload that Gemini MUST return.
    If Gemini outputs anything that doesn't parse into this model,
    the request fails safely instead of serving bad data.
    """
    primary_diagnosis: Disease
    confidence_score: float = Field(ge=0.0, le=1.0)
    confidence_breakdown: ConfidenceBreakdown
    visual_findings: str = Field(min_length=10, description="What the AI observed in the rash photo")
    acoustic_findings: str = Field(min_length=10, description="What the AI observed in the cough audio")
    differential_notes: str = Field(min_length=10, description="Clinical reasoning for the diagnosis")
    recommended_next_steps: list[str] = Field(min_length=1, description="Actionable medical recommendations")


# ══════════════════════════════════════════════════════════════════
# MCP SERVER TOOL RESPONSES
# ══════════════════════════════════════════════════════════════════

class WHOProtocol(BaseModel):
    """Response from MCP tool: get_triage_protocol"""
    disease: Disease
    alert_level: AlertLevel
    medications: list[str]
    danger_signs: list[str]
    immediate_actions: list[str]
    strictly_avoid: list[str]
    referral_criteria: str
    isolation_required: bool
    isolation_duration: str


class MedicationSafetyResult(BaseModel):
    """Response from MCP tool: check_medication_safety"""
    diagnosis: Disease
    proposed_medications: list[str]
    safe: list[str] = Field(default_factory=list)
    contraindicated: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class OutbreakCluster(BaseModel):
    """A single outbreak cluster record."""
    zip_code: str
    disease: str
    case_count: int
    latest_case: str
    earliest_case: str


class RegionalOutbreakResult(BaseModel):
    """Outbreak status for a specific geographic region."""
    zip_code: str = Field(..., description="The queried postal/zip code.")
    recent_cases: int = Field(..., description="Number of cases in the last 24h.")
    is_outbreak: bool = Field(..., description="True if cases >= 3.")
    alert_level: str = Field(..., description="E.g., 'Normal', 'Elevated', 'Critical'.")


# ══════════════════════════════════════════════════════════════════
# DOCS MODULE CONFIGURATION
# ══════════════════════════════════════════════════════════════════

class TeamMember(BaseModel):
    name: str
    role: str
    email: str
    avatar_url: str

class DocsConfigUpdate(BaseModel):
    is_public: bool
    start_date: str | None = None
    end_date: str | None = None
    team_members: list[TeamMember] = []


# ══════════════════════════════════════════════════════════════════
# RAG PIPELINE — chunks retrieved from pgvector
# ══════════════════════════════════════════════════════════════════

class RAGChunk(BaseModel):
    """A single chunk of WHO guideline text retrieved from pgvector."""
    id: str
    disease: str
    section: str
    content: str
    similarity_score: float = Field(ge=0.0, le=1.0)
    metadata: dict = Field(default_factory=dict)


class RAGContext(BaseModel):
    """Full RAG context assembled for injection into the final prompt."""
    chunks: list[RAGChunk] = Field(default_factory=list)
    patient_location: str = ""
    contextual_prefix: str = ""  # Prepended to chunks for Contextual RAG
    total_token_estimate: int = 0


# ══════════════════════════════════════════════════════════════════
# LANGGRAPH ORCHESTRATOR STATE
# ══════════════════════════════════════════════════════════════════

class OrchestratorState(TypedDict, total=False):
    """
    The mutable state bag passed between LangGraph nodes.

    This is a TypedDict (not a Pydantic model) because LangGraph
    requires dict-like state for its reducer pattern.
    """
    # ── Inputs (set at graph entry) ──────────────────────────────
    image_bytes: bytes
    image_mime_type: str
    audio_bytes: bytes
    audio_mime_type: str
    patient_id: str
    zip_code: str
    is_online: bool

    # ── Routing decision ─────────────────────────────────────────
    route: str  # "cloud" or "edge"

    # ── Gemini raw output ────────────────────────────────────────
    raw_diagnosis: dict  # Unparsed JSON from Gemini
    diagnosis: dict  # Validated DiagnosisResult as dict

    # ── RAG context ──────────────────────────────────────────────
    rag_context: dict  # RAGContext as dict

    # ── MCP guardrail outputs ────────────────────────────────────
    who_protocol: dict  # WHOProtocol as dict
    medication_safety: dict  # MedicationSafetyResult as dict
    outbreak_data: dict  # RegionalOutbreakResult as dict

    # ── Final assembled response ─────────────────────────────────
    final_response: dict

    # ── Error tracking ───────────────────────────────────────────
    errors: list[str]


# ══════════════════════════════════════════════════════════════════
# FASTAPI RESPONSE MODELS
# ══════════════════════════════════════════════════════════════════

class InferenceMetadata(BaseModel):
    """Metadata about the inference run."""
    model: str = "gemini-3.1-flash-lite"
    system_instruction_version: str = "v3.0"
    inference_time_ms: int = 0
    route_taken: RouteDecision = RouteDecision.CLOUD
    rag_chunks_used: int = 0
    mcp_tools_invoked: list[str] = Field(default_factory=list)
    timestamp: str = ""


class EthicalMetadata(BaseModel):
    """Ethical disclosure attached to every response."""
    disclaimer: str = (
        "This is a decision-support tool, NOT a clinical diagnosis. "
        "Always consult a qualified health professional."
    )
    known_limitations: list[str] = Field(default_factory=lambda: [
        "Accuracy may be lower for darker skin tones due to rash visibility variations",
        "Audio quality in noisy environments may reduce acoustic analysis accuracy",
        "Model has not been validated on a clinical dataset specific to Bangladesh",
        "This tool cannot detect co-infections or comorbidities",
    ])
    bias_mitigations: list[str] = Field(default_factory=lambda: [
        "System instruction includes markers applicable across skin tones",
        "Confidence score is reduced when image quality is poor",
        "Cross-modal discordance detection alerts when visual and acoustic signals conflict",
    ])
    data_handling: str = (
        "Images and audio are processed in-memory and not stored on the server. "
        "Only diagnostic results are logged."
    )


class AnalyzeResponse(BaseModel):
    """The complete response from POST /analyze."""
    patient_id: str
    diagnosis: DiagnosisResult
    who_protocol: WHOProtocol | None = None
    medication_safety: MedicationSafetyResult | None = None
    outbreak_data: RegionalOutbreakResult | None = None
    rag_context_summary: str = ""
    metadata: InferenceMetadata
    ethical_metadata: EthicalMetadata = Field(default_factory=EthicalMetadata)

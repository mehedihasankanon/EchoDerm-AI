"""
orchestrator.py — LangGraph diagnostic orchestration graph.

This is the brain of EchoDerm AI. It implements a multi-step, multi-agent
diagnostic workflow using LangGraph's graph-based orchestration:

  [START]
    │
    ├── route_decision ──┐
    │                    │
    │   ┌────────────────┴────────────────┐
    │   │ is_online = True                │ is_online = False
    │   ▼                                 ▼
    │ gemini_inference              edge_fallback ──→ [END]
    │   │
    │   ▼
    │ rag_retrieval
    │   │
    │   ▼
    │ mcp_guardrails
    │   │
    │   ▼
    │ validate_output
    │   │
    │   ▼
    └── [END]

The graph evaluates navigator.onLine state and payload size to
autonomously route inference tasks between cloud (Gemini) and
edge (text-only fallback) paths.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from langgraph.graph import StateGraph, START, END

from schemas import OrchestratorState, DiagnosisResult
from inference import analyze_multimodal_symptoms
from rag import run_rag_pipeline
from mcp_server import get_triage_protocol, check_medication_safety, query_regional_outbreaks


# ══════════════════════════════════════════════════════════════════
# NODE 1: ROUTE DECISION
# ══════════════════════════════════════════════════════════════════

def route_decision(state: OrchestratorState) -> OrchestratorState:
    """
    Evaluate connectivity and payload to decide the inference path.

    Rules:
      - is_online=True AND image_bytes present → "cloud" (full Gemini multimodal)
      - is_online=False OR no image → "edge" (text-only fallback)
    """
    is_online = state.get("is_online", True)
    has_image = bool(state.get("image_bytes"))
    has_audio = bool(state.get("audio_bytes"))

    if is_online and has_image and has_audio:
        state["route"] = "cloud"
    else:
        state["route"] = "edge"
        reasons = []
        if not is_online:
            reasons.append("device is offline")
        if not has_image:
            reasons.append("no image provided")
        if not has_audio:
            reasons.append("no audio provided")
        state.setdefault("errors", []).append(
            f"Routed to edge fallback: {', '.join(reasons)}"
        )

    return state


def should_go_cloud(state: OrchestratorState) -> str:
    """Conditional edge: return 'cloud' or 'edge' based on route decision."""
    return state.get("route", "edge")


# ══════════════════════════════════════════════════════════════════
# NODE 2: GEMINI INFERENCE (Cloud Path)
# ══════════════════════════════════════════════════════════════════

async def gemini_inference(state: OrchestratorState) -> OrchestratorState:
    """
    Run Gemini 3.1 Flash Lite multimodal inference on the image + audio.

    This is the first step of the cloud path. The raw Gemini output is
    stored in state['raw_diagnosis'] for subsequent RAG enrichment
    and MCP guardrail validation.
    """
    try:
        result = await analyze_multimodal_symptoms(
            image_bytes=state["image_bytes"],
            image_mime_type=state.get("image_mime_type", "image/jpeg"),
            audio_bytes=state["audio_bytes"],
            audio_mime_type=state.get("audio_mime_type", "audio/wav"),
            rag_context="",  # First pass — no RAG yet
        )
        state["raw_diagnosis"] = result
    except Exception as exc:
        state.setdefault("errors", []).append(
            f"Gemini inference failed: {exc}"
        )
        state["raw_diagnosis"] = {}

    return state


# ══════════════════════════════════════════════════════════════════
# NODE 3: RAG RETRIEVAL
# ══════════════════════════════════════════════════════════════════

async def rag_retrieval(state: OrchestratorState) -> OrchestratorState:
    """
    Run the multi-step Agentic RAG pipeline:
      1. Extract features from Gemini's raw output
      2. Embed the query
      3. Search pgvector for WHO guideline chunks
      4. Prepend patient geographic metadata (Contextual RAG)

    If RAG returns results AND the raw diagnosis exists, re-run Gemini
    with the RAG context injected into the system instruction for a
    grounded second pass.
    """
    raw_diagnosis = state.get("raw_diagnosis", {})
    if not raw_diagnosis:
        state.setdefault("errors", []).append("No raw diagnosis for RAG.")
        state["rag_context"] = {}
        return state

    try:
        rag_result = await run_rag_pipeline(
            diagnosis_result=raw_diagnosis,
            zip_code=state.get("zip_code", ""),
            patient_location="",
            top_k=5,
        )
        state["rag_context"] = rag_result

        # If we got RAG context, re-run Gemini with grounded context
        contextual_text = rag_result.get("contextual_text", "")
        if contextual_text and state.get("image_bytes"):
            grounded_result = await analyze_multimodal_symptoms(
                image_bytes=state["image_bytes"],
                image_mime_type=state.get("image_mime_type", "image/jpeg"),
                audio_bytes=state["audio_bytes"],
                audio_mime_type=state.get("audio_mime_type", "audio/wav"),
                rag_context=contextual_text,
            )
            # Merge: keep the grounded result but preserve RAG metadata
            state["raw_diagnosis"] = grounded_result

    except Exception as exc:
        state.setdefault("errors", []).append(f"RAG retrieval failed: {exc}")
        state["rag_context"] = {}

    return state


# ══════════════════════════════════════════════════════════════════
# NODE 4: MCP GUARDRAILS
# ══════════════════════════════════════════════════════════════════

async def mcp_guardrails(state: OrchestratorState) -> OrchestratorState:
    """
    Invoke the MCP server tools to validate and enrich the diagnosis:
      1. get_triage_protocol — fetch strict WHO management steps
      2. check_medication_safety — verify recommended meds aren't dangerous
      3. query_regional_outbreaks — check for local cluster alerts
    """
    raw = state.get("raw_diagnosis", {})
    diagnosis_str = raw.get("primary_diagnosis", "")
    next_steps = raw.get("recommended_next_steps", [])

    # Tool 1: WHO Triage Protocol
    try:
        protocol = get_triage_protocol(diagnosis_str)
        state["who_protocol"] = protocol
    except Exception as exc:
        state.setdefault("errors", []).append(
            f"MCP get_triage_protocol failed: {exc}"
        )
        state["who_protocol"] = {}

    # Tool 2: Medication Safety Check
    # Extract medication names from recommended_next_steps
    medication_keywords = []
    for step in next_steps:
        step_lower = step.lower()
        for med in [
            "paracetamol", "ibuprofen", "aspirin", "vitamin a",
            "naproxen", "diclofenac", "ors", "acetaminophen",
        ]:
            if med in step_lower:
                medication_keywords.append(med.title())
    try:
        safety = check_medication_safety(
            diagnosis_str, medication_keywords or ["Paracetamol"]
        )
        state["medication_safety"] = safety
    except Exception as exc:
        state.setdefault("errors", []).append(
            f"MCP check_medication_safety failed: {exc}"
        )
        state["medication_safety"] = {}

    # Tool 3: Regional Outbreak Query
    zip_code = state.get("zip_code", "")
    try:
        outbreak = await query_regional_outbreaks(zip_code)
        state["outbreak_data"] = outbreak
    except Exception as exc:
        state.setdefault("errors", []).append(
            f"MCP query_regional_outbreaks failed: {exc}"
        )
        state["outbreak_data"] = {}

    return state


# ══════════════════════════════════════════════════════════════════
# NODE 5: VALIDATE OUTPUT (Pydantic enforcement)
# ══════════════════════════════════════════════════════════════════

def validate_output(state: OrchestratorState) -> OrchestratorState:
    """
    Run Pydantic validation on the Gemini output.

    If the output doesn't match DiagnosisResult schema, this node
    catches it and stores the error. The final response will include
    a safe fallback instead of serving malformed data.
    """
    raw = state.get("raw_diagnosis", {})

    # Strip internal metadata before validation
    clean = {k: v for k, v in raw.items() if not k.startswith("_")}
    metadata = raw.get("_metadata", {})

    try:
        validated = DiagnosisResult.model_validate(clean)
        state["diagnosis"] = validated.model_dump()
    except Exception as exc:
        state.setdefault("errors", []).append(
            f"Pydantic validation failed: {exc}"
        )
        # Fallback: use raw data but flag it
        state["diagnosis"] = clean
        state["diagnosis"]["_validation_failed"] = True

    # ── Assemble the final response ──────────────────────────────
    rag_context = state.get("rag_context", {})
    who_protocol = state.get("who_protocol", {})
    medication_safety = state.get("medication_safety", {})
    outbreak_data = state.get("outbreak_data", {})

    mcp_tools_invoked = []
    if who_protocol:
        mcp_tools_invoked.append("get_triage_protocol")
    if medication_safety:
        mcp_tools_invoked.append("check_medication_safety")
    if outbreak_data:
        mcp_tools_invoked.append("query_regional_outbreaks")

    # Build RAG summary
    chunks = rag_context.get("chunks", [])
    rag_summary = ""
    if chunks:
        rag_summary = (
            f"Grounded in {len(chunks)} WHO guideline chunks retrieved via "
            f"pgvector RAG (disease filter: {rag_context.get('disease_filter', 'none')})"
        )

    state["final_response"] = {
        "patient_id": state.get("patient_id", ""),
        "diagnosis": state.get("diagnosis", {}),
        "who_protocol": who_protocol if who_protocol else None,
        "medication_safety": medication_safety if medication_safety else None,
        "outbreak_data": outbreak_data if outbreak_data else None,
        "rag_context_summary": rag_summary,
        "metadata": {
            "model": metadata.get("model", "gemini-3.1-flash-lite"),
            "system_instruction_version": metadata.get(
                "system_instruction_version", "v3.0"
            ),
            "inference_time_ms": metadata.get("inference_time_ms", 0),
            "route_taken": state.get("route", "cloud"),
            "rag_chunks_used": len(chunks),
            "mcp_tools_invoked": mcp_tools_invoked,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "ethical_metadata": {
            "disclaimer": (
                "This is a decision-support tool, NOT a clinical diagnosis. "
                "Always consult a qualified health professional."
            ),
            "known_limitations": [
                "Accuracy may vary for darker skin tones",
                "Audio quality affects acoustic analysis",
                "Not validated on Bangladesh-specific clinical datasets",
                "Cannot detect co-infections or comorbidities",
            ],
            "bias_mitigations": [
                "System instruction includes skin-tone-agnostic markers",
                "Confidence reduced on poor image quality",
                "Cross-modal discordance detection active",
            ],
            "data_handling": (
                "Images and audio processed in-memory only — never stored."
            ),
        },
        "errors": state.get("errors", []),
    }

    return state


# ══════════════════════════════════════════════════════════════════
# NODE 6: EDGE FALLBACK (Offline Path)
# ══════════════════════════════════════════════════════════════════

def edge_fallback(state: OrchestratorState) -> OrchestratorState:
    """
    When offline or missing media files, return a minimal text-based
    response. The real triage happens on the frontend via Llama 3.2.

    This node exists so the backend always returns a valid response
    shape even when the full pipeline can't run.
    """
    state["final_response"] = {
        "patient_id": state.get("patient_id", ""),
        "diagnosis": {
            "primary_diagnosis": "Pending",
            "confidence_score": 0.0,
            "confidence_breakdown": {
                "visual_confidence": 0.0,
                "acoustic_confidence": 0.0,
                "cross_modal_agreement": "discordant",
            },
            "visual_findings": "No image analyzed — device offline or media missing.",
            "acoustic_findings": "No audio analyzed — device offline or media missing.",
            "differential_notes": (
                "Full multimodal analysis requires an internet connection and both "
                "a rash photo and cough audio. This request has been queued for "
                "processing when connectivity is restored."
            ),
            "recommended_next_steps": [
                "Use the offline Llama triage for preliminary text-based assessment",
                "Queue this submission for full analysis when internet returns",
                "Monitor patient for danger signs in the meantime",
            ],
        },
        "who_protocol": None,
        "medication_safety": None,
        "outbreak_data": None,
        "rag_context_summary": "",
        "metadata": {
            "model": "edge-fallback",
            "system_instruction_version": "v3.0",
            "inference_time_ms": 0,
            "route_taken": "edge",
            "rag_chunks_used": 0,
            "mcp_tools_invoked": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "ethical_metadata": {
            "disclaimer": (
                "OFFLINE MODE — This is a queued submission. Full AI analysis "
                "will run when internet connectivity is restored."
            ),
            "known_limitations": ["Offline — no multimodal analysis performed"],
            "bias_mitigations": [],
            "data_handling": "Data stored locally in IndexedDB until sync.",
        },
        "errors": state.get("errors", []),
    }

    return state


# ══════════════════════════════════════════════════════════════════
# BUILD THE GRAPH
# ══════════════════════════════════════════════════════════════════

def build_diagnostic_graph() -> StateGraph:
    """
    Construct and compile the LangGraph diagnostic orchestration graph.

    Returns a compiled graph that can be invoked with:
        result = await graph.ainvoke(initial_state)
    """
    graph = StateGraph(OrchestratorState)

    # ── Add nodes ────────────────────────────────────────────────
    graph.add_node("route_decision", route_decision)
    graph.add_node("gemini_inference", gemini_inference)
    graph.add_node("rag_retrieval", rag_retrieval)
    graph.add_node("mcp_guardrails", mcp_guardrails)
    graph.add_node("validate_output", validate_output)
    graph.add_node("edge_fallback", edge_fallback)

    # ── Add edges ────────────────────────────────────────────────

    # START → route_decision
    graph.add_edge(START, "route_decision")

    # route_decision → cloud or edge (conditional)
    graph.add_conditional_edges(
        "route_decision",
        should_go_cloud,
        {
            "cloud": "gemini_inference",
            "edge": "edge_fallback",
        },
    )

    # Cloud path: gemini → rag → mcp → validate → END
    graph.add_edge("gemini_inference", "rag_retrieval")
    graph.add_edge("rag_retrieval", "mcp_guardrails")
    graph.add_edge("mcp_guardrails", "validate_output")
    graph.add_edge("validate_output", END)

    # Edge path: fallback → END
    graph.add_edge("edge_fallback", END)

    return graph.compile()


# ── Module-level compiled graph (singleton) ──────────────────────
diagnostic_graph = build_diagnostic_graph()

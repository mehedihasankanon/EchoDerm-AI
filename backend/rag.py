"""
rag.py — Multi-step Agentic RAG pipeline for EchoDerm AI.

This module implements the WHO guideline retrieval augmented generation pipeline:

  Step 1: Extract key clinical features from Gemini's initial diagnosis
  Step 2: Generate a query embedding via Gemini's text-embedding-004
  Step 3: Query Supabase pgvector for top-k semantically similar WHO chunks
  Step 4: Prepend patient geographic metadata (Contextual RAG)
  Step 5: Return assembled context for injection into the final prompt

The goal: ensure the AI's output is strictly grounded in official WHO
epidemiological literature, not baseline pre-training data.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from google import genai

from database import search_who_guidelines

load_dotenv()

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

# Shared genai client for embeddings
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Lazy-init the Gemini client."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


# ══════════════════════════════════════════════════════════════════
# STEP 1: Build the semantic query from diagnosis features
# ══════════════════════════════════════════════════════════════════

def build_rag_query(diagnosis_result: dict) -> str:
    """
    Construct a natural-language query from the Gemini diagnosis output.
    This query is designed to retrieve the most relevant WHO guideline chunks.

    We combine the diagnosis, visual findings, and acoustic findings into a
    single query string that captures the clinical context.
    """
    parts = []

    primary = diagnosis_result.get("primary_diagnosis", "")
    if primary:
        parts.append(f"WHO clinical management guidelines for {primary}")

    visual = diagnosis_result.get("visual_findings", "")
    if visual:
        parts.append(f"Skin rash characteristics: {visual[:200]}")

    acoustic = diagnosis_result.get("acoustic_findings", "")
    if acoustic:
        parts.append(f"Respiratory symptoms: {acoustic[:200]}")

    # Add treatment-specific keywords to improve retrieval
    if primary == "Measles":
        parts.append("Vitamin A dosage isolation airborne precautions")
    elif primary == "Dengue":
        parts.append(
            "NSAID contraindication fluid management platelet monitoring"
        )

    return ". ".join(parts) if parts else "WHO clinical guidelines Measles Dengue"


# ══════════════════════════════════════════════════════════════════
# STEP 2: Generate embedding via Gemini text-embedding-004
# ══════════════════════════════════════════════════════════════════

async def generate_embedding(text: str) -> list[float]:
    """
    Generate a 768-dimensional embedding using Gemini's embedding model.

    Returns an empty list if the API call fails (graceful degradation).
    """
    if not GEMINI_API_KEY:
        print("[WARN] No Gemini API key. Skipping embedding generation.")
        return []

    try:
        client = _get_client()
        response = await client.aio.models.embed_content(
            model="gemini-embedding-001",
            contents=text,
        )
        # The response contains an embedding object
        if response and response.embeddings:
            return list(response.embeddings[0].values)
        return []

    except Exception as exc:
        print(f"[WARN] Embedding generation failed: {exc}")
        return []


# ══════════════════════════════════════════════════════════════════
# STEP 3: Query pgvector for relevant WHO guideline chunks
# ══════════════════════════════════════════════════════════════════

async def retrieve_who_chunks(
    query_embedding: list[float],
    top_k: int = 5,
    disease_filter: str | None = None,
) -> list[dict]:
    """
    Search pgvector for the top-k most semantically similar WHO chunks.

    Returns empty list if pgvector is not configured or query fails.
    """
    if not query_embedding:
        print("[WARN] Empty embedding. Skipping pgvector search.")
        return []

    return await search_who_guidelines(
        query_embedding=query_embedding,
        top_k=top_k,
        disease_filter=disease_filter,
    )


# ══════════════════════════════════════════════════════════════════
# STEP 4: Contextual RAG — prepend geographic metadata
# ══════════════════════════════════════════════════════════════════

def build_contextual_chunks(
    chunks: list[dict],
    zip_code: str = "",
    patient_location: str = "",
) -> str:
    """
    Assemble the retrieved chunks into a single context string,
    prepended with patient geographic metadata (Contextual RAG).

    This is the Anthropic-style contextual RAG approach: we add
    specific context about the patient's location and local
    epidemiological situation before the retrieved WHO text.
    """
    if not chunks:
        return ""

    sections: list[str] = []

    # ── Geographic context prefix ────────────────────────────────
    if zip_code or patient_location:
        geo_prefix = "PATIENT GEOGRAPHIC CONTEXT:\n"
        if patient_location:
            geo_prefix += f"  Location: {patient_location}\n"
        if zip_code:
            geo_prefix += f"  Postal Code: {zip_code}\n"
        geo_prefix += (
            "  Note: Treatment protocols may need adjustment based on local "
            "drug availability and referral facility distance.\n"
        )
        sections.append(geo_prefix)

    # ── Retrieved WHO guideline chunks ───────────────────────────
    sections.append("RETRIEVED WHO CLINICAL GUIDELINES (from pgvector RAG):\n")

    for i, chunk in enumerate(chunks, 1):
        section_header = chunk.get("section", "General")
        disease = chunk.get("disease", "Unknown")
        content = chunk.get("content", "")
        similarity = chunk.get("similarity", 0.0)

        sections.append(
            f"[Chunk {i}] Disease: {disease} | Section: {section_header} | "
            f"Relevance: {similarity:.2%}\n{content}\n"
        )

    return "\n".join(sections)


# ══════════════════════════════════════════════════════════════════
# MAIN PIPELINE — called by the LangGraph orchestrator
# ══════════════════════════════════════════════════════════════════

async def run_rag_pipeline(
    diagnosis_result: dict,
    zip_code: str = "",
    patient_location: str = "",
    top_k: int = 5,
) -> dict:
    """
    Execute the complete multi-step Agentic RAG pipeline.

    Args:
        diagnosis_result: The raw Gemini diagnosis output (dict)
        zip_code: Patient's postal code for geographic context
        patient_location: Human-readable location string
        top_k: Number of WHO chunks to retrieve

    Returns:
        dict with keys:
            - chunks: list of retrieved chunk dicts
            - contextual_text: assembled text for prompt injection
            - total_chunks: number of chunks found
            - disease_filter: the disease used for filtering
    """
    # Step 1: Build the semantic query
    query_text = build_rag_query(diagnosis_result)

    # Step 2: Generate embedding
    embedding = await generate_embedding(query_text)

    # Step 3: Query pgvector
    disease_filter = diagnosis_result.get("primary_diagnosis")
    chunks = await retrieve_who_chunks(
        query_embedding=embedding,
        top_k=top_k,
        disease_filter=disease_filter,
    )

    # Step 4: Build contextual text
    contextual_text = build_contextual_chunks(
        chunks=chunks,
        zip_code=zip_code,
        patient_location=patient_location,
    )

    # Estimate token count (rough: ~0.75 tokens per word)
    word_count = len(contextual_text.split())
    token_estimate = int(word_count * 0.75)

    return {
        "chunks": chunks,
        "contextual_text": contextual_text,
        "total_chunks": len(chunks),
        "disease_filter": disease_filter or "",
        "token_estimate": token_estimate,
        "query_text": query_text,
    }

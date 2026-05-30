"""
inference.py — Multimodal Gemini inference for EchoDerm AI.

Uses Gemini 3.1 Flash Lite to perform simultaneous analysis of a skin-rash
image and a cough audio clip, producing a structured differential diagnosis
(Measles vs. Dengue) with confidence breakdown by modality.

Now supports optional RAG context injection — when pgvector retrieves
relevant WHO guideline chunks, they are appended to the system instruction
to ground the model's output in official clinical literature.
"""

from __future__ import annotations

import json
import os
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL: str = "gemini-3.1-flash-lite"

if not GEMINI_API_KEY:
    raise EnvironmentError(
        "GEMINI_API_KEY must be set in the environment or .env file."
    )

# Initialize the new SDK Client
client = genai.Client(api_key=GEMINI_API_KEY)

# System instruction version — increment when you change the prompt
SYSTEM_INSTRUCTION_VERSION = "v3.0"

# ── Base system instruction with clinical differentiation criteria ────────────
BASE_SYSTEM_INSTRUCTION = """\
You are EchoDerm AI, a clinical decision-support system for differentiating
Measles from Dengue in pediatric patients in rural Bangladesh.

You will receive TWO inputs simultaneously:
1. A photograph of the patient's skin rash.
2. An audio recording of the patient's cough.

═══ CLINICAL DIFFERENTIATION CRITERIA ═══

Use the following evidence-based markers to make your differential diagnosis:

VISUAL MARKERS (from the skin rash photograph):

  MEASLES indicators:
  - Maculopapular (flat + raised) erythematous rash
  - Begins on the face/forehead, spreads downward (cephalocaudal progression)
  - Confluent patches (individual spots merge together)
  - Koplik's spots (tiny white dots inside the mouth, if visible)
  - Rash appears 3-5 days after fever onset
  - Skin may show desquamation (peeling) in later stages

  DENGUE indicators:
  - Diffuse, blanching erythematous macular rash ("islands of white in a sea of red")
  - Petechiae (tiny pinpoint red/purple dots that do NOT blanch when pressed)
  - Rash is generalized — does NOT follow a head-to-toe progression
  - May show hemorrhagic manifestations (bruising, purpura)
  - Tourniquet test positive areas (clusters of petechiae)
  - Rash appears during defervescence (when fever breaks, days 5-7)

ACOUSTIC MARKERS (from the cough audio):

  MEASLES indicators:
  - Dry, barking, nonproductive cough
  - Harsh quality (laryngeal/tracheal involvement)
  - May have stridor (high-pitched inspiratory sound)
  - Persistent cough (a hallmark symptom of measles)
  - Cough typically precedes the rash by 2-4 days

  DENGUE indicators:
  - Cough is typically ABSENT or very mild
  - If present: soft, non-specific, mildly productive
  - No barking quality, no stridor
  - Dengue is NOT primarily a respiratory illness
  - NOTE: The ABSENCE of a significant cough is itself a Dengue indicator

  HEALTHY indicators:
  - Clear, normal skin with no significant erythematous patches, macules, or petechiae
  - No distinct harsh cough in the audio

═══ DECISION LOGIC ═══

Weight the visual evidence at 60% and acoustic evidence at 40%.

If the image shows cephalocaudal maculopapular rash AND the audio shows
barking/harsh cough → strong Measles signal (confidence > 0.80).

If the image shows diffuse rash with petechiae AND the audio shows
absent/mild cough → strong Dengue signal (confidence > 0.80).

If BOTH the image shows healthy/normal skin AND the audio shows normal background 
noise or no significant cough → output "Healthy" (confidence > 0.80).

If signals conflict (e.g., normal skin but severe barking cough), output 
the disease matching the strongest signal (e.g., Measles) but reduce 
confidence to 0.50-0.70 and explain the conflict in differential_notes.

═══ SCOPE GUARDRAIL ═══

You MUST REFUSE to analyze images that are clearly NOT skin rashes or normal skin 
(e.g., broken bones, X-rays, unrelated body parts, non-medical photos).
If the image is out of scope, return:
{
  "primary_diagnosis": "Healthy",
  "confidence_score": 0.0,
  "confidence_breakdown": {"visual_confidence": 0.0, "acoustic_confidence": 0.0, "cross_modal_agreement": "discordant"},
  "visual_findings": "Image does not appear to be a relevant body part.",
  "acoustic_findings": "Analysis skipped — image out of scope.",
  "differential_notes": "The uploaded image does not match the expected input type. Please upload a clear photo of the patient's skin.",
  "recommended_next_steps": ["Upload a clear photograph of the patient's skin"]
}

═══ OUTPUT FORMAT ═══

Return STRICT JSON matching this exact schema. No markdown, no commentary.

{
  "primary_diagnosis": "Measles" or "Dengue" or "Healthy",
  "confidence_score": <float 0.0-1.0>,
  "confidence_breakdown": {
    "visual_confidence": <float 0.0-1.0>,
    "acoustic_confidence": <float 0.0-1.0>,
    "cross_modal_agreement": "concordant" or "discordant"
  },
  "visual_findings": "<what you observed in the rash photo>",
  "acoustic_findings": "<what you observed in the cough audio>",
  "differential_notes": "<your clinical reasoning, including why you weighted modalities as you did>",
  "recommended_next_steps": ["<action 1>", "<action 2>", "<action 3>"]
}

═══ EXAMPLE OUTPUT ═══

{
  "primary_diagnosis": "Measles",
  "confidence_score": 0.88,
  "confidence_breakdown": {
    "visual_confidence": 0.90,
    "acoustic_confidence": 0.85,
    "cross_modal_agreement": "concordant"
  },
  "visual_findings": "Confluent maculopapular erythematous rash with cephalocaudal distribution.",
  "acoustic_findings": "Harsh, dry, barking cough with audible stridor on inspiration.",
  "differential_notes": "Both visual and acoustic markers strongly indicate Measles. Cross-modal signals are concordant.",
  "recommended_next_steps": ["Administer Vitamin A 200,000 IU immediately", "Isolate patient", "Monitor for pneumonia"]
}
"""


def _build_system_instruction(rag_context: str = "") -> str:
    """
    Build the complete system instruction, optionally injecting
    RAG context from pgvector WHO guideline retrieval.
    """
    if not rag_context:
        return BASE_SYSTEM_INSTRUCTION

    return (
        BASE_SYSTEM_INSTRUCTION
        + "\n\n═══ RETRIEVED WHO GUIDELINES (from pgvector RAG) ═══\n\n"
        + "The following WHO guideline excerpts were retrieved from our "
        + "verified clinical database. Use these to ground your recommended_next_steps. "
        + "Do NOT contradict these guidelines.\n\n"
        + rag_context
    )


async def analyze_multimodal_symptoms(
    image_bytes: bytes,
    image_mime_type: str,
    audio_bytes: bytes,
    audio_mime_type: str,
    rag_context: str = "",
) -> dict:
    """
    Run dual-modal inference on skin-rash image + cough audio.

    Args:
        image_bytes: Raw bytes of the rash photograph
        image_mime_type: MIME type of the image
        audio_bytes: Raw bytes of the cough audio
        audio_mime_type: MIME type of the audio
        rag_context: Optional pre-assembled RAG context string from pgvector

    Returns:
        dict with the diagnosis AND inference metadata
    """

    # Build the multimodal contents
    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type),
        types.Part.from_bytes(data=audio_bytes, mime_type=audio_mime_type),
        (
            "Analyze the attached skin-rash photograph and cough audio recording. "
            "Provide your differential diagnosis as strict JSON following the "
            "schema defined in your system instruction."
        ),
    ]

    # Build system instruction with optional RAG context
    system_instruction = _build_system_instruction(rag_context)

    # Package the model parameters using GenerateContentConfig
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.2,
        top_p=0.8,
        max_output_tokens=1024,
        response_mime_type="application/json",
    )

    # Track inference time for explainability
    start_time = time.time()

    # Invoke the model asynchronously
    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=config,
    )

    inference_time_ms = round((time.time() - start_time) * 1000)

    # Parse the strict-JSON response
    if response.text is None:
        raise ValueError("Model response returned no text content")
    result: dict = json.loads(response.text)

    # Attach inference metadata for explainability
    result["_metadata"] = {
        "model": GEMINI_MODEL,
        "system_instruction_version": SYSTEM_INSTRUCTION_VERSION,
        "inference_time_ms": inference_time_ms,
        "rag_context_injected": bool(rag_context),
    }

    return result
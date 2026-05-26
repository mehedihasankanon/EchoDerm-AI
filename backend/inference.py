"""
inference.py — Multimodal Gemini inference for EchoDerm AI.

Uses Gemini 1.5 Flash to perform simultaneous analysis of a skin‑rash image
and a cough audio clip, producing a structured differential diagnosis
(Measles vs. Dengue) with confidence scores.
"""

import json
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

if not GEMINI_API_KEY:
    raise EnvironmentError(
        "GEMINI_API_KEY must be set in the environment or .env file."
    )

genai.configure(api_key=GEMINI_API_KEY)

# ── System instruction for strict differential diagnosis ────────────────────
SYSTEM_INSTRUCTION = """
You are EchoDerm AI, a clinical decision‑support assistant specialising in
differentiating Measles from Dengue Fever based on two simultaneous inputs:

1. A photograph of a skin rash.
2. An audio recording of a patient's cough.

Analyse both modalities and return your assessment as **strict JSON** matching
the schema below — no markdown fences, no extra keys, no commentary outside
the JSON object.

JSON Schema:
{
  "primary_diagnosis": "Measles" | "Dengue",
  "confidence_score": <float 0.0–1.0>,
  "visual_findings": "<concise description of rash morphology & distribution>",
  "acoustic_findings": "<concise description of cough characteristics>",
  "differential_notes": "<brief reasoning for the chosen diagnosis>",
  "recommended_next_steps": ["<action 1>", "<action 2>"]
}

Rules:
- Confidence must be between 0.0 and 1.0 inclusive.
- primary_diagnosis MUST be exactly "Measles" or "Dengue".
- If the inputs are ambiguous, still pick the most probable diagnosis and
  explain your uncertainty in differential_notes.
- Never refuse to answer; always provide your best clinical estimate.
"""

# ── Gemini model configuration ──────────────────────────────────────────────
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    system_instruction=SYSTEM_INSTRUCTION,
    generation_config=genai.GenerationConfig(
        temperature=0.2,
        top_p=0.8,
        max_output_tokens=1024,
        response_mime_type="application/json",
    ),
)


async def analyze_multimodal_symptoms(
    image_bytes: bytes,
    image_mime_type: str,
    audio_bytes: bytes,
    audio_mime_type: str,
) -> dict:
    """
    Run dual‑modal inference on skin‑rash image + cough audio.

    Parameters
    ----------
    image_bytes : bytes
        Raw bytes of the uploaded skin‑rash photograph.
    image_mime_type : str
        MIME type of the image (e.g. "image/jpeg", "image/png").
    audio_bytes : bytes
        Raw bytes of the uploaded cough audio clip.
    audio_mime_type : str
        MIME type of the audio (e.g. "audio/wav", "audio/mpeg").

    Returns
    -------
    dict
        Parsed JSON object conforming to the diagnostic schema defined in
        SYSTEM_INSTRUCTION.
    """

    # Build the multimodal prompt parts
    prompt_parts = [
        # Image payload
        {"mime_type": image_mime_type, "data": image_bytes},
        # Audio payload
        {"mime_type": audio_mime_type, "data": audio_bytes},
        # Text instruction accompanying the media
        (
            "Analyze the attached skin‑rash photograph and cough audio recording. "
            "Provide your differential diagnosis as strict JSON."
        ),
    ]

    # Invoke the model (async‑compatible via generate_content_async)
    response = await model.generate_content_async(prompt_parts)

    # Parse the strict‑JSON response
    result: dict = json.loads(response.text)

    return result

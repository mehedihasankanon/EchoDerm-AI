"""
seed_vectors.py — One-time script to chunk, embed, and insert WHO
clinical management guidelines into Supabase pgvector.

Run this ONCE after setting up the Supabase table:
  python seed_vectors.py

It will:
  1. Chunk the hardcoded WHO guidelines into meaningful sections
  2. Generate embeddings via Gemini text-embedding-004
  3. Insert each chunk + embedding into the who_guidelines table

Prerequisites:
  - Supabase pgvector extension enabled
  - who_guidelines table created (see implementation_plan.md for SQL)
  - search_who_guidelines RPC function created
  - GEMINI_API_KEY and SUPABASE_URL/KEY in .env
"""

from __future__ import annotations

import asyncio

from rag import generate_embedding
from database import insert_who_guideline


# ══════════════════════════════════════════════════════════════════
# WHO GUIDELINE CHUNKS — chunked for optimal retrieval
# ══════════════════════════════════════════════════════════════════
# Each chunk is a semantically meaningful section of WHO guidelines.
# Chunks are ~100-300 words — small enough for precise retrieval,
# large enough to contain actionable clinical information.

WHO_CHUNKS: list[dict] = [
    # ── MEASLES ──────────────────────────────────────────────────
    {
        "disease": "Measles",
        "section": "Clinical Presentation",
        "content": (
            "Measles presents with a prodromal phase of high fever (up to 40.6°C), "
            "cough, coryza (runny nose), and conjunctivitis (the '3 Cs') lasting "
            "2-4 days before rash onset. Koplik's spots — small white lesions on "
            "the buccal mucosa — are pathognomonic and appear 1-2 days before the "
            "rash. The characteristic maculopapular rash begins on the face and "
            "behind the ears, spreading cephalocaudally (head to toe) over 3-4 days. "
            "The rash is initially discrete but becomes confluent, particularly on "
            "the face. Desquamation (peeling) occurs as the rash fades. Measles is "
            "one of the most contagious diseases — airborne transmission with a "
            "basic reproduction number (R0) of 12-18."
        ),
    },
    {
        "disease": "Measles",
        "section": "Vitamin A Treatment Protocol",
        "content": (
            "WHO recommends immediate Vitamin A supplementation for ALL children "
            "diagnosed with measles: Children >12 months: 200,000 IU orally on "
            "day 1 and day 2. Children 6-11 months: 100,000 IU on day 1 and day 2. "
            "Infants <6 months: 50,000 IU on day 1 and day 2. Vitamin A reduces "
            "measles mortality by 50-80% and prevents blindness from corneal damage. "
            "Administration should not be delayed for any reason — every hour matters. "
            "For children with clinical Vitamin A deficiency (night blindness, "
            "Bitot's spots), a third dose should be given 2-4 weeks after the second."
        ),
    },
    {
        "disease": "Measles",
        "section": "Supportive Care and Monitoring",
        "content": (
            "Supportive care includes: Fever management with Paracetamol only "
            "(10-15 mg/kg every 4-6 hours, max 4 doses/day). NEVER give Aspirin "
            "to children (risk of Reye's syndrome). Maintain hydration with ORS "
            "if diarrhea is present. Monitor for danger signs every 4 hours: "
            "inability to drink/breastfeed, persistent vomiting, convulsions, "
            "lethargy, mouth ulcers preventing eating, corneal clouding, fast or "
            "deep breathing. Isolate the patient for minimum 4 days after rash "
            "onset to prevent airborne transmission."
        ),
    },
    {
        "disease": "Measles",
        "section": "Complications and Referral",
        "content": (
            "Common measles complications: Pneumonia (most common cause of measles "
            "death), otitis media (ear infection — check for discharge), "
            "encephalitis (1 in 1000 cases), corneal ulceration/blindness. "
            "Severely malnourished children are at highest risk. Refer urgently "
            "to hospital if: any danger sign is present, child is severely "
            "malnourished (MUAC <115mm), pneumonia suspected (fast breathing, "
            "chest indrawing), signs of encephalitis (seizures, altered consciousness), "
            "or corneal clouding is observed. Measles is a notifiable disease — "
            "report to local health authority within 24 hours."
        ),
    },
    {
        "disease": "Measles",
        "section": "Epidemiology Bangladesh",
        "content": (
            "Bangladesh context: Despite high vaccination coverage (~95% MCV1), "
            "measles outbreaks continue in densely populated areas, urban slums, "
            "and Rohingya refugee camps in Cox's Bazar. Outbreaks peak during "
            "January-April (dry season). The WHO SEARO region reported 14,000+ "
            "confirmed measles cases in Bangladesh in 2023. Community health "
            "workers (Shasthya Shebikas) are often the first point of contact — "
            "early detection and immediate Vitamin A administration at the "
            "community level significantly reduces mortality."
        ),
    },

    # ── DENGUE ───────────────────────────────────────────────────
    {
        "disease": "Dengue",
        "section": "Clinical Presentation",
        "content": (
            "Dengue presents with sudden high fever (40°C), severe headache, "
            "retro-orbital pain, myalgia, arthralgia, nausea/vomiting, and a "
            "diffuse blanching erythematous rash described as 'islands of white "
            "in a sea of red.' Petechiae (pinpoint hemorrhages that do NOT blanch) "
            "may appear. Unlike measles, the rash does NOT follow a cephalocaudal "
            "pattern and typically appears during defervescence (days 5-7 when fever "
            "breaks). A positive tourniquet test (≥20 petechiae per square inch after "
            "inflating a BP cuff) is a WHO-recommended clinical sign. Dengue is "
            "mosquito-borne (Aedes aegypti), NOT airborne — no isolation required."
        ),
    },
    {
        "disease": "Dengue",
        "section": "NSAID Contraindication Warning",
        "content": (
            "CRITICAL SAFETY WARNING: NSAIDs are STRICTLY CONTRAINDICATED in "
            "dengue. This includes Ibuprofen, Aspirin, Naproxen, Diclofenac, "
            "Mefenamic acid, and all other NSAIDs. NSAIDs inhibit platelet "
            "function and increase bleeding risk — in dengue, where platelet "
            "counts are already dropping, NSAIDs can cause fatal hemorrhaging. "
            "The ONLY acceptable antipyretic is Paracetamol (Acetaminophen) at "
            "10-15 mg/kg every 4-6 hours. This is the single most critical "
            "medication safety rule for dengue management. Misadministration of "
            "Ibuprofen in suspected dengue is a potentially fatal medical error."
        ),
    },
    {
        "disease": "Dengue",
        "section": "Fluid Management and Monitoring",
        "content": (
            "Dengue management is primarily supportive with aggressive fluid "
            "therapy. Oral: Encourage ORS, water, coconut water — target 5ml/kg/hr. "
            "Monitor: Platelet count and hematocrit DAILY (ideally every 12 hours "
            "during critical phase days 3-7). Track fluid intake and output. "
            "Check blood pressure and pulse every 2-4 hours. The critical phase "
            "occurs during defervescence — this is when plasma leakage is highest "
            "and the patient is at greatest risk of shock (DSS). Rising hematocrit "
            "(>20% increase) with dropping platelets is a danger sign requiring "
            "immediate IV fluid resuscitation."
        ),
    },
    {
        "disease": "Dengue",
        "section": "Warning Signs and Referral",
        "content": (
            "WHO dengue warning signs requiring IMMEDIATE hospital referral: "
            "Severe abdominal pain (continuous), persistent vomiting (≥3 episodes "
            "in 24 hours), clinical fluid accumulation (ascites, pleural effusion), "
            "mucosal bleeding (gums, nose, hematemesis, melena), lethargy or "
            "restlessness, liver enlargement >2 cm, laboratory: platelet count "
            "<100,000/mm³ or rapidly decreasing, rising hematocrit concurrent "
            "with rapid platelet decrease. Dengue hemorrhagic fever (DHF) and "
            "dengue shock syndrome (DSS) are life-threatening — mortality without "
            "treatment is 20-50%, but with proper fluid management drops to <1%."
        ),
    },
    {
        "disease": "Dengue",
        "section": "Epidemiology Bangladesh",
        "content": (
            "Bangladesh context: Dengue is hyperendemic in Dhaka and surrounding "
            "urban areas. 2023 saw a record 321,000+ reported cases and 1,700+ "
            "deaths — the worst outbreak in Bangladesh's history. Peak transmission "
            "occurs during monsoon season (June-October) when Aedes aegypti "
            "breeding sites proliferate. Rural areas are increasingly affected as "
            "urbanization expands mosquito habitats. Community health workers should "
            "use mosquito nets around patient beds even during illness (to prevent "
            "mosquitoes from biting the viremic patient and spreading to others). "
            "The vector-control strategy includes eliminating standing water sources."
        ),
    },
]


# ══════════════════════════════════════════════════════════════════
# SEED FUNCTION
# ══════════════════════════════════════════════════════════════════

async def seed() -> None:
    """Chunk, embed, and insert all WHO guideline chunks."""
    print(f"[Seeder] Starting - {len(WHO_CHUNKS)} chunks to process...")

    success = 0
    failed = 0

    for i, chunk in enumerate(WHO_CHUNKS, 1):
        disease = chunk["disease"]
        section = chunk["section"]
        content = chunk["content"]

        print(f"[{i}/{len(WHO_CHUNKS)}] Embedding: {disease} / {section}...")

        # Generate embedding
        embedding = await generate_embedding(content)
        if not embedding:
            print(f"  [WARN] Embedding failed for chunk {i}. Skipping.")
            failed += 1
            continue

        print(f"  [OK] Embedding: {len(embedding)} dimensions")

        # Insert into pgvector
        try:
            await insert_who_guideline(
                disease=disease,
                section=section,
                content=content,
                embedding=embedding,
                metadata={"source": "WHO", "chunk_index": i},
            )
            print(f"  [OK] Inserted into Supabase.")
            success += 1
        except Exception as exc:
            print(f"  [FAIL] Insert failed: {exc}")
            failed += 1

    print(f"\n[Seeder] Done. Success: {success}, Failed: {failed}")


# ══════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    asyncio.run(seed())

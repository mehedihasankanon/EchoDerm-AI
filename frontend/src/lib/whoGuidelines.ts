/**
 * whoGuidelines.ts — Deterministic WHO clinical guideline mapping.
 *
 * Owner: Tamim (UI Architect)
 *
 * This maps the AI's diagnosis to the correct WHO clinical guidelines.
 * This is NOT AI — it is hardcoded medical advice from WHO protocols.
 * The AI picks the diagnosis; this file picks the matching advice.
 */

export interface WHOGuideline {
  disease: string;
  alertLevel: "critical" | "warning" | "info";
  alertColor: string;
  medications: string[];
  dangerSigns: string[];
  immediateActions: string[];
  strictlyAvoid: string[];
  referralCriteria: string;
  isolationRequired: boolean;
  isolationDuration: string;
}

/**
 * Given a diagnosis string ("Measles" or "Dengue"),
 * return the full WHO guideline object.
 */
export function getWHOGuideline(diagnosis: string): WHOGuideline {

  // ── MEASLES — WHO Guidelines ──────────────────────────────
  if (diagnosis === "Measles") {
    return {
      disease: "Measles",
      alertLevel: "critical",
      alertColor: "bg-red-600",

      medications: [
        "Vitamin A — 200,000 IU orally, immediately (for children over 12 months)",
        "Vitamin A — 100,000 IU for children 6-11 months",
        "Second dose of Vitamin A the next day",
        "Paracetamol for fever (10-15 mg/kg every 4-6 hours as needed)",
        "ORS (Oral Rehydration Salts) if diarrhea is present",
      ],

      dangerSigns: [
        "Inability to drink or breastfeed",
        "Vomiting everything",
        "Convulsions (seizures)",
        "Lethargy or unconsciousness",
        "Mouth ulcers that prevent eating",
        "Clouding of the cornea (eye involvement)",
        "Deep or fast breathing (pneumonia sign)",
      ],

      immediateActions: [
        "Administer Vitamin A immediately — this is the #1 priority",
        "Isolate the patient from other children (measles is airborne)",
        "Monitor temperature every 4 hours",
        "Ensure adequate fluid intake",
        "Check for ear discharge (otitis media complication)",
        "Check eyes daily for corneal clouding",
        "Notify the local health authority (measles is a notifiable disease)",
      ],

      strictlyAvoid: [
        "DO NOT give Aspirin to children (risk of Reye's syndrome)",
        "DO NOT delay Vitamin A — every hour matters",
        "DO NOT send the child to a crowded waiting room (spread risk)",
      ],

      referralCriteria:
        "Refer URGENTLY to hospital if any danger sign is present, " +
        "if the child is severely malnourished, or if pneumonia is suspected.",

      isolationRequired: true,
      isolationDuration: "4 days after rash onset (minimum)",
    };
  }

  // ── DENGUE — WHO Guidelines ───────────────────────────────
  if (diagnosis === "Dengue") {
    return {
      disease: "Dengue",
      alertLevel: "warning",
      alertColor: "bg-orange-500",

      medications: [
        "Paracetamol ONLY for fever (10-15 mg/kg every 4-6 hours)",
        "ORS or IV fluids if signs of dehydration",
        "NO specific antiviral — treatment is supportive only",
      ],

      dangerSigns: [
        "Severe abdominal pain (continuous)",
        "Persistent vomiting (3 or more times in 24 hours)",
        "Fluid accumulation (ascites, pleural effusion)",
        "Mucosal bleeding (gums, nose, vomiting blood)",
        "Lethargy or restlessness",
        "Liver enlargement > 2 cm",
        "Rapid decrease in platelet count",
        "Rising hematocrit with rapid decrease in platelet count",
      ],

      immediateActions: [
        "Start oral rehydration immediately",
        "Monitor platelet count and hematocrit daily",
        "Record fluid intake and output",
        "Check blood pressure and pulse every 2-4 hours",
        "Watch for warning signs during the critical phase (days 3-7 of illness)",
        "Ensure the patient stays hydrated — encourage drinking water, juice, ORS",
        "Use mosquito nets around the patient's bed (prevent further transmission)",
      ],

      strictlyAvoid: [
        "⚠️ STRICTLY AVOID Ibuprofen (increases bleeding risk)",
        "⚠️ STRICTLY AVOID Aspirin (increases bleeding risk)",
        "⚠️ STRICTLY AVOID NSAIDs of any kind",
        "DO NOT give intramuscular injections (bleeding risk)",
        "DO NOT use dark-colored fluids (makes it hard to detect vomiting blood)",
      ],

      referralCriteria:
        "Refer IMMEDIATELY to hospital if any warning sign is present, " +
        "if platelet count drops below 100,000, or if there is any bleeding.",

      isolationRequired: false,
      isolationDuration: "Not required (Dengue is mosquito-borne, not person-to-person)",
    };
  }

  // ── FALLBACK — should never happen ────────────────────────
  return {
    disease: "Unknown",
    alertLevel: "info",
    alertColor: "bg-gray-500",
    medications: ["Consult a physician"],
    dangerSigns: ["Any sign of clinical deterioration"],
    immediateActions: ["Refer to the nearest health facility"],
    strictlyAvoid: [],
    referralCriteria: "Refer immediately for proper assessment.",
    isolationRequired: false,
    isolationDuration: "N/A",
  };
}

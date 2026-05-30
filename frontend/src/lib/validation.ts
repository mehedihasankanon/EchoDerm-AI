/**
 * validation.ts — Zod schemas mirroring the backend Pydantic models.
 *
 * If the backend returns an unexpected key, wrong type, or malformed
 * structure, Zod catches it and triggers a safe UI fallback instead
 * of crashing the React app.
 *
 * These schemas are the frontend counterpart of backend/schemas.py.
 * Keep them in sync.
 */

import { z } from "zod";

// ══════════════════════════════════════════════════════════════════
// CORE DIAGNOSIS
// ══════════════════════════════════════════════════════════════════

export const ConfidenceBreakdownSchema = z.object({
  visual_confidence: z.number().min(0).max(1),
  acoustic_confidence: z.number().min(0).max(1),
  cross_modal_agreement: z.enum(["concordant", "discordant"]),
});

export const DiagnosisResultSchema = z.object({
  primary_diagnosis: z.string(),
  confidence_score: z.number().min(0).max(1),
  confidence_breakdown: ConfidenceBreakdownSchema.optional(),
  visual_findings: z.string(),
  acoustic_findings: z.string(),
  differential_notes: z.string(),
  recommended_next_steps: z.array(z.string()),
});

// ══════════════════════════════════════════════════════════════════
// MCP TOOL RESPONSES
// ══════════════════════════════════════════════════════════════════

export const WHOProtocolSchema = z.object({
  disease: z.string(),
  alert_level: z.enum(["critical", "warning", "info"]),
  medications: z.array(z.string()),
  danger_signs: z.array(z.string()),
  immediate_actions: z.array(z.string()),
  strictly_avoid: z.array(z.string()),
  referral_criteria: z.string(),
  isolation_required: z.boolean(),
  isolation_duration: z.string(),
});

export const MedicationSafetySchema = z.object({
  diagnosis: z.string(),
  proposed_medications: z.array(z.string()),
  safe: z.array(z.string()).default([]),
  contraindicated: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const OutbreakClusterSchema = z.object({
  zip_code: z.string(),
  disease: z.string(),
  case_count: z.number(),
  latest_case: z.string(),
  earliest_case: z.string(),
});

export const RegionalOutbreakSchema = z.object({
  zip_code: z.string(),
  active_clusters: z.array(OutbreakClusterSchema).default([]),
  alert_triggered: z.boolean().default(false),
  alert_message: z.string().default(""),
});

// ══════════════════════════════════════════════════════════════════
// METADATA
// ══════════════════════════════════════════════════════════════════

export const InferenceMetadataSchema = z.object({
  model: z.string().default("gemini-3.1-flash-lite"),
  system_instruction_version: z.string().default("v3.0"),
  inference_time_ms: z.number().default(0),
  route_taken: z.enum(["cloud", "edge"]).default("cloud"),
  rag_chunks_used: z.number().default(0),
  mcp_tools_invoked: z.array(z.string()).default([]),
  timestamp: z.string().default(""),
});

export const EthicalMetadataSchema = z.object({
  disclaimer: z.string(),
  known_limitations: z.array(z.string()).default([]),
  bias_mitigations: z.array(z.string()).default([]),
  data_handling: z.string().default(""),
});

// ══════════════════════════════════════════════════════════════════
// FULL API RESPONSE
// ══════════════════════════════════════════════════════════════════

export const AnalyzeResponseSchema = z.object({
  patient_id: z.string(),
  diagnosis: DiagnosisResultSchema,
  who_protocol: WHOProtocolSchema.nullable().optional(),
  medication_safety: MedicationSafetySchema.nullable().optional(),
  outbreak_data: RegionalOutbreakSchema.nullable().optional(),
  rag_context_summary: z.string().default(""),
  metadata: InferenceMetadataSchema.optional(),
  ethical_metadata: EthicalMetadataSchema.optional(),
  errors: z.array(z.string()).default([]),
});

// ══════════════════════════════════════════════════════════════════
// INFERRED TYPES (use these in React components)
// ══════════════════════════════════════════════════════════════════

export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;
export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;
export type WHOProtocol = z.infer<typeof WHOProtocolSchema>;
export type MedicationSafety = z.infer<typeof MedicationSafetySchema>;
export type OutbreakCluster = z.infer<typeof OutbreakClusterSchema>;
export type RegionalOutbreak = z.infer<typeof RegionalOutbreakSchema>;
export type InferenceMetadata = z.infer<typeof InferenceMetadataSchema>;
export type EthicalMetadata = z.infer<typeof EthicalMetadataSchema>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ══════════════════════════════════════════════════════════════════
// SAFE PARSE HELPER
// ══════════════════════════════════════════════════════════════════

/**
 * Parse and validate the /analyze API response using Zod.
 *
 * If the response doesn't match the schema, returns a safe fallback
 * instead of crashing the React app.
 *
 * @param data — Raw JSON from the backend
 * @returns Validated AnalyzeResponse or null (with error logged)
 */
export function parseAnalyzeResponse(
  data: unknown
): AnalyzeResponse | null {
  const result = AnalyzeResponseSchema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  console.error(
    "[Zod Validation Failed] Backend response did not match schema:",
    result.error.format()
  );

  return null;
}

/**
 * Generate a safe fallback response when Zod validation fails.
 * This ensures the UI always has something to display.
 */
export function getFallbackResponse(patientId: string): AnalyzeResponse {
  return {
    patient_id: patientId,
    diagnosis: {
      primary_diagnosis: "Validation Error",
      confidence_score: 0,
      visual_findings: "The AI response could not be validated.",
      acoustic_findings: "The AI response could not be validated.",
      differential_notes:
        "The backend returned a response that did not match the expected format. " +
        "This is a safety measure — we refuse to display unverified AI output.",
      recommended_next_steps: [
        "Please try again",
        "If the issue persists, consult a health professional directly",
      ],
    },
    rag_context_summary: "",
    errors: ["Zod frontend validation failed — AI output rejected for safety"],
  };
}

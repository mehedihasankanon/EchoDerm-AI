/**
 * llamaEngine.ts — On-device Llama offline triage engine.
 *
 * Owner: Rayyan (Edge Architect)
 *
 * When the device has NO internet, this module runs Llama 3.2 1B
 * directly in the browser via WebGPU (using WebLLM) to provide
 * immediate text-based symptom triage.
 *
 * This does NOT replace Gemini — it's a fallback for emergency
 * preliminary guidance. Image/audio still queue for Gemini.
 *
 * Dependencies: npm install @mlc-ai/web-llm
 * NOTE: This is an OPTIONAL dependency. The app works without it.
 * If WebLLM is not installed, all functions gracefully no-op.
 */

// ═══════════════════════════════════════════════════════════════
// DYNAMIC IMPORT (avoids build errors if @mlc-ai/web-llm isn't installed)
// ═══════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null;
let isLoadingFlag = false;

const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const MEDICAL_SYSTEM_PROMPT = `You are EchoDerm AI (Offline Mode). You are a preliminary triage assistant for rural health workers in Bangladesh.

You are running locally on the device with NO internet connection. You can only process TEXT descriptions of symptoms — you CANNOT see images or hear audio.

Based on the symptom description, provide:
1. Whether symptoms suggest Measles or Dengue (or uncertain)
2. Immediate actions the health worker should take
3. Danger signs to watch for
4. A clear disclaimer that this is PRELIMINARY and a full AI analysis will run when internet returns

Keep your response short (under 200 words), simple, and actionable. Use simple English suitable for community health workers.

IMPORTANT: Always end with "⚠️ This is a preliminary offline assessment. Full AI analysis with rash photo and cough audio will run automatically when internet is restored."`;

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export async function initLlama(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (engine || isLoadingFlag) return;

  isLoadingFlag = true;
  console.log("[LlamaEngine] Initializing Llama 3.2 1B...");

  try {
    // Dynamic import — won't crash if package isn't installed
    // Using a variable to prevent TS from resolving the module at compile time
    const webllmModule = "@mlc-ai/web-llm";
    const webllm = await import(/* @vite-ignore */ webllmModule);
    engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report: { progress: number }) => {
        const pct = Math.round(report.progress * 100);
        console.log(`[LlamaEngine] Loading: ${pct}%`);
        onProgress?.(report.progress);
      },
    });
    console.log("[LlamaEngine] Ready.");
  } catch (error) {
    console.warn("[LlamaEngine] WebLLM not available. Offline triage disabled.", error);
    engine = null;
  } finally {
    isLoadingFlag = false;
  }
}

export async function offlineTriage(symptoms: string): Promise<string> {
  if (!engine) {
    return "Offline AI engine is not available. Your data has been saved and will be analyzed when internet is restored.";
  }

  console.log("[LlamaEngine] Running offline triage...");

  const response = await engine.chat.completions.create({
    messages: [
      { role: "system", content: MEDICAL_SYSTEM_PROMPT },
      { role: "user", content: `Patient symptoms: ${symptoms}` },
    ],
    temperature: 0.3,
    max_tokens: 512,
  });

  const advice =
    response.choices[0]?.message?.content ||
    "Unable to generate triage advice. Please wait for internet connectivity for full analysis.";

  console.log("[LlamaEngine] Triage complete.");
  return advice;
}

export function isLlamaReady(): boolean {
  return engine !== null;
}

export function isLlamaLoading(): boolean {
  return isLoadingFlag;
}

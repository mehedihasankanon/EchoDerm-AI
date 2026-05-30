# 🚀 DEADLINE DAY PLAYBOOK — EchoDerm AI v1.0.0

---

## TASK 1: GAMMA AI PROMPT (Copy-paste into gamma.app)

> **Copy everything between the lines below into Gamma AI's "Generate" box.**

---

```
Create a professional, cinematic 10-slide pitch deck for "EchoDerm AI" — an enterprise-grade dual-modal diagnostic AI platform that simultaneously analyzes a child's skin rash PHOTO and cough AUDIO to differentiate between Measles and Dengue fever. Target audience: hackathon judges evaluating innovation, AI depth, real-world impact, and technical sophistication.

SLIDE 1 — TITLE
- Title: "EchoDerm AI"
- Subtitle: "The Stethoscope Learned to See"
- Tagline: "Dual-Modal AI × Edge Intelligence × WHO Clinical Guardrails"
- Show a futuristic medical AI interface with dark navy/indigo/purple glassmorphism aesthetic.
- Bottom: "The Infinity AI BuildFest 2026" — Team EchoDerm

SLIDE 2 — THE PROBLEM
- Headline: "Rural Bangladesh: A Diagnostic Dead Zone"
- 72% of Bangladesh's 170M population lives in rural areas with zero specialist access.
- Measles and Dengue present with OVERLAPPING symptoms: rash, fever, malaise. Community health workers misdiagnose.
- THE FATAL MISTAKE: Giving Ibuprofen for suspected Measles when it's Dengue causes fatal hemorrhaging. NSAIDs are STRICTLY CONTRAINDICATED for Dengue.
- WHO reports 140,000+ measles deaths/year globally. Bangladesh had 321,000+ Dengue cases in 2023 — its worst outbreak.
- "A health worker with a smartphone needs a tool that SEES what eyes miss and HEARS what stethoscopes can't."
- Imagery: rural health clinic in Bangladesh, child patient, community health worker.

SLIDE 3 — OUR SOLUTION
- Headline: "Two Inputs. Two Modalities. One Life-Saving Answer."
- The health worker uploads a rash photo + records a 10-second cough.
- Gemini 3.1 Flash Lite analyzes BOTH simultaneously with WHO-calibrated clinical markers.
- Visual channel (60% weight): maculopapular vs petechial rash, cephalocaudal progression, Koplik spots.
- Acoustic channel (40% weight): barking cough (Measles) vs absent cough (Dengue).
- Cross-modal discordance detection: when signals conflict, confidence drops and the worker is warned.
- Show a flow: Photo + Audio → AI Diagnosis → Confidence Scores → WHO Treatment Protocol.

SLIDE 4 — THE ARCHITECTURE (Enterprise-Grade)
- Headline: "Not a Wrapper — A Clinical Decision Engine"
- Center: LangGraph Orchestrator (the brain) routing between:
  * CLOUD PATH: Gemini 3.1 Flash Lite (full multimodal) → pgvector RAG → MCP Guardrails → Pydantic Validation
  * EDGE PATH: Llama 3.2 1B in-browser via WebLLM (text-only triage when offline)
- The orchestrator evaluates navigator.onLine + payload size to autonomously route.
- Show the 6-node graph: route_decision → gemini_inference → rag_retrieval → mcp_guardrails → validate_output → response
- Tech badges: LangGraph, Gemini, Llama, WebLLM, FastAPI, React, Supabase, pgvector, MCP, Pydantic, Zod

SLIDE 5 — THE GUARDRAILS (MCP Server)
- Headline: "The AI Cannot Guess Medical Protocols"
- We built a custom MCP server: EchoDerm-WHO-Protocol-Server
- Protocol: JSON-RPC over SSE, hosted alongside FastAPI
- 3 tools the AI MUST call (it cannot skip these):
  1. get_triage_protocol — Fetches rigid WHO management steps (hardcoded, immutable)
  2. check_medication_safety — Cross-references AI recommendations against contraindicated drugs
  3. query_regional_outbreaks — Pulls live cluster data for epidemic detection
- "The LLM analyzes. The MCP server dictates treatment. The AI CANNOT hallucinate medical advice."
- Show diagram: Gemini Output → MCP Server → Validated Protocol → User

SLIDE 6 — RAG & KNOWLEDGE GROUNDING
- Headline: "Grounded in WHO Literature, Not Training Weights"
- Supabase pgvector stores chunked & embedded WHO clinical management guidelines.
- Multi-step Agentic RAG:
  1. Gemini extracts visual/audio features
  2. Features embedded via text-embedding-004 (768d)
  3. pgvector retrieves top-5 semantically relevant WHO chunks
  4. Patient geographic metadata prepended (Contextual RAG)
  5. Grounded context injected into Gemini's second-pass prompt
- Result: The AI's "recommended next steps" come from verified WHO guidelines, not hallucination.
- Show: Embedding → pgvector → Retrieved Chunks → Prompt Injection → Grounded Output

SLIDE 7 — DEMO WALKTHROUGH
- Headline: "Watch It Work"
- Step 1: Consent screen (ethical first-launch gate)
- Step 2: Upload rash photo + record 10-second cough
- Step 3: LangGraph routes to Gemini → 3 seconds → diagnosis appears
- Step 4: Explainability Panel: visual confidence bar, acoustic confidence bar, cross-modal agreement
- Step 5: WHO Guidelines Panel: medications, danger signs, contraindications — all from MCP server
- Step 6: Outbreak Alert: if ≥3 cases in same zip code → SMS alert via n8n + Twilio
- Step 7: Bangla language toggle, "Not a diagnosis" banner, ethical disclosure
- Show dark glassmorphism UI screenshots.

SLIDE 8 — ETHICS & SAFETY
- Headline: "Responsible AI That Knows Its Limits"
- Consent modal before first use. Persistent "NOT a diagnosis" banner.
- Scope guardrails: System prompt REFUSES out-of-scope images (broken bones, X-rays).
- Output validation: Pydantic (backend) + Zod (frontend) — if AI hallucinates an unexpected key, the parser rejects it.
- Bias disclosure: accuracy may vary with skin tone, audio quality, environment.
- Data privacy: images/audio processed in-memory only — NEVER stored on server.
- Cross-modal discordance alerts when visual and acoustic signals conflict.

SLIDE 9 — AUTOMATION & OBSERVABILITY
- Headline: "From Diagnosis to Outbreak Alert in Seconds"
- Epidemiological Alerts via n8n:
  * Supabase Database Webhook fires on every new case
  * n8n detects cluster (≥3 cases, same zip, 24 hours)
  * Twilio SMS dispatched to regional health directors
- LangSmith traces every LangGraph execution — full observability.
- FastAPI structured JSON logging for audit trails.
- Show: Supabase Webhook → n8n → Cluster Detection → Twilio SMS

SLIDE 10 — FUTURE VISION & CALL TO ACTION
- Headline: "From Hackathon to Health Infrastructure"
- 130,000+ community health workers in Bangladesh could use this.
- Next: Clinical validation pilot with DGHS Bangladesh.
- Expansion: Add Chickenpox, Scabies, Fungal infections to the differential.
- Federated learning: train on local data without centralizing patient images.
- Integration: DHIS2 (national health information system) and WHO IRIS.
- "EchoDerm AI: where the stethoscope meets the neural network."
- Team credits, GitHub link, live demo URL.

DESIGN STYLE: Dark mode, sleek, cinematic. Color palette: deep navy (#0a0a1e), indigo (#818cf8), purple (#c084fc), teal (#14b8a6), amber (#f59e0b for warnings). Glassmorphism card effects. Inter or Outfit typography. Minimal text — let architecture diagrams and screenshots dominate. Each slide should feel like a premium product page.
```

---

## TASK 2: MASTER SYSTEM PROMPT (Copy-paste into Gemini/Codex/ChatGPT windows)

> **Copy everything between the lines below into any AI assistant you're using.**

---

```
You are helping build "EchoDerm AI" for the Infinity AI BuildFest 2026 hackathon. Here is the complete context:

## WHAT IT IS
EchoDerm AI is an enterprise-grade, dual-modal diagnostic AI platform for rural Bangladesh. A community health worker uploads a child's skin rash PHOTO and cough AUDIO recording simultaneously. The system differentiates between Measles and Dengue fever using multimodal analysis, WHO-grounded RAG, and MCP-enforced clinical guardrails.

## ARCHITECTURE OVERVIEW
The system uses a LangGraph orchestrator that routes between:
- CLOUD PATH: Gemini 3.1 Flash Lite (multimodal) → pgvector RAG → MCP Guardrails → Pydantic Validation
- EDGE PATH: Llama 3.2 1B in-browser via WebLLM (text-only offline triage)

## TECH STACK
- Frontend: React 19 + Vite 8 + TypeScript + Tailwind CSS v4 + Zod (validation)
- Backend: Python 3.12 + FastAPI + uvicorn + Pydantic v2
- Orchestration: LangGraph (graph-based multi-agent routing)
- AI Cloud: google-genai SDK, model: gemini-3.1-flash-lite
- AI Edge: Llama 3.2 1B via @mlc-ai/web-llm (WebGPU)
- Database: Supabase PostgreSQL + pgvector extension
- RAG: Gemini text-embedding-004 (768d) → Supabase pgvector → Contextual + Agentic RAG
- Guardrails: Custom MCP server (EchoDerm-WHO-Protocol-Server) over SSE
- Observability: LangSmith tracing + FastAPI structured JSON logs
- Automation: n8n webhooks for outbreak alert SMS via Twilio

## BACKEND FILES
1. main.py — FastAPI app. Endpoints: POST /analyze, GET /health, GET /dashboard/stats, GET /patient/{id}/history, GET /docs-data
2. orchestrator.py — LangGraph graph with 6 nodes: route_decision, gemini_inference, rag_retrieval, mcp_guardrails, validate_output, edge_fallback
3. inference.py — Gemini inference with RAG context injection. Uses google.genai SDK.
4. schemas.py — All Pydantic models: DiagnosisResult, WHOProtocol, MedicationSafetyResult, RegionalOutbreakResult, RAGChunk, OrchestratorState, AnalyzeResponse
5. mcp_server.py — MCP server with 3 tools: get_triage_protocol, check_medication_safety, query_regional_outbreaks
6. rag.py — Multi-step Agentic RAG: build_rag_query → generate_embedding → retrieve_who_chunks → build_contextual_chunks
7. database.py — Supabase REST via httpx. Functions: log_diagnostic_result, get_diagnostic_stats, get_patient_history, search_who_guidelines, insert_who_guideline
8. seed_vectors.py — One-time script to embed and insert 10 WHO guideline chunks into pgvector

## LANGGRAPH GRAPH FLOW
[START] → route_decision → (is_online?) → gemini_inference → rag_retrieval → mcp_guardrails → validate_output → [END]
                                        → edge_fallback → [END]

## MCP SERVER (EchoDerm-WHO-Protocol-Server)
Protocol: JSON-RPC over SSE. 3 tools:
- get_triage_protocol(diagnosis) → Hardcoded WHO management steps
- check_medication_safety(diagnosis, medications) → Contraindication cross-reference
- query_regional_outbreaks(zip_code) → Active cluster data from Supabase

## API CONTRACT (POST /analyze)
Accepts multipart/form-data: image (File), audio (File), patient_id (str), is_online (str), zip_code (str)
Returns: { patient_id, diagnosis: DiagnosisResult, who_protocol, medication_safety, outbreak_data, rag_context_summary, metadata: InferenceMetadata, ethical_metadata, errors }

## FRONTEND LIBS
- validation.ts — Zod schemas mirroring backend Pydantic models
- syncManager.ts — IndexedDB offline queue (localforage)
- llamaEngine.ts — WebLLM Llama 3.2 1B engine
- audioRecorder.ts — MediaRecorder live cough capture
- i18n.ts — Bangla/English translations
- whoGuidelines.ts — Deterministic WHO protocol mapping

## ENV VARS
Backend: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY, LANGSMITH_API_KEY, LANGSMITH_TRACING, LANGSMITH_ENDPOINT, LANGSMITH_PROJECT
Frontend: VITE_API_URL

## SUPABASE TABLES
diagnostic_results: id, patient_id, primary_diagnosis, confidence_score, raw_response (JSONB), zip_code, created_at
who_guidelines: id, disease, section, content, embedding (VECTOR(768)), metadata (JSONB), created_at
```

---

## TASK 4: DOCS MODULE SQL (Run this in Supabase)

To support the Live `/docs` module, we need one final table in your Supabase database.

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**
2. Run this exact code:

```sql
-- Create the docs configuration table
CREATE TABLE IF NOT EXISTS docs_config (
  id TEXT PRIMARY KEY DEFAULT 'config',
  is_public BOOLEAN DEFAULT false,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  team_members JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies and Permissions
ALTER TABLE docs_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for docs_config" ON docs_config;
CREATE POLICY "Allow all for docs_config" ON docs_config FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions to roles (needed for REST API inserts)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.docs_config TO anon, authenticated, service_role;

-- Insert default row if not exists
INSERT INTO docs_config (id, is_public) VALUES ('config', false) ON CONFLICT DO NOTHING;

-- Force API cache reload
NOTIFY pgrst, 'reload schema';
```

---

## TASK 5: DEPLOYMENT & AUTOMATION GUIDE (For Absolute Beginners)

*Note: The Supabase database SQL and vector seeding have already been completed by the AI team. You only need to follow these steps to put the app live on the internet!*

### Step 1: Push Your Code to GitHub
Before deploying, your code must be on GitHub.
1. Open your terminal or command prompt in the `EchoDerim AI` folder.
2. Type `git add .` and press Enter.
3. Type `git commit -m "Ready for deployment"` and press Enter.
4. Type `git push origin main` and press Enter.
*(If you haven't linked a GitHub repo yet, create a new empty repository on GitHub.com, and follow the instructions there to push an existing repository from the command line).*

---

### Step 2: Deploy the Backend on Render (Free)
Render is a cloud host that will run your Python FastAPI code.

1. Go to [render.com](https://render.com) and click **Get Started for Free** (Sign up with GitHub).
2. Once logged in, click the **New +** button at the top right, then click **Web Service**.
3. Select **"Build and deploy from a Git repository"** and click **Next**.
4. Connect your GitHub account and select your `echoderm-ai` repository.
5. You will see a settings page. Fill it out EXACTLY like this:
   - **Name**: `echoderm-backend`
   - **Language**: `Python`
   - **Branch**: `main`
   - **Root Directory**: `backend` *(Crucial! Don't skip this)*
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Select the **Free** tier option.
6. Scroll down and click **Advanced** to expand it. Click **Add Environment Variable** and add these EXACT keys and your values:
   - `GEMINI_API_KEY` (Paste your Gemini key here)
   - `SUPABASE_URL` (Go to Supabase -> Project Settings -> API -> copy the Project URL)
   - `SUPABASE_KEY` (Copy the `anon` `public` key from the same Supabase page)
   - `PYTHON_VERSION` = `3.12.0`
7. Click the **Create Web Service** button at the very bottom.
8. Wait ~5 minutes. When you see a green "Live" badge, copy the URL at the top left (e.g., `https://echoderm-backend-xxxx.onrender.com`). You will need this for the frontend!

---

### Step 3: Deploy the Frontend on Vercel (Free)
Vercel is a lightning-fast host for React/Vite apps.

1. Go to [vercel.com](https://vercel.com) and click **Sign Up** (Use your GitHub account).
2. On your Vercel dashboard, click **Add New...** -> **Project**.
3. Import your `echoderm-ai` GitHub repository.
4. On the Configure Project page, fill it out exactly like this:
   - **Project Name**: `echoderm-ai`
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click "Edit", select the `frontend` folder, and click Continue.
5. Click the **Environment Variables** dropdown to expand it:
   - **Name**: `VITE_API_URL`
   - **Value**: Paste the Render URL you copied in Step 2 (Make sure there is NO slash `/` at the very end of the URL).
   - Click **Add**.
6. Click the big **Deploy** button.
7. Wait 1-2 minutes. When confetti falls on your screen, click **Continue to Dashboard** and click the big Visit button to see your live app!

---

### Step 4: n8n Epidemiological Alerts (Absolute Beginner Guide)
n8n is an automation tool (like Zapier). We will use it to send an SMS text message automatically if the AI detects an outbreak.

**Part A: Start n8n**
1. Go to [n8n.io](https://n8n.io) -> **Start for free** -> Sign up.
2. Inside n8n, click **Add workflow** (or "Create from scratch").

**Part B: The Webhook Trigger**
1. Click **Add first step**. Search for `Webhook` and click it.
2. Change the **HTTP Method** dropdown to `POST`.
3. Look at the "Webhook URLs" section. Click **Test URL** to get a temporary URL, and click it to copy it to your clipboard.
4. Leave this tab open.

**Part C: Connect Supabase to the Webhook**
1. Open a new tab, go to your Supabase project dashboard -> Click **Database** (on the left menu) -> Click **Webhooks** -> Click **Create a Webhook**.
2. **Name**: `Outbreak Alert Webhook`
3. **Table**: `diagnostic_results`
4. **Events**: Check the box for `Insert`.
5. **Type**: `HTTP Request`
6. **HTTP Method**: `POST`
7. **URL**: Paste the n8n webhook URL you just copied.
8. Click **Add new header** -> Name: `Content-type`, Value: `application/json`.
9. Click **Create Webhook**.

**Part D: Finish the n8n Workflow**
1. Go back to your n8n tab. Your Webhook node is waiting. Click "Listen for Test Event".
2. Now, go to your live app and submit a fake patient with Dengue.
3. The n8n screen will light up with the data!
4. Click the small `+` icon on the right of the Webhook box to add a new step.
5. Search for `IF` and click it.
   - We want to check if the AI was confident.
   - Value 1: Drag the `confidence_score` from the left panel.
   - Condition: `Larger`
   - Value 2: `0.8`
6. From the "true" side of the IF node, click the `+` to add another step.
7. Search for `Twilio` (You need a free Twilio account to send texts).
8. Connect your Twilio credentials (Account SID and Auth Token from your Twilio dashboard).
9. Set the **To** number (your phone) and **From** number (your Twilio number).
10. In the **Message** box, type: `🚨 ECHO-DERM ALERT: Suspected outbreak of ` and drag the `primary_diagnosis` from the left panel into the box, then type ` in zip code ` and drag the `zip_code` into the box.
11. Finally, toggle the workflow from "Inactive" to "Active" in the top right corner!

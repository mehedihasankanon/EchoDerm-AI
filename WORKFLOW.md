# EchoDerm AI — Build Order & Dependency Workflow

> Who builds what, in what order, what blocks whom, and what can run in parallel.

---

## The Dependency Graph (Big Picture)

```
TIME ──────────────────────────────────────────────────────────────►

PHASE 1: FOUNDATIONS              PHASE 2: WIRING           PHASE 3: INTEGRATION    PHASE 4: POLISH
(all 3 work independently)       (handoffs happen)          (everything connects)   (test together)
                                        │                          │
KANON ─────────────────────────────────────────────────────────────────────────────────────────────
│                                       │                          │
│ [K1] Create Supabase project    [K4] Test /analyze with    [K6] Debug live         [K8] Deploy
│      + table                         Postman/curl               requests from        backend to
│                                       │                          Tamim's UI           Render/Railway
│ [K2] Fill in .env keys          [K5] Give Tamim the        │                        │
│      (Supabase + Gemini)             API URL                │                        │
│                                       │                     │                        │
│ [K3] Get backend running             ─┼──── HANDOFF ────────┤                        │
│      (uvicorn --reload)               │     to Tamim        │                        │
│         │                             │                     │                        │
│         ▼                             │                     │                        │
│    Backend is LIVE on                 │                     │                        │
│    localhost:8000                      │                     │                        │
─────────────────────────────────────────────────────────────────────────────────────────────────────

TAMIM ─────────────────────────────────────────────────────────────────────────────────────────────
│                                       │                          │
│ [T1] Build the static UI        [T4] Wire "Analyze" btn    [T6] Display real       [T8] Final UI
│      (no backend needed)             to Rayyan's                 Gemini results       polish, animations
│      - Patient ID input              submitDiagnostic()          using DiagnosisResult
│      - Image upload card              │                          component             │
│      - Audio upload card        [T5] Wire WHO guidelines         │                    │
│      - Analyze button                 display                    │                    │
│      - Result skeleton                │                          │                    │
│                                       │                          │                    │
│ [T2] Write whoGuidelines.ts           │                          │                    │
│      (pure logic, no deps)            │                          │                    │
│                                       │                          │                    │
│ [T3] Write DiagnosisResult.tsx        │                          │                    │
│      (static component, mock data)    │                          │                    │
─────────────────────────────────────────────────────────────────────────────────────────────────────

RAYYAN ────────────────────────────────────────────────────────────────────────────────────────────
│                                       │                          │
│ [R1] npm install localforage    [R4] Give Tamim the        [R6] Test offline→       [R8] Test on
│                                      import instructions        online flow with      real phone
│ [R2] Write syncManager.ts            for submitDiagnostic()     real backend          (Airplane Mode)
│      (can test with mock             + initSync()                │                    │
│       server or no server)            │                          │                    │
│                                  ─────┼──── HANDOFF ────────┤                        │
│ [R3] Write unit tests /              │     to Tamim        │                        │
│      manual console tests             │                     │                        │
─────────────────────────────────────────────────────────────────────────────────────────────────────
```

---

## Phase-by-Phase Breakdown

### PHASE 1: FOUNDATIONS (Everyone works alone — zero dependencies)

> **Goal:** Each person builds their piece in isolation. No one waits for anyone.

| Task ID | Owner | Task | Depends On | Time Est. |
|---------|-------|------|------------|-----------|
| **K1** | Kanon | Create Supabase project, find API keys, run the SQL to create `diagnostic_results` table | Nothing | 15 min |
| **K2** | Kanon | Fill in `backend/.env` with real Supabase URL, Supabase Key, and Gemini API Key | K1 | 5 min |
| **K3** | Kanon | `pip install -r requirements.txt` then `uvicorn main:app --reload --port 8000` then verify `localhost:8000/health` returns OK | K2 | 10 min |
| | | | | |
| **T1** | Tamim | Build the full static UI in React (all the visual layout — upload cards, buttons, result skeleton). Use hardcoded mock data for the results section. **No backend call needed.** | Nothing | 2-3 hrs |
| **T2** | Tamim | Write `whoGuidelines.ts` — pure TypeScript logic, no imports from anyone else's code | Nothing | 30 min |
| **T3** | Tamim | Write `DiagnosisResult.tsx` — render mock diagnosis data using the WHO guidelines component | T2 | 30 min |
| | | | | |
| **R1** | Rayyan | `cd frontend && npm install localforage` | Nothing | 1 min |
| **R2** | Rayyan | Write `syncManager.ts` — the complete offline queue + sync engine | R1 | 1-2 hrs |
| **R3** | Rayyan | Test `syncManager.ts` manually via browser console (enqueue fake items, check IndexedDB, call flushQueue) | R2 | 30 min |

```
PHASE 1 PARALLELISM:

    KANON: ████ K1 ██ K2 ███ K3 ████████████████░░░░░░░░░░░░░░░  (idle, helps others)
    TAMIM: ████████████████████████ T1 ████████ T2 ██████ T3 ████
   RAYYAN: █ R1 █████████████████ R2 ████████████ R3 ████████████

   ──────────────────────────────────────────────────────────────►
   0 min                                                    ~3 hrs

   ✅ ALL THREE CAN START SIMULTANEOUSLY. ZERO BLOCKING.
```

> [!TIP]
> **Kanon finishes Phase 1 fastest** (~30 min). While waiting for the others, he should:
> - Test the `/analyze` endpoint manually using the Swagger docs at `localhost:8000/docs`
> - Upload a test image + audio and verify Gemini returns valid JSON
> - Check that the result appears in the Supabase Table Editor

---

### PHASE 2: WIRING (Two handoffs happen here)

> **Goal:** Connect the pieces. This is where dependencies appear.

| Task ID | Owner | Task | Depends On | Time Est. |
|---------|-------|------|------------|-----------|
| **K4** | Kanon | Test `/analyze` with real files using Postman or the Swagger UI. Confirm Gemini returns valid JSON and the result appears in Supabase. | K3 | 20 min |
| **K5** | Kanon | **HANDOFF to Tamim:** Give Tamim the backend URL (e.g., `http://192.168.x.x:8000`). Tamim puts it in `frontend/.env` as `VITE_API_URL`. | K4 | 2 min |
| | | | | |
| **R4** | Rayyan | **HANDOFF to Tamim:** Tell Tamim exactly what to import and how to call it (the 4-line instructions). | R2 | 5 min |
| | | | | |
| **T4** | Tamim | Wire the "Analyze" button to `submitDiagnostic()` instead of a direct `fetch`. Add `initSync()` in the root `useEffect`. | **R4 + K5** | 30 min |
| **T5** | Tamim | Wire the WHO guidelines display — pass real `diagnosis.primary_diagnosis` into `getWHOGuideline()` and render the alert box | T3 + T4 | 20 min |

```
PHASE 2 DEPENDENCY CHAIN:

    KANON: ████ K4 ██ K5 ─────────── HANDOFF TO TAMIM ──────┐
                                                              │
   RAYYAN: █████ R4 ─────────────── HANDOFF TO TAMIM ──┐     │
                                                        │     │
    TAMIM: ░░░░░░░░░░░░ (waits for R4 + K5) ░░░░░░░░░  ▼     ▼
           ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ T4 ████████ T5 ██
```

> [!IMPORTANT]
> **This is the critical bottleneck.** Tamim is blocked until both Kanon's API URL and Rayyan's integration instructions are ready. Kanon and Rayyan should prioritize delivering K5 and R4 as fast as possible.

---

### PHASE 3: INTEGRATION (First end-to-end test)

> **Goal:** Everything talks to everything. First real diagnosis from phone to screen.

| Task ID | Owner | Task | Depends On | Time Est. |
|---------|-------|------|------------|-----------|
| **K6** | Kanon | Monitor the backend terminal. Watch for incoming requests from Tamim's UI. Debug any 400/422/502 errors. | K4 + T4 | 30 min |
| **T6** | Tamim | Replace mock data with real Gemini responses. Verify DiagnosisResult renders correctly with live data. | T4 + T5 | 30 min |
| **R6** | Rayyan | Test the full offline-to-online flow: Submit while offline, check IndexedDB, go online, watch auto-sync, verify result appears | R2 + K4 + T4 | 30 min |

```
PHASE 3: ALL THREE MUST BE PRESENT (or on a call)

    KANON: ████████ K6 (watching backend logs) ████████████████
    TAMIM: ████████ T6 (testing real results on screen) ████████
   RAYYAN: ████████ R6 (testing offline→online cycle) █████████

   This phase is collaborative. Everyone debugging together.
```

> [!TIP]
> **Run all three terminals side by side:**
> - Terminal 1: `cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000`
> - Terminal 2: `cd frontend && npm run dev -- --host`
> - Terminal 3: Browser DevTools Console tab (watching `[SyncManager]` logs)

---

### PHASE 4: POLISH & DEPLOY (Final stretch)

> **Goal:** Make it demo-ready. Deploy. Rehearse.

| Task ID | Owner | Task | Depends On | Time Est. |
|---------|-------|------|------------|-----------|
| **K8** | Kanon | Deploy backend to Render/Railway/Fly.io. Update `VITE_API_URL` to the production URL. | K6 passes | 1 hr |
| **T8** | Tamim | Final UI polish — animations, loading states, error messages, mobile responsiveness on a 360px screen | T6 passes | 1-2 hrs |
| **R8** | Rayyan | Full phone test — real device, Airplane Mode toggle, verify queue persistence across browser close/reopen | R6 passes | 30 min |
| **ALL** | Everyone | Demo rehearsal — run through the exact presentation flow 2-3 times | K8 + T8 + R8 | 30 min |

---

## The Two Critical Handoff Moments

These are the **only** two moments where one person's work blocks another:

### Handoff 1: Kanon → Tamim (the API URL)

```
KANON does:                          TAMIM receives:
─────────────────────────────────    ─────────────────────────────
1. Backend is running                "Here's the URL, put it in
2. /analyze works with test files     frontend/.env as VITE_API_URL"
3. Sends Tamim a message:
   "Backend is live at                Example:
    http://192.168.1.105:8000"        VITE_API_URL=http://192.168.1.105:8000
```

**When this must happen:** Before Tamim starts T4.
**How long it takes Kanon:** ~30 minutes from project start.

### Handoff 2: Rayyan → Tamim (the function signatures)

```
RAYYAN does:                         TAMIM receives:
─────────────────────────────────    ─────────────────────────────
1. syncManager.ts is written         "Import these 2 functions.
2. Sends Tamim this message:          Call them like this."

   import { initSync, submitDiagnostic }
     from "./lib/syncManager";

   // In useEffect (once):
   initSync({
     onQueueChanged: (n) => setQueueCount(n),
     onOnlineStatusChanged: (b) => setIsOnline(b),
     onSyncResult: (r) => setDiagnosis(r.diagnosis),
     onSyncError: (id, e) => setStatusMsg(e),
   });

   // In the Analyze button handler:
   const result = await submitDiagnostic(patientId, imageFile, audioFile);
   if (result) { /* show diagnosis */ }
   else { /* show "queued" message */ }
```

**When this must happen:** Before Tamim starts T4.
**How long it takes Rayyan:** ~2 hours from project start.

---

## Independence Map (Quick Reference)

| Task | Can start immediately? | Blocked by |
|------|:---:|---|
| K1 — Supabase setup | ✅ | — |
| K2 — Fill .env | ✅ | K1 |
| K3 — Run backend | ✅ | K2 |
| K4 — Test /analyze | ✅ | K3 |
| K5 — Give URL to Tamim | ✅ | K4 |
| | | |
| T1 — Build static UI | ✅ | — |
| T2 — WHO guidelines logic | ✅ | — |
| T3 — Diagnosis component | ✅ | T2 |
| T4 — Wire submit to syncManager | ⛔ | **K5 + R4** |
| T5 — Wire WHO display | ⛔ | T4 |
| T6 — Test with real data | ⛔ | T5 + K4 |
| | | |
| R1 — Install localforage | ✅ | — |
| R2 — Write syncManager.ts | ✅ | R1 |
| R3 — Test in console | ✅ | R2 |
| R4 — Give instructions to Tamim | ✅ | R2 |
| R6 — Test offline flow | ⛔ | R2 + K4 + T4 |

---

## Realistic Timeline (Hackathon Day)

```
HOUR 0           1           2           3           4           5           6
  │           │           │           │           │           │           │
  ├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
  │           │           │           │           │           │           │
KANON:
  │▓▓ K1+K2 ▓▓▓ K3 ▓▓▓▓▓▓▓▓ K4 (test with Swagger) ▓▓│
  │                        │► K5 HANDOFF to Tamim      │
  │                        │                           │▓▓▓ K6 (debug) ▓▓▓│▓▓ K8 deploy ▓▓│
  │                        │                           │                   │               │
TAMIM:
  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ T1 (build UI) ▓▓▓▓▓▓▓│
  │▓▓ T2 ▓▓▓▓ T3 ▓▓│              (can do T2/T3 while │
  │                  │               building T1)       │
  │                  │                    ▼ gets K5+R4  │
  │                  │              │▓▓▓▓ T4 ▓▓▓▓▓▓▓▓▓▓│▓▓ T5 ▓│▓ T6 ▓│▓▓ T8 polish ▓▓│
  │                  │              │                   │       │      │               │
RAYYAN:
  │▓ R1 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ R2 (write syncManager) ▓▓▓▓▓▓▓│
  │                     │▓▓ R3 (console test) ▓│        │
  │                     │► R4 HANDOFF to Tamim │        │
  │                     │                      │  │▓▓▓▓▓▓▓ R6 (offline test) ▓▓│▓ R8 phone ▓│
  │                     │                      │  │                            │            │
  │           │           │           │           │           │           │
  ├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
HOUR 0           1           2           3           4           5           6
                                      ▲
                                      │
                              CRITICAL MERGE POINT
                              (T4 can finally start)
                              Usually around hour 2.5-3
```

---

## Summary: The 6 Rules

1. **Phase 1 is fully parallel.** Nobody waits. Everybody builds.
2. **Kanon finishes first** (~30 min). Use idle time to thoroughly test `/analyze` with real images and audio via the Swagger UI.
3. **The bottleneck is Tamim at T4.** He can't wire the real submit logic until Kanon gives the URL (K5) AND Rayyan gives the function signatures (R4).
4. **Rayyan is the second to finish Phase 1** (~2 hrs). Deliver R4 to Tamim immediately after.
5. **Phase 3 is collaborative.** All three should be in the same room (or call) debugging together.
6. **Phase 4 can re-parallelize.** Kanon deploys, Tamim polishes, Rayyan does final phone testing — all independent.

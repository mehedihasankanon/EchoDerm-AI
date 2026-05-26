# EchoDerm AI

> **A dual-modal AI diagnostic co-pilot that simultaneously analyzes skin rashes and acoustic cough signatures to instantly differentiate Measles from Dengue and Rubella in rural clinics.**

---
<!--
## Table of Contents
- [The Problem](#-the-problem)
- [How It Works](#-how-it-works)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [License](#-license)

-->

---

## The Problem
In rural health clinics—specifically in countries like Bangladesh—Community Health Care Providers (CHCPs) often face severe diagnostic challenges. Misdiagnosing **Dengue** as **Measles** (or vice versa) based solely on visual inspection of skin rashes can lead to critical, sometimes fatal delays in patient treatment. Traditional lab-based confirmation requires expensive hardware, specialized training, and turnaround times that rural clinics simply cannot afford.

---

## How It Works
**EchoDerm AI** acts as a superhuman diagnostic co-pilot:
1. **Dual-Modal Inputs:** The clinician captures exactly **one photograph** of the patient's skin rash and records a **5-second audio clip** of their cough.
2. **Concurrent Multimodal Inference:** Our backend processes both inputs concurrently using the **Gemini 1.5 Flash** model.
3. **Differential Diagnosis:** The AI cross-references the visual maculopapular patterns from the image with the distinct acoustic signature (e.g., the dry, brassy harshness of a Measles cough versus a Dengue-related cough or other symptoms).
4. **Structured Decision Support:** The system returns a structured, highly confident differential diagnosis along with specific recommendations in real-time, requiring zero expensive laboratory hardware.

---

## Architecture & Tech Stack

### Backend
* **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (High-performance Python web framework)
* **LLM Engine:** [Google Gemini 1.5 Flash](https://ai.google.dev/) (Utilizing the official `google-generativeai` SDK for structured JSON multimodal inference)
* **Database & Logging:** [Supabase](https://supabase.com/) (For storing diagnostic records and raw inference logs)
* **Server:** [Uvicorn](https://www.uvicorn.org/) (Asynchronous ASGI web server)

### Frontend
* **Core:** [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
* **Build Tool:** [Vite 8](https://vite.dev/)
* **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)

---

## 📂 Project Structure

```
EchoDerm-AI/
├── backend/
│   ├── .venv/                 # Python Virtual Environment
│   ├── database.py            # Supabase database helpers & connection singleton
│   ├── inference.py           # Gemini 1.5 Flash multimodal configuration and execution
│   ├── main.py                # FastAPI endpoints, CORS, and validation
│   └── requirements.txt       # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main React component
│   │   ├── main.tsx           # React mounting & entrypoint
│   │   └── App.css            # Stylesheets
│   ├── package.json           # Frontend dependencies and scripts
│   ├── vite.config.ts         # Vite configuration (with Tailwind CSS plugin)
│   └── index.html             # Single Page Application template
└── readme.md                  # Project documentation (this file)
```

---

## 🚀 Getting Started

### Prerequisites
* Python 3.10+ installed
* Node.js v18+ installed
* A **Google Gemini API Key** (Get one at [Google AI Studio](https://aistudio.google.com/))
* A **Supabase Project** URL and API Key

---

### Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:
   * **Windows (PowerShell):**
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   * **macOS/Linux:**
     ```bash
     source .venv/bin/activate
     ```

4. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Create a `.env` file in the `backend/` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   SUPABASE_URL=your_supabase_project_url_here
   SUPABASE_KEY=your_supabase_anon_key_here
   ```

6. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload
   ```
   The backend API will be running at `http://127.0.0.1:8000`.

---

### Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd ../frontend
   ```

2. Install the package dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend application will be running at `http://localhost:5173`.

---
<!--

## 🔌 API Documentation

### 1. Health Check
* **Endpoint:** `GET /health`
* **Description:** Simple liveness probe to verify service status.
* **Response:**
  ```json
  {
    "status": "ok",
    "service": "echoderm-ai"
  }
  ```

### 2. Analyze Symptoms
* **Endpoint:** `POST /analyze`
* **Content-Type:** `multipart/form-data`
* **Request Parameters:**
  * `image` (File, Required): Skin-rash photo (`image/jpeg`, `image/png`, `image/webp`).
  * `audio` (File, Required): Cough recording (`audio/wav`, `audio/mpeg`, `audio/ogg`, `audio/mp3`).
  * `patient_id` (Form Field, Optional): Custom patient identifier string. Auto-generated via UUID if omitted.

* **Response (conforming to strict JSON schema):**
  ```json
  {
    "patient_id": "8b5f901a-6d4b-4a5d-b0a3-d02f5a659ccb",
    "diagnosis": {
      "primary_diagnosis": "Measles",
      "confidence_score": 0.92,
      "visual_findings": "Generalized maculopapular rash spreading from the hairline down to face and trunk, matching typical measles exanthem progression.",
      "acoustic_findings": "Dry, hacking, and brassy cough signature with high acoustic intensity.",
      "differential_notes": "The combination of the characteristic cephalocaudal rash progression and the dry, brassy cough is highly indicative of Measles, differentiating it from the typical presentation of Dengue.",
      "recommended_next_steps": [
        "Isolate the patient immediately to prevent transmission.",
        "Provide supportive therapy (hydration, fever management).",
        "Administer Vitamin A supplements according to local clinical guidelines.",
        "Notify local public health authorities."
      ]
    }
  }
  ```

---

## 🗄️ Database Schema
To enable diagnosis logging, ensure your Supabase instance contains a `diagnostic_results` table with the following structure:

```sql
CREATE TABLE diagnostic_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id TEXT NOT NULL,
    primary_diagnosis TEXT NOT NULL,
    confidence_score DOUBLE PRECISION NOT NULL,
    raw_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---
--> 


## 📄 License
This project is licensed under the MIT License.

import { useState } from 'react';
import './index.css';

interface DiagnosisResult {
  patient_id: string;
  diagnosis: {
    primary_diagnosis: string;
    confidence_score: number;
    visual_findings: string;
    acoustic_findings: string;
    differential_notes: string;
    recommended_next_steps: string[];
  };
}

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!image || !audio) {
      setError("Please upload both a rash image and a cough recording.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('image', image);
    formData.append('audio', audio);

    try {
      const response = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Analysis failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen flex flex-col justify-center">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 gradient-text">EchoDerm AI</h1>
        <p className="text-gray-400 text-lg">Dual-Modal Diagnostic Co-pilot for Rural Health Clinics</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Image Upload */}
        <div className="glass p-8 rounded-3xl flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Skin Rash Photo</h3>
          <input 
            type="file" 
            accept="image/*" 
            onChange={(e) => setImage(e.target.files?.[0] || null)}
            className="hidden" 
            id="image-upload" 
          />
          <label htmlFor="image-upload" className="cursor-pointer bg-white/5 hover:bg-white/10 px-6 py-3 rounded-xl transition-all border border-white/10">
            {image ? image.name : "Select Image"}
          </label>
        </div>

        {/* Audio Upload */}
        <div className="glass p-8 rounded-3xl flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Cough Audio</h3>
          <input 
            type="file" 
            accept="audio/*" 
            onChange={(e) => setAudio(e.target.files?.[0] || null)}
            className="hidden" 
            id="audio-upload" 
          />
          <label htmlFor="audio-upload" className="cursor-pointer bg-white/5 hover:bg-white/10 px-6 py-3 rounded-xl transition-all border border-white/10">
            {audio ? audio.name : "Select Audio"}
          </label>
        </div>
      </div>

      <div className="flex justify-center">
        <button 
          onClick={handleAnalyze}
          disabled={loading}
          className={`px-12 py-4 rounded-2xl font-bold text-lg transition-all ${
            loading 
            ? "bg-gray-700 cursor-not-allowed" 
            : "bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 active:scale-95"
          }`}
        >
          {loading ? "Analyzing..." : "Instantly Differentiate"}
        </button>
      </div>

      {error && (
        <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-12 glass p-8 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
            <div>
              <h2 className="text-sm uppercase tracking-widest text-indigo-400 font-bold mb-1">Primary Diagnosis</h2>
              <p className="text-4xl font-bold">{result.diagnosis.primary_diagnosis}</p>
            </div>
            <div className="text-right">
              <h2 className="text-sm uppercase tracking-widest text-gray-400 font-bold mb-1">Confidence</h2>
              <p className="text-4xl font-bold text-green-400">{(result.diagnosis.confidence_score * 100).toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <h4 className="font-bold text-indigo-300 mb-2">Visual Findings</h4>
              <p className="text-gray-300 italic">"{result.diagnosis.visual_findings}"</p>
            </div>
            <div>
              <h4 className="font-bold text-purple-300 mb-2">Acoustic Findings</h4>
              <p className="text-gray-300 italic">"{result.diagnosis.acoustic_findings}"</p>
            </div>
          </div>

          <div className="mb-8">
            <h4 className="font-bold text-white mb-2">Differential Notes</h4>
            <p className="text-gray-300 bg-white/5 p-4 rounded-xl border border-white/5">{result.diagnosis.differential_notes}</p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-3">Recommended Next Steps</h4>
            <ul className="space-y-2">
              {result.diagnosis.recommended_next_steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-gray-300">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
          
          <p className="mt-8 text-xs text-gray-500 text-center uppercase tracking-widest">Patient ID: {result.patient_id}</p>
        </div>
      )}
    </div>
  );
}

export default App;

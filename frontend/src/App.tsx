import { useState, useEffect, useRef } from 'react';
import './index.css';
import { t } from './lib/i18n';
import type { Language } from './lib/i18n';
import { getWHOGuideline } from './lib/whoGuidelines';
import type { WHOGuideline } from './lib/whoGuidelines';

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

interface ConfidenceBreakdown {
  visual_confidence: number;
  acoustic_confidence: number;
  cross_modal_agreement: string;
}

interface Diagnosis {
  primary_diagnosis: string;
  confidence_score: number;
  confidence_breakdown?: ConfidenceBreakdown;
  visual_findings: string;
  acoustic_findings: string;
  differential_notes: string;
  recommended_next_steps: string[];
}

interface EthicalMetadata {
  disclaimer: string;
  known_limitations: string[];
  bias_mitigations: string[];
  data_handling: string;
}

interface AnalysisResult {
  patient_id: string;
  diagnosis: Diagnosis;
  metadata?: { model?: string; inference_time_ms?: number; timestamp?: string };
  ethical_metadata?: EthicalMetadata;
}

interface DashboardStats {
  total_scans: number;
  measles_count: number;
  dengue_count: number;
  period: string;
}

// ══════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/** Returns Tailwind color class based on diagnosis string */
const diagnosisColor = (d: string) => {
  const lower = d.toLowerCase();
  if (lower.includes('measles')) return 'text-red-600';
  if (lower.includes('dengue')) return 'text-orange-500';
  return 'text-emerald-600'; // Healthy or unknown
};

const diagnosisBg = (d: string) => {
  const lower = d.toLowerCase();
  if (lower.includes('measles')) return 'bg-red-50 border-red-200';
  if (lower.includes('dengue')) return 'bg-orange-50 border-orange-200';
  return 'bg-emerald-50 border-emerald-200';
};

const diagnosisIcon = (d: string) => {
  const lower = d.toLowerCase();
  if (lower.includes('measles')) return '🔴';
  if (lower.includes('dengue')) return '🟠';
  return '🟢';
};

// ══════════════════════════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════════════════════════

function App() {
  // ── State ───────────────────────────────────────────────────────
  const [lang, setLang] = useState<Language>(() =>
    (localStorage.getItem('echoderm_lang') as Language) || 'en'
  );
  const [consented, setConsented] = useState<boolean>(() =>
    localStorage.getItem('echoderm_consent') === 'true'
  );
  const [consentChecked, setConsentChecked] = useState(false);

  // Upload state
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [audio, setAudio] = useState<File | Blob | null>(null);
  const [audioName, setAudioName] = useState<string>('');
  const [patientId, setPatientId] = useState('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Analysis state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Feature state
  const [showExplainability, setShowExplainability] = useState(false);
  const [showWHO, setShowWHO] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState<'diagnose' | 'dashboard'>('diagnose');

  // ── Effects ─────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('echoderm_lang', lang);
  }, [lang]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') fetchStats();
  }, [activeTab]);

  // ── Image preview ───────────────────────────────────────────────
  const handleImageChange = (file: File | null) => {
    setImage(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  // ── Audio recording ─────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudio(blob);
        setAudioName(`🎤 Recorded (${(blob.size / 1024).toFixed(0)} KB)`);
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      // Auto-stop at 15 seconds
      setTimeout(() => { if (recorder.state === 'recording') stopRecording(); }, 15000);
    } catch {
      setError('Microphone access denied. Please allow microphone permission.');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ── Analyze ─────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!image || !audio) {
      setError(t('analyze.error.both', lang));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('image', image);
    formData.append('audio', audio, audio instanceof File ? audio.name : 'recording.webm');
    if (patientId.trim()) formData.append('patient_id', patientId.trim());

    try {
      const response = await fetch(`${API_URL}/analyze`, { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Server error' }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }
      const data: AnalysisResult = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Dashboard fetch ─────────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/dashboard/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  };

  // ── Consent handler ─────────────────────────────────────────────
  const handleConsent = () => {
    localStorage.setItem('echoderm_consent', 'true');
    setConsented(true);
  };

  // ── Start New Scan (reset handler) ──────────────────────────────
  const handleNewScan = () => {
    setImage(null);
    setImagePreview(null);
    setAudio(null);
    setAudioName('');
    setResult(null);
    setError(null);
    setShowExplainability(false);
    setShowWHO(false);
  };

  // ══════════════════════════════════════════════════════════════════
  // CONSENT SCREEN
  // ══════════════════════════════════════════════════════════════════



  // ══════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════

  const whoGuideline: WHOGuideline | null = result ? getWHOGuideline(result.diagnosis.primary_diagnosis) : null;
  const breakdown = result?.diagnosis.confidence_breakdown;

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* ── CONSENT MODAL OVERLAY ── */}
      {!consented && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 modal-backdrop">
          <div className="bg-white rounded-3xl p-10 max-w-lg w-full text-center shadow-2xl border border-gray-100">
            <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-4xl">⚕️</span>
            </div>
            <h1 className="text-2xl font-bold mb-2 gradient-text">{t('ethical.consent.title', lang)}</h1>
            <p className="text-gray-500 mb-8 text-base leading-relaxed">{t('ethical.consent.body', lang)}</p>

            <div className="text-left space-y-4 mb-8">
              <p className="text-sm font-semibold text-indigo-600">{t('ethical.consent.data', lang)}</p>
              <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5 leading-relaxed">
                <li>{t('ethical.consent.data.1', lang)}</li>
                <li>{t('ethical.consent.data.2', lang)}</li>
                <li>{t('ethical.consent.data.3', lang)}</li>
              </ul>
              <p className="text-sm font-semibold text-amber-600 mt-4">{t('ethical.consent.limitations', lang)}</p>
              <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5 leading-relaxed">
                <li>{t('ethical.consent.limitations.1', lang)}</li>
                <li>{t('ethical.consent.limitations.2', lang)}</li>
                <li>{t('ethical.consent.limitations.3', lang)}</li>
              </ul>
            </div>

            <label className="flex items-center gap-3 mb-8 cursor-pointer justify-center">
              <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded" />
              <span className="text-sm text-gray-600">{t('ethical.consent.checkbox', lang)}</span>
            </label>

            <button onClick={handleConsent} disabled={!consentChecked}
              className={`w-full py-3.5 rounded-xl font-bold text-lg transition-all ${
                consentChecked
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-200'
                  : 'bg-gray-200 cursor-not-allowed text-gray-400'
              }`}>
              {t('ethical.consent.accept', lang)}
            </button>

            <button onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              className="mt-5 text-sm text-gray-400 hover:text-indigo-600 transition-colors">
              {t('lang.toggle', lang)}
            </button>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="text-center mb-10 pt-4">
        <div className="flex justify-between items-center mb-6">
          {/* Online/Offline badge */}
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
            isOnline
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : 'bg-amber-50 text-amber-600 border-amber-200'
          }`}>
            {isOnline ? '🟢 Online' : '📡 Offline'}
          </span>

          {/* Language toggle */}
          <button onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="text-sm px-4 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm">
            {t('lang.toggle', lang)}
          </button>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold mb-3 gradient-text">{t('app.title', lang)}</h1>
        <p className="text-gray-500 text-base sm:text-lg">{t('app.subtitle', lang)}</p>
      </header>

      {/* ── Disclaimer banner ──────────────────────────────────── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-center">
        <p className="text-sm text-amber-700 leading-relaxed">{t('ethical.disclaimer', lang)}</p>
      </div>

      {/* ── Offline banner ─────────────────────────────────────── */}
      {!isOnline && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-8 text-center animate-pulse">
          <p className="text-sm text-orange-600">{t('offline.banner', lang)}</p>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-3 mb-10 justify-center">
        <button onClick={() => setActiveTab('diagnose')}
          className={`px-7 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'diagnose'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
              : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}>
          🩺 {lang === 'en' ? 'Diagnose' : 'ডায়াগনোসিস'}
        </button>
        <button onClick={() => setActiveTab('dashboard')}
          className={`px-7 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'dashboard'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
              : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}>
          📊 {lang === 'en' ? 'Dashboard' : 'ড্যাশবোর্ড'}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DASHBOARD TAB                                             */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="glass rounded-3xl p-8 sm:p-10">
          <h2 className="text-2xl font-bold mb-8 gradient-text">{t('dashboard.title', lang)}</h2>
          {stats ? (
            <div className="grid grid-cols-3 gap-5">
              <div className="text-center p-6 rounded-2xl bg-indigo-50 border border-indigo-100">
                <p className="text-4xl font-bold text-indigo-700">{stats.total_scans}</p>
                <p className="text-sm text-gray-500 mt-2">{t('dashboard.total', lang)}</p>
              </div>
              <div className="text-center p-6 rounded-2xl bg-red-50 border border-red-100">
                <p className="text-4xl font-bold text-red-600">{stats.measles_count}</p>
                <p className="text-sm text-gray-500 mt-2">{t('dashboard.measles', lang)}</p>
              </div>
              <div className="text-center p-6 rounded-2xl bg-orange-50 border border-orange-100">
                <p className="text-4xl font-bold text-orange-500">{stats.dengue_count}</p>
                <p className="text-sm text-gray-500 mt-2">{t('dashboard.dengue', lang)}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center text-base">Loading stats...</p>
          )}
          {stats && stats.total_scans > 0 && (
            <div className="mt-8">
              <p className="text-sm text-gray-400 mb-3">{t('dashboard.period', lang)}</p>
              <div className="flex gap-1 h-10 rounded-xl overflow-hidden bg-gray-100">
                <div className="bg-red-400 transition-all rounded-l-lg" style={{ width: `${(stats.measles_count / stats.total_scans) * 100}%` }} />
                <div className="bg-orange-400 transition-all rounded-r-lg" style={{ width: `${(stats.dengue_count / stats.total_scans) * 100}%` }} />
              </div>
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>🔴 Measles {((stats.measles_count / stats.total_scans) * 100).toFixed(0)}%</span>
                <span>🟠 Dengue {((stats.dengue_count / stats.total_scans) * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DIAGNOSE TAB                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'diagnose' && (
        <>
          {/* ── Patient ID ─────────────────────────────────────── */}
          <div className="mb-8">
            <input type="text" value={patientId} onChange={e => setPatientId(e.target.value)}
              placeholder={t('patient.id.placeholder', lang)}
              className="w-full px-5 py-3.5 rounded-xl bg-white border border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-base shadow-sm" />
          </div>

          {/* ── Upload Cards ───────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* Image Upload */}
            <div className="glass p-8 rounded-3xl flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">{t('upload.rash.title', lang)}</h3>
              <p className="text-sm text-gray-400 mb-4">{lang === 'en' ? 'JPG, PNG up to 10MB' : 'JPG, PNG ১০MB পর্যন্ত'}</p>

              {imagePreview && (
                <img src={imagePreview} alt="Rash preview"
                  className="w-full h-36 object-cover rounded-xl mb-4 border border-gray-200 shadow-sm" />
              )}

              <input type="file" accept="image/*" capture="environment"
                onChange={e => handleImageChange(e.target.files?.[0] || null)}
                className="hidden" id="image-upload" />
              <label htmlFor="image-upload"
                className={`cursor-pointer px-6 py-3 rounded-xl transition-all text-sm font-medium w-full border ${
                  image
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 hover:bg-indigo-50 border-gray-200 hover:border-indigo-300 text-gray-600'
                }`}>
                {image ? `✅ ${image.name.slice(0, 25)}` : t('upload.rash.button', lang)}
              </label>
            </div>

            {/* Audio Upload / Record */}
            <div className="glass p-8 rounded-3xl flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">{t('upload.audio.title', lang)}</h3>
              <p className="text-sm text-gray-400 mb-4">{lang === 'en' ? 'Record or upload cough audio' : 'কাশির অডিও রেকর্ড বা আপলোড করুন'}</p>

              {/* Record button */}
              <button onClick={isRecording ? stopRecording : startRecording}
                className={`w-full py-3 rounded-xl font-semibold text-sm mb-4 transition-all ${
                  isRecording
                    ? 'bg-red-500 animate-pulse text-white shadow-lg shadow-red-200'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                }`}>
                {isRecording
                  ? `🔴 ${t('upload.audio.stop', lang)} (${recordingTime}s)`
                  : t('upload.audio.record', lang)
                }
              </button>

              <p className="text-xs text-gray-400 mb-4">— {lang === 'en' ? 'or upload a file' : 'অথবা ফাইল আপলোড করুন'} —</p>

              <input type="file" accept="audio/*"
                onChange={e => { setAudio(e.target.files?.[0] || null); setAudioName(e.target.files?.[0]?.name || ''); }}
                className="hidden" id="audio-upload" />
              <label htmlFor="audio-upload"
                className={`cursor-pointer px-6 py-3 rounded-xl transition-all text-sm font-medium w-full border ${
                  audioName
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 hover:bg-purple-50 border-gray-200 hover:border-purple-300 text-gray-600'
                }`}>
                {audioName ? `✅ ${audioName.slice(0, 25)}` : t('upload.audio.button', lang)}
              </label>
            </div>
          </div>

          {/* ── Analyze Button ─────────────────────────────────── */}
          <div className="flex justify-center mb-10">
            <button onClick={handleAnalyze} disabled={loading || !image || !audio}
              className={`px-12 py-4 rounded-2xl font-bold text-base transition-all ${
                loading || !image || !audio
                  ? 'bg-gray-200 cursor-not-allowed text-gray-400'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-200 active:scale-95'
              }`}>
              {loading ? (
                <span className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  {t('analyze.loading', lang)}
                </span>
              ) : t('analyze.button', lang)}
            </button>
          </div>

          {/* ── Error ──────────────────────────────────────────── */}
          {error && (
            <div className="mb-8 p-5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-base">
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* RESULTS — GLASS MODAL OVERLAY                         */}
          {/* ══════════════════════════════════════════════════════ */}
          {result && (
            <div className="fixed inset-0 z-50 modal-backdrop flex items-start justify-center overflow-y-auto py-8 px-4">
              <div className="glass-modal rounded-3xl p-8 sm:p-10 max-w-3xl w-full my-4 relative">

                {/* Close button */}
                <button onClick={handleNewScan}
                  className="absolute top-5 right-5 w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all text-lg">
                  ✕
                </button>

                {/* ── Diagnosis Header ──────────────────────────── */}
                <div className="text-center mb-8 pb-8 border-b border-gray-200">
                  <p className="text-xs uppercase tracking-widest text-indigo-500 font-bold mb-3">
                    {t('result.diagnosis', lang)}
                  </p>

                  {/* Diagnosis badge */}
                  <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl border ${diagnosisBg(result.diagnosis.primary_diagnosis)} mb-4`}>
                    <span className="text-2xl">{diagnosisIcon(result.diagnosis.primary_diagnosis)}</span>
                    <span className={`text-3xl sm:text-4xl font-bold ${diagnosisColor(result.diagnosis.primary_diagnosis)}`}>
                      {result.diagnosis.primary_diagnosis}
                    </span>
                  </div>

                  {/* Confidence circular badge */}
                  <div className="flex justify-center mt-4">
                    <div className="relative w-24 h-24">
                      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                        <circle cx="50" cy="50" r="42" stroke={
                          result.diagnosis.primary_diagnosis.toLowerCase().includes('measles') ? '#dc2626'
                          : result.diagnosis.primary_diagnosis.toLowerCase().includes('dengue') ? '#f97316'
                          : '#059669'
                        } strokeWidth="8" fill="none"
                          strokeDasharray={`${result.diagnosis.confidence_score * 100 * 2.64} 264`}
                          strokeLinecap="round"
                          className="transition-all duration-1000" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-gray-800">{(result.diagnosis.confidence_score * 100).toFixed(0)}%</span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide">{t('result.confidence', lang)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Findings cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-5">
                    <h4 className="font-bold text-indigo-700 mb-2 text-sm flex items-center gap-2">
                      <span className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center text-xs">👁️</span>
                      {t('result.visual', lang)}
                    </h4>
                    <p className="text-gray-600 text-sm leading-relaxed italic">"{result.diagnosis.visual_findings}"</p>
                  </div>
                  <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-5">
                    <h4 className="font-bold text-purple-700 mb-2 text-sm flex items-center gap-2">
                      <span className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center text-xs">👂</span>
                      {t('result.acoustic', lang)}
                    </h4>
                    <p className="text-gray-600 text-sm leading-relaxed italic">"{result.diagnosis.acoustic_findings}"</p>
                  </div>
                </div>

                {/* Differential notes */}
                <div className="mb-8">
                  <h4 className="font-bold text-gray-800 mb-2 text-sm">{t('result.reasoning', lang)}</h4>
                  <p className="text-gray-600 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed">
                    {result.diagnosis.differential_notes}
                  </p>
                </div>

                {/* Next steps checklist */}
                <div className="mb-8">
                  <h4 className="font-bold text-gray-800 mb-3 text-sm">{t('result.nextsteps', lang)}</h4>
                  <ul className="space-y-2.5">
                    {result.diagnosis.recommended_next_steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3 text-gray-600 text-sm leading-relaxed bg-white/80 border border-gray-100 rounded-xl p-3">
                        <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Patient & meta info */}
                <div className="flex items-center justify-between text-sm text-gray-400 pt-5 border-t border-gray-200 mb-6">
                  <span>{t('result.patient_id', lang)}: {result.patient_id.slice(0, 8)}...</span>
                  {result.metadata?.inference_time_ms && (
                    <span>⚡ {result.metadata.inference_time_ms}ms</span>
                  )}
                </div>

                {/* ── Explainability Panel ──────────────────────── */}
                {breakdown && (
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
                    <button onClick={() => setShowExplainability(!showExplainability)}
                      className="w-full p-5 text-left font-semibold flex items-center justify-between hover:bg-gray-50 transition-all">
                      <span className="gradient-text text-sm">{t('explain.title', lang)}</span>
                      <span className="text-gray-400 text-sm">{showExplainability ? '▲' : '▼'}</span>
                    </button>
                    {showExplainability && (
                      <div className="px-6 pb-6 space-y-5">
                        {/* Visual confidence bar */}
                        <div>
                          <div className="flex justify-between text-sm text-gray-500 mb-2">
                            <span>👁️ {t('explain.visual_confidence', lang)} (60% weight)</span>
                            <span className="font-semibold text-gray-700">{(breakdown.visual_confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div className="h-2.5 rounded-full bg-teal-500 transition-all duration-700"
                              style={{ width: `${breakdown.visual_confidence * 100}%` }} />
                          </div>
                        </div>
                        {/* Acoustic confidence bar */}
                        <div>
                          <div className="flex justify-between text-sm text-gray-500 mb-2">
                            <span>👂 {t('explain.acoustic_confidence', lang)} (40% weight)</span>
                            <span className="font-semibold text-gray-700">{(breakdown.acoustic_confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div className="h-2.5 rounded-full bg-purple-500 transition-all duration-700"
                              style={{ width: `${breakdown.acoustic_confidence * 100}%` }} />
                          </div>
                        </div>
                        {/* Cross-modal agreement */}
                        <div className={`p-4 rounded-xl text-sm font-medium ${
                          breakdown.cross_modal_agreement === 'concordant'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {breakdown.cross_modal_agreement === 'concordant'
                            ? t('explain.concordant', lang)
                            : t('explain.discordant', lang)
                          }
                        </div>
                        {/* Metadata */}
                        {result.metadata && (
                          <div className="text-sm text-gray-400 space-y-1.5 pt-3 border-t border-gray-100">
                            <p>{t('explain.model', lang)}: <span className="text-gray-600">{result.metadata.model}</span></p>
                            <p>{t('explain.inference_time', lang)}: <span className="text-gray-600">{result.metadata.inference_time_ms}ms</span></p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── WHO Guidelines Panel ─────────────────────── */}
                {whoGuideline && (
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
                    <button onClick={() => setShowWHO(!showWHO)}
                      className="w-full p-5 text-left font-semibold flex items-center justify-between hover:bg-gray-50 transition-all">
                      <span className="gradient-text text-sm">{t('who.title', lang)}</span>
                      <span className="text-gray-400 text-sm">{showWHO ? '▲' : '▼'}</span>
                    </button>
                    {showWHO && (
                      <div className="px-6 pb-6 space-y-5">
                        {/* Immediate Actions */}
                        <div>
                          <h5 className="text-sm font-bold text-emerald-600 mb-2">{t('who.actions', lang)}</h5>
                          <ul className="space-y-1.5">
                            {whoGuideline.immediateActions.map((a, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2 leading-relaxed">
                                <span className="text-emerald-500 mt-1">•</span> {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {/* Strictly Avoid */}
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                          <h5 className="text-sm font-bold text-red-600 mb-2">{t('who.avoid', lang)}</h5>
                          <ul className="space-y-1.5">
                            {whoGuideline.strictlyAvoid.map((a, i) => (
                              <li key={i} className="text-sm text-red-600 leading-relaxed">{a}</li>
                            ))}
                          </ul>
                        </div>
                        {/* Danger Signs */}
                        <div>
                          <h5 className="text-sm font-bold text-red-500 mb-2">{t('who.danger', lang)}</h5>
                          <ul className="space-y-1.5">
                            {whoGuideline.dangerSigns.map((d, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2 leading-relaxed">
                                <span className="text-red-500">⚠</span> {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {/* Medications */}
                        <div>
                          <h5 className="text-sm font-bold text-blue-600 mb-2">{t('who.medications', lang)}</h5>
                          <ul className="space-y-1.5">
                            {whoGuideline.medications.map((m, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2 leading-relaxed">
                                <span className="text-blue-500">💊</span> {m}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {/* Referral */}
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                          <h5 className="text-sm font-bold text-amber-600 mb-1">{t('who.referral', lang)}</h5>
                          <p className="text-sm text-amber-700 leading-relaxed">{whoGuideline.referralCriteria}</p>
                        </div>
                        {/* Isolation */}
                        {whoGuideline.isolationRequired && (
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                            <h5 className="text-sm font-bold text-purple-600 mb-1">{t('who.isolation', lang)}</h5>
                            <p className="text-sm text-purple-700 leading-relaxed">{whoGuideline.isolationDuration}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Ethical metadata ──────────────────────────── */}
                {result.ethical_metadata && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
                    <details>
                      <summary className="cursor-pointer text-sm text-gray-500 hover:text-indigo-600 transition-colors font-medium">
                        ℹ️ {lang === 'en' ? 'View Ethical Disclosure & Limitations' : 'নৈতিক প্রকাশ ও সীমাবদ্ধতা দেখুন'}
                      </summary>
                      <div className="mt-4 space-y-3 text-sm text-gray-500">
                        <p className="font-bold text-amber-600">{result.ethical_metadata.disclaimer}</p>
                        <div>
                          <p className="font-semibold text-gray-700 mb-1">Known Limitations:</p>
                          <ul className="list-disc pl-5 space-y-1">
                            {result.ethical_metadata.known_limitations.map((l, i) => <li key={i}>{l}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-700 mb-1">Bias Mitigations:</p>
                          <ul className="list-disc pl-5 space-y-1">
                            {result.ethical_metadata.bias_mitigations.map((b, i) => <li key={i}>{b}</li>)}
                          </ul>
                        </div>
                        <p><span className="font-semibold text-gray-700">Data Handling:</span> {result.ethical_metadata.data_handling}</p>
                      </div>
                    </details>
                  </div>
                )}

                {/* ── Start New Scan Button ─────────────────────── */}
                <div className="flex justify-center pt-4">
                  <button onClick={handleNewScan}
                    className="px-10 py-4 rounded-2xl font-bold text-base bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {lang === 'en' ? 'Start New Scan' : 'নতুন স্ক্যান শুরু করুন'}
                  </button>
                </div>

              </div>
            </div>
          )}
        </>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center mt-14 pb-8 text-sm text-gray-400">
        EchoDerm AI v0.2.0 · Gemini 3.1 Flash Lite + Llama 3.2 1B · The Infinity AI BuildFest 2026
      </footer>
    </div>
  );
}

export default App;

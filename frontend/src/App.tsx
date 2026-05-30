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

  // ══════════════════════════════════════════════════════════════════
  // CONSENT SCREEN
  // ══════════════════════════════════════════════════════════════════

  if (!consented) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-8 max-w-lg w-full text-center">
          <div className="text-5xl mb-4">⚕️</div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">{t('ethical.consent.title', lang)}</h1>
          <p className="text-gray-300 mb-6">{t('ethical.consent.body', lang)}</p>

          <div className="text-left space-y-3 mb-6">
            <p className="text-sm font-semibold text-indigo-300">{t('ethical.consent.data', lang)}</p>
            <ul className="text-xs text-gray-400 space-y-1.5 list-disc pl-4">
              <li>{t('ethical.consent.data.1', lang)}</li>
              <li>{t('ethical.consent.data.2', lang)}</li>
              <li>{t('ethical.consent.data.3', lang)}</li>
            </ul>
            <p className="text-sm font-semibold text-amber-300 mt-3">{t('ethical.consent.limitations', lang)}</p>
            <ul className="text-xs text-gray-400 space-y-1.5 list-disc pl-4">
              <li>{t('ethical.consent.limitations.1', lang)}</li>
              <li>{t('ethical.consent.limitations.2', lang)}</li>
              <li>{t('ethical.consent.limitations.3', lang)}</li>
            </ul>
          </div>

          <label className="flex items-center gap-3 mb-6 cursor-pointer justify-center">
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)}
              className="w-4 h-4 accent-indigo-500" />
            <span className="text-sm text-gray-300">{t('ethical.consent.checkbox', lang)}</span>
          </label>

          <button onClick={handleConsent} disabled={!consentChecked}
            className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
              consentChecked ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-700 cursor-not-allowed text-gray-500'
            }`}>
            {t('ethical.consent.accept', lang)}
          </button>

          <button onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors">
            {t('lang.toggle', lang)}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════

  const whoGuideline: WHOGuideline | null = result ? getWHOGuideline(result.diagnosis.primary_diagnosis) : null;
  const breakdown = result?.diagnosis.confidence_breakdown;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="text-center mb-8 pt-4">
        <div className="flex justify-between items-center mb-4">
          {/* Online/Offline badge */}
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            isOnline ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {isOnline ? '🟢 Online' : '📡 Offline'}
          </span>

          {/* Language toggle */}
          <button onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="text-sm px-3 py-1 rounded-full glass hover:bg-white/10 transition-all">
            {t('lang.toggle', lang)}
          </button>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold mb-2 gradient-text">{t('app.title', lang)}</h1>
        <p className="text-gray-400 text-sm sm:text-base">{t('app.subtitle', lang)}</p>
      </header>

      {/* ── Disclaimer banner ──────────────────────────────────── */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 text-center">
        <p className="text-xs text-amber-300">{t('ethical.disclaimer', lang)}</p>
      </div>

      {/* ── Offline banner ─────────────────────────────────────── */}
      {!isOnline && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-6 text-center animate-pulse">
          <p className="text-xs text-orange-300">{t('offline.banner', lang)}</p>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-8 justify-center">
        <button onClick={() => setActiveTab('diagnose')}
          className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'diagnose' ? 'bg-indigo-600 text-white' : 'glass text-gray-400 hover:text-white'
          }`}>
          🩺 {lang === 'en' ? 'Diagnose' : 'ডায়াগনোসিস'}
        </button>
        <button onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'glass text-gray-400 hover:text-white'
          }`}>
          📊 {lang === 'en' ? 'Dashboard' : 'ড্যাশবোর্ড'}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DASHBOARD TAB                                             */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="glass rounded-3xl p-8">
          <h2 className="text-2xl font-bold mb-6 gradient-text">{t('dashboard.title', lang)}</h2>
          {stats ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-2xl bg-white/5">
                <p className="text-3xl font-bold">{stats.total_scans}</p>
                <p className="text-xs text-gray-400 mt-1">{t('dashboard.total', lang)}</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-red-500/10">
                <p className="text-3xl font-bold text-red-400">{stats.measles_count}</p>
                <p className="text-xs text-gray-400 mt-1">{t('dashboard.measles', lang)}</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-orange-500/10">
                <p className="text-3xl font-bold text-orange-400">{stats.dengue_count}</p>
                <p className="text-xs text-gray-400 mt-1">{t('dashboard.dengue', lang)}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center">Loading stats...</p>
          )}
          {stats && stats.total_scans > 0 && (
            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-2">{t('dashboard.period', lang)}</p>
              <div className="flex gap-2 h-8 rounded-lg overflow-hidden">
                <div className="bg-red-500/60 transition-all" style={{ width: `${(stats.measles_count / stats.total_scans) * 100}%` }} />
                <div className="bg-orange-500/60 transition-all" style={{ width: `${(stats.dengue_count / stats.total_scans) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Measles {((stats.measles_count / stats.total_scans) * 100).toFixed(0)}%</span>
                <span>Dengue {((stats.dengue_count / stats.total_scans) * 100).toFixed(0)}%</span>
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
          <div className="mb-6">
            <input type="text" value={patientId} onChange={e => setPatientId(e.target.value)}
              placeholder={t('patient.id.placeholder', lang)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all" />
          </div>

          {/* ── Upload Cards ───────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Image Upload */}
            <div className="glass p-6 rounded-3xl flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-3">{t('upload.rash.title', lang)}</h3>

              {imagePreview && (
                <img src={imagePreview} alt="Rash preview"
                  className="w-full h-32 object-cover rounded-xl mb-3 border border-white/10" />
              )}

              <input type="file" accept="image/*" capture="environment"
                onChange={e => handleImageChange(e.target.files?.[0] || null)}
                className="hidden" id="image-upload" />
              <label htmlFor="image-upload"
                className="cursor-pointer bg-white/5 hover:bg-white/10 px-5 py-2.5 rounded-xl transition-all border border-white/10 text-sm w-full">
                {image ? `✅ ${image.name.slice(0, 20)}` : t('upload.rash.button', lang)}
              </label>
            </div>

            {/* Audio Upload / Record */}
            <div className="glass p-6 rounded-3xl flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-3">{t('upload.audio.title', lang)}</h3>

              {/* Record button */}
              <button onClick={isRecording ? stopRecording : startRecording}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm mb-3 transition-all ${
                  isRecording
                    ? 'bg-red-500 animate-pulse text-white'
                    : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/20'
                }`}>
                {isRecording
                  ? `🔴 ${t('upload.audio.stop', lang)} (${recordingTime}s)`
                  : t('upload.audio.record', lang)
                }
              </button>

              <p className="text-xs text-gray-500 mb-3">— {lang === 'en' ? 'or upload a file' : 'অথবা ফাইল আপলোড করুন'} —</p>

              <input type="file" accept="audio/*"
                onChange={e => { setAudio(e.target.files?.[0] || null); setAudioName(e.target.files?.[0]?.name || ''); }}
                className="hidden" id="audio-upload" />
              <label htmlFor="audio-upload"
                className="cursor-pointer bg-white/5 hover:bg-white/10 px-5 py-2.5 rounded-xl transition-all border border-white/10 text-sm w-full">
                {audioName ? `✅ ${audioName.slice(0, 25)}` : t('upload.audio.button', lang)}
              </label>
            </div>
          </div>

          {/* ── Analyze Button ─────────────────────────────────── */}
          <div className="flex justify-center mb-8">
            <button onClick={handleAnalyze} disabled={loading || !image || !audio}
              className={`px-10 py-4 rounded-2xl font-bold text-base transition-all ${
                loading || !image || !audio
                  ? 'bg-gray-700 cursor-not-allowed text-gray-500'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 active:scale-95'
              }`}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  {t('analyze.loading', lang)}
                </span>
              ) : t('analyze.button', lang)}
            </button>
          </div>

          {/* ── Error ──────────────────────────────────────────── */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center text-sm">
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* RESULTS                                               */}
          {/* ══════════════════════════════════════════════════════ */}
          {result && (
            <div className="space-y-6">

              {/* ── Diagnosis Header ──────────────────────────── */}
              <div className="glass p-6 sm:p-8 rounded-3xl">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-1">
                      {t('result.diagnosis', lang)}
                    </h2>
                    <p className={`text-3xl sm:text-4xl font-bold ${
                      result.diagnosis.primary_diagnosis === 'Measles' ? 'text-red-400' : 'text-orange-400'
                    }`}>
                      {result.diagnosis.primary_diagnosis}
                    </p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                      {t('result.confidence', lang)}
                    </h2>
                    <p className="text-3xl sm:text-4xl font-bold text-green-400">
                      {(result.diagnosis.confidence_score * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Findings grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h4 className="font-bold text-indigo-300 mb-1 text-sm">{t('result.visual', lang)}</h4>
                    <p className="text-gray-300 text-sm italic">"{result.diagnosis.visual_findings}"</p>
                  </div>
                  <div>
                    <h4 className="font-bold text-purple-300 mb-1 text-sm">{t('result.acoustic', lang)}</h4>
                    <p className="text-gray-300 text-sm italic">"{result.diagnosis.acoustic_findings}"</p>
                  </div>
                </div>

                {/* Differential notes */}
                <div className="mb-6">
                  <h4 className="font-bold text-white mb-1 text-sm">{t('result.reasoning', lang)}</h4>
                  <p className="text-gray-300 text-sm bg-white/5 p-3 rounded-xl border border-white/5">
                    {result.diagnosis.differential_notes}
                  </p>
                </div>

                {/* Next steps */}
                <div className="mb-4">
                  <h4 className="font-bold text-white mb-2 text-sm">{t('result.nextsteps', lang)}</h4>
                  <ul className="space-y-1.5">
                    {result.diagnosis.recommended_next_steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-white/5">
                  <span>{t('result.patient_id', lang)}: {result.patient_id.slice(0, 8)}...</span>
                  {result.metadata?.inference_time_ms && (
                    <span>⚡ {result.metadata.inference_time_ms}ms</span>
                  )}
                </div>
              </div>

              {/* ── Explainability Panel ──────────────────────── */}
              {breakdown && (
                <div className="glass rounded-3xl overflow-hidden">
                  <button onClick={() => setShowExplainability(!showExplainability)}
                    className="w-full p-4 text-left font-semibold flex items-center justify-between hover:bg-white/5 transition-all">
                    <span className="gradient-text text-sm">{t('explain.title', lang)}</span>
                    <span className="text-gray-400">{showExplainability ? '▲' : '▼'}</span>
                  </button>
                  {showExplainability && (
                    <div className="px-6 pb-6 space-y-4">
                      {/* Visual confidence bar */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>👁️ {t('explain.visual_confidence', lang)} (60% weight)</span>
                          <span>{(breakdown.visual_confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full bg-teal-400 transition-all duration-700"
                            style={{ width: `${breakdown.visual_confidence * 100}%` }} />
                        </div>
                      </div>
                      {/* Acoustic confidence bar */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>👂 {t('explain.acoustic_confidence', lang)} (40% weight)</span>
                          <span>{(breakdown.acoustic_confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full bg-purple-400 transition-all duration-700"
                            style={{ width: `${breakdown.acoustic_confidence * 100}%` }} />
                        </div>
                      </div>
                      {/* Cross-modal agreement */}
                      <div className={`p-3 rounded-xl text-xs ${
                        breakdown.cross_modal_agreement === 'concordant'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {breakdown.cross_modal_agreement === 'concordant'
                          ? t('explain.concordant', lang)
                          : t('explain.discordant', lang)
                        }
                      </div>
                      {/* Metadata */}
                      {result.metadata && (
                        <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-white/5">
                          <p>{t('explain.model', lang)}: {result.metadata.model}</p>
                          <p>{t('explain.inference_time', lang)}: {result.metadata.inference_time_ms}ms</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── WHO Guidelines Panel ─────────────────────── */}
              {whoGuideline && (
                <div className="glass rounded-3xl overflow-hidden">
                  <button onClick={() => setShowWHO(!showWHO)}
                    className="w-full p-4 text-left font-semibold flex items-center justify-between hover:bg-white/5 transition-all">
                    <span className="gradient-text text-sm">{t('who.title', lang)}</span>
                    <span className="text-gray-400">{showWHO ? '▲' : '▼'}</span>
                  </button>
                  {showWHO && (
                    <div className="px-6 pb-6 space-y-4">
                      {/* Immediate Actions */}
                      <div>
                        <h5 className="text-sm font-bold text-green-400 mb-2">{t('who.actions', lang)}</h5>
                        <ul className="space-y-1">
                          {whoGuideline.immediateActions.map((a, i) => (
                            <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                              <span className="text-green-400">•</span> {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Strictly Avoid */}
                      <div className="bg-red-500/10 p-3 rounded-xl">
                        <h5 className="text-sm font-bold text-red-400 mb-2">{t('who.avoid', lang)}</h5>
                        <ul className="space-y-1">
                          {whoGuideline.strictlyAvoid.map((a, i) => (
                            <li key={i} className="text-xs text-red-300">{a}</li>
                          ))}
                        </ul>
                      </div>
                      {/* Danger Signs */}
                      <div>
                        <h5 className="text-sm font-bold text-red-300 mb-2">{t('who.danger', lang)}</h5>
                        <ul className="space-y-1">
                          {whoGuideline.dangerSigns.map((d, i) => (
                            <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                              <span className="text-red-400">⚠</span> {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Medications */}
                      <div>
                        <h5 className="text-sm font-bold text-blue-300 mb-2">{t('who.medications', lang)}</h5>
                        <ul className="space-y-1">
                          {whoGuideline.medications.map((m, i) => (
                            <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                              <span className="text-blue-400">💊</span> {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Referral */}
                      <div className="bg-amber-500/10 p-3 rounded-xl">
                        <h5 className="text-sm font-bold text-amber-400 mb-1">{t('who.referral', lang)}</h5>
                        <p className="text-xs text-amber-300">{whoGuideline.referralCriteria}</p>
                      </div>
                      {/* Isolation */}
                      {whoGuideline.isolationRequired && (
                        <div className="bg-purple-500/10 p-3 rounded-xl">
                          <h5 className="text-sm font-bold text-purple-400 mb-1">{t('who.isolation', lang)}</h5>
                          <p className="text-xs text-purple-300">{whoGuideline.isolationDuration}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Ethical metadata ──────────────────────────── */}
              {result.ethical_metadata && (
                <div className="glass rounded-3xl p-4">
                  <details>
                    <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 transition-colors">
                      ℹ️ {lang === 'en' ? 'View Ethical Disclosure & Limitations' : 'নৈতিক প্রকাশ ও সীমাবদ্ধতা দেখুন'}
                    </summary>
                    <div className="mt-3 space-y-2 text-xs text-gray-400">
                      <p className="font-bold text-amber-400">{result.ethical_metadata.disclaimer}</p>
                      <div>
                        <p className="font-semibold text-gray-300 mb-1">Known Limitations:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {result.ethical_metadata.known_limitations.map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-300 mb-1">Bias Mitigations:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {result.ethical_metadata.bias_mitigations.map((b, i) => <li key={i}>{b}</li>)}
                        </ul>
                      </div>
                      <p><span className="font-semibold text-gray-300">Data Handling:</span> {result.ethical_metadata.data_handling}</p>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="text-center mt-12 pb-6 text-xs text-gray-600">
        EchoDerm AI v0.2.0 · Gemini 3.1 Flash Lite + Llama 3.2 1B · The Infinity AI BuildFest 2026
      </footer>
    </div>
  );
}

export default App;

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Server, Shield, Activity, Database, ChevronRight, Lock } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface TeamMember {
  name: string;
  role: string;
  email: string;
  avatar_url: string;
}

interface DocsConfig {
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
  team_members: TeamMember[];
}

export default function DocsPage() {
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [config, setConfig] = useState<DocsConfig | null>(null);
  const [sysData, setSysData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const confRes = await fetch(`${API_URL}/docs/config`);
        const confData = await confRes.json();
        setIsAvailable(confData.is_visible);
        setConfig(confData.raw_config);

        if (confData.is_visible) {
          const sysRes = await fetch(`${API_URL}/docs-data`);
          setSysData(await sysRes.json());
        }
      } catch (e) {
        console.error("Docs load error", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100">
        <div className="glass-modal rounded-3xl p-12 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-50 border border-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-3">Documentation Not Available</h1>
          <p className="text-gray-500 text-base leading-relaxed mb-8">
            This module is currently disabled or outside of its scheduled viewing window.
          </p>
          <Link to="/" className="inline-block px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all text-sm font-semibold shadow-lg shadow-indigo-200">
            Return to App
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-gray-700 pb-20">
      {/* Navbar */}
      <nav className="glass sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-200">
            E
          </div>
          <span className="font-bold text-lg text-gray-800">EchoDerm /docs</span>
        </div>
        <div className="flex gap-5 items-center">
          <a href="#pitch" className="text-sm font-semibold text-gray-500 hover:text-indigo-600 transition-colors hidden sm:block">Pitch Deck</a>
          <a href="#architecture" className="text-sm font-semibold text-gray-500 hover:text-indigo-600 transition-colors hidden sm:block">Architecture</a>
          <Link to="/docs/admin" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors bg-indigo-50 px-4 py-1.5 rounded-lg border border-indigo-100">Admin Panel</Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 space-y-20">
        
        {/* HERO */}
        <section id="pitch" className="text-center pt-10 pb-10">
          <span className="px-4 py-1.5 bg-indigo-100 text-indigo-600 text-xs font-bold uppercase tracking-widest rounded-full mb-6 inline-block border border-indigo-200">
            YC Pitch Deck
          </span>
          <h1 className="text-5xl sm:text-7xl font-bold text-gray-900 tracking-tight mb-6">
            The Stethoscope <br/><span className="gradient-text">Learned to See.</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Dual-Modal AI × Edge Intelligence × WHO Clinical Guardrails. Differentiating Measles from Dengue to prevent fatal misdiagnosis in rural Bangladesh.
          </p>
        </section>

        {/* PROBLEM & SOLUTION */}
        <section className="grid md:grid-cols-2 gap-8">
          <div className="glass p-8 rounded-3xl border border-red-100">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">The Problem</h3>
            <p className="text-gray-600 mb-5 leading-relaxed text-base">
              72% of Bangladesh's 170M population lives in rural areas. Community health workers frequently misdiagnose Measles vs Dengue due to overlapping symptoms (fever, rash).
            </p>
            <div className="p-5 bg-red-50 rounded-xl border border-red-100">
              <span className="font-bold text-red-600 text-sm">THE FATAL MISTAKE:</span>
              <p className="text-red-700 text-sm mt-1 leading-relaxed">Giving NSAIDs (Ibuprofen) for suspected Measles when it's actually Dengue causes fatal hemorrhaging.</p>
            </div>
          </div>
          <div className="glass p-8 rounded-3xl border border-indigo-100">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Our Solution</h3>
            <p className="text-gray-600 mb-5 leading-relaxed text-base">
              A dual-modal diagnostic engine. A health worker captures a photo of the rash AND a 10-second audio recording of the cough.
            </p>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-gray-600 text-base"><ChevronRight className="w-4 h-4 text-indigo-500 shrink-0"/> Visual (60%): Identifies Koplik spots, maculopapular progression.</li>
              <li className="flex items-center gap-3 text-gray-600 text-base"><ChevronRight className="w-4 h-4 text-purple-500 shrink-0"/> Acoustic (40%): Detects barking cough signature of Measles.</li>
            </ul>
          </div>
        </section>

        {/* TEAM SECTION */}
        <section id="team">
          <h2 className="text-3xl font-bold text-gray-800 mb-8 flex items-center gap-3">
            <Users className="text-indigo-500" /> The Team
          </h2>
          {config?.team_members && config.team_members.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {config.team_members.map((member, i) => (
                <div key={i} className="glass p-8 rounded-3xl text-center hover:shadow-lg transition-all">
                  <div className="w-24 h-24 mx-auto rounded-2xl overflow-hidden mb-5 border-2 border-gray-200 shadow-sm">
                    <img
                      src={member.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name) + '&background=6366f1&color=fff&size=150'}
                      alt={member.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name) + '&background=6366f1&color=fff&size=150'; }}
                    />
                  </div>
                  <h4 className="font-bold text-lg text-gray-800">{member.name}</h4>
                  <p className="text-indigo-600 text-sm font-semibold mb-2">{member.role}</p>
                  <p className="text-xs text-gray-400">{member.email}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-gray-400 glass rounded-3xl text-base">
              No team members configured yet. Add them in the Admin Panel.
            </div>
          )}
        </section>

        {/* ARCHITECTURE */}
        <section id="architecture">
          <h2 className="text-3xl font-bold text-gray-800 mb-8 flex items-center gap-3">
            <Server className="text-teal-500" /> Technical Architecture
          </h2>
          
          <div className="glass p-8 sm:p-10 rounded-3xl mb-8">
            <div className="flex flex-col md:flex-row gap-10 items-start justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Live System Config</h3>
                <p className="text-sm text-gray-400 mb-6">Auto-synced from backend <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">/docs-data</code></p>
                {sysData ? (
                  <div className="space-y-4">
                    {[
                      { label: 'Orchestrator', value: sysData.architecture.orchestrator.name, color: 'text-gray-800' },
                      { label: 'Cloud Model', value: sysData.architecture.models.cloud, color: 'text-indigo-600' },
                      { label: 'Edge Model', value: sysData.architecture.models.edge, color: 'text-purple-600' },
                      { label: 'Guardrails', value: sysData.architecture.guardrails.name, color: 'text-teal-600' },
                      { label: 'RAG Vector DB', value: sysData.architecture.rag.database, color: 'text-amber-600' },
                    ].map(({ label, value, color }, i) => (
                      <div key={i} className="flex justify-between items-center pb-3 border-b border-gray-100">
                        <span className="text-sm text-gray-400">{label}</span>
                        <span className={`text-sm font-semibold ${color}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-red-500">Failed to load system data.</p>
                )}
              </div>
              
              <div className="flex-1 bg-gray-50 border border-gray-100 p-6 rounded-2xl w-full">
                <h4 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-5">Data Flow</h4>
                <div className="space-y-3">
                  {[
                    { step: '1. Input', detail: 'React + Zod', bg: 'bg-white border-gray-200', text: 'text-gray-800' },
                    { step: '2. Orchestrator', detail: 'LangGraph Route', bg: 'bg-indigo-50 border-indigo-100', text: 'text-indigo-600' },
                    { step: '3. Inference & RAG', detail: 'Gemini + pgvector', bg: 'bg-purple-50 border-purple-100', text: 'text-purple-600' },
                    { step: '4. MCP Guardrails', detail: 'WHO Protocols', bg: 'bg-teal-50 border-teal-100', text: 'text-teal-600' },
                  ].map(({ step, detail, bg, text }, i) => (
                    <div key={i}>
                      <div className={`p-4 ${bg} rounded-xl border flex items-center justify-between`}>
                        <span className={`text-sm font-bold ${text}`}>{step}</span>
                        <span className="text-xs text-gray-400">{detail}</span>
                      </div>
                      {i < 3 && <div className="flex justify-center text-gray-300 text-lg py-1">↓</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECURITY & RAG */}
        <section className="grid md:grid-cols-3 gap-6">
          <div className="glass p-7 rounded-3xl">
            <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-amber-500"/>
            </div>
            <h4 className="text-lg font-bold text-gray-800 mb-2">MCP Guardrails</h4>
            <p className="text-sm text-gray-500 leading-relaxed">LLMs hallucinate medical advice. We use an MCP Server over SSE to strictly enforce hardcoded WHO protocols and cross-reference contraindicated medications.</p>
          </div>
          <div className="glass p-7 rounded-3xl">
            <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-blue-500"/>
            </div>
            <h4 className="text-lg font-bold text-gray-800 mb-2">pgvector RAG</h4>
            <p className="text-sm text-gray-500 leading-relaxed">Agentic Contextual RAG prepends geographic context before similarity search on WHO literature chunks via text-embedding-004.</p>
          </div>
          <div className="glass p-7 rounded-3xl">
            <div className="w-12 h-12 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center mb-4">
              <Activity className="w-6 h-6 text-red-500"/>
            </div>
            <h4 className="text-lg font-bold text-gray-800 mb-2">Outbreak Alerts</h4>
            <p className="text-sm text-gray-500 leading-relaxed">Automated n8n webhook triggers when ≥3 cases are detected in the same zip code within 24h, dispatching SMS alerts via Twilio.</p>
          </div>
        </section>
      </main>
      
      <footer className="text-center mt-24 pb-8 text-sm text-gray-400">
        EchoDerm AI — Infinity AI BuildFest 2026.
      </footer>
    </div>
  );
}

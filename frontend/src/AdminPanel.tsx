import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Save, Eye, EyeOff, Users, Plus, Trash2, Calendar } from 'lucide-react';

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

export default function AdminPanel() {
  const [password, setPassword] = useState('');
  
  const [config, setConfig] = useState<DocsConfig>({
    is_public: false,
    start_date: '',
    end_date: '',
    team_members: []
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{type: 'error' | 'success', text: string} | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/docs/config`)
      .then(r => r.json())
      .then(d => {
        if (d.raw_config) {
          setConfig({
            is_public: d.raw_config.is_public || false,
            start_date: d.raw_config.start_date || '',
            end_date: d.raw_config.end_date || '',
            team_members: d.raw_config.team_members || []
          });
        }
      })
      .catch(e => console.error(e));
  }, []);

  const handleSave = async () => {
    if (!password) {
      setMsg({ type: 'error', text: 'Admin password required.' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/docs/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password
        },
        body: JSON.stringify({
          ...config,
          start_date: config.start_date ? new Date(config.start_date).toISOString() : null,
          end_date: config.end_date ? new Date(config.end_date).toISOString() : null
        })
      });
      if (!res.ok) {
        throw new Error('Authentication failed or server error');
      }
      setMsg({ type: 'success', text: 'Configuration saved successfully!' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    setConfig({
      ...config,
      team_members: [...config.team_members, { name: '', role: '', email: '', avatar_url: '' }]
    });
  };

  const handleUpdateMember = (index: number, field: keyof TeamMember, value: string) => {
    const newMembers = [...config.team_members];
    newMembers[index][field] = value;
    setConfig({ ...config, team_members: newMembers });
  };

  const handleRemoveMember = (index: number) => {
    const newMembers = [...config.team_members];
    newMembers.splice(index, 1);
    setConfig({ ...config, team_members: newMembers });
  };

  const formatForInput = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-gray-700 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        
        <header className="flex justify-between items-center mb-10 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center border border-indigo-200">
                <Settings className="w-5 h-5 text-indigo-600" />
              </div>
              Docs Admin Panel
            </h1>
            <p className="text-sm text-gray-400 mt-2">Manage Pitch Deck visibility and Team Showcase</p>
          </div>
          <Link to="/docs" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
            View /docs Page
          </Link>
        </header>

        {msg && (
          <div className={`mb-6 p-5 rounded-xl text-sm font-semibold border ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            {msg.text}
          </div>
        )}

        {/* ADMIN AUTH */}
        <div className="glass p-6 rounded-2xl mb-8 border border-indigo-100">
          <label className="block text-sm font-bold text-gray-700 mb-2">Admin Password</label>
          <input 
            type="password" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter admin password to save changes"
            className="w-full px-5 py-3.5 rounded-xl bg-white border border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-base"
          />
        </div>

        {/* VISIBILITY CONTROLS */}
        <section className="glass p-6 sm:p-8 rounded-3xl mb-8 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Eye className="text-teal-500 w-5 h-5" /> Access & Visibility
          </h2>
          
          <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-gray-100 mb-6">
            <div>
              <p className="font-bold text-gray-800">Global Visibility</p>
              <p className="text-sm text-gray-400 mt-1">If OFF, /docs is completely hidden.</p>
            </div>
            <button 
              onClick={() => setConfig({...config, is_public: !config.is_public})}
              className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-sm ${
                config.is_public
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {config.is_public ? <><Eye className="w-4 h-4"/> ON</> : <><EyeOff className="w-4 h-4"/> OFF</>}
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500"/> Start Time
              </label>
              <input 
                type="datetime-local" 
                value={formatForInput(config.start_date)}
                onChange={e => setConfig({...config, start_date: e.target.value})}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-xs text-gray-400 mt-2">Leave blank for no start restriction.</p>
            </div>
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-500"/> End Time
              </label>
              <input 
                type="datetime-local" 
                value={formatForInput(config.end_date)}
                onChange={e => setConfig({...config, end_date: e.target.value})}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-xs text-gray-400 mt-2">Leave blank for no end restriction.</p>
            </div>
          </div>
        </section>

        {/* TEAM SHOWCASE */}
        <section className="glass p-6 sm:p-8 rounded-3xl mb-8 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="text-purple-500 w-5 h-5" /> Team Showcase
            </h2>
            <button onClick={handleAddMember} className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-sm font-bold transition-all flex items-center gap-1 border border-indigo-200">
              <Plus className="w-4 h-4"/> Add Member
            </button>
          </div>

          {config.team_members.map((member, i) => (
            <div key={i} className="p-5 bg-gray-50 rounded-2xl mb-4 relative group border border-gray-100">
              <button 
                onClick={() => handleRemoveMember(i)}
                className="absolute top-4 right-4 p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-colors border border-red-100"
              >
                <Trash2 className="w-4 h-4"/>
              </button>
              
              <div className="grid md:grid-cols-2 gap-4 pr-14">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Full Name</label>
                  <input type="text" value={member.name} onChange={e => handleUpdateMember(i, 'name', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Role</label>
                  <input type="text" value={member.role} onChange={e => handleUpdateMember(i, 'role', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Lead Engineer" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Email</label>
                  <input type="email" value={member.email} onChange={e => handleUpdateMember(i, 'email', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Avatar URL</label>
                  <input type="text" value={member.avatar_url} onChange={e => handleUpdateMember(i, 'avatar_url', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="https://..." />
                </div>
              </div>
            </div>
          ))}
          {config.team_members.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No team members added yet.</p>
          )}
        </section>

        {/* SAVE BUTTON */}
        <button 
          onClick={handleSave}
          disabled={loading}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-xl flex items-center justify-center gap-2 text-white ${
            loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200 active:scale-[0.98]'
          }`}
        >
          {loading ? 'Saving...' : <><Save className="w-5 h-5"/> Save Configuration</>}
        </button>

      </div>
    </div>
  );
}

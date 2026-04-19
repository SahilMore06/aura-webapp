/**
 * AURA — Settings Page
 * Profile editing, alert thresholds, appearance.
 * All changes persist to Supabase user_profiles and auth metadata.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Settings2, Bell, Shield, Moon, Sun, User, LogOut, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { useActivityTracker } from '../hooks/useActivityTracker';
import { activityLogger } from '../lib/activityLogger';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'appearance';

export function Settings() {
  const navigate    = useNavigate();
  const { session, profile, loadProfile, signOut } = useAuthStore();
  const { trackEvent } = useActivityTracker('page_visit', { page: 'settings' });

  // Profile fields
  const [displayName,  setDisplayName]  = useState(profile?.display_name  || session?.user?.user_metadata?.display_name || '');
  const [city,         setCity]         = useState(profile?.city          || '');
  const [threshold,    setThreshold]    = useState(profile?.aqi_threshold ?? 100);
  const [notifications,setNotifications]= useState(profile?.notifications_enabled ?? true);
  const [theme,        setTheme]        = useState('dark');
  const [activeTab,    setActiveTab]    = useState<SettingsTab>('profile');

  // UI state
  const [saving,   setSaving]   = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync profile values when profile loads from DB
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setCity(profile.city || '');
      setThreshold(profile.aqi_threshold ?? 100);
      setNotifications(profile.notifications_enabled ?? true);
    }
  }, [profile]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setSaveMsg({ type, text });
    setTimeout(() => setSaveMsg(null), 3000);
  };

  // ── Save profile to Supabase ────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user) return;
    setSaving(true);
    try {
      const updates = {
        id:           session.user.id,
        display_name: displayName.trim(),
        city:         city.trim(),
        updated_at:   new Date().toISOString(),
      };

      const { error: profileErr } = await supabase
        .from('user_profiles')
        .upsert(updates, { onConflict: 'id' });
      if (profileErr) throw profileErr;

      // Also sync display_name to Auth metadata
      if (displayName !== session.user.user_metadata?.display_name) {
        await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
      }

      // Reload profile in store
      await loadProfile(session.user.id);

      trackEvent('settings_saved', { fields: ['display_name', 'city'] });
      showMsg('success', 'Profile saved successfully!');
    } catch (err: any) {
      showMsg('error', err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // ── Save notification settings ──────────────────────────────
  const handleSaveAlerts = async () => {
    if (!session?.user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ aqi_threshold: threshold, notifications_enabled: notifications })
        .eq('id', session.user.id);
      if (error) throw error;

      trackEvent('settings_saved', { fields: ['aqi_threshold', 'notifications_enabled'], threshold, notifications });
      showMsg('success', 'Alert settings saved!');
    } catch (err: any) {
      showMsg('error', err.message || 'Failed to save alert settings.');
    } finally {
      setSaving(false);
    }
  };

  // ── Sign out ────────────────────────────────────────────────
  const handleSignOut = async () => {
    trackEvent('logout');
    await signOut();
    navigate('/auth');
  };

  const tabs: { id: SettingsTab; icon: React.ElementType; label: string }[] = [
    { id: 'profile',      icon: User,     label: 'Profile' },
    { id: 'notifications',icon: Bell,     label: 'Notifications' },
    { id: 'security',     icon: Shield,   label: 'Security & Privacy' },
    { id: 'appearance',   icon: Moon,     label: 'Appearance' },
  ];

  const userInitial = displayName?.charAt(0)?.toUpperCase() || session?.user?.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen bg-bg text-text-primary p-6 pb-32 overflow-y-auto"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-surface border border-stroke flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-[#00D4AA]" />
          </div>
          <div>
            <h1 className="text-2xl font-display italic">Settings</h1>
            <p className="text-muted text-sm">{session?.user?.email}</p>
          </div>
        </motion.header>

        {/* Global save message */}
        {saveMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-xl flex items-center gap-3 ${
              saveMsg.type === 'success'
                ? 'bg-[#00D4AA]/10 border border-[#00D4AA]/20'
                : 'bg-red-500/10 border border-red-500/20'
            }`}
          >
            {saveMsg.type === 'success'
              ? <CheckCircle className="w-5 h-5 text-[#00D4AA] shrink-0" />
              : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            }
            <p className={`text-sm ${saveMsg.type === 'success' ? 'text-[#00D4AA]' : 'text-red-300'}`}>
              {saveMsg.text}
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Sidebar Nav */}
          <motion.nav
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-1 space-y-2"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-surface text-text-primary border border-stroke'
                    : 'text-muted hover:bg-stroke/50 hover:text-text-primary'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-[#00D4AA]' : ''}`} />
                {tab.label}
              </button>
            ))}

            <div className="pt-8 mt-8 border-t border-stroke">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#FF5252] hover:bg-[#FF5252]/10 transition-colors"
                id="sign-out-btn"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </motion.nav>

          {/* Main Content */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-2 space-y-6"
          >
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <section className="bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6">
                <h2 className="text-xl font-display italic mb-6">Profile Information</h2>

                <div className="flex items-center gap-6 mb-8">
                  <div className="w-20 h-20 rounded-full accent-gradient flex items-center justify-center text-3xl font-bold text-bg shadow-[0_0_30px_rgba(0,212,170,0.2)]">
                    {userInitial}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">{displayName || 'User'}</h3>
                    <p className="text-muted text-sm">{session?.user?.email}</p>
                    <span className={`mt-1 inline-block text-xs font-bold px-2 py-0.5 rounded-full ${
                      profile?.role === 'admin' ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-stroke text-muted'
                    }`}>
                      {profile?.role || 'user'}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-bg border border-stroke rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-[#00D4AA] focus:ring-1 focus:ring-[#00D4AA] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Mumbai, Maharashtra"
                      className="w-full bg-bg border border-stroke rounded-xl px-4 py-2.5 text-text-primary placeholder:text-muted focus:outline-none focus:border-[#00D4AA] focus:ring-1 focus:ring-[#00D4AA] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">Email</label>
                    <input
                      type="email"
                      defaultValue={session?.user?.email || ''}
                      disabled
                      className="w-full bg-bg border border-stroke/50 rounded-xl px-4 py-2.5 text-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted mt-1">Email cannot be changed here.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#00D4AA] text-bg font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </form>
              </section>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <section className="bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-display italic">Alert Thresholds</h2>
                    <p className="text-muted text-sm mt-1">Configure when you receive AQI alerts.</p>
                  </div>
                  <button
                    onClick={() => setNotifications(!notifications)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${notifications ? 'bg-[#00D4AA]' : 'bg-stroke'}`}
                    aria-label="Toggle notifications"
                  >
                    <div className={`w-4 h-4 bg-bg rounded-full transition-transform ${notifications ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-muted">AQI Alert Threshold</label>
                      <span className="text-[#00D4AA] font-bold">{threshold}</span>
                    </div>
                    <input
                      type="range" min="0" max="300" value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-[#00D4AA] bg-stroke rounded-lg appearance-none h-2"
                    />
                    <div className="flex justify-between text-xs text-muted mt-2">
                      <span>Good (0)</span><span>Moderate (100)</span><span>Hazardous (300)</span>
                    </div>
                  </div>

                  <div className="bg-bg border border-stroke rounded-xl p-4 flex items-start gap-3">
                    <Bell className="w-5 h-5 text-[#FF9E40] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Alert when AQI exceeds {threshold}</h4>
                      <p className="text-xs text-muted mt-1">
                        Notifications are currently <strong>{notifications ? 'enabled' : 'disabled'}</strong>.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveAlerts}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#00D4AA] text-bg font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {saving ? 'Saving…' : 'Save Alert Settings'}
                  </button>
                </div>
              </section>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <section className="bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6 space-y-6">
                <h2 className="text-xl font-display italic">Security & Privacy</h2>
                <div className="bg-bg border border-stroke rounded-xl p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Account created</span>
                    <span className="text-muted text-sm">
                      {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Last seen</span>
                    <span className="text-muted text-sm">
                      {profile?.last_seen_at ? new Date(profile.last_seen_at).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Auth provider</span>
                    <span className="text-muted text-sm capitalize">
                      {session?.user?.app_metadata?.provider || 'email'}
                    </span>
                  </div>
                </div>
                <div className="bg-[#00D4AA]/5 border border-[#00D4AA]/20 rounded-xl p-4">
                  <p className="text-sm text-[#00D4AA] font-medium mb-1">✅ Row Level Security Active</p>
                  <p className="text-xs text-muted">Your data is protected. Only you can access your own records.</p>
                </div>
              </section>
            )}

            {/* Appearance Tab */}
            {activeTab === 'appearance' && (
              <section className="bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6">
                <h2 className="text-xl font-display italic mb-6">Appearance</h2>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'light', icon: Sun,  label: 'Light Mode' },
                    { id: 'dark',  icon: Moon, label: 'Dark Mode' },
                  ].map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      onClick={() => setTheme(id)}
                      className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border transition-all ${
                        theme === id ? 'border-[#00D4AA] bg-stroke/50' : 'border-stroke hover:border-muted'
                      }`}
                    >
                      <Icon className={`w-8 h-8 ${theme === id ? 'text-[#00D4AA]' : 'text-muted'}`} />
                      <span className={`font-medium ${theme === id ? 'text-text-primary' : 'text-muted'}`}>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-4">Full theme switching coming soon.</p>
              </section>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

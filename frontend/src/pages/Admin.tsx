/**
 * AURA — Admin Dashboard
 * Access: /admin (role = admin OR isAdminMock)
 *
 * Shows:
 * - Platform overview stats (users, sessions, events today)
 * - Recent activity log across all users
 * - User list with last seen
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Users, Activity, Shield, Clock, RefreshCw, TrendingUp,
  LogIn, LogOut, MapPin, Settings2, Download, Eye, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useActivityTracker } from '../hooks/useActivityTracker';

// ── Helpers ───────────────────────────────────────────────────
const ACTION_ICONS: Record<string, React.ElementType> = {
  login:        LogIn,
  logout:       LogOut,
  page_visit:   Eye,
  signup:       Users,
  map_city_selected: MapPin,
  settings_saved: Settings2,
  report_downloaded: Download,
};

const ACTION_COLORS: Record<string, string> = {
  login:       '#00D4AA',
  logout:      '#FF9E40',
  signup:      '#00E676',
  page_visit:  '#60A5FA',
  error_occurred: '#FF5252',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, delay = 0 }: {
  icon: React.ElementType; label: string; value: string | number;
  color: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay }}
      className="bg-surface border border-stroke rounded-2xl p-5 flex items-center gap-4"
    >
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}18` }}>
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div>
        <p className="text-muted text-sm">{label}</p>
        <p className="text-2xl font-display italic font-bold text-text-primary">{value}</p>
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export function Admin() {
  const { isAdminMock } = useAuthStore();
  const { trackEvent } = useActivityTracker('page_visit', { page: 'admin' });

  const [logs, setLogs]         = useState<any[]>([]);
  const [users, setUsers]       = useState<any[]>([]);
  const [stats, setStats]       = useState({ totalUsers: 0, todayEvents: 0, activeToday: 0, totalEvents: 0 });
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      // If admin mock, show placeholder data
      if (isAdminMock) {
        setStats({ totalUsers: 1, todayEvents: 12, activeToday: 1, totalEvents: 47 });
        setLogs([
          { id: '1', user_email: 'admin@aura.ai', action_type: 'login', page: '/dashboard', created_at: new Date().toISOString(), metadata: {} },
          { id: '2', user_email: 'admin@aura.ai', action_type: 'page_visit', page: '/map', created_at: new Date(Date.now() - 60000).toISOString(), metadata: {} },
        ]);
        setUsers([{ id: 'admin-mock', display_name: 'Admin', email: 'admin@aura.ai', role: 'admin', last_seen_at: new Date().toISOString(), total_actions: 47 }]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Real data from Supabase
      const [logsRes, summaryRes] = await Promise.all([
        supabase
          .from('user_activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('admin_activity_summary')
          .select('*'),
      ]);

      const allLogs = logsRes.data || [];
      const summary = summaryRes.data || [];

      const today = new Date().toISOString().slice(0, 10);
      const todayEvents = allLogs.filter(l => l.created_at.startsWith(today)).length;
      const activeToday = new Set(allLogs.filter(l => l.created_at.startsWith(today)).map(l => l.user_id)).size;

      setLogs(allLogs);
      setUsers(summary);
      setStats({
        totalUsers:  summary.length,
        todayEvents,
        activeToday,
        totalEvents: allLogs.length,
      });

    } catch (err) {
      console.error('[Admin] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Action type distribution
  const actionCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.action_type] = (acc[l.action_type] || 0) + 1;
    return acc;
  }, {});
  const topActions = Object.entries(actionCounts)
    .sort(([,a],[,b]) => (b as number) - (a as number))
    .slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen bg-bg text-text-primary p-6 pb-32 overflow-y-auto"
    >
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface border border-stroke flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#00D4AA]" />
            </div>
            <div>
              <h1 className="text-2xl font-display italic">Admin Dashboard</h1>
              <p className="text-muted text-sm">Platform activity overview</p>
            </div>
          </div>
          <button
            onClick={() => { trackEvent('button_click', { button: 'admin_refresh' }); fetchData(); }}
            className="flex items-center gap-2 text-sm text-muted hover:text-[#00D4AA] transition-colors bg-surface border border-stroke rounded-xl px-4 py-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00D4AA]' : ''}`} />
            Refresh
          </button>
        </motion.header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#00D4AA]" />
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Users}     label="Total Users"     value={stats.totalUsers}  color="#00D4AA" delay={0.1} />
              <StatCard icon={Activity}  label="Events Today"    value={stats.todayEvents}  color="#60A5FA" delay={0.15} />
              <StatCard icon={TrendingUp}label="Active Today"    value={stats.activeToday}  color="#00E676" delay={0.2} />
              <StatCard icon={Clock}     label="Total Events"    value={stats.totalEvents}  color="#FFE57F" delay={0.25} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Action breakdown */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-surface border border-stroke rounded-3xl p-6"
              >
                <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#00D4AA]" /> Top Actions
                </h2>
                <div className="space-y-3">
                  {topActions.length === 0 ? (
                    <p className="text-muted text-sm">No events recorded yet.</p>
                  ) : topActions.map(([action, count]) => {
                    const total = logs.length || 1;
                    const pct = Math.round(((count as number) / total) * 100);
                    const color = ACTION_COLORS[action] || '#60A5FA';
                    return (
                      <div key={action}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-text-primary font-medium capitalize">{action.replace(/_/g, ' ')}</span>
                          <span className="text-muted">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-bg rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* User list */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="bg-surface border border-stroke rounded-3xl p-6 lg:col-span-2"
              >
                <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#00D4AA]" /> Users
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted text-xs uppercase tracking-wider border-b border-stroke">
                        <th className="text-left py-2 pr-4">Name</th>
                        <th className="text-left py-2 pr-4">Role</th>
                        <th className="text-left py-2 pr-4">Actions</th>
                        <th className="text-left py-2">Last seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke/50">
                      {users.length === 0 ? (
                        <tr><td colSpan={4} className="py-4 text-muted">No users found.</td></tr>
                      ) : users.map((u) => (
                        <tr key={u.user_id || u.id} className="hover:bg-bg/40 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-text-primary truncate max-w-[140px]">{u.display_name || '—'}</div>
                            <div className="text-muted text-xs truncate max-w-[140px]">{u.email}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              u.role === 'admin' ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-stroke text-muted'
                            }`}>{u.role || 'user'}</span>
                          </td>
                          <td className="py-3 pr-4 text-text-primary font-mono">{u.total_actions || 0}</td>
                          <td className="py-3 text-muted text-xs">{u.last_seen_at ? timeAgo(u.last_seen_at) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </div>

            {/* Activity feed */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-surface border border-stroke rounded-3xl p-6"
            >
              <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#00D4AA]" /> Recent Activity
                <span className="text-xs text-muted font-normal ml-auto">Last 50 events</span>
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {logs.length === 0 ? (
                  <p className="text-muted text-sm py-4">No activity recorded yet.</p>
                ) : logs.map((log) => {
                  const Icon = ACTION_ICONS[log.action_type] || Activity;
                  const color = ACTION_COLORS[log.action_type] || '#60A5FA';
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-xl hover:bg-bg/60 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center mt-0.5"
                        style={{ backgroundColor: `${color}18` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-text-primary capitalize">
                            {log.action_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-muted shrink-0">{timeAgo(log.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                          <span className="truncate">{log.user_email || 'unknown'}</span>
                          {log.page && <><span>·</span><span className="text-[#00D4AA]/80">{log.page}</span></>}
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <p className="text-[10px] text-muted/60 mt-0.5 truncate font-mono">
                            {JSON.stringify(log.metadata)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}

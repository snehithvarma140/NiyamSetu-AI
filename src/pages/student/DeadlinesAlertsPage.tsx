import React, { useEffect, useState } from 'react';
import { Bell, Calendar, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { StatusText } from '../../components/ui/StatusText';
import type { AlertItem, DeadlineTask } from '../../types/niyamsetu';

export const DeadlinesAlertsPage: React.FC = () => {
  const { token, lang, overview } = useApp();
  const [deadlines, setDeadlines] = useState<DeadlineTask[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [dRes, aRes] = await Promise.all([
        apiRequest<{ deadlines: DeadlineTask[] }>('/deadlines', { token }),
        apiRequest<{ alerts: AlertItem[] }>('/alerts', { token }),
      ]);
      setDeadlines(dRes.deadlines);
      setAlerts(aRes.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load deadlines and alerts.');
    }
  };

  useEffect(() => {
    void loadData();
  }, [token, overview]);

  const toggleTask = async (dl: DeadlineTask) => {
    if (!token) return;
    try {
      setError(null);
      const nextStatus = dl.status === 'completed' ? 'pending' : 'completed';
      await apiRequest(`/deadlines/${dl.id}`, {
        method: 'PATCH',
        token,
        body: { status: nextStatus },
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update task status.');
    }
  };

  const markAlertRead = async (id: string) => {
    if (!token) return;
    try {
      setError(null);
      await apiRequest(`/alerts/${id}/read`, { method: 'PATCH', token });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark alert as read.');
    }
  };

  const filteredDeadlines = deadlines.filter((dl) => {
    if (statusFilter !== 'ALL' && dl.status !== statusFilter) return false;
    if (roleFilter !== 'ALL' && dl.owner_role !== roleFilter) return false;
    return true;
  });

  const filteredAlerts = alerts.filter((a) => {
    if (roleFilter !== 'ALL' && a.target_role !== 'ALL' && a.target_role !== roleFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Smart Deadline &amp; Compliance Tracker
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Track active submission deadlines and Policy Ripple change alerts across all 16 schemes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter deadlines by status"
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium min-h-[36px]"
          >
            <option value="ALL">All Statuses ({deadlines.length})</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role owner"
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium min-h-[36px]"
          >
            <option value="ALL">All Roles</option>
            <option value="STUDENT">Student Tasks</option>
            <option value="ADMIN">Officer Tasks</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Compliance Tasks &amp; Deadlines
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredDeadlines.length} of {deadlines.length} tracked
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto pr-1">
            {filteredDeadlines.map((dl) => (
              <div key={dl.id} className="py-3.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleTask(dl)}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                      dl.status === 'completed'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                    }`}
                    aria-label="Toggle task completion"
                  >
                    {dl.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                  <div className="space-y-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {lang === 'te' ? dl.title_te : dl.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Due {dl.due_date}</span>
                      </span>
                      <span>·</span>
                      <span>Owner: {dl.owner_role}</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 pt-0.5">
                  <StatusText status={dl.status} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Policy Ripple Alerts
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredAlerts.filter((a) => !a.read).length} unread
            </span>
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="py-6 text-sm text-slate-500">No alerts match the selected filter.</div>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {filteredAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-md border p-3.5 space-y-2 ${
                    a.read
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                      : 'border-teal-700/40 dark:border-cyan-500/40 bg-teal-50/40 dark:bg-cyan-950/20'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-teal-800 dark:text-cyan-300">
                      <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{a.priority === 'high' ? 'Important Update' : 'Notice'}</span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {new Date(a.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    {lang === 'te' ? a.message_te : a.message}
                  </p>
                  {!a.read && (
                    <button
                      type="button"
                      onClick={() => markAlertRead(a.id)}
                      className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

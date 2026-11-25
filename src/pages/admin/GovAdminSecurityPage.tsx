import React, { useEffect, useState } from 'react';
import { Code2, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { DeveloperDashboard } from '../developer/DeveloperDashboard';
import type { UserProfile, UserRole } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

export const GovAdminSecurityPage: React.FC = () => {
  const { token, user } = useApp();
  const [tab, setTab] = useState<'roles' | 'telemetry'>('roles');
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deptEdits, setDeptEdits] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOfficer = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';
  const isRoot = user?.role === 'PLATFORM_ADMIN';

  const loadAccounts = async () => {
    if (!token || !isOfficer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ users: UserProfile[] }>('/gov/users', { token });
      setAccounts(res.users || []);
      const map: Record<string, string> = {};
      (res.users || []).forEach((u) => {
        map[u.id] = u.department || '';
      });
      setDeptEdits(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load user directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, [token, user?.role]);

  const handleRoleChange = async (targetUser: UserProfile, nextRole: UserRole) => {
    if (!token || !isRoot) return;
    setUpdatingId(targetUser.id);
    setNotice(null);
    setError(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(`/gov/users/${targetUser.id}/role`, {
        method: 'PATCH',
        token,
        body: {
          role: nextRole,
          department: deptEdits[targetUser.id] ?? targetUser.department ?? '',
        },
      });
      setAccounts((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      setNotice(`Updated ${res.user.name} to ${res.user.role}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Administration, Roles &amp; System Telemetry
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage portal authorization roles, department assignments, schema registry health, and
            live backend API/Firestore/Supabase diagnostics strictly within the Government Portal.
          </p>
        </div>

        <div
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'roles'}
            onClick={() => setTab('roles')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              tab === 'roles'
                ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>User Roles &amp; Security</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'telemetry'}
            onClick={() => setTab('telemetry')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              tab === 'telemetry'
                ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Schema, API &amp; DB Telemetry</span>
          </button>
        </div>
      </div>

      <AdminGuardBanner />

      {tab === 'roles' && isOfficer && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Portal Access &amp; Department Roster ({accounts.length})
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRoot
                  ? 'Root Governance Administrator privileges active: you can assign Citizen vs Government Officer roles.'
                  : 'Viewing directory as Government Officer (ADMIN). Only Root Administrator (PLATFORM_ADMIN) may promote/demote portal roles.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAccounts()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {notice && (
            <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-semibold">User</th>
                  <th className="py-2.5 px-4 font-semibold">Email</th>
                  <th className="py-2.5 px-4 font-semibold">Department</th>
                  <th className="py-2.5 px-4 font-semibold">Portal Role</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {acc.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {acc.email}
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="text"
                        disabled={!isRoot}
                        value={deptEdits[acc.id] ?? ''}
                        onChange={(e) =>
                          setDeptEdits((prev) => ({ ...prev, [acc.id]: e.target.value }))
                        }
                        placeholder="Department / Nodal Cell"
                        className="rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs w-44 disabled:opacity-70"
                      />
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-teal-800 dark:text-cyan-300">
                      {acc.role}
                    </td>
                    <td className="py-2.5 px-4">
                      {isRoot ? (
                        <select
                          aria-label={`Change role for ${acc.name}`}
                          disabled={updatingId === acc.id}
                          value={acc.role}
                          onChange={(e) => void handleRoleChange(acc, e.target.value as UserRole)}
                          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                        >
                          <option value="STUDENT">STUDENT (Citizen Portal)</option>
                          <option value="ADMIN">ADMIN (Gov Officer)</option>
                          <option value="PLATFORM_ADMIN">PLATFORM_ADMIN (Root Gov)</option>
                        </select>
                      ) : (
                        <span className="text-slate-400">Root only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'telemetry' && isOfficer && <DeveloperDashboard />}
    </div>
  );
};

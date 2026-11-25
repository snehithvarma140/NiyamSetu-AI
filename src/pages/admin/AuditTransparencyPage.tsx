import React, { useEffect, useState } from 'react';
import { PlusCircle, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { StatusText } from '../../components/ui/StatusText';
import type { AuditLogEntry, DocumentRecord, MonitoredSource } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

export const AuditTransparencyPage: React.FC = () => {
  const { token, user, overview } = useApp();
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [sources, setSources] = useState<MonitoredSource[]>([]);
  const [docNumber, setDocNumber] = useState('SN-2025/01');
  const [authority, setAuthority] = useState('');
  const [authResult, setAuthResult] = useState<{
    result: string;
    summary: string;
    matched_document: DocumentRecord | null;
  } | null>(null);

  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceDept, setNewSourceDept] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceFreq, setNewSourceFreq] = useState('Daily');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceFeedback, setSourceFeedback] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const loadAll = async () => {
    try {
      const sRes = await apiRequest<{ sources: MonitoredSource[] }>('/sources', { token });
      setSources(sRes.sources);
      if (token && isAdmin) {
        const aRes = await apiRequest<{ audit_log: AuditLogEntry[] }>('/audit', { token });
        setAuditLog(aRes.audit_log);
      }
    } catch (err) {
      setSourceFeedback(err instanceof Error ? err.message : 'Unable to load source registry.');
    }
  };

  useEffect(() => {
    void loadAll();
  }, [token, user?.role, overview]);

  const scanSource = async (id: string) => {
    if (!token) return;
    setSourceFeedback(null);
    try {
      await apiRequest(`/sources/${id}/scan`, { method: 'POST', token });
      await loadAll();
    } catch (err) {
      setSourceFeedback(err instanceof Error ? err.message : 'Source scan failed.');
    }
  };

  const updateSourceStatus = async (
    id: string,
    last_status: MonitoredSource['last_status']
  ) => {
    if (!token) return;
    setSourceFeedback(null);
    try {
      await apiRequest(`/sources/${id}`, {
        method: 'PATCH',
        token,
        body: { last_status },
      });
      await loadAll();
    } catch (err) {
      setSourceFeedback(err instanceof Error ? err.message : 'Could not update source status.');
    }
  };

  const handleRegisterSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSourceSaving(true);
    setSourceFeedback(null);
    try {
      await apiRequest('/sources', {
        method: 'POST',
        token,
        body: {
          name: newSourceName.trim(),
          department: newSourceDept.trim(),
          url: newSourceUrl.trim(),
          check_frequency: newSourceFreq,
        },
      });
      setNewSourceName('');
      setNewSourceDept('');
      setNewSourceUrl('');
      setNewSourceFreq('Daily');
      setShowAddSource(false);
      setSourceFeedback('Official source added to monitor and logged in audit trail.');
      await loadAll();
    } catch (err) {
      setSourceFeedback(err instanceof Error ? err.message : 'Failed to register official source.');
    } finally {
      setSourceSaving(false);
    }
  };

  const checkSourceAuthenticity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSourceFeedback(null);
    try {
      const res = await apiRequest<{
        result: string;
        summary: string;
        matched_document: DocumentRecord | null;
      }>('/authenticity/check', {
        method: 'POST',
        token,
        body: { docNumber, authority },
      });
      setAuthResult(res);
    } catch (err) {
      setSourceFeedback(
        err instanceof Error ? err.message : 'Unable to check document against registry.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Transparency, Audit Trail & Official Source Monitor
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Inspect who approved rules, applied Policy Ripple updates, or ran checks, alongside
          monitored official sources and document source matching.
        </p>
      </div>

      <AdminGuardBanner />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Official Source Monitor */}
        <section className="lg:col-span-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Official Source Monitor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Discovered documents never become authoritative until verified in Human Review.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddSource((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{showAddSource ? 'Close Form' : 'Register Official Source'}</span>
              </button>
            )}
          </div>

          {sourceFeedback && (
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-300">
              {sourceFeedback}
            </div>
          )}

          {isAdmin && showAddSource && (
            <form
              onSubmit={handleRegisterSource}
              className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-3"
            >
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Add Department Circular Feed / Portal
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Source Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="e.g., AP Higher Education G.O. Portal"
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Issuing Department
                  </label>
                  <input
                    type="text"
                    required
                    value={newSourceDept}
                    onChange={(e) => setNewSourceDept(e.target.value)}
                    placeholder="e.g., Department of Higher Education"
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Official Source URL
                  </label>
                  <input
                    type="url"
                    required
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://goir.ap.gov.in/..."
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Check Frequency
                  </label>
                  <select
                    value={newSourceFreq}
                    onChange={(e) => setNewSourceFreq(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="Hourly">Hourly</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sourceSaving}
                  className="px-3.5 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {sourceSaving ? 'Saving...' : 'Save Official Source'}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {sources.map((src) => (
              <div key={src.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {src.name}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {src.department}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                    {src.url}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {src.check_frequency} · Last checked{' '}
                    {new Date(src.last_checked).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                  <StatusText
                    status={
                      src.last_status === 'new_document_found' ? 'needs_review' : src.last_status
                    }
                    labelOverride={
                      src.last_status === 'new_document_found' ? 'New document found' : undefined
                    }
                  />
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Status for ${src.name}`}
                        value={src.last_status}
                        onChange={(e) =>
                          void updateSourceStatus(
                            src.id,
                            e.target.value as MonitoredSource['last_status']
                          )
                        }
                        className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="verified">verified</option>
                        <option value="new_document_found">new_document_found</option>
                        <option value="unchanged">unchanged</option>
                        <option value="outdated">outdated</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void scanSource(src.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer whitespace-nowrap"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Check now</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Document Authenticity & Source Check */}
        <section className="lg:col-span-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Document Source & Version Check
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Matches document numbers against our verified registry to flag superseded or unknown
              circulars. Automated matching cannot prove a document is physically genuine or fake.
            </p>
          </div>

          <form onSubmit={checkSourceAuthenticity} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notification / Circular Number
                </label>
                <input
                  type="text"
                  required
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  placeholder="e.g., SN-2025/01"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Issuing Authority (Optional)
                </label>
                <input
                  type="text"
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                  placeholder="e.g., Higher Education"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Check Against Registry</span>
            </button>
          </form>

          {authResult && (
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5">
              <StatusText
                status={
                  authResult.result === 'matches_official_source'
                    ? 'verified'
                    : authResult.result === 'not_found'
                    ? 'cannot_verify'
                    : 'needs_review'
                }
                labelOverride={authResult.result.replace(/_/g, ' ')}
              />
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {authResult.summary}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Audit Trail */}
      {isAdmin && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Governance Audit Trail
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {auditLog.length} event(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-4 font-semibold">Actor</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                  <th className="py-2.5 px-4 font-semibold">Details</th>
                  <th className="py-2.5 px-4 font-semibold">Source Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {entry.actor_name}
                      </div>
                      <div className="font-mono text-slate-500 dark:text-slate-400">
                        {entry.actor_role}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {entry.action}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {entry.details}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {entry.source_reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { PolicyRipple3DScene } from '../../components/three/PolicyRipple3DScene';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import type { ImpactReport, RuleLink, RuleRecord } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

interface RippleResponse {
  amendment_rules: RuleRecord[];
  rule_links: RuleLink[];
  impact_reports: ImpactReport[];
}

export const PolicyRipplePage: React.FC = () => {
  const { token, user, overview, refreshOverview, ripplePulseTick, triggerRipplePulse, setPage } =
    useApp();
  const [data, setData] = useState<RippleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const loadRipple = async () => {
    try {
      setError(null);
      const res = await apiRequest<RippleResponse>('/ripple', { token });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Policy Ripple reports.');
    }
  };

  useEffect(() => {
    void loadRipple();
  }, [token, overview]);

  const handleItem = async (reportId: string, itemId: string, action: 'apply' | 'reject') => {
    if (!token) return;
    setError(null);
    try {
      await apiRequest(`/ripple/${reportId}/items/${itemId}`, {
        method: 'POST',
        token,
        body: { action },
      });
      triggerRipplePulse();
      await refreshOverview();
      await loadRipple();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply ripple update.');
    }
  };

  const applyAllReport = async (reportId: string) => {
    if (!token) return;
    setError(null);
    try {
      await apiRequest(`/ripple/${reportId}/apply-all`, { method: 'POST', token });
      triggerRipplePulse();
      await refreshOverview();
      await loadRipple();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply all updates.');
    }
  };

  const approvedAmendments =
    data?.amendment_rules.filter((r) => r.status === 'active').length ?? 0;
  const appliedCount =
    data?.impact_reports.reduce(
      (sum, rep) => sum + rep.items.filter((i) => i.status === 'applied').length,
      0
    ) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Policy Ripple Engine
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Trace how an approved rule change propagates across eligibility thresholds, procedure
            steps, required documents, FormSathi checks, deadlines, and alerts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPage('review')}
          className="px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer self-start whitespace-nowrap"
        >
          Go to Human Review Queue
        </button>
      </div>

      <AdminGuardBanner />

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Rule-to-Process Dependency Map
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {approvedAmendments} amendment rule(s) active · {appliedCount} ripple update(s) applied
          </span>
        </div>
        <PolicyRipple3DScene
          approvedAmendmentsCount={approvedAmendments}
          appliedImpactsCount={appliedCount}
          pulseKey={ripplePulseTick}
        />
      </section>

      {error && (
        <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Impact Reports */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Generated Impact Reports
        </h2>

        {data && data.impact_reports.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No impact reports generated yet
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              By design, Policy Ripple only traces approved rules. Open the Human Review Queue and
              approve one or more draft rules from Sample Amendment SN-2026/07 to generate
              traceable impact reports here.
            </p>
            <button
              type="button"
              onClick={() => setPage('review')}
              className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              Review Draft Rules Now
            </button>
          </div>
        ) : (
          data?.impact_reports.map((rep) => {
            const hasPending = rep.items.some((i) => i.status === 'proposed');
            const rule = data.amendment_rules.find((r) => r.id === rep.rule_id);
            return (
              <article
                key={rep.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {rep.title}
                      </h3>
                      <StatusText status={rep.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">
                        Generated {new Date(rep.generated_at).toLocaleTimeString('en-IN')}
                      </span>
                      {rule && (
                        <SourceCitationButton
                          documentId={rule.document_id}
                          pageNumber={rule.page_number}
                          clauseRef={rule.clause_reference}
                          label={`Source p.${rule.page_number} · cl.${rule.clause_reference}`}
                        />
                      )}
                    </div>
                  </div>

                  {isAdmin && hasPending && (
                    <button
                      type="button"
                      onClick={() => applyAllReport(rep.id)}
                      className="px-3.5 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Apply All Updates
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-4 font-semibold">Affected Component</th>
                        <th className="py-2.5 px-4 font-semibold">Previous → Proposed Change</th>
                        <th className="py-2.5 px-4 font-semibold">Status</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {rep.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 px-4 align-top">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.target_title}
                            </div>
                            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                              {item.linked_type}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top space-y-1">
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                              <span className="line-through text-rose-700 dark:text-rose-400">
                                {item.old_text}
                              </span>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {item.proposed_text}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400">
                              {item.reason}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <StatusText status={item.status} />
                          </td>
                          <td className="py-3 px-4 align-top text-right">
                            {isAdmin && item.status === 'proposed' ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleItem(rep.id, item.id, 'apply')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Apply</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleItem(rep.id, item.id, 'reject')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Skip</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
};

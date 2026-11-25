import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquareWarning,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { StatusText } from '../../components/ui/StatusText';
import {
  DonutChart,
  HorizontalBarChart,
  RuleOutcomeStackedChart,
  VerticalColumnChart,
} from '../../components/charts/AnalyticsCharts';
import type { GovMonitoringPayload } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

export const GovMonitoringPage: React.FC = () => {
  const { token, user } = useApp();
  const [data, setData] = useState<GovMonitoringPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOfficer = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const loadMonitoring = async () => {
    if (!token || !isOfficer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<GovMonitoringPayload>('/gov/monitoring', { token });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load application monitoring.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMonitoring();
  }, [token, user?.role]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Government Analytics, Scheme Usage &amp; Rule Usefulness
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Live statistics dynamically computed from citizen drafts, official portal confirmations,
            and readiness rule evaluations across all 16 schemes.
          </p>
        </div>

        {isOfficer && (
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMonitoring()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Telemetry</span>
            </button>
          </div>
        )}
      </div>

      <AdminGuardBanner />

      {error && (
        <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {isOfficer && data && (
        <>
          {/* Real KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Citizen Drafts', val: data.totals.drafts, icon: FileText },
              { label: 'Ready for Portal', val: data.totals.ready_for_portal, icon: Activity },
              { label: 'Confirmed Submitted', val: data.totals.submitted_confirmed, icon: CheckCircle2 },
              {
                label: 'Open Complaints',
                val: data.complaints_summary?.open ?? 0,
                icon: MessageSquareWarning,
              },
              {
                label: 'SLA Delayed Apps',
                val: data.feedback_intelligence?.delay_flagged_apps_count ?? 0,
                icon: Clock,
              },
              {
                label: 'Unanswered FAQs',
                val: data.feedback_intelligence?.unanswered_faq_reports ?? 0,
                icon: HelpCircle,
              },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xl font-bold tabular-nums text-teal-800 dark:text-cyan-300">
                      {kpi.val}
                    </span>
                    <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{kpi.label}</div>
                </div>
              );
            })}
          </div>

          {/* Visual Graphs Row 1: Most Used Schemes & Rule Usefulness */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HorizontalBarChart
              title="Most Used Schemes (Total Interactions)"
              subtitle="Combines applications started, readiness runs, and scheme-tagged Vault documents"
              data={data.scheme_usage.slice(0, 8).map((s) => ({
                label: s.scheme_name,
                badge: s.scheme_code,
                sublabel: `${s.applications_count} apps · ${s.readiness_checks_count} checks · ${s.memorized_docs_count} docs`,
                value: s.total_usage_score,
              }))}
              valueSuffix=" pts"
            />

            <RuleOutcomeStackedChart
              title="Rule Usefulness & Decision Clarity"
              subtitle="How often each statutory rule produces Met, Missing Info, or Not Met outcomes"
              items={data.rule_usefulness.slice(0, 8).map((r) => ({
                label: r.label,
                code: `${r.scheme_code} · ${r.rule_key}`,
                met: r.met_count,
                notMet: r.not_met_count,
                missing: r.missing_count,
                score: r.usefulness_score,
              }))}
            />
          </div>

          {/* Visual Graphs Row 2: Pipeline Donut + Usage Columns + Bottlenecks */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <DonutChart
              title="Application Lifecycle Funnel"
              subtitle="Real count across all citizen applications"
              centerLabel="Applications"
              centerValue={
                data.totals.drafts +
                data.totals.ready_for_portal +
                data.totals.submitted_confirmed
              }
              slices={[
                { label: 'Drafts', value: data.totals.drafts, color: '#d97706' },
                { label: 'Ready for Portal', value: data.totals.ready_for_portal, color: '#0891b2' },
                { label: 'Confirmed', value: data.totals.submitted_confirmed, color: '#059669' },
              ]}
            />

            <VerticalColumnChart
              title="Scheme Demand vs Confirmed Submissions"
              subtitle="Top 6 active schemes compared side-by-side"
              primaryLabel="Usage Score"
              secondaryLabel="Confirmed"
              data={data.scheme_usage.slice(0, 6).map((s) => ({
                label: s.scheme_code,
                primary: s.total_usage_score,
                secondary: s.confirmed_count,
              }))}
            />

            <HorizontalBarChart
              title="Missing Document & Field Bottlenecks"
              subtitle="Most frequently missing items in citizen readiness checks"
              data={data.missing_document_bottlenecks.slice(0, 6).map((b) => ({
                label: b.document_name,
                value: b.missing_count,
                colorClass: 'bg-amber-500 dark:bg-amber-400',
              }))}
              valueSuffix=" gaps"
              emptyText="No missing requirement bottlenecks recorded yet."
            />
          </div>

          {/* Ranked Scheme Usage Matrix */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Complete Scheme Usage &amp; Citizen Adoption Ranking
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Exact breakdown showing which scheme is used most and by how many citizen actions
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {data.scheme_usage.length} schemes tracked
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 font-semibold">#</th>
                    <th className="py-2.5 px-4 font-semibold">Code</th>
                    <th className="py-2.5 px-4 font-semibold">Scheme</th>
                    <th className="py-2.5 px-4 font-semibold">Total Usage</th>
                    <th className="py-2.5 px-4 font-semibold">Applications</th>
                    <th className="py-2.5 px-4 font-semibold">Confirmed</th>
                    <th className="py-2.5 px-4 font-semibold">Readiness Checks</th>
                    <th className="py-2.5 px-4 font-semibold">Vault Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.scheme_usage.map((row, idx) => (
                    <tr key={row.scheme_id}>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-teal-800 dark:text-cyan-300">
                        {row.scheme_code}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {row.scheme_name}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {row.total_usage_score}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{row.applications_count}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {row.confirmed_count}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        {row.readiness_checks_count}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        {row.memorized_docs_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Rule Usefulness Table */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Rule Usefulness &amp; Statutory Effectiveness Matrix
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Measures how useful each rule is across citizen eligibility evaluations, clear pass/fail outcomes, and cross-scheme dependency links
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Top {Math.min(15, data.rule_usefulness.length)} rules shown
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 font-semibold">Rule</th>
                    <th className="py-2.5 px-4 font-semibold">Scheme</th>
                    <th className="py-2.5 px-4 font-semibold">Usefulness</th>
                    <th className="py-2.5 px-4 font-semibold">Evaluations</th>
                    <th className="py-2.5 px-4 font-semibold">Met / Missing / Not Met</th>
                    <th className="py-2.5 px-4 font-semibold">Links</th>
                    <th className="py-2.5 px-4 font-semibold">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.rule_usefulness.slice(0, 15).map((r) => (
                    <tr key={r.rule_id}>
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-semibold text-teal-800 dark:text-cyan-300">
                          {r.rule_key}
                        </div>
                        <div className="text-slate-800 dark:text-slate-200 max-w-xs truncate">
                          {r.label}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {r.scheme_code}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {r.usefulness_score}/100
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{r.evaluations_triggered}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        <span className="text-emerald-700 dark:text-emerald-400">{r.met_count}</span> /{' '}
                        <span className="text-amber-700 dark:text-amber-400">{r.missing_count}</span>{' '}
                        / <span className="text-rose-700 dark:text-rose-400">{r.not_met_count}</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{r.linked_dependencies_count}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        {Math.round(r.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent Citizen Application Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Recent Citizen Application Records
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Anonymized state log of drafts, portal-ready packets, and user-confirmed filings
                </p>
              </div>

              {data.recent_applications.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                  No citizen application drafts saved in this session yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.recent_applications.map((app) => (
                    <div
                      key={app.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {app.scheme_code} — {app.scheme_name}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 font-mono">
                          Missing items: {app.missing_count} ·{' '}
                          {new Date(app.updated_at).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <StatusText status={app.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Regional Demand Intelligence & Citizen Feedback / Complaint Intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Regional Demand Intelligence
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      District-level concentration of citizens, active drafts, and raised complaints
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {data.totals.registered_citizens} total citizens
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4 font-semibold">State</th>
                      <th className="py-2.5 px-4 font-semibold">District</th>
                      <th className="py-2.5 px-4 font-semibold">Citizens</th>
                      <th className="py-2.5 px-4 font-semibold">Applications</th>
                      <th className="py-2.5 px-4 font-semibold">Complaints</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(data.regional_demand || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-4 px-4 text-center text-slate-500 dark:text-slate-400"
                        >
                          No regional demand records aggregated yet.
                        </td>
                      </tr>
                    ) : (
                      (data.regional_demand || []).map((row) => (
                        <tr key={`${row.state}-${row.district}`}>
                          <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                            {row.state || 'Unassigned'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                            {row.district || 'Unassigned'}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums">{row.citizens}</td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-teal-800 dark:text-cyan-300 font-semibold">
                            {row.applications}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-rose-700 dark:text-rose-400">
                            {row.complaints}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="lg:col-span-6 space-y-5">
              <HorizontalBarChart
                title="Citizen Feedback & Complaint Intelligence"
                subtitle={`Total ${data.complaints_summary?.total ?? 0} complaints · ${
                  data.complaints_summary?.open ?? 0
                } open · ${data.complaints_summary?.resolved ?? 0} resolved`}
                data={(data.complaints_summary?.by_category || []).map((c) => ({
                  label: c.category,
                  value: c.count,
                  colorClass: 'bg-rose-600 dark:bg-rose-400',
                }))}
                valueSuffix=" cases"
                emptyText="No citizen complaints recorded yet."
              />

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Unanswered Citizen FAQ Reports ({data.feedback_intelligence?.unanswered_faq_reports ?? 0})
                    </h2>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    Readiness Checks: {data.totals.readiness_checks}
                  </span>
                </div>
                {!data.feedback_intelligence?.top_unanswered_questions?.length ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No unanswered FAQ gaps reported by citizens yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.feedback_intelligence.top_unanswered_questions.slice(0, 6).map((q) => (
                      <div key={q.id} className="py-2 text-xs space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {q.question}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {q.category} · {new Date(q.created_at).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};

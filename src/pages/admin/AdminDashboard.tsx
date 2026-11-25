import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckSquare,
  CloudUpload,
  FileText,
  GitCompare,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import {
  DonutChart,
  HorizontalBarChart,
  RuleOutcomeStackedChart,
  VerticalColumnChart,
} from '../../components/charts/AnalyticsCharts';
import { syncSchemesCatalogToFirestore } from '../../lib/firebase';
import type { GovMonitoringPayload } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

export const AdminDashboard: React.FC = () => {
  const { overview, setPage, firebaseUid, user, token, setAuthModalOpen, schemesCatalog } = useApp();
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState<GovMonitoringPayload | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';
  const metrics = overview?.metrics;
  const docs = overview?.documents || [];
  const reports = overview?.impact_reports || [];
  const activeSchemesCount = (overview?.schemes || []).filter((s) => s.active).length;
  const newSchemes = (overview?.schemes || []).filter((s) => s.is_new);
  const amendedDocs = docs.filter((d) => d.version >= 2);
  const allRules = overview?.rules || [];
  const correctionsRequestedCount = allRules.filter(
    (r) => r.status === 'correction_requested'
  ).length;

  useEffect(() => {
    let active = true;
    const loadMonitoring = async () => {
      if (!token || !isAdmin) {
        setMonitoring(null);
        return;
      }
      try {
        const res = await apiRequest<GovMonitoringPayload>('/gov/monitoring', { token });
        if (active) setMonitoring(res);
      } catch {
        if (active) setMonitoring(null);
      }
    };
    void loadMonitoring();
    return () => {
      active = false;
    };
  }, [token, isAdmin, overview?.metrics?.audit_events]);

  const handleCloudSync = async () => {
    if (!firebaseUid) {
      setAuthModalOpen(true);
      return;
    }
    if (!overview) return;
    setSyncingCloud(true);
    setSyncNotice(null);
    try {
      const count = await syncSchemesCatalogToFirestore(overview.schemes, overview.rules);
      setSyncNotice(`Synced ${count} schemes to Google Cloud Firestore (schemes_catalog).`);
    } catch (err) {
      setSyncNotice(
        err instanceof Error
          ? err.message
          : 'Cloud Firestore sync requires verified Platform Admin credentials.'
      );
    } finally {
      setSyncingCloud(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Government Portal Overview
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage official notifications, verify extracted rules, approve Policy Ripple updates,
            and monitor citizen application operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {schemesCatalog.length > 0 && (
            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 px-2.5 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
              Firestore Live: {schemesCatalog.length} schemes
            </span>
          )}
          <button
            type="button"
            disabled={syncingCloud}
            onClick={() => void handleCloudSync()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-teal-700 dark:border-cyan-400 bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {syncingCloud
                ? 'Syncing Firestore...'
                : firebaseUid && user?.role === 'PLATFORM_ADMIN'
                  ? 'Sync Schemes to Cloud Firestore'
                  : 'Sync Catalog (Admin Google Auth)'}
            </span>
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
          {syncNotice}
        </div>
      )}

      <AdminGuardBanner />

      {/* Rule Governance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Monitored Documents', val: metrics?.documents_count ?? 0, page: 'ruleweaver' as const },
          { label: 'Drafts Awaiting Review', val: metrics?.draft_rules ?? 0, page: 'review' as const },
          { label: 'Corrections Requested', val: correctionsRequestedCount, page: 'review' as const },
          { label: 'Applied Ripple Updates', val: metrics?.applied_impacts ?? 0, page: 'ripple' as const },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setPage(card.page)}
            className="card-3d text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors cursor-pointer"
          >
            <div className="font-mono text-2xl font-semibold tabular-nums text-teal-800 dark:text-cyan-300">
              {card.val}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{card.label}</div>
          </button>
        ))}
      </div>

      {/* Citizen Service & Application Operations Snapshot */}
      {isAdmin && monitoring && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Citizen Application & Service Operations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live operational metrics derived from verified FormSathi drafts, portal confirmations, and citizen records.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPage('app_monitoring')}
              className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer self-start sm:self-auto whitespace-nowrap"
            >
              Open Full Monitoring Console
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Drafts In Progress', val: monitoring.totals.drafts },
              { label: 'Ready for Official Portal', val: monitoring.totals.ready_for_portal },
              { label: 'Confirmed Submitted', val: monitoring.totals.submitted_confirmed },
              { label: 'Registered Citizens', val: monitoring.totals.registered_citizens },
              { label: 'Active Schemes', val: activeSchemesCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5"
              >
                <div className="font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {stat.val}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Graphical Scheme Usage, Rule Usefulness & Funnel Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
            <HorizontalBarChart
              title="Most Used Government Schemes (By Citizen Activity)"
              subtitle="Ranked by total applications, readiness evaluations & Vault document usage"
              data={monitoring.scheme_usage.slice(0, 7).map((s) => ({
                label: s.scheme_name,
                badge: s.scheme_code,
                sublabel: `${s.applications_count} apps (${s.confirmed_count} confirmed) · ${s.readiness_checks_count} readiness checks · ${s.memorized_docs_count} docs`,
                value: s.total_usage_score,
              }))}
              valueSuffix=" pts"
            />

            <RuleOutcomeStackedChart
              title="Most Useful Active Rules (Impact & Outcome Distribution)"
              subtitle="Rules ranked by evaluations triggered, condition clarity & downstream scheme reach"
              items={monitoring.rule_usefulness.slice(0, 7).map((r) => ({
                label: r.label,
                code: `${r.scheme_code} · ${r.rule_key}`,
                met: r.met_count,
                notMet: r.not_met_count,
                missing: r.missing_count,
                score: r.usefulness_score,
              }))}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DonutChart
              title="Citizen Application Pipeline"
              subtitle="Live distribution across Drafts, Portal-Ready & Confirmed Submissions"
              centerLabel="Total Apps"
              centerValue={
                monitoring.totals.drafts +
                monitoring.totals.ready_for_portal +
                monitoring.totals.submitted_confirmed
              }
              slices={[
                { label: 'Drafts In Progress', value: monitoring.totals.drafts, color: '#d97706' },
                { label: 'Ready for Portal', value: monitoring.totals.ready_for_portal, color: '#0891b2' },
                { label: 'Confirmed Submitted', value: monitoring.totals.submitted_confirmed, color: '#059669' },
              ]}
            />

            <VerticalColumnChart
              title="Top Schemes: Total Usage vs Confirmed Submissions"
              subtitle="Compares total citizen interaction volume against completed filings"
              primaryLabel="Usage Score"
              secondaryLabel="Confirmed"
              data={monitoring.scheme_usage.slice(0, 6).map((s) => ({
                label: s.scheme_code,
                primary: s.total_usage_score,
                secondary: s.confirmed_count,
              }))}
            />
          </div>
        </section>
      )}

      {/* Newly Introduced & Amended Government Scheme Rollouts */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Newly Introduced & Amended Government Scheme Rollouts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {newSchemes.length} newly launched citizen programs and {amendedDocs.length} circular
              amendment(s) tracked for compliance & SLA sign-off
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPage('ripple')}
            className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer self-start sm:self-auto"
          >
            Open Policy Ripple Engine
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {newSchemes.map((sch) => {
            const schRules = allRules.filter((r) => r.scheme_id === sch.id);
            const draftCount = schRules.filter(
              (r) =>
                r.status === 'draft' ||
                r.status === 'under_review' ||
                r.status === 'correction_requested'
            ).length;
            const activeCount = schRules.filter((r) => r.status === 'active').length;
            return (
              <div
                key={sch.id}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="font-semibold text-teal-800 dark:text-cyan-300">
                    {sch.code} · {sch.schema_version || 'v1.0'}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Rollout {sch.introduced_date || '2026'}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {sch.name}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Target Group: {sch.target_group || 'All eligible citizens'}
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span>
                    {activeCount} active · {draftCount} pending
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(draftCount > 0 ? 'review' : 'ruleweaver')}
                    className="font-sans font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
                  >
                    {draftCount > 0 ? 'Review Drafts' : 'Inspect AST'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {amendedDocs.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Active Policy Amendments (v2+ Circulars)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {amendedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {doc.title}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {doc.doc_number} · v{doc.version} · {doc.effective_date}
                    </div>
                  </div>
                  <StatusText status={doc.verification_status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Notification Library
            </h2>
            <button
              type="button"
              onClick={() => setPage('ruleweaver')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Open RuleWeaver</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {docs.map((d) => (
              <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
                    <span>{d.title}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {d.doc_number} · v{d.version} · Effective {d.effective_date}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusText status={d.verification_status} />
                  <SourceCitationButton documentId={d.id} label="Inspect pages" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Governance Next Actions
            </h2>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setPage('review')}
              className="w-full flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <CheckSquare className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Human Review Queue
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {metrics?.draft_rules ?? 0} draft rule(s) · {correctionsRequestedCount} correction(s) requested
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setPage('ripple')}
              className="w-full flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <GitCompare className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Policy Ripple Impact Reports
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {reports.length} active impact report(s)
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setPage('app_monitoring')}
              className="w-full flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Application & Service Monitoring
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Track citizen drafts, document bottlenecks, and scheme demand
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setPage('gov_admin')}
              className="w-full flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Administration & Security
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Manage department roles, user permissions, and schema diagnostics
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  Clock,
  ExternalLink,
  FileCheck2,
  GitCompare,
  HelpCircle,
  MapPin,
  MessageSquareWarning,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { StatusText } from '../../components/ui/StatusText';
import { ComplaintsPanel } from '../../components/student/ComplaintsPanel';
import { FaqCenterPanel } from '../../components/student/FaqCenterPanel';
import { DelayAssistantModal } from '../../components/student/DelayAssistantModal';
import { DeadlinesAlertsPage } from './DeadlinesAlertsPage';
import { HelpCentersMapPage } from './HelpCentersMapPage';
import type { ApplicationDraftRecord } from '../../types/niyamsetu';

export type ServicesHelpTab = 'deadlines' | 'help_centers' | 'tracker' | 'complaints' | 'faq';

interface VaultWarning {
  doc_id: string;
  title: string;
  severity: 'warning' | 'ok';
  message: string;
}

export const ServicesHelpPage: React.FC<{ initialTab?: ServicesHelpTab }> = ({ initialTab }) => {
  const {
    lang,
    token,
    overview,
    applications,
    complaints,
    deleteApplicationDraft,
    openSchemeInAssistant,
    openComplaintForApp,
  } = useApp();
  const [tab, setTab] = useState<ServicesHelpTab>(initialTab || 'deadlines');
  const [vaultWarnings, setVaultWarnings] = useState<VaultWarning[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>(['sch-pm-01', 'sch-ste-02', 'sch-rtf-06']);
  const [delayModalApp, setDelayModalApp] = useState<ApplicationDraftRecord | null>(null);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const switchTab = (nextTab: ServicesHelpTab) => {
    setTab(nextTab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  useEffect(() => {
    let active = true;
    if (!token) {
      setVaultWarnings([]);
      return;
    }
    apiRequest<{ vault_warnings: VaultWarning[] }>('/document-guide', { token })
      .then((res) => {
        if (active) setVaultWarnings(res.vault_warnings || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  const schemes = overview?.schemes || [];
  const comparedSchemes = useMemo(
    () => schemes.filter((s) => compareIds.includes(s.id)).slice(0, 3),
    [schemes, compareIds]
  );

  const toggleCompareScheme = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const tabs: Array<{
    id: ServicesHelpTab;
    label: string;
    labelTe: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'deadlines',
      label: 'Deadlines & Renewal Alerts',
      labelTe: 'గడువులు & పునరుద్ధరణలు',
      icon: Bell,
    },
    {
      id: 'help_centers',
      label: 'Nearby Help Centers Map',
      labelTe: 'సమీప సహాయ కేంద్రాలు',
      icon: MapPin,
    },
    {
      id: 'tracker',
      label: `Saved Drafts & Compare (${applications.length})`,
      labelTe: `దరఖాస్తులు & పోలిక (${applications.length})`,
      icon: GitCompare,
    },
    {
      id: 'complaints',
      label: `Complaints & Grievances (${complaints.length})`,
      labelTe: `ఫిర్యాదులు (${complaints.length})`,
      icon: MessageSquareWarning,
    },
    {
      id: 'faq',
      label: 'Citizen FAQ & Process Guide',
      labelTe: 'ప్రశ్నలు & మార్గదర్శి',
      icon: HelpCircle,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {lang === 'te' ? 'సేవలు, గడువులు & సహాయ కేంద్రాలు' : 'Services, Deadlines & Nearby Help'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            Track official opening/closing dates, document renewal alerts, live MeeSeva &amp; Welfare
            help centers, saved application drafts, and side-by-side scheme comparisons.
          </p>
        </div>

        <div
          className="flex items-center gap-1.5 overflow-x-auto flex-nowrap snap-x p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          role="tablist"
          aria-label="Services and Help Tabs"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(item.id)}
                className={`snap-start shrink-0 min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{lang === 'te' ? item.labelTe : item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'deadlines' && (
        <div className="space-y-6">
          {/* Document Renewal Warnings from Vault */}
          {vaultWarnings.some((w) => w.severity === 'warning') && (
            <section className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Document Renewal &amp; Missing Certificate ID Alerts</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {vaultWarnings
                  .filter((w) => w.severity === 'warning')
                  .map((w) => (
                    <div
                      key={w.doc_id}
                      className="rounded border border-amber-200 dark:border-amber-800/70 bg-white/80 dark:bg-slate-900 p-2.5"
                    >
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{w.title}</div>
                      <div className="text-amber-800 dark:text-amber-300 mt-0.5">{w.message}</div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Scheme Opening & Deadline Calendar */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Official Application Opening &amp; Closing Windows
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-500">{schemes.length} schemes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {schemes.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3.5 flex flex-col justify-between gap-2.5 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 font-mono">
                      <span className="font-bold text-teal-800 dark:text-cyan-300">{s.code}</span>
                      {s.application_status && <StatusText status={s.application_status} />}
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug min-h-[2.25rem]">
                      {s.name}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums flex items-center justify-between gap-2">
                    <span>Opens: {s.opening_date || '2026-07-15'}</span>
                    <span>Closes: {s.deadline_date || '2026-12-31'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <DeadlinesAlertsPage />
        </div>
      )}

      {tab === 'help_centers' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <strong className="text-slate-900 dark:text-slate-100">Source Transparency:</strong>{' '}
              Below are live Google Maps Platform &amp; Google Places search results around your
              selected district. Official department contacts are always shown inside each scheme's
              Detail modal.
            </div>
          </div>
          <HelpCentersMapPage />
        </div>
      )}

      {tab === 'tracker' && (
        <div className="space-y-6">
          {/* Saved Applications Tracker */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Saved Application Drafts &amp; Portal Confirmations
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Only real drafts you saved in FormSathi or submissions you explicitly confirmed
                  after visiting an official portal appear here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openSchemeInAssistant(schemes[0]?.id || 'sch-pm-01')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer self-start"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Start New Application Draft</span>
              </button>
            </div>

            {applications.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                No saved application drafts yet. Open the Application Assistant to prepare a
                scheme packet and map your answers.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="font-bold text-teal-800 dark:text-cyan-300">
                          {app.scheme_code}
                        </span>
                        <StatusText status={app.status} />
                        {typeof app.elapsed_days === 'number' &&
                          typeof app.expected_processing_days === 'number' && (
                            <span
                              className={
                                app.is_overdue
                                  ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              · {app.elapsed_days}/{app.expected_processing_days}d SLA
                              {app.is_overdue ? ' (Overdue)' : ''}
                            </span>
                          )}
                        {app.portal_reference_number && (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            · Ref: {app.portal_reference_number}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {app.scheme_name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {app.attached_documents.length} doc(s) attached ·{' '}
                        {app.missing_requirements.length > 0
                          ? `${app.missing_requirements.length} missing requirement(s)`
                          : 'All mapped fields populated'}{' '}
                        · Updated {new Date(app.updated_at).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDelayModalApp(app)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-xs font-semibold text-amber-900 dark:text-amber-300 hover:border-amber-500 cursor-pointer whitespace-nowrap"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Delay Assistant</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openComplaintForApp(app)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer whitespace-nowrap"
                      >
                        <MessageSquareWarning className="w-3 h-3" />
                        <span>Complaint</span>
                      </button>
                      {app.portal_url && (
                        <a
                          href={app.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 whitespace-nowrap"
                        >
                          <span>Official Portal</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openSchemeInAssistant(app.scheme_id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <span>Continue</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteApplicationDraft(app.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label={`Delete draft for ${app.scheme_name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Side-by-Side Scheme Comparison Matrix */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Side-by-Side Scheme Comparison Matrix (Select up to 3)
              </h2>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {schemes.map((s) => {
                  const active = compareIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleCompareScheme(s.id)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border cursor-pointer transition-colors ${
                        active
                          ? 'border-teal-800 dark:border-cyan-400 bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {s.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-semibold">Dimension</th>
                    {comparedSchemes.map((s) => (
                      <th key={s.id} className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                        {s.code} — {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">
                      Department
                    </td>
                    {comparedSchemes.map((s) => (
                      <td key={s.id} className="py-2.5 px-3">{s.authority}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">
                      Benefit
                    </td>
                    {comparedSchemes.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 font-semibold text-teal-800 dark:text-cyan-300">
                        {s.benefit_summary}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">
                      Eligibility Criteria
                    </td>
                    {comparedSchemes.map((s) => (
                      <td key={s.id} className="py-2.5 px-3">{s.eligibility_summary || s.description}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">
                      Required Documents
                    </td>
                    {comparedSchemes.map((s) => (
                      <td key={s.id} className="py-2.5 px-3">
                        {(s.required_docs_list || []).join(', ') || 'See detail'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">
                      Deadline
                    </td>
                    {comparedSchemes.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 font-mono tabular-nums">
                        {s.deadline_date || '2026-12-31'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'complaints' && <ComplaintsPanel mode="citizen" />}

      {tab === 'faq' && <FaqCenterPanel />}

      <DelayAssistantModal
        application={delayModalApp}
        onClose={() => setDelayModalApp(null)}
        onRaiseComplaint={(app) => openComplaintForApp(app)}
      />
    </div>
  );
};

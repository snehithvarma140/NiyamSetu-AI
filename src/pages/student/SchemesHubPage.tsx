import React, { useEffect, useState } from 'react';
import { FileSearch, FileText, GitCompare, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { EligibilityFinderPage } from './EligibilityFinderPage';
import { WhatIfSimulatorPage } from './WhatIfSimulatorPage';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import { SchemeDetailModal } from '../../components/ui/SchemeDetailModal';
import type { RuleComparisonRow } from '../../types/niyamsetu';

export type SchemesHubTab = 'eligibility' | 'updates' | 'whatif';

export const SchemesHubPage: React.FC<{ initialTab?: SchemesHubTab }> = ({ initialTab }) => {
  const { lang, overview, token } = useApp();
  const [tab, setTab] = useState<SchemesHubTab>(initialTab || 'eligibility');
  const [compareSchemeId, setCompareSchemeId] = useState('sch-pm-01');
  const [comparisonRows, setComparisonRows] = useState<RuleComparisonRow[]>([]);
  const [detailSchemeId, setDetailSchemeId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  const switchTab = (nextTab: SchemesHubTab) => {
    setTab(nextTab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  useEffect(() => {
    if (tab !== 'updates') return;
    let active = true;
    apiRequest<{ comparison: RuleComparisonRow[] }>(`/ruleweaver/comparison/${compareSchemeId}`, {
      token,
    })
      .then((res) => {
        if (active) setComparisonRows(res.comparison || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tab, compareSchemeId, token, overview]);

  const schemesCount = overview?.schemes.length ?? 16;
  const amendedCount = (overview?.rules || []).filter((r) => r.version >= 2).length;

  const tabs: Array<{
    id: SchemesHubTab;
    label: string;
    labelTe: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'eligibility',
      label: `Discovery & Eligibility (${schemesCount})`,
      labelTe: `పథకాల అన్వేషణ (${schemesCount})`,
      icon: FileSearch,
    },
    {
      id: 'updates',
      label: `Updated Rules & Sources (${amendedCount})`,
      labelTe: `నవీకరించిన నియమాలు (${amendedCount})`,
      icon: GitCompare,
    },
    {
      id: 'whatif',
      label: 'What-If Simulator',
      labelTe: 'వాట్-ఇఫ్ సిమ్యులేటర్',
      icon: SlidersHorizontal,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {lang === 'te' ? 'పథకాలు & నియమాల అన్వేషకుడు' : 'Schemes & Rules Explorer'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Search verified schemes, services, notifications, and official circulars, compare old vs
            new rules, and open full scheme details.
          </p>
        </div>

        <div
          className="flex items-center gap-1.5 overflow-x-auto flex-nowrap snap-x p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          role="tablist"
          aria-label="Schemes Explorer Tabs"
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

      <div>
        {tab === 'eligibility' && <EligibilityFinderPage />}

        {tab === 'updates' && (
          <div className="space-y-6">
            {/* Old vs New Scheme Requirements Comparator */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Compare Old vs New Scheme Requirements
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Inspect version-by-version changes from original circulars to approved amendments.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={compareSchemeId}
                    onChange={(e) => setCompareSchemeId(e.target.value)}
                    aria-label="Select scheme to compare old and new rules"
                    className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs"
                  >
                    {(overview?.schemes || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDetailSchemeId(compareSchemeId)}
                    className="px-3 py-1.5 rounded border border-teal-700 dark:border-cyan-400 text-xs font-semibold text-teal-800 dark:text-cyan-300 cursor-pointer whitespace-nowrap"
                  >
                    Scheme Detail
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 font-semibold">Requirement</th>
                      <th className="py-2.5 px-3 font-semibold">Previous Circular Rule</th>
                      <th className="py-2.5 px-3 font-semibold">Current / Proposed Rule</th>
                      <th className="py-2.5 px-3 font-semibold">Rule Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {comparisonRows.map((row) => (
                      <tr key={row.rule_key}>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {row.label}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {row.old_rule ? row.old_rule.condition_text : 'None (New Clause)'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100 font-medium">
                          {row.new_rule ? row.new_rule.condition_text : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusText
                            status={row.change_type}
                            labelOverride={
                              row.change_type === 'added'
                                ? 'New Rule'
                                : row.change_type === 'modified'
                                  ? 'Revised Rule'
                                  : 'Unchanged'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Official Source Circulars Browser */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Official Source Documents &amp; Notifications ({overview?.documents.length || 0})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inspect page-by-page circular text and verification status directly from official
                  gazettes and department releases.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(overview?.documents || []).map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 font-mono text-teal-800 dark:text-cyan-300">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-bold">{doc.doc_number}</span>
                        <span>· v{doc.version}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {doc.title}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {doc.authority} · Effective {doc.effective_date}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusText status={doc.verification_status} />
                      <SourceCitationButton documentId={doc.id} label="View Source Pages" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'whatif' && <WhatIfSimulatorPage />}
      </div>

      <SchemeDetailModal schemeId={detailSchemeId} onClose={() => setDetailSchemeId(null)} />
    </div>
  );
};

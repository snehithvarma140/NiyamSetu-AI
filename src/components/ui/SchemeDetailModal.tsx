import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  GitCompare,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from './SourceCitationButton';
import { StatusText } from './StatusText';
import type {
  DeadlineTask,
  DocumentGuideMetadata,
  DocumentRecord,
  ProcedureStep,
  RuleComparisonRow,
  RuleRecord,
  SchemeProcedure8Q,
  SchemeRecord,
} from '../../types/niyamsetu';

interface SchemeDetailPayload {
  scheme: SchemeRecord;
  procedure_8q: SchemeProcedure8Q | null;
  doc_classifications: Array<{
    doc_name: string;
    requirement_level: 'mandatory' | 'additional' | 'optional' | 'not_applicable';
    guide: DocumentGuideMetadata;
  }>;
  comparison: RuleComparisonRow[];
  documents: DocumentRecord[];
  rules: RuleRecord[];
  deadlines: DeadlineTask[];
  steps: ProcedureStep[];
}

interface SchemeDetailModalProps {
  schemeId: string | null;
  onClose: () => void;
}

export const SchemeDetailModal: React.FC<SchemeDetailModalProps> = ({ schemeId, onClose }) => {
  const { token, lang, overview, openSchemeInAssistant } = useApp();
  const [detail, setDetail] = useState<SchemeDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schemeId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<SchemeDetailPayload>(`/schemes/${schemeId}/detail`, { token })
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load scheme details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [schemeId, token]);

  if (!schemeId) return null;

  const fallbackScheme = overview?.schemes.find((s) => s.id === schemeId);
  const sch = detail?.scheme || fallbackScheme;
  const mandatoryDocs =
    detail?.doc_classifications.filter((d) => d.requirement_level === 'mandatory') || [];
  const additionalDocs =
    detail?.doc_classifications.filter((d) => d.requirement_level === 'additional') || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scheme Detailed Specification"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50 dark:bg-slate-950/70">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-teal-800 dark:text-cyan-300">
              <span className="font-bold">{sch?.code}</span>
              {sch?.is_new && (
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  · NEW ({sch.introduced_date || '2026'})
                </span>
              )}
              {sch?.application_status && <StatusText status={sch.application_status} />}
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              {sch ? (lang === 'te' ? sch.name_te : sch.name) : 'Loading Scheme...'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {sch?.authority} · Last verified {sch?.last_verified_date || '2026-11-01'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer shrink-0"
            aria-label="Close scheme details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && !detail && (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              Loading verified scheme rules, documents, and official circulars...
            </div>
          )}

          {error && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {sch && (
            <>
              {/* Plain Language Description + Purpose + Benefits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Purpose &amp; Simple Summary
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {lang === 'te' ? sch.description_te : sch.description}
                  </p>
                  {sch.purpose && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <strong>Purpose:</strong> {sch.purpose}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-teal-200 dark:border-cyan-900 bg-teal-50/50 dark:bg-cyan-950/20 p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-teal-900 dark:text-cyan-200">
                    Benefits &amp; Who Can Apply
                  </div>
                  <div className="text-sm font-bold text-teal-900 dark:text-cyan-200">
                    {sch.benefit_summary}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong>Who can apply:</strong> {sch.who_can_apply || sch.target_group}
                  </p>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <strong>Category:</strong> {sch.beneficiary_category || sch.target_group} ·{' '}
                    <strong>States:</strong> {(sch.states_applicable || ['All India']).join(', ')}
                  </div>
                </div>
              </div>

              {/* Key Dates, Official Website, Contact & Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                    <span>Opening &amp; Deadline</span>
                  </div>
                  <div className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    Opens: {sch.opening_date || '2026-07-15'}
                  </div>
                  <div className="font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    Deadline: {sch.deadline_date || '2026-12-31'}
                  </div>
                </div>

                <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold">
                    <Building2 className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                    <span>Department &amp; Contact</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {sch.authority}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 flex items-start gap-1">
                    <Mail className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{sch.contact_info || 'Official Portal Helpdesk'}</span>
                  </div>
                </div>

                <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold">
                    <ExternalLink className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                    <span>Official Portal</span>
                  </div>
                  {sch.official_website ? (
                    <a
                      href={sch.official_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-teal-800 dark:text-cyan-300 hover:underline break-all"
                    >
                      <span>{sch.official_website}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-500">Official State Portal</span>
                  )}
                </div>

                <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold">
                    <FileText className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                    <span>Source Circular</span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 font-medium">
                    {sch.source_notification || `${sch.code} Circular`}
                  </div>
                  {detail?.documents[0] && (
                    <SourceCitationButton
                      documentId={detail.documents[0].id}
                      label="Inspect Circular PDF"
                    />
                  )}
                </div>
              </div>

              {/* Mandatory vs Additional Required Documents */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Mandatory Documents
                    </h3>
                    <span className="text-xs font-mono text-rose-700 dark:text-rose-400 font-semibold">
                      {mandatoryDocs.length || (sch.required_docs_list?.length ?? 0)} required
                    </span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    {mandatoryDocs.length > 0
                      ? mandatoryDocs.map((d) => (
                          <li key={d.doc_name} className="space-y-0.5">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300 shrink-0" />
                              <span>{d.doc_name}</span>
                            </div>
                            <div className="pl-5 text-slate-500 dark:text-slate-400">
                              {d.guide.issuing_department} · {d.guide.validity_period}
                            </div>
                          </li>
                        ))
                      : (sch.required_docs_list || []).map((name) => (
                          <li key={name} className="font-semibold text-slate-800 dark:text-slate-200">
                            • {name}
                          </li>
                        ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Additional / Conditional Documents
                    </h3>
                    <span className="text-xs font-mono text-amber-700 dark:text-amber-400 font-semibold">
                      {additionalDocs.length || (sch.additional_docs_list?.length ?? 0)} conditional
                    </span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    {additionalDocs.length > 0
                      ? additionalDocs.map((d) => (
                          <li key={d.doc_name} className="space-y-0.5">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {d.doc_name}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              {d.guide.why_required}
                            </div>
                          </li>
                        ))
                      : (sch.additional_docs_list || []).map((name) => (
                          <li key={name} className="text-slate-700 dark:text-slate-300">
                            • {name}
                          </li>
                        ))}
                  </ul>
                </div>
              </div>

              {/* Old vs New Rule Requirements Comparison */}
              {detail && detail.comparison.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <GitCompare className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                    <span>Old vs New Circular Rules Comparison</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                          <th className="py-2 px-3 font-semibold">Requirement</th>
                          <th className="py-2 px-3 font-semibold">Previous Rule</th>
                          <th className="py-2 px-3 font-semibold">Latest / Amended</th>
                          <th className="py-2 px-3 font-semibold">Classification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {detail.comparison.map((row) => (
                          <tr key={row.rule_key}>
                            <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                              {row.label}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                              {row.old_rule ? row.old_rule.condition_text : 'None (New)'}
                            </td>
                            <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">
                              {row.new_rule ? row.new_rule.condition_text : '—'}
                            </td>
                            <td className="py-2 px-3">
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
                </div>
              )}

              {/* 8-Question Procedure Snapshot */}
              {detail?.procedure_8q && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-4 space-y-2 text-xs">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                    <span>After Submission &amp; Application Tracking</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">
                    <strong>After Submission:</strong> {detail.procedure_8q.what_happens_after_submission}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">
                    <strong>How to Track:</strong> {detail.procedure_8q.how_to_track}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Footer CTA */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Official eligibility and final approval are confirmed only by the issuing portal.
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Close
            </button>
            {sch && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openSchemeInAssistant(sch.id);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <span>Check My Eligibility &amp; Apply</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  MessageSquareWarning,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { StatusText } from '../ui/StatusText';
import type { ApplicationDraftRecord, DelayAnalysisResult } from '../../types/niyamsetu';

interface DelayAssistantModalProps {
  application: ApplicationDraftRecord | null;
  onClose: () => void;
  onRaiseComplaint?: (app: ApplicationDraftRecord) => void;
}

export const DelayAssistantModal: React.FC<DelayAssistantModalProps> = ({
  application,
  onClose,
  onRaiseComplaint,
}) => {
  const { token, lang } = useApp();
  const [analysis, setAnalysis] = useState<DelayAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!application || !token) {
      setAnalysis(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<{ analysis: DelayAnalysisResult }>(`/applications/${application.id}/delay-analysis`, {
      method: 'POST',
      token,
      body: { lang },
    })
      .then((res) => {
        if (active) setAnalysis(res.analysis);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to analyze application delay.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [application?.id, token, lang]);

  if (!application) return null;

  const expectedDays = analysis?.expected_processing_days ?? application.expected_processing_days ?? 30;
  const elapsedDays = analysis?.elapsed_days ?? application.elapsed_days ?? 0;
  const isOverdue = analysis?.is_overdue ?? application.is_overdue ?? false;
  const progressPct = Math.min(100, Math.round((elapsedDays / Math.max(1, expectedDays)) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Application Status and Delay Assistant"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="font-bold text-teal-800 dark:text-cyan-300">
                {application.scheme_code}
              </span>
              <StatusText status={application.status} />
              {application.portal_reference_number && (
                <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                  · Ref {application.portal_reference_number}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Application Delay &amp; Status Assistant — {application.scheme_name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close Delay Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Verified Metadata & SLA Progress */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Handling Department</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {analysis?.handling_department || application.handling_department || 'State Department'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Submitted / Prepared</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {application.submitted_at
                  ? new Date(application.submitted_at).toLocaleDateString('en-IN')
                  : 'Not yet submitted'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Last Status Update</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {new Date(application.last_status_update || application.updated_at).toLocaleDateString(
                  'en-IN'
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Published SLA Window</div>
              <div
                className={`font-mono tabular-nums font-bold mt-0.5 ${
                  isOverdue ? 'text-rose-700 dark:text-rose-400' : 'text-teal-800 dark:text-cyan-300'
                }`}
              >
                {elapsedDays} / {expectedDays} days {isOverdue ? '· SLA Exceeded' : '· Active'}
              </div>
            </div>
          </div>

          {/* SLA Timeline Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Official SLA Processing Meter</span>
              </span>
              <span className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                {application.submitted_at
                  ? `${elapsedDays} days elapsed of ${expectedDays}-day published SLA`
                  : 'Timer starts after official portal submission confirmation'}
              </span>
            </div>
            <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isOverdue
                    ? 'bg-rose-600 dark:bg-rose-400'
                    : 'bg-teal-700 dark:bg-cyan-400'
                }`}
                style={{ width: `${application.submitted_at ? progressPct : 18}%` }}
              />
            </div>
          </div>

          {/* Unified 4-Stage Application Timeline */}
          {application.timeline_events && application.timeline_events.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                4-Stage Application Lifecycle Timeline
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {application.timeline_events.map((ev, idx) => {
                  const isDone = ev.status === 'done';
                  const isDelayed = ev.status === 'delayed';
                  return (
                    <div
                      key={`${ev.stage}-${idx}`}
                      className={`rounded-md border p-3 text-xs space-y-1 ${
                        isDone
                          ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : isDelayed
                            ? 'border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-semibold text-slate-900 dark:text-slate-100">
                        <span className="truncate">{ev.label || ev.stage}</span>
                        {isDone && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        {isDelayed && (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleDateString('en-IN') : 'Pending'}
                      </div>
                      {ev.note && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                          {ev.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Delay Explanation */}
          {loading ? (
            <div className="rounded-md border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400">
              Analyzing verified circular SLAs, missing requirements, and delay indicators...
            </div>
          ) : error ? (
            <div className="rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Plain-Language Status &amp; Delay Explanation
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {analysis.ai_explanation}
                </p>
              </div>

              {/* Strictly 3 distinct evidence categories */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-md border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-300">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Verified Facts</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc list-inside">
                    {analysis.verified_reasons.map((r, i) => (
                      <li key={i} className="leading-snug">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/20 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Possible Explanations</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc list-inside">
                    {analysis.possible_explanations.map((r, i) => (
                      <li key={i} className="leading-snug">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                    <HelpCircle className="w-4 h-4 shrink-0 text-slate-500" />
                    <span>Unknown External Factors</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc list-inside">
                    {analysis.unknown_factors.map((r, i) => (
                      <li key={i} className="leading-snug">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Next Steps & Official Grievance Contacts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Recommended Next Steps
                  </div>
                  <ol className="space-y-1 list-decimal list-inside text-slate-700 dark:text-slate-300">
                    {analysis.next_steps.map((s, i) => (
                      <li key={i} className="leading-snug">
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Official Contact &amp; Grievance Channel
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">{analysis.official_contact}</div>
                  {analysis.grievance_channel && (
                    <a
                      href={analysis.grievance_channel}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-teal-800 dark:text-cyan-300 hover:underline"
                    >
                      <span>{analysis.grievance_channel}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Never fabricates reasons: NiyamSetu separates confirmed application logs from external
              department queue factors.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {onRaiseComplaint && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRaiseComplaint(application);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <MessageSquareWarning className="w-3.5 h-3.5" />
                  <span>Escalate &amp; Raise Complaint</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

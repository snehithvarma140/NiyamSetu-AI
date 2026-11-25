import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Edit3, MessageSquareWarning, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import type { DocumentRecord, ReviewQueueItem, RuleRecord } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

interface QueueRow {
  queue_item: ReviewQueueItem;
  rule?: RuleRecord;
  old_rule: RuleRecord | null;
  document: DocumentRecord | null;
  citation: string;
}

export const HumanReviewQueuePage: React.FC = () => {
  const { token, user, refreshOverview, triggerRipplePulse, setPage } = useApp();
  const [items, setItems] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCondition, setEditCondition] = useState('');
  const [editValue, setEditValue] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';

  const loadQueue = async () => {
    if (!token || !isAdmin) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ items: QueueRow[] }>('/review-queue', { token });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load review queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [token, user?.role]);

  const decide = async (
    ruleId: string,
    decision: 'approved' | 'rejected' | 'correction_requested'
  ) => {
    if (!token) return;
    setError(null);
    const noteText = (notes[ruleId] || '').trim();
    if (decision === 'correction_requested' && !noteText) {
      setError(
        'Reviewer correction note is required when requesting corrections for a rule.'
      );
      return;
    }

    setSubmittingId(ruleId);
    try {
      await apiRequest(`/review-queue/${ruleId}/decide`, {
        method: 'POST',
        token,
        body: {
          decision,
          note: noteText,
          condition_text: editingId === ruleId ? editCondition : undefined,
          value: editingId === ruleId ? editValue : undefined,
        },
      });
      setEditingId(null);
      if (decision === 'approved') triggerRipplePulse();
      await refreshOverview();
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed.');
    } finally {
      setSubmittingId(null);
    }
  };

  const approveAll = async () => {
    if (!token) return;
    setError(null);
    try {
      await apiRequest('/review-queue/approve-all', { method: 'POST', token });
      triggerRipplePulse();
      await refreshOverview();
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch approval failed.');
    }
  };

  const pendingCount = items.filter((i) => i.queue_item.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Human Review Queue
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Extracted rules stay draft until verified by an authorised officer. Approve to activate
            and generate a Policy Ripple report, request corrections with a reviewer note, or reject.
          </p>
        </div>

        {isAdmin && pendingCount > 0 && (
          <button
            type="button"
            onClick={approveAll}
            className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap self-start"
          >
            Approve All {pendingCount} Pending Changes
          </button>
        )}
      </div>

      <AdminGuardBanner />

      {error && (
        <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {isAdmin && loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-sm text-slate-500">
          Loading review queue...
        </div>
      )}

      {isAdmin && !loading && (
        <div className="space-y-4">
          {items.map((row) => {
            const r = row.rule;
            if (!r) return null;
            const lowConfidence = r.confidence < 0.9;
            const isEditing = editingId === r.id;
            const canDecide =
              r.status === 'draft' ||
              r.status === 'under_review' ||
              r.status === 'correction_requested';
            const isBusy = submittingId === r.id;

            return (
              <article
                key={row.queue_item.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {r.id}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">
                        Confidence {Math.round(r.confidence * 100)}%
                      </span>
                      <span>·</span>
                      <SourceCitationButton
                        documentId={r.document_id}
                        pageNumber={r.page_number}
                        clauseRef={r.clause_reference}
                        label={row.citation}
                      />
                    </div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {r.label}
                    </h2>
                  </div>

                  <StatusText status={r.status} />
                </div>

                {lowConfidence && canDecide && (
                  <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/25 px-3 py-2 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Extraction confidence is below 90% ({Math.round(r.confidence * 100)}%).
                      Inspect the source document page carefully before approving.
                    </span>
                  </div>
                )}

                {r.status === 'correction_requested' && (
                  <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <MessageSquareWarning className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">
                        Correction Requested by {row.queue_item.reviewed_by || 'Reviewer'}
                      </span>
                      {row.queue_item.decision_note
                        ? ` · Note: ${row.queue_item.decision_note}`
                        : ''}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Previous Rule
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">
                      {row.old_rule ? row.old_rule.condition_text : 'None (New requirement)'}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Proposed Rule (v{r.version})
                    </div>
                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          value={editCondition}
                          onChange={(e) => setEditCondition(e.target.value)}
                          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          aria-label="Edit condition text"
                        />
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                          aria-label="Edit machine value"
                        />
                      </div>
                    ) : (
                      <div className="text-slate-900 dark:text-slate-100 font-medium">
                        {r.condition_text}{' '}
                        <span className="font-mono text-xs text-teal-800 dark:text-cyan-300">
                          ({r.field} {r.operator} {String(r.value)})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {canDecide ? (
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
                    <input
                      type="text"
                      value={notes[r.id] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Reviewer note (required when requesting corrections)..."
                      className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (isEditing) {
                            setEditingId(null);
                          } else {
                            setEditingId(r.id);
                            setEditCondition(r.condition_text);
                            setEditValue(String(r.value));
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEditing ? 'Cancel edit' : 'Edit'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => decide(r.id, 'approved')}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Activate</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => decide(r.id, 'correction_requested')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        <MessageSquareWarning className="w-3.5 h-3.5" />
                        <span>Request Corrections</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => decide(r.id, 'rejected')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <span>
                      Reviewed by {row.queue_item.reviewed_by || 'Reviewer'}
                      {row.queue_item.decision_note ? ` · Note: ${row.queue_item.decision_note}` : ''}
                    </span>
                    {r.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => setPage('ripple')}
                        className="font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        View Policy Ripple Impact
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

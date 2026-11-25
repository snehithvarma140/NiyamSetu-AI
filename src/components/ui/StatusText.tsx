import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';

type StateTone =
  | 'active'
  | 'verified'
  | 'applied'
  | 'completed'
  | 'likely_eligible'
  | 'submitted_confirmed'
  | 'open'
  | 'ready_for_portal'
  | 'draft'
  | 'pending'
  | 'proposed'
  | 'modified'
  | 'needs_review'
  | 'possibly_eligible'
  | 'pending_review'
  | 'correction_requested'
  | 'closing_soon'
  | 'outdated'
  | 'rejected'
  | 'not_met'
  | 'not_eligible'
  | 'closed'
  | 'superseded'
  | 'unchanged'
  | 'added'
  | 'cannot_verify';

const LABEL_MAP: Record<StateTone, string> = {
  active: 'Active',
  verified: 'Verified',
  applied: 'Applied',
  completed: 'Completed',
  likely_eligible: 'Likely eligible',
  submitted_confirmed: 'Confirmed Submitted',
  open: 'Open',
  ready_for_portal: 'Ready for Portal',
  draft: 'Draft (awaiting review)',
  pending: 'Pending review',
  proposed: 'Proposed update',
  modified: 'Modified',
  needs_review: 'Needs review',
  possibly_eligible: 'Possibly eligible',
  pending_review: 'Pending review',
  correction_requested: 'Corrections requested',
  closing_soon: 'Closing soon',
  outdated: 'Outdated',
  rejected: 'Rejected',
  not_met: 'Not met',
  not_eligible: 'Not eligible',
  closed: 'Closed',
  superseded: 'Superseded',
  unchanged: 'Unchanged',
  added: 'Added',
  cannot_verify: 'Cannot verify',
};

export const StatusText: React.FC<{ status: string; labelOverride?: string }> = ({
  status,
  labelOverride,
}) => {
  const key = status as StateTone;
  const text = labelOverride || LABEL_MAP[key] || status;

  if (
    key === 'active' ||
    key === 'verified' ||
    key === 'applied' ||
    key === 'completed' ||
    key === 'likely_eligible' ||
    key === 'submitted_confirmed' ||
    key === 'open'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </span>
    );
  }

  if (
    key === 'draft' ||
    key === 'pending' ||
    key === 'proposed' ||
    key === 'modified' ||
    key === 'needs_review' ||
    key === 'possibly_eligible' ||
    key === 'pending_review' ||
    key === 'cannot_verify' ||
    key === 'correction_requested' ||
    key === 'closing_soon' ||
    key === 'outdated'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </span>
    );
  }

  if (
    key === 'rejected' ||
    key === 'not_met' ||
    key === 'not_eligible' ||
    key === 'closed'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 whitespace-nowrap shrink-0">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </span>
    );
  }

  if (key === 'added' || key === 'ready_for_portal') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-cyan-300 whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
      <MinusCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
};

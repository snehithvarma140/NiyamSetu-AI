import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  FilePlus2,
  MessageSquareWarning,
  Paperclip,
  Send,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { VoiceTranscribeButton } from '../voice/VoiceTranscribeButton';
import type {
  ApplicationDraftRecord,
  ComplaintCategory,
  ComplaintChannel,
  ComplaintRecord,
  ComplaintStatus,
  OrganizationType,
} from '../../types/niyamsetu';

interface ComplaintsPanelProps {
  mode?: 'citizen' | 'org' | 'gov';
  prefillApp?: ApplicationDraftRecord | null;
  complaintsOverride?: ComplaintRecord[];
  onRefreshOrg?: () => Promise<void> | void;
}

const DEPARTMENT_OPTIONS: Array<{
  label: string;
  org_type: OrganizationType | 'government';
}> = [
  { label: 'State Social Welfare / Scholarship Dept', org_type: 'government' },
  { label: 'Department of School / Higher Education', org_type: 'college' },
  { label: 'Public Hospital / Aarogyasri Health Board', org_type: 'hospital' },
  { label: 'Lead Bank / NPCI DBT Grievance Desk', org_type: 'bank' },
  { label: 'MeeSeva / CSC Revenue Certificate Desk', org_type: 'other' },
  { label: 'Central Welfare / CPGRAMS Portal', org_type: 'government' },
];

const CATEGORIES: ComplaintCategory[] = [
  'Application Delay',
  'Document Verification Issue',
  'DBT / Bank Payment Delay',
  'Hospital / Health Scheme Issue',
  'College Bonafide / Institution Issue',
  'Portal / Technical Error',
  'Service Quality / Behavior',
];

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

export const ComplaintsPanel: React.FC<ComplaintsPanelProps> = ({
  mode = 'citizen',
  prefillApp,
  complaintsOverride,
  onRefreshOrg,
}) => {
  const {
    user,
    token,
    overview,
    applications,
    complaints,
    submitComplaint,
    updateComplaint,
    complaintPrefillApp,
    setComplaintPrefillApp,
    setAuthModalOpen,
  } = useApp();

  const effectivePrefill = prefillApp ?? complaintPrefillApp;
  const displayedComplaints = complaintsOverride ?? complaints;

  // Citizen submission form state
  const [deptIdx, setDeptIdx] = useState(0);
  const [category, setCategory] = useState<ComplaintCategory>('Application Delay');
  const [schemeId, setSchemeId] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState<ComplaintChannel>('niyamsetu_tracked');
  const [externalRef, setExternalRef] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [attachments, setAttachments] = useState<
    Array<{ name: string; size_bytes: number; mime_type: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Filter & update state
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [officerStatus, setOfficerStatus] = useState<Record<string, ComplaintStatus>>({});
  const [officerNote, setOfficerNote] = useState<Record<string, string>>({});
  const [citizenNote, setCitizenNote] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => {
    if (!effectivePrefill) return;
    setSchemeId(effectivePrefill.scheme_id);
    setApplicationId(effectivePrefill.id);
    setCategory('Application Delay');
    setSubject(
      `SLA Delay Escalation: ${effectivePrefill.scheme_code} (${effectivePrefill.scheme_name})`
    );
    setDescription(
      `Application ${effectivePrefill.portal_reference_number || effectivePrefill.id} submitted on ${
        effectivePrefill.submitted_at
          ? new Date(effectivePrefill.submitted_at).toLocaleDateString('en-IN')
          : 'draft'
      } has elapsed ${effectivePrefill.elapsed_days ?? 0} days (SLA: ${
        effectivePrefill.expected_processing_days ?? 30
      } days). Requesting department status verification and resolution.`
    );
  }, [effectivePrefill]);

  const filteredList = useMemo(() => {
    return displayedComplaints.filter((c) => {
      if (statusFilter === 'open') return c.status !== 'resolved';
      if (statusFilter === 'resolved') return c.status === 'resolved';
      return true;
    });
  }, [displayedComplaints, statusFilter]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 5);
    setAttachments(
      files.map((f) => ({
        name: f.name,
        size_bytes: f.size,
        mime_type: f.type || 'application/pdf',
      }))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    const chosenDept = DEPARTMENT_OPTIONS[deptIdx] || DEPARTMENT_OPTIONS[0];
    setSubmitting(true);
    setFormErr(null);
    setFormMsg(null);
    try {
      const created = await submitComplaint({
        department: chosenDept.label,
        org_type: chosenDept.org_type,
        scheme_id: schemeId || undefined,
        application_id: applicationId || undefined,
        category,
        subject: subject.trim(),
        description: description.trim(),
        attachments,
        submission_channel: channel,
        external_reference_number: channel === 'external_manual' ? externalRef.trim() : undefined,
        reminder_date: reminderDate || undefined,
      });
      setFormMsg(
        `Complaint logged with Reference #${created.reference_number} (${
          created.submission_channel === 'niyamsetu_tracked'
            ? 'NiyamSetu Tracked Desk'
            : 'External Manual Record'
        }).`
      );
      setSubject('');
      setDescription('');
      setExternalRef('');
      setAttachments([]);
      setComplaintPrefillApp(null);
      setExpandedId(created.id);
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Unable to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfficerUpdate = async (cmp: ComplaintRecord) => {
    setUpdatingId(cmp.id);
    setActionErr(null);
    try {
      const nextStatus = officerStatus[cmp.id] || cmp.status;
      const noteText = (officerNote[cmp.id] || '').trim();
      await updateComplaint(cmp.id, {
        status: nextStatus,
        resolution_note: nextStatus === 'resolved' && noteText ? noteText : cmp.resolution_note,
        message: noteText || `Status updated to ${STATUS_LABEL[nextStatus]}.`,
      });
      setOfficerNote((prev) => ({ ...prev, [cmp.id]: '' }));
      if (onRefreshOrg) await onRefreshOrg();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to update complaint status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCitizenFollowUp = async (cmp: ComplaintRecord) => {
    const noteText = (citizenNote[cmp.id] || '').trim();
    if (!noteText) return;
    setUpdatingId(cmp.id);
    setActionErr(null);
    try {
      await updateComplaint(cmp.id, { message: noteText });
      setCitizenNote((prev) => ({ ...prev, [cmp.id]: '' }));
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to post follow-up message.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {mode === 'citizen' && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareWarning
                  className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0"
                  aria-hidden="true"
                />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Raise a Citizen Complaint or Grievance
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Submit directly to a connected department desk or track an external portal complaint you
                filed elsewhere.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Submission Channel Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setChannel('niyamsetu_tracked')}
                className={`text-left rounded-md border p-3 transition-colors cursor-pointer ${
                  channel === 'niyamsetu_tracked'
                    ? 'border-teal-700 dark:border-cyan-400 bg-teal-50/60 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Submit via NiyamSetu Grievance Desk
                </div>
                <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                  Routes directly to the relevant Hospital, Bank, College, MeeSeva, or Government officer
                  queue with a genuine NiyamSetu Reference ID.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setChannel('external_manual')}
                className={`text-left rounded-md border p-3 transition-colors cursor-pointer ${
                  channel === 'external_manual'
                    ? 'border-teal-700 dark:border-cyan-400 bg-teal-50/60 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Log External Portal Complaint Manually
                </div>
                <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                  Already filed on CPGRAMS, Prajavani, or a bank ombudsman? Record its official docket
                  number here for reminders and history.
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Department / Organization *
                </label>
                <select
                  value={deptIdx}
                  onChange={(e) => setDeptIdx(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                >
                  {DEPARTMENT_OPTIONS.map((opt, idx) => (
                    <option key={opt.label} value={idx}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Complaint Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Related Scheme (Optional)
                </label>
                <select
                  value={schemeId}
                  onChange={(e) => setSchemeId(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                >
                  <option value="">General / Not scheme-specific</option>
                  {(overview?.schemes || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {applications.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Linked Application (Optional)
                  </label>
                  <select
                    value={applicationId}
                    onChange={(e) => setApplicationId(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                  >
                    <option value="">None</option>
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.scheme_code} · {a.portal_reference_number || a.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {channel === 'external_manual' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    External Portal Reference #
                  </label>
                  <input
                    type="text"
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                    placeholder="e.g., PMOPG/E/2026/00412"
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Follow-Up Reminder Date (Optional)
                </label>
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Complaint Subject *
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Concise summary of the issue or delay"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Issue Description *
                  </label>
                  <VoiceTranscribeButton
                    onTranscript={(txt) =>
                      setDescription((prev) => (prev ? `${prev} ${txt}` : txt))
                    }
                    disabled={submitting}
                    label="Dictate Issue"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe dates, acknowledgement numbers, officer remarks, or what assistance you need..."
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                />
              </div>
            </div>

            {/* Supporting File Metadata Attachment */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer hover:border-teal-700">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach Supporting Proofs (up to 5 files)</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.txt"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
                {attachments.map((att, idx) => (
                  <span
                    key={`${att.name}-${idx}`}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-300"
                  >
                    <FilePlus2 className="w-3 h-3" />
                    <span>{att.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((p) => p.filter((_, i) => i !== idx))}
                      className="text-rose-600 cursor-pointer"
                      aria-label={`Remove attachment ${att.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? 'Submitting...'
                    : channel === 'external_manual'
                      ? 'Save External Complaint Log'
                      : 'Submit Tracked Complaint'}
                </span>
              </button>
            </div>

            {formMsg && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formMsg}</span>
              </div>
            )}
            {formErr && (
              <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">{formErr}</div>
            )}
          </form>
        </section>
      )}

      {/* Complaints List & Resolution Desk */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {mode === 'citizen'
                ? `Complaint History & Status Tracker (${displayedComplaints.length})`
                : `Assigned Citizen Grievances (${displayedComplaints.length})`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === 'citizen'
                ? 'Shows both NiyamSetu tracked complaints and external portal logs with timelines and reminders.'
                : 'Review supporting proofs, post official updates, or mark complaints resolved.'}
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
            {(['all', 'open', 'resolved'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer whitespace-nowrap capitalize ${
                  statusFilter === f
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {actionErr && (
          <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
            {actionErr}
          </div>
        )}

        {filteredList.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
            {user
              ? 'No complaints found in this view.'
              : 'Sign in to view or submit complaints.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredList.map((cmp) => {
              const isExpanded = expandedId === cmp.id;
              return (
                <div key={cmp.id} className="py-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-teal-800 dark:text-cyan-300">
                          {cmp.reference_number}
                        </span>
                        <span>·</span>
                        <span
                          className={`font-semibold ${
                            cmp.status === 'resolved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : cmp.status === 'escalated'
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {STATUS_LABEL[cmp.status]}
                        </span>
                        <span>·</span>
                        <span>
                          {cmp.submission_channel === 'niyamsetu_tracked'
                            ? 'NiyamSetu Tracked'
                            : 'External Self-Logged'}
                        </span>
                        <span>·</span>
                        <span>{cmp.category}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {cmp.subject}
                      </h4>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {cmp.department} · Citizen: {cmp.citizen_name}
                        {cmp.reminder_date && (
                          <span className="inline-flex items-center gap-1 ml-2 font-mono text-amber-700 dark:text-amber-400">
                            <Calendar className="w-3 h-3" /> Reminder {cmp.reminder_date}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : cmp.id)}
                      className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isExpanded ? 'Hide Details' : 'Inspect & Timeline'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-4 text-xs">
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {cmp.description}
                      </p>

                      {cmp.attachments.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                          <span className="font-sans font-semibold">Attached files:</span>
                          {cmp.attachments.map((a, i) => (
                            <span key={`${a.name}-${i}`}>
                              {a.name} ({Math.max(1, Math.round(a.size_bytes / 1024))} KB)
                            </span>
                          ))}
                        </div>
                      )}

                      {cmp.resolution_note && (
                        <div className="rounded border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5 text-emerald-900 dark:text-emerald-200">
                          <strong>Official Resolution Note:</strong> {cmp.resolution_note}
                        </div>
                      )}

                      {/* Updates Timeline */}
                      <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          Activity &amp; Status Updates
                        </div>
                        <ul className="space-y-1.5">
                          {cmp.updates.map((u, idx) => (
                            <li
                              key={idx}
                              className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 text-[11px] border-b border-slate-200/60 dark:border-slate-800/60 pb-1 last:border-b-0"
                            >
                              <span className="text-slate-700 dark:text-slate-300">
                                <strong>{u.actor}:</strong> {u.message}
                              </span>
                              <span className="font-mono text-slate-500 tabular-nums shrink-0">
                                {new Date(u.timestamp).toLocaleString('en-IN')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Citizen follow-up OR Officer action */}
                      {mode === 'citizen' ? (
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <input
                            type="text"
                            value={citizenNote[cmp.id] || ''}
                            onChange={(e) =>
                              setCitizenNote((p) => ({ ...p, [cmp.id]: e.target.value }))
                            }
                            placeholder="Add follow-up remark or external portal update..."
                            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            disabled={updatingId === cmp.id}
                            onClick={() => void handleCitizenFollowUp(cmp)}
                            className="px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Post Update
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <select
                            value={officerStatus[cmp.id] || cmp.status}
                            onChange={(e) =>
                              setOfficerStatus((p) => ({
                                ...p,
                                [cmp.id]: e.target.value as ComplaintStatus,
                              }))
                            }
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          >
                            <option value="submitted">Submitted</option>
                            <option value="under_review">Under Review</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="escalated">Escalated</option>
                          </select>
                          <input
                            type="text"
                            value={officerNote[cmp.id] || ''}
                            onChange={(e) =>
                              setOfficerNote((p) => ({ ...p, [cmp.id]: e.target.value }))
                            }
                            placeholder="Official officer response / resolution note..."
                            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            disabled={updatingId === cmp.id}
                            onClick={() => void handleOfficerUpdate(cmp)}
                            className="px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            {updatingId === cmp.id ? 'Updating...' : 'Save Resolution Update'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

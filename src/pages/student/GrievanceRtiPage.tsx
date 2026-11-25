import React, { useEffect, useState } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { VoiceTranscribeButton } from '../../components/voice/VoiceTranscribeButton';
import { SpeakButton } from '../../components/voice/SpeakButton';
import type { VoiceLanguageCode } from '../../types/niyamsetu';

interface DraftResponse {
  draft_text: string;
  cited_clauses: string[];
  submission_steps: string[];
  disclaimer: string;
}

const SCENARIO_TEMPLATES: Array<{
  label: string;
  mode: 'GRIEVANCE' | 'RTI';
  subject: string;
  details: string;
}> = [
  {
    label: 'Income Ceiling Clarification',
    mode: 'GRIEVANCE',
    subject: 'Clarification regarding family income threshold under Sample Notification SN-2025/01',
    details:
      'My application was marked ineligible citing an income of ₹2,80,000, whereas Amendment SN-2026/07 proposes enhancing the ceiling to ₹3,00,000.',
  },
  {
    label: 'Name Initial Mismatch Appeal',
    mode: 'GRIEVANCE',
    subject: 'Request to accept minor initial mismatch between Revenue Income Certificate and Marksheet',
    details:
      'My Income Certificate omits my middle/last initial while my Board Marksheet prints my full initial. Both belong to the same Aadhaar-verified student profile.',
  },
  {
    label: 'RTI: Marks Cutoff Status',
    mode: 'RTI',
    subject: 'RTI request on approval status of AICTE Pragati Corrigendum PRG-2026/09 (65% to 60%)',
    details:
      'Kindly inform the effective date, nodal office circular number, and current verification status of the 60% marks relaxation for AICTE Pragati applicants.',
  },
  {
    label: 'Delayed DBT Reimbursement',
    mode: 'GRIEVANCE',
    subject: 'Delay in quarterly RTF-06 tuition reimbursement credit despite college e-KYC verification',
    details:
      'My institutional biometric verification and 78% attendance were approved 60 days ago, yet the first quarterly disbursement to our joint account is pending.',
  },
  {
    label: 'RTI: Hostel Mess Grant Extension',
    mode: 'RTI',
    subject: 'RTI regarding extended submission timeline under Circular HST-2026/04',
    details:
      'Please clarify whether students whose college hostel allotments completed in December 2026 remain eligible under the 20 January 2027 extension.',
  },
  {
    label: 'Saksham UDID Verification Query',
    mode: 'GRIEVANCE',
    subject: 'Portal error rejecting renewed UDID Disability Card under AICTE Saksham (SKM-09)',
    details:
      'My updated 45% benchmark UDID certificate issued by the District Medical Board is failing automated portal validation.',
  },
];

export const GrievanceRtiPage: React.FC<{ langOverride?: VoiceLanguageCode }> = ({
  langOverride,
}) => {
  const { token, lang, user, setAuthModalOpen } = useApp();
  const effectiveLang: VoiceLanguageCode = langOverride || lang;
  const [mode, setMode] = useState<'GRIEVANCE' | 'RTI'>('GRIEVANCE');
  const [subject, setSubject] = useState(SCENARIO_TEMPLATES[0].subject);
  const [details, setDetails] = useState(
    user?.name
      ? `${SCENARIO_TEMPLATES[0].details} (Applicant: ${user.name})`
      : SCENARIO_TEMPLATES[0].details
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.name) return;
    setDetails((prev) => {
      if (prev === SCENARIO_TEMPLATES[0].details) {
        return `${SCENARIO_TEMPLATES[0].details} (Applicant: ${user.name})`;
      }
      return prev;
    });
  }, [user?.name]);

  const generateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DraftResponse>('/grievance/draft', {
        method: 'POST',
        token,
        body: { mode, subject, details, lang: effectiveLang },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate draft.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.draft_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard access was blocked by the browser. Please select and copy the draft manually.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Grievance & RTI Draft Assistant
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Draft structured grievance representations or Right to Information (RTI) requests citing
          verified active clauses in English, Hindi, or Telugu. Drafts are starting points for your
          review, not legal advice.
        </p>
      </div>

      <form
        onSubmit={generateDraft}
        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Predefined Grievance & RTI Templates:
          </div>
          <div className="flex flex-wrap gap-2">
            {SCENARIO_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => {
                  setMode(tpl.mode);
                  setSubject(tpl.subject);
                  setDetails(tpl.details);
                }}
                className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
              >
                {tpl.mode}: {tpl.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-md bg-slate-100 dark:bg-slate-800 w-fit">
          {(['GRIEVANCE', 'RTI'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-semibold rounded cursor-pointer ${
                mode === m
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {m === 'GRIEVANCE' ? 'Grievance Representation' : 'RTI Application'}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Subject
          </label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Describe your situation
            </label>
            <VoiceTranscribeButton
              onTranscript={(txt) => setDetails((prev) => (prev ? `${prev} ${txt}` : txt))}
              disabled={loading}
              langOverride={effectiveLang}
              label="Dictate Details"
            />
          </div>
          <textarea
            rows={3}
            required
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
        >
          {loading ? 'Drafting with Gemini...' : `Generate ${mode} Draft`}
        </button>
      </form>

      {result && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Generated Draft for Review
            </h2>
            <div className="flex items-center gap-2">
              <SpeakButton
                text={result.draft_text}
                label="Listen to Draft"
                langOverride={effectiveLang}
                compact
              />
              <button
                type="button"
                onClick={copyText}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy draft'}</span>
              </button>
            </div>
          </div>

          <pre className="whitespace-pre-wrap rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200 font-sans">
            {result.draft_text}
          </pre>

          {result.cited_clauses.length > 0 && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold">Referenced clauses:</span>{' '}
              <span className="font-mono">{result.cited_clauses.join(' · ')}</span>
            </div>
          )}

          {result.submission_steps.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                General Submission Steps
              </div>
              <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-400 space-y-1">
                {result.submission_steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-amber-700 dark:text-amber-400 border-t border-slate-200 dark:border-slate-800 pt-3">
            {result.disclaimer}
          </p>
        </section>
      )}
    </div>
  );
};

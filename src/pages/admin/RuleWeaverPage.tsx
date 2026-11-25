import React, { useEffect, useState } from 'react';
import { AlertCircle, FileUp, GitCompare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import type { DocumentRecord, RuleRecord, SchemeRecord } from '../../types/niyamsetu';
import { AdminGuardBanner } from './AdminGuardBanner';

interface ComparisonRow {
  rule_key: string;
  label: string;
  old_rule: RuleRecord | null;
  new_rule: RuleRecord | null;
  old_display: string;
  new_display: string;
  change_type: 'added' | 'modified' | 'removed' | 'unchanged';
  citation: string;
  review_status: RuleRecord['status'];
}

interface ComparisonResponse {
  scheme: SchemeRecord;
  documents: DocumentRecord[];
  comparison: ComparisonRow[];
}

const SAMPLE_CORRIGENDA: Array<{
  label: string;
  schemeId: string;
  title: string;
  docNumber: string;
  effectiveDate: string;
  rawText: string;
}> = [
  {
    label: 'SN-2026/11 (PM-01 Marks)',
    schemeId: 'sch-pm-01',
    title: 'Sample Corrigendum SN-2026/11 — Minimum Marks Adjustment',
    docNumber: 'SN-2026/11',
    effectiveDate: '2026-11-25',
    rawText:
      'Page 1, Clause 2(a): In partial modification of SN-2025/01 Clause 4(b), the minimum qualifying aggregate marks requirement is revised from 60% to 55% for all Post-Matric applicants.\nPage 1, Clause 2(b): Applicants must additionally attach a Bonafide Student Certificate.',
  },
  {
    label: 'MED-2026/18 (Medical Stipend)',
    schemeId: 'sch-med-10',
    title: 'Corrigendum MED-2026/18 — Medical & Nursing Income Ceiling Revision',
    docNumber: 'MED-2026/18',
    effectiveDate: '2026-12-01',
    rawText:
      'Page 1, Clause 3(a): Annual family income ceiling for State Medical & Nursing Clinical Stipend is enhanced from ₹4,00,000 to ₹4,50,000 for government medical college interns.\nPage 1, Clause 3(b): Monthly clinical internship stipend disbursement requires biometric hospital attendance >= 80%.',
  },
  {
    label: 'SPR-2026/12 (Khelo Sports)',
    schemeId: 'sch-spr-16',
    title: 'Notification SPR-2026/12 — Khelo Sports Merit Cutoff Update',
    docNumber: 'SPR-2026/12',
    effectiveDate: '2026-12-05',
    rawText:
      'Page 1, Clause 1(c): Minimum academic attendance exemption is granted up to 50% qualifying marks for National Camp medalists under Khelo Sports Merit Grant.\nPage 1, Clause 2(a): Last date for online Sports Merit certificate upload is extended to 2026-12-30.',
  },
  {
    label: 'HST-2026/09 (Hostel Grant)',
    schemeId: 'sch-hst-07',
    title: 'Circular HST-2026/09 — Hostel Mess Allowance Revision',
    docNumber: 'HST-2026/09',
    effectiveDate: '2026-12-10',
    rawText:
      'Page 1, Clause 4(a): Monthly Hostel & Mess Allowance cap for eligible residential students is increased from ₹1,500 to ₹2,200 per month.\nPage 1, Clause 4(b): Hostel Warden monthly attendance log must be countersigned by the Institution Head.',
  },
];

export const RuleWeaverPage: React.FC = () => {
  const { token, overview, refreshOverview, setPage, user } = useApp();
  const [schemeId, setSchemeId] = useState('sch-pm-01');
  const [data, setData] = useState<ComparisonResponse | null>(null);

  // Ingest new notification form
  const [title, setTitle] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('2026-11-25');
  const [rawText, setRawText] = useState('');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadComparison = async () => {
    try {
      setError(null);
      const res = await apiRequest<ComparisonResponse>(`/ruleweaver/comparison/${schemeId}`, {
        token,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load scheme version comparison.');
    }
  };

  useEffect(() => {
    void loadComparison();
  }, [schemeId, token, overview]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      const txt = await file.text();
      setRawText(txt);
      setFileBase64(null);
      setFileMime(null);
    } else {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      setFileBase64(btoa(bin));
      setFileMime(file.type || 'application/pdf');
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngesting(true);
    setError(null);
    setIngestMsg(null);
    try {
      const res = await apiRequest<{ extracted_rules: RuleRecord[] }>('/ruleweaver/ingest', {
        method: 'POST',
        token,
        body: {
          title,
          docNumber,
          schemeId,
          effectiveDate,
          rawText,
          inlineBase64: fileBase64 || undefined,
          mimeType: fileMime || undefined,
        },
      });
      setIngestMsg(
        `Extracted ${res.extracted_rules.length} rule(s) from ${docNumber} as DRAFT into Human Review Queue.`
      );
      setTitle('');
      setDocNumber('');
      setRawText('');
      setFileBase64(null);
      setFileName(null);
      await refreshOverview();
      await loadComparison();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notification ingestion failed.');
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            RuleWeaver — Document Ingestion & Version Comparison
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Extract structured rules from official notifications and compare versions. Ambiguities
            and changes are queued for Human Review before activation.
          </p>
        </div>

        <select
          value={schemeId}
          onChange={(e) => setSchemeId(e.target.value)}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          aria-label="Select scheme"
        >
          {(overview?.schemes || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
      </div>

      <AdminGuardBanner />

      {/* Document Version Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {doc.title}
                </h2>
                <StatusText status={doc.verification_status} />
              </div>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {doc.doc_number} · v{doc.version} · Effective {doc.effective_date}
              </div>
              <div className="pt-1">
                <SourceCitationButton documentId={doc.id} label="Inspect extracted pages" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Version Comparison Table */}
      {data && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Version Comparison (v1 vs Latest)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setPage('review')}
              className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
            >
              Open Human Review Queue
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-semibold">Rule</th>
                  <th className="py-3 px-4 font-semibold">Old (v1)</th>
                  <th className="py-3 px-4 font-semibold">Latest Amendment</th>
                  <th className="py-3 px-4 font-semibold">Change</th>
                  <th className="py-3 px-4 font-semibold">Review State</th>
                  <th className="py-3 px-4 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.comparison.map((row) => {
                  const refRule = row.new_rule || row.old_rule;
                  return (
                    <tr key={row.rule_key}>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {row.label}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {row.old_display}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {row.new_rule ? (
                          <span className="space-x-2">
                            {row.old_rule && (
                              <del className="text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 rounded">
                                {row.old_display}
                              </del>
                            )}
                            <ins className="no-underline font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
                              {row.new_display}
                            </ins>
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">No change</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={row.change_type} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={row.review_status} />
                      </td>
                      <td className="py-3 px-4">
                        {refRule && (
                          <SourceCitationButton
                            documentId={refRule.document_id}
                            pageNumber={refRule.page_number}
                            clauseRef={refRule.clause_reference}
                            label={row.citation}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Upload & Extract New Notification with Gemini */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Ingest New Notification with Gemini RuleWeaver
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Extracted rules start as DRAFT and enter the Human Review Queue automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_CORRIGENDA.map((sample) => (
              <button
                key={sample.docNumber}
                type="button"
                onClick={() => {
                  setSchemeId(sample.schemeId);
                  setTitle(sample.title);
                  setDocNumber(sample.docNumber);
                  setEffectiveDate(sample.effectiveDate);
                  setRawText(sample.rawText);
                }}
                className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
              >
                Load {sample.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleIngest} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Notification Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sample Corrigendum SN-2026/11"
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Document Number
              </label>
              <input
                type="text"
                required
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="e.g., SN-2026/11"
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Effective Date
              </label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Notification Text (or upload PDF / Image / Text below)
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-cyan-300 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" />
                <span>{fileName ? `Selected: ${fileName}` : 'Attach PDF / Image / TXT'}</span>
                <input
                  type="file"
                  accept=".txt,.pdf,.png,.jpg,.jpeg"
                  onChange={handleFilePick}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste notification clauses with page/clause numbers..."
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
            />
          </div>

          {error && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {ingestMsg && (
            <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-200">
              {ingestMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={ingesting || (user?.role !== 'ADMIN' && user?.role !== 'PLATFORM_ADMIN')}
            className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
          >
            {ingesting ? 'Extracting Rules via Gemini...' : 'Extract Draft Rules'}
          </button>
        </form>
      </section>
    </div>
  );
};

import React, { useState } from 'react';
import { ArrowRight, CheckSquare, Compass, ExternalLink, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { VoiceTranscribeButton } from '../voice/VoiceTranscribeButton';
import type { ServiceNavigatorResult } from '../../types/niyamsetu';

const QUICK_PROBLEMS = [
  'Need an income certificate for ePass scholarship',
  'Bank DBT Aadhaar seeding failed for scholarship money',
  'Need hospital Aarogyasri or UDID disability certificate',
  'How to apply for Amma Vodi or Kalyana Lakshmi scheme',
];

export const ServiceNavigatorPanel: React.FC = () => {
  const { lang, token, overview, openSchemeInAssistant, setPage } = useApp();
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ServiceNavigatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (queryText?: string) => {
    const q = (queryText ?? problem).trim();
    if (!q) return;
    if (queryText) setProblem(queryText);
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ result: ServiceNavigatorResult }>('/navigator/resolve', {
        method: 'POST',
        token,
        body: { problem: q, lang },
      });
      setResult(res.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resolve government service right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCode = (code: string) => {
    const found = overview?.schemes.find(
      (s) => s.code.toLowerCase() === code.trim().toLowerCase()
    );
    if (found) {
      openSchemeInAssistant(found.id);
    } else {
      setPage('schemes_hub');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Citizen Service Navigator
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Describe any citizen problem in plain words to find the right department, required
            documents, and official step-by-step path.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSearch();
        }}
        className="flex flex-col sm:flex-row gap-2.5"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="e.g., My bank account is not seeded with NPCI for scholarship DBT..."
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            aria-label="Describe your citizen service need"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <VoiceTranscribeButton
            onTranscript={(txt) => setProblem((prev) => (prev ? `${prev} ${txt}` : txt))}
            disabled={loading}
            label="Speak"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <span>{loading ? 'Mapping Service...' : 'Find Department & Steps'}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
          Common searches:
        </span>
        {QUICK_PROBLEMS.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => void handleSearch(sample)}
            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-700 dark:text-slate-300 hover:border-teal-700 cursor-pointer"
          >
            {sample}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">{error}</div>
      )}

      {result && (
        <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="text-[11px] font-mono text-teal-800 dark:text-cyan-300 font-semibold">
                {result.department}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {result.service_name}
              </h3>
            </div>
            {result.official_portal && (
              <a
                href={result.official_portal}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:border-teal-700 whitespace-nowrap shrink-0"
              >
                <span>Open Official Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                Required Documents Checklist
              </div>
              <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                {result.required_documents.map((doc) => (
                  <li key={doc} className="flex items-start gap-2">
                    <CheckSquare className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400 shrink-0 mt-0.5" />
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                Official Action Steps
              </div>
              <ol className="space-y-1.5 list-decimal list-inside text-slate-700 dark:text-slate-300">
                {result.official_steps.map((step, i) => (
                  <li key={`${i}-${step}`} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{result.verified_vs_general_note}</span>
            {result.related_scheme_codes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span>Prepare scheme:</span>
                {result.related_scheme_codes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleOpenCode(code)}
                    className="font-mono font-bold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
                  >
                    {code}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

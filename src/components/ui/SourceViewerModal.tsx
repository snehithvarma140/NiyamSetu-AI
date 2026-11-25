import React, { useEffect, useState } from 'react';
import { X, FileText, ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type { DocumentPage, DocumentRecord, RuleRecord } from '../../types/niyamsetu';
import { StatusText } from './StatusText';

interface DocPagesResponse {
  document: DocumentRecord;
  pages: DocumentPage[];
  rules: RuleRecord[];
}

export const SourceViewerModal: React.FC = () => {
  const { sourceTarget, closeSourceViewer, token } = useApp();
  const [data, setData] = useState<DocPagesResponse | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceTarget) return;
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<DocPagesResponse>(`/documents/${sourceTarget.documentId}/pages`, { token })
      .then((res) => {
        if (!active) return;
        setData(res);
        const match =
          res.pages.find((p) => p.page_number === sourceTarget.pageNumber) || res.pages[0];
        setSelectedPage(match ? match.page_number : null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load source document.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sourceTarget, token]);

  if (!sourceTarget) return null;

  const currentPage = data?.pages.find((p) => p.page_number === selectedPage) || data?.pages[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Official Source Document Evidence"
    >
      <div className="w-full max-w-3xl rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {data?.document.title || 'Source Document Evidence'}
            </h3>
          </div>
          <button
            type="button"
            onClick={closeSourceViewer}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close source viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {loading && (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading extracted source pages...
            </div>
          )}

          {error && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {data.document.doc_number}
                </span>
                <span aria-hidden="true">·</span>
                <span>{data.document.authority}</span>
                <span aria-hidden="true">·</span>
                <span>Effective {data.document.effective_date}</span>
                <span aria-hidden="true">·</span>
                <StatusText status={data.document.verification_status} />
                {sourceTarget.clauseRef && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-teal-800 dark:text-cyan-300">
                      Clause {sourceTarget.clauseRef}
                    </span>
                  </>
                )}
              </div>

              {data.pages.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Pages:</span>
                  {data.pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPage(p.page_number)}
                      className={`px-2.5 py-1 text-xs font-mono rounded border cursor-pointer transition-colors ${
                        currentPage?.page_number === p.page_number
                          ? 'bg-teal-800 text-white border-teal-800 dark:bg-cyan-500 dark:text-slate-950 dark:border-cyan-500'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-700'
                      }`}
                    >
                      p.{p.page_number}
                    </button>
                  ))}
                  {currentPage && (
                    <span className="ml-auto text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      OCR/Text confidence {Math.round(currentPage.extraction_confidence * 100)}%
                    </span>
                  )}
                </div>
              )}

              {currentPage ? (
                <pre className="whitespace-pre-wrap rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200 font-mono">
                  {currentPage.text}
                </pre>
              ) : (
                <p className="text-sm text-slate-500">No extracted page text recorded.</p>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Source reference: {data.document.source_url}</span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  <span>{data.rules.length} extracted rule(s)</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

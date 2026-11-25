import React from 'react';
import { FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface SourceCitationButtonProps {
  documentId: string;
  pageNumber?: number;
  clauseRef?: string;
  label: string;
}

export const SourceCitationButton: React.FC<SourceCitationButtonProps> = ({
  documentId,
  pageNumber,
  clauseRef,
  label,
}) => {
  const { openSourceViewer } = useApp();
  return (
    <button
      type="button"
      onClick={() => openSourceViewer({ documentId, pageNumber, clauseRef })}
      className="inline-flex items-center gap-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-2 py-0.5 text-xs font-mono text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 hover:text-teal-800 dark:hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      title="Open exact source document page"
    >
      <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
};

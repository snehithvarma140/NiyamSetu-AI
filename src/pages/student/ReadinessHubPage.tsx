import React from 'react';
import { FileCheck2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FormSathiPage } from './FormSathiPage';

export const ReadinessHubPage: React.FC = () => {
  const { lang } = useApp();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-teal-800 dark:text-cyan-300 mb-1">
            <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>FORMSATHI AI · 7-STAGE APPLICATION ASSISTANT</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {lang === 'te' ? 'అప్లికేషన్ అసిస్టెంట్ (FormSathi AI)' : 'Application Assistant'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select a scheme, inspect its 8-question procedure &amp; visual flow, prepare fields and
            Vault documents, review AI mapping, and confirm portal submission yourself.
          </p>
        </div>
      </div>

      <FormSathiPage />
    </div>
  );
};

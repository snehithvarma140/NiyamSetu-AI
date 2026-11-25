import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AdminGuardBanner: React.FC = () => {
  const { user, signInAsDemoRole } = useApp();
  if (user && (user.role === 'ADMIN' || user.role === 'PLATFORM_ADMIN')) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200">
        <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Administrator Role Required for Mutations:</span> You are
          currently signed in as <span className="font-mono">{user?.role || 'Guest'}</span>.
          Server-side RBAC blocks approving rules, ingesting notifications, or applying Policy
          Ripple updates until you switch to an Administrator workspace.
        </div>
      </div>
      <button
        type="button"
        onClick={() => signInAsDemoRole('ADMIN')}
        className="px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
      >
        Switch to Administrator
      </button>
    </div>
  );
};

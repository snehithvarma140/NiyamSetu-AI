import React, { useEffect, useState } from 'react';
import { Activity, CheckSquare, GitCompare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RuleWeaverPage } from './RuleWeaverPage';
import { HumanReviewQueuePage } from './HumanReviewQueuePage';
import { PolicyRipplePage } from './PolicyRipplePage';

export type GovernanceHubTab = 'ruleweaver' | 'review' | 'ripple';

export const GovernanceLifecycleHubPage: React.FC<{ initialTab?: GovernanceHubTab }> = ({
  initialTab,
}) => {
  const { overview } = useApp();
  const [tab, setTab] = useState<GovernanceHubTab>(initialTab || 'ruleweaver');

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  const draftCount = overview?.metrics.draft_rules ?? 0;

  const tabs: Array<{
    id: GovernanceHubTab;
    label: string;
    badge?: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'ruleweaver',
      label: '1. RuleWeaver Compare & Ingest',
      icon: GitCompare,
    },
    {
      id: 'review',
      label: '2. Human Review Queue',
      badge: draftCount,
      icon: CheckSquare,
    },
    {
      id: 'ripple',
      label: '3. 3D Policy Ripple Engine',
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Policy Lifecycle & Governance Hub
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Extract structured clauses from notifications, review AI drafts in human-in-the-loop governance, and propagate updates across all connected dependencies.
          </p>
        </div>

        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0"
          role="tablist"
          aria-label="Policy Lifecycle Stages"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                      active
                        ? 'bg-white/20 dark:bg-slate-950/20'
                        : 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {tab === 'ruleweaver' && <RuleWeaverPage />}
        {tab === 'review' && <HumanReviewQueuePage />}
        {tab === 'ripple' && <PolicyRipplePage />}
      </div>
    </div>
  );
};

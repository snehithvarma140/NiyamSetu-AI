import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { StatusText } from '../../components/ui/StatusText';
import type { WhatIfResult } from '../../types/niyamsetu';

export const WhatIfSimulatorPage: React.FC = () => {
  const { token, overview } = useApp();
  const [schemeId, setSchemeId] = useState<string>('sch-pm-01');
  const [income, setIncome] = useState<string>('280000');
  const [marks, setMarks] = useState<string>('72');
  const [sim, setSim] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    apiRequest<{ simulation: WhatIfResult }>('/whatif/simulate', {
      method: 'POST',
      token,
      body: {
        schemeId,
        family_income: income === '' ? null : Number(income),
        marks_percent: marks === '' ? null : Number(marks),
      },
    })
      .then((res) => {
        if (active) setSim(res.simulation);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to run simulation right now.');
        }
      });
    return () => {
      active = false;
    };
  }, [schemeId, income, marks, token, overview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            What-If Rule Version Simulator
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Compare baseline notification criteria (v1) against pending/active amendments (v2) side
            by side using deterministic rules.
          </p>
        </div>
        <select
          value={schemeId}
          onChange={(e) => setSchemeId(e.target.value)}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          aria-label="Select scheme for What-If simulation"
        >
          {(overview?.schemes || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="wi-income" className="font-medium text-slate-700 dark:text-slate-300">
                Family Annual Income (₹)
              </label>
              <span className="font-mono font-semibold tabular-nums text-teal-800 dark:text-cyan-300">
                ₹{Number(income || 0).toLocaleString('en-IN')}
              </span>
            </div>
            <input
              id="wi-income"
              type="number"
              min={0}
              step={5000}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
            />
            <input
              type="range"
              min={0}
              max={800000}
              step={10000}
              value={Math.min(800000, Math.max(0, Number(income || 0)))}
              onChange={(e) => setIncome(e.target.value)}
              className="w-full accent-teal-800 dark:accent-cyan-400"
              aria-label="Adjust family income slider"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="wi-marks" className="font-medium text-slate-700 dark:text-slate-300">
                Qualifying Marks (%)
              </label>
              <span className="font-mono font-semibold tabular-nums text-teal-800 dark:text-cyan-300">
                {marks || 0}%
              </span>
            </div>
            <input
              id="wi-marks"
              type="number"
              min={0}
              max={100}
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.min(100, Math.max(0, Number(marks || 0)))}
              onChange={(e) => setMarks(e.target.value)}
              className="w-full accent-teal-800 dark:accent-cyan-400"
              aria-label="Adjust marks slider"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 self-center">
            Quick scenarios:
          </span>
          {[
            { label: '₹1,50,000 · 65% (Universal Band)', i: '150000', m: '65' },
            { label: '₹2,20,000 · 70% (Base Eligible)', i: '220000', m: '70' },
            { label: '₹2,80,000 · 72% (Outcome Flip Band)', i: '280000', m: '72' },
            { label: '₹3,40,000 · 80% (High Merit)', i: '340000', m: '80' },
            { label: '₹4,50,000 · 85% (Medical / SAK Band)', i: '450000', m: '85' },
            { label: '₹7,50,000 · 90% (AICTE / Research Band)', i: '750000', m: '90' },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setIncome(preset.i);
                setMarks(preset.m);
              }}
              className="rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {sim && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 font-semibold">Condition</th>
                    <th className="py-3 px-4 font-semibold">Baseline Notification (v1)</th>
                    <th className="py-3 px-4 font-semibold">Latest Amendment (v2)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {sim.rows.map((r) => (
                    <tr key={r.rule_key}>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {r.label}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {r.v1_display}
                          </span>
                          <StatusText
                            status={r.v1_outcome === 'met' ? 'active' : 'not_met'}
                            labelOverride={r.v1_outcome === 'met' ? 'Met' : 'Not met'}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {r.v2_display}
                          </span>
                          <StatusText
                            status={r.v2_outcome === 'met' ? 'active' : 'not_met'}
                            labelOverride={r.v2_outcome === 'met' ? 'Met' : 'Not met'}
                          />
                          {r.v2_status !== 'active' && (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              (Draft — pending review)
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className={`rounded-lg border p-5 space-y-2 ${
              sim.outcome_changed
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span>
                {sim.outcome_changed ? 'Eligibility Outcome Changes' : 'Outcome Unchanged'}
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span className="font-normal text-slate-700 dark:text-slate-300">
                v1: {sim.v1_eligible ? 'Eligible' : 'Not Eligible'} · v2:{' '}
                {sim.v2_eligible ? 'Eligible' : 'Not Eligible'}
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">{sim.explanation}</p>
          </section>
        </>
      )}
    </div>
  );
};

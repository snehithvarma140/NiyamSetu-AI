import React, { useState } from 'react';

export interface BarDatum {
  label: string;
  sublabel?: string;
  value: number;
  maxValue?: number;
  colorClass?: string;
  badge?: string;
}

export const HorizontalBarChart: React.FC<{
  title: string;
  subtitle?: string;
  data: BarDatum[];
  valueSuffix?: string;
  emptyText?: string;
}> = ({ title, subtitle, data, valueSuffix = '', emptyText = 'No metrics available yet.' }) => {
  const maxVal = Math.max(1, ...data.map((d) => d.maxValue ?? d.value));

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {data.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item, idx) => {
            const pct = Math.max(4, Math.min(100, Math.round((item.value / maxVal) * 100)));
            return (
              <div key={`${item.label}-${idx}`} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="font-mono tabular-nums font-bold text-teal-800 dark:text-cyan-300 shrink-0">
                    {item.value}
                    {valueSuffix}
                  </span>
                </div>
                {item.sublabel && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {item.sublabel}
                  </div>
                )}
                <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      item.colorClass || 'bg-teal-700 dark:bg-cyan-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  textColorClass?: string;
}

export const DonutChart: React.FC<{
  title: string;
  subtitle?: string;
  centerLabel: string;
  centerValue: string | number;
  slices: DonutSlice[];
}> = ({ title, subtitle, centerLabel, centerValue, slices }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = Math.max(
    1,
    slices.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  );
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const segments = slices.map((slice, idx) => {
    const val = Math.max(0, slice.value);
    const ratio = val / total;
    const dashLen = ratio * circumference;
    const offset = -cumulative * circumference;
    cumulative += ratio;
    return { ...slice, idx, dashLen, offset, pct: Math.round(ratio * 100) };
  });

  const activeSlice = hoveredIdx !== null ? segments[hoveredIdx] : null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 144 144" className="w-full h-full -rotate-90">
            <circle
              cx="72"
              cy="72"
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-slate-100 dark:text-slate-800"
              strokeWidth="18"
            />
            {segments.map((seg) => (
              <circle
                key={`circle-${seg.label}-${seg.idx}`}
                cx="72"
                cy="72"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={hoveredIdx === seg.idx ? 22 : 18}
                strokeDasharray={`${seg.dashLen} ${circumference}`}
                strokeDashoffset={seg.offset}
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(seg.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
            <span className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {activeSlice ? activeSlice.value : centerValue}
            </span>
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-tight">
              {activeSlice ? `${activeSlice.label} (${activeSlice.pct}%)` : centerLabel}
            </span>
          </div>
        </div>

        <div className="flex-1 w-full space-y-2">
          {segments.map((seg) => (
            <div
              key={`legend-${seg.label}-${seg.idx}`}
              onMouseEnter={() => setHoveredIdx(seg.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between gap-2 text-xs px-2 py-1 rounded transition-colors cursor-default ${
                hoveredIdx === seg.idx ? 'bg-slate-100 dark:bg-slate-800' : ''
              }`}
            >
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="truncate">{seg.label}</span>
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                {seg.value} ({seg.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export interface StackedOutcomeItem {
  label: string;
  code: string;
  met: number;
  notMet: number;
  missing: number;
  score: number;
}

export const RuleOutcomeStackedChart: React.FC<{
  title: string;
  subtitle?: string;
  items: StackedOutcomeItem[];
}> = ({ title, subtitle, items }) => {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400" /> Met
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 dark:bg-amber-400" /> Missing
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 dark:bg-rose-400" /> Not Met
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const total = Math.max(1, item.met + item.notMet + item.missing);
          const metW = Math.round((item.met / total) * 100);
          const missW = Math.round((item.missing / total) * 100);
          const notW = Math.max(0, 100 - metW - missW);
          return (
            <div key={`${item.code}-${item.label}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                  <span className="font-mono font-semibold text-teal-800 dark:text-cyan-300 mr-1.5">
                    {item.code}
                  </span>
                  {item.label}
                </span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 shrink-0">
                  Impact {item.score}/100
                </span>
              </div>
              <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                {metW > 0 && (
                  <div
                    className="h-full bg-emerald-600 dark:bg-emerald-400"
                    style={{ width: `${metW}%` }}
                    title={`Met: ${item.met}`}
                  />
                )}
                {missW > 0 && (
                  <div
                    className="h-full bg-amber-500 dark:bg-amber-400"
                    style={{ width: `${missW}%` }}
                    title={`Missing Info: ${item.missing}`}
                  />
                )}
                {notW > 0 && (
                  <div
                    className="h-full bg-rose-600 dark:bg-rose-400"
                    style={{ width: `${notW}%` }}
                    title={`Not Met: ${item.notMet}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface ColumnBarPoint {
  label: string;
  primary: number;
  secondary?: number;
}

export const VerticalColumnChart: React.FC<{
  title: string;
  subtitle?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  data: ColumnBarPoint[];
}> = ({ title, subtitle, primaryLabel, secondaryLabel, data }) => {
  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.primary, d.secondary ?? 0])
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-700 dark:bg-cyan-400" /> {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400" />{' '}
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>

      <div className="h-44 flex items-end justify-between gap-2 pt-4">
        {data.map((pt, idx) => {
          const h1 = Math.max(6, Math.round((pt.primary / maxVal) * 100));
          const h2 =
            typeof pt.secondary === 'number'
              ? Math.max(6, Math.round((pt.secondary / maxVal) * 100))
              : 0;
          return (
            <div key={`${pt.label}-${idx}`} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="w-full h-32 flex items-end justify-center gap-1">
                <div
                  className="w-full max-w-[18px] rounded-t bg-teal-700 dark:bg-cyan-400 transition-all duration-500"
                  style={{ height: `${h1}%` }}
                  title={`${pt.label} · ${primaryLabel}: ${pt.primary}`}
                />
                {typeof pt.secondary === 'number' && (
                  <div
                    className="w-full max-w-[18px] rounded-t bg-emerald-600 dark:bg-emerald-400 transition-all duration-500"
                    style={{ height: `${h2}%` }}
                    title={`${pt.label} · ${secondaryLabel || 'Confirmed'}: ${pt.secondary}`}
                  />
                )}
              </div>
              <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400 truncate w-full text-center">
                {pt.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

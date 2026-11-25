import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Calendar, ExternalLink, FileText, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { saveUserEligibilityInputs } from '../../lib/firebase';
import { StatusText } from '../../components/ui/StatusText';
import { SchemeDetailModal } from '../../components/ui/SchemeDetailModal';
import type { EligibilityEvaluationResult } from '../../types/niyamsetu';

const PROFILE_PRESETS: Array<{ label: string; income: string; marks: string }> = [
  { label: 'Low-Income First-Gen (₹1.8L · 76%)', income: '180000', marks: '76' },
  { label: 'Borderline Income (₹2.8L · 72%)', income: '280000', marks: '72' },
  { label: 'STEM Merit Scholar (₹4.2L · 84%)', income: '420000', marks: '84' },
  { label: 'School NMMS Candidate (₹2.1L · 58%)', income: '210000', marks: '58' },
  { label: 'Skill & Fee Waiver (₹5.5L · 52%)', income: '550000', marks: '52' },
  { label: 'Defence / Saksham Tier (₹7.6L · 63%)', income: '760000', marks: '63' },
];

export const EligibilityFinderPage: React.FC = () => {
  const {
    lang,
    setPage,
    token,
    user,
    memorizedDocs,
    overview,
    firebaseUid,
    saveSchemeBookmark,
    setAuthModalOpen,
    openSchemeInAssistant,
  } = useApp();

  const [income, setIncome] = useState<string>(
    user?.family_income !== null && user?.family_income !== undefined
      ? String(user.family_income)
      : '280000'
  );
  const [marks, setMarks] = useState<string>(
    user?.marks_percent !== null && user?.marks_percent !== undefined
      ? String(user.marks_percent)
      : '72'
  );
  const [results, setResults] = useState<EligibilityEvaluationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedSchemeId, setSavedSchemeId] = useState<string | null>(null);
  const [detailSchemeId, setDetailSchemeId] = useState<string | null>(null);

  // Rich discovery filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'likely_eligible' | 'not_eligible' | 'new_only' | 'updated_only'
  >('all');
  const [authorityFilter, setAuthorityFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [appStatusFilter, setAppStatusFilter] = useState<string>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'this_year' | 'closing_soon'>('all');

  const evaluate = async (customIncome?: string, customMarks?: string) => {
    setLoading(true);
    try {
      const incStr = customIncome ?? income;
      const mrkStr = customMarks ?? marks;
      const numericIncome = incStr === '' ? null : Number(incStr);
      const numericMarks = mrkStr === '' ? null : Number(mrkStr);
      const res = await apiRequest<{ results: EligibilityEvaluationResult[] }>(
        '/eligibility/evaluate',
        {
          method: 'POST',
          token,
          body: {
            family_income: numericIncome,
            marks_percent: numericMarks,
          },
        }
      );
      setResults(res.results);
      if (firebaseUid && numericIncome !== null && numericMarks !== null) {
        void saveUserEligibilityInputs(firebaseUid, numericIncome, numericMarks).catch(
          () => undefined
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.family_income !== null && user?.family_income !== undefined) {
      setIncome(String(user.family_income));
    }
    if (user?.marks_percent !== null && user?.marks_percent !== undefined) {
      setMarks(String(user.marks_percent));
    }
  }, [user?.id, user?.family_income, user?.marks_percent]);

  useEffect(() => {
    void evaluate(
      user?.family_income !== null && user?.family_income !== undefined
        ? String(user.family_income)
        : undefined,
      user?.marks_percent !== null && user?.marks_percent !== undefined
        ? String(user.marks_percent)
        : undefined
    );
  }, [overview, user?.id]);

  const updatedSchemeIds = useMemo(() => {
    const ids = new Set<string>();
    (overview?.rules || []).forEach((r) => {
      if (r.version >= 2) ids.add(r.scheme_id);
    });
    return ids;
  }, [overview?.rules]);

  const authorities = Array.from(new Set(results.map((r) => r.scheme.authority))).sort();
  const statesList = Array.from(
    new Set(results.flatMap((r) => r.scheme.states_applicable || ['All India']))
  ).sort();
  const districtsList = Array.from(
    new Set(results.flatMap((r) => r.scheme.districts_applicable || ['All Districts']))
  ).sort();
  const categoriesList = Array.from(
    new Set(
      results.map((r) => r.scheme.beneficiary_category || r.scheme.target_group || 'General Citizens')
    )
  ).sort();

  const filteredResults = results.filter((res) => {
    const sch = res.scheme;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'new_only'
          ? Boolean(sch.is_new)
          : statusFilter === 'updated_only'
            ? updatedSchemeIds.has(sch.id)
            : res.status === statusFilter;

    const matchesAuth = authorityFilter === 'all' || sch.authority === authorityFilter;
    const matchesState =
      stateFilter === 'all' ||
      (sch.states_applicable || ['All India']).some(
        (s) => s === stateFilter || s === 'All India'
      );
    const matchesDistrict =
      districtFilter === 'all' ||
      (sch.districts_applicable || ['All Districts']).some(
        (d) => d === districtFilter || d === 'All Districts'
      );
    const matchesCat =
      categoryFilter === 'all' ||
      (sch.beneficiary_category || sch.target_group) === categoryFilter;
    const matchesAppStatus =
      appStatusFilter === 'all' || (sch.application_status || 'open') === appStatusFilter;

    const matchesDeadline =
      deadlineFilter === 'all'
        ? true
        : deadlineFilter === 'closing_soon'
          ? sch.application_status === 'closing_soon' ||
            (sch.deadline_date ? sch.deadline_date <= '2026-11-30' : false)
          : sch.deadline_date
            ? sch.deadline_date.startsWith('2026')
            : true;

    const q = searchTerm.trim().toLowerCase();
    const schemeRulesText = (overview?.rules || [])
      .filter((r) => r.scheme_id === sch.id)
      .map((r) => `${r.label} ${r.condition_text}`)
      .join(' ')
      .toLowerCase();
    const matchesQuery =
      !q ||
      sch.name.toLowerCase().includes(q) ||
      sch.code.toLowerCase().includes(q) ||
      sch.authority.toLowerCase().includes(q) ||
      sch.description.toLowerCase().includes(q) ||
      (sch.source_notification || '').toLowerCase().includes(q) ||
      schemeRulesText.includes(q);

    return (
      matchesStatus &&
      matchesAuth &&
      matchesState &&
      matchesDistrict &&
      matchesCat &&
      matchesAppStatus &&
      matchesDeadline &&
      matchesQuery
    );
  });

  const eligibleCount = results.filter((r) => r.status === 'likely_eligible').length;
  const newCount = results.filter((r) => r.scheme.is_new).length;
  const updatedCount = results.filter((r) => updatedSchemeIds.has(r.scheme.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Schemes, Services &amp; Official Rules Search ({filteredResults.length} of{' '}
            {results.length})
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Search verified schemes, services, circulars, and rules by state, district, department,
            beneficiary group, application status, and deadline. ({memorizedDocs.length} Vault docs)
          </p>
        </div>
        {user && (
          <button
            type="button"
            onClick={() => setPage('student_home')}
            className="px-3 py-1.5 rounded-md border border-teal-700 dark:border-cyan-400 text-teal-800 dark:text-cyan-300 text-xs font-semibold hover:bg-teal-50 dark:hover:bg-cyan-950/30 cursor-pointer whitespace-nowrap self-start"
          >
            Back to Dashboard
          </button>
        )}
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Quick Citizen Sample Profiles:
            </span>
            {user && (
              <button
                type="button"
                onClick={() => {
                  const nextInc =
                    user.family_income !== null && user.family_income !== undefined
                      ? String(user.family_income)
                      : '280000';
                  const nextMrk =
                    user.marks_percent !== null && user.marks_percent !== undefined
                      ? String(user.marks_percent)
                      : '72';
                  setIncome(nextInc);
                  setMarks(nextMrk);
                  void evaluate(nextInc, nextMrk);
                }}
                className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                Use My Saved Profile ({user.name})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {PROFILE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setIncome(p.income);
                  setMarks(p.marks);
                  void evaluate(p.income, p.marks);
                }}
                className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void evaluate();
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2 border-t border-slate-100 dark:border-slate-800"
        >
          <div>
            <label
              htmlFor="elig-income"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Family Annual Income (₹)
            </label>
            <input
              id="elig-income"
              type="number"
              min={0}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="e.g., 280000"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label
              htmlFor="elig-marks"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Qualifying Exam Marks (%)
            </label>
            <input
              id="elig-marks"
              type="number"
              min={0}
              max={100}
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
              placeholder="e.g., 72"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="py-2 px-4 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            {loading ? 'Evaluating...' : 'Check Matching Schemes'}
          </button>
        </form>

        {/* Status Tabs & Search */}
        <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', `All (${results.length})`],
                  ['likely_eligible', `Likely Eligible (${eligibleCount})`],
                  ['new_only', `Newly Introduced (${newCount})`],
                  ['updated_only', `Recently Updated (${updatedCount})`],
                  ['not_eligible', `Criteria Not Met (${results.length - eligibleCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusFilter(id)}
                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === id
                      ? 'bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search schemes, rules, circulars..."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs"
                aria-label="Search schemes, services, rules, or notifications"
              />
            </div>
          </div>

          {/* 6-Facet Filter Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              aria-label="Filter by state"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="all">State: All</option>
              {statesList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              aria-label="Filter by district"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="all">District: All</option>
              {districtsList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={authorityFilter}
              onChange={(e) => setAuthorityFilter(e.target.value)}
              aria-label="Filter by department"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="all">Department: All ({authorities.length})</option>
              {authorities.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by beneficiary category"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="all">Beneficiary: All</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={appStatusFilter}
              onChange={(e) => setAppStatusFilter(e.target.value)}
              aria-label="Filter by application status"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="all">Status: All</option>
              <option value="open">Open Now</option>
              <option value="closing_soon">Closing Soon</option>
              <option value="upcoming">Upcoming</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={deadlineFilter}
              onChange={(e) =>
                setDeadlineFilter(e.target.value as 'all' | 'this_year' | 'closing_soon')
              }
              aria-label="Filter by deadline"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="all">Deadline: Any</option>
              <option value="closing_soon">Closing Soon (&le; Nov 2026)</option>
              <option value="this_year">2026 Cycle</option>
            </select>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {filteredResults.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No schemes match the active filters. Reset filters or search another term.
          </div>
        ) : (
          filteredResults.map((res) => {
            const sch = res.scheme;
            const hasUpdatedRule = updatedSchemeIds.has(sch.id);
            return (
              <div
                key={sch.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 card-3d hover:border-teal-700/60 dark:hover:border-cyan-400/60"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-teal-800 dark:text-cyan-300">{sch.code}</span>
                      <span>· {sch.authority}</span>
                      {sch.is_new && (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          · NEW ({sch.introduced_date || '2026'})
                        </span>
                      )}
                      {hasUpdatedRule && (
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          · REVISED RULE ACTIVE
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {lang === 'te' ? sch.name_te : sch.name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {lang === 'te' ? sch.description_te : sch.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {sch.application_status && <StatusText status={sch.application_status} />}
                    <StatusText status={res.status} />
                  </div>
                </div>

                {/* Dates, Beneficiary, Source & Official Link */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300 shrink-0" />
                    <div className="font-mono tabular-nums">
                      Opens {sch.opening_date || '2026-07-15'} · Deadline{' '}
                      <strong>{sch.deadline_date || '2026-12-31'}</strong>
                    </div>
                  </div>
                  <div className="rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 truncate">
                    <strong>Beneficiaries:</strong> {sch.beneficiary_category || sch.target_group}
                  </div>
                  <div className="rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 flex items-center justify-between gap-2">
                    <span className="truncate font-mono">
                      {sch.source_notification || `${sch.code} Circular`}
                    </span>
                    {sch.official_website && (
                      <a
                        href={sch.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-800 dark:text-cyan-300 hover:underline shrink-0 inline-flex items-center gap-1"
                      >
                        <span>Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-4 font-semibold">Condition</th>
                        <th className="py-2 pr-4 font-semibold">Active Rule</th>
                        <th className="py-2 pr-4 font-semibold">Your Input</th>
                        <th className="py-2 pr-4 font-semibold">Evaluation</th>
                        <th className="py-2 font-semibold">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {res.conditions.map((c) => (
                        <tr key={c.rule_id}>
                          <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-200">
                            {c.label}
                          </td>
                          <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {c.expected}
                          </td>
                          <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {c.provided}
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusText
                              status={
                                c.outcome === 'met'
                                  ? 'active'
                                  : c.outcome === 'not_met'
                                  ? 'not_met'
                                  : 'pending'
                              }
                              labelOverride={
                                c.outcome === 'met'
                                  ? 'Met'
                                  : c.outcome === 'not_met'
                                  ? 'Not met'
                                  : 'Missing input'
                              }
                            />
                          </td>
                          <td className="py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                            {c.citation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-teal-800 dark:text-cyan-300">
                    {sch.benefit_summary}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!firebaseUid) {
                          setAuthModalOpen(true);
                          return;
                        }
                        void saveSchemeBookmark(
                          sch.id,
                          sch.name,
                          `Status: ${res.status} (Income ₹${income || '—'}, Marks ${marks || '—'}%)`
                        ).then(() => setSavedSchemeId(sch.id));
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>
                        {savedSchemeId === sch.id ? 'Saved to Cloud' : 'Bookmark'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailSchemeId(sch.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-100 hover:border-teal-700 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View Full Details &amp; Rules</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSchemeInAssistant(sch.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <span>Check My Eligibility &amp; Apply</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <SchemeDetailModal schemeId={detailSchemeId} onClose={() => setDetailSchemeId(null)} />
    </div>
  );
};

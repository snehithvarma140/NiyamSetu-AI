import React, { useMemo, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FileText,
  FolderLock,
  GitCompare,
  MapPin,
  MessageSquareText,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp, type PageId } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import { SchemeDetailModal } from '../../components/ui/SchemeDetailModal';
import { ServiceNavigatorPanel } from '../../components/student/ServiceNavigatorPanel';
import { DelayAssistantModal } from '../../components/student/DelayAssistantModal';
import {
  DonutChart,
  HorizontalBarChart,
  VerticalColumnChart,
} from '../../components/charts/AnalyticsCharts';
import type { AllSchemesAiPlanResult, ApplicationDraftRecord } from '../../types/niyamsetu';

const INDIAN_STATES = [
  'Telangana',
  'Andhra Pradesh',
  'Karnataka',
  'Tamil Nadu',
  'Maharashtra',
  'Delhi',
  'Kerala',
  'Uttar Pradesh',
  'West Bengal',
  'Rajasthan',
];

export const StudentHome: React.FC = () => {
  const {
    setPage,
    lang,
    overview,
    user,
    token,
    firebaseUid,
    bookmarks,
    memorizedDocs,
    applications,
    saveUserProfile,
    saveSchemeBookmark,
    deleteSchemeBookmark,
    setAuthModalOpen,
    openSchemeInAssistant,
    openComplaintForApp,
    setJanSetuDrawerOpen,
  } = useApp();

  const [quickQuestion, setQuickQuestion] = useState('');
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>('sch-pm-01');
  const [detailSchemeId, setDetailSchemeId] = useState<string | null>(null);
  const [delayModalApp, setDelayModalApp] = useState<ApplicationDraftRecord | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  // Inline State & District switcher (reads persisted guest location if not signed in)
  const [locState, setLocState] = useState(() => {
    if (user?.state) return user.state;
    try {
      const saved = JSON.parse(localStorage.getItem('niyamsetu_guest_location') || '{}');
      if (saved?.state) return String(saved.state);
    } catch {
      // ignore
    }
    return 'Telangana';
  });
  const [locDistrict, setLocDistrict] = useState(() => {
    if (user?.district) return user.district;
    try {
      const saved = JSON.parse(localStorage.getItem('niyamsetu_guest_location') || '{}');
      if (saved?.district) return String(saved.district);
    } catch {
      // ignore
    }
    return 'Hyderabad';
  });
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user?.state) setLocState(user.state);
    if (user?.district) setLocDistrict(user.district);
  }, [user?.state, user?.district]);

  // Application Status Tracker slide & ID lookup state
  const [trackQuery, setTrackQuery] = useState('');
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [customTrackedApp, setCustomTrackedApp] = useState<ApplicationDraftRecord | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    setSlideIndex((prev) =>
      applications.length === 0 ? 0 : Math.min(prev, applications.length - 1)
    );
  }, [applications.length]);

  const activeTrackedApp = customTrackedApp || applications[slideIndex] || null;

  const handleTrackById = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = trackQuery.trim();
    if (!q) return;
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setTrackingBusy(true);
    setTrackingError(null);
    try {
      const res = await apiRequest<{ application: ApplicationDraftRecord }>(
        `/applications/track/${encodeURIComponent(q)}`,
        { token }
      );
      setCustomTrackedApp(res.application);
      const idx = applications.findIndex((a) => a.id === res.application.id);
      if (idx >= 0) setSlideIndex(idx);
    } catch (err) {
      setCustomTrackedApp(null);
      setTrackingError(
        err instanceof Error ? err.message : `No application found matching "${q}".`
      );
    } finally {
      setTrackingBusy(false);
    }
  };

  // All-16-Scheme Vault Eligibility & AI Task Planner state
  const [vaultPlan, setVaultPlan] = useState<AllSchemesAiPlanResult | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [runningAiPlan, setRunningAiPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [schemeFilter, setSchemeFilter] = useState<'all' | 'eligible' | 'new' | 'action'>('all');

  useEffect(() => {
    let active = true;
    if (!token) {
      setVaultPlan(null);
      return;
    }
    setLoadingPlan(true);
    apiRequest<{ plan: AllSchemesAiPlanResult }>('/eligibility/vault-summary', { token })
      .then((res) => {
        if (active) {
          setVaultPlan(res.plan);
          setPlanError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setPlanError(err instanceof Error ? err.message : 'Could not load 16-scheme summary.');
        }
      })
      .finally(() => {
        if (active) setLoadingPlan(false);
      });
    return () => {
      active = false;
    };
  }, [token, memorizedDocs.length, user?.family_income, user?.marks_percent, user?.address, user?.updated_at]);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanState = locState.trim() || 'Telangana';
    const cleanDistrict = locDistrict.trim() || 'Hyderabad';
    setSavingLocation(true);
    setLocationNotice(null);
    try {
      try {
        localStorage.setItem(
          'niyamsetu_guest_location',
          JSON.stringify({ state: cleanState, district: cleanDistrict })
        );
      } catch {
        // ignore storage failures
      }
      if (token) {
        await saveUserProfile({ state: cleanState, district: cleanDistrict });
      }
      setLocationNotice(`Saved jurisdiction to ${cleanDistrict}, ${cleanState}.`);
    } catch {
      setLocationNotice(`Saved jurisdiction locally (${cleanDistrict}, ${cleanState}).`);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleRunAiAllSchemes = async () => {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setRunningAiPlan(true);
    setPlanError(null);
    try {
      const res = await apiRequest<{ plan: AllSchemesAiPlanResult }>('/eligibility/ai-plan', {
        method: 'POST',
        token,
        body: { lang },
      });
      setVaultPlan(res.plan);
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : 'Unable to generate AI multi-scheme plan.'
      );
    } finally {
      setRunningAiPlan(false);
    }
  };

  const citizenAlerts =
    overview?.alerts.filter((a) => a.target_role === 'ALL' || a.target_role === 'STUDENT') || [];
  const schemesById = useMemo(
    () => new Map((overview?.schemes || []).map((s) => [s.id, s])),
    [overview?.schemes]
  );

  // Newly introduced schemes filtered softly for location relevance when available
  const newSchemesForStudents = (overview?.schemes || []).filter((s) => s.is_new);
  const newPlansWithEligibility = newSchemesForStudents
    .map((sch) => {
      const planMatch = vaultPlan?.scheme_plans.find((sp) => sp.scheme_id === sch.id) || null;
      return { scheme: sch, plan: planMatch };
    })
    .sort((a, b) => {
      const rank = (status?: string) =>
        status === 'likely_eligible' ? 0 : status === 'possibly_eligible' ? 1 : 2;
      return rank(a.plan?.eligibility_status) - rank(b.plan?.eligibility_status);
    });
  const eligibleNewCount = newPlansWithEligibility.filter(
    (item) => item.plan?.eligibility_status === 'likely_eligible'
  ).length;

  // Newly Updated Rules: distinctly tag NEW RULE (version 1) vs REVISED RULE (version >= 2)
  const newlyUpdatedRules = useMemo(() => {
    const all = overview?.rules || [];
    const revised = all.filter((r) => r.version >= 2 && (r.status === 'active' || r.status === 'draft'));
    const recentNew = all.filter((r) => r.version === 1 && r.status === 'active').slice(0, 4);
    return [...revised, ...recentNew].slice(0, 6);
  }, [overview?.rules]);

  // Real Application Overview breakdown (zero fake numbers)
  const appStats = useMemo(() => {
    const inProgress = applications.filter((a) => a.status === 'draft').length;
    const ready = applications.filter((a) => a.status === 'ready_for_portal').length;
    const confirmed = applications.filter((a) => a.status === 'submitted_confirmed').length;
    const missingTotal = applications.reduce((acc, a) => acc + a.missing_requirements.length, 0);
    return { inProgress, ready, confirmed, missingTotal };
  }, [applications]);

  const eligibilityChartSlices = useMemo(() => {
    const plans = vaultPlan?.scheme_plans || [];
    if (plans.length > 0) {
      const likely = plans.filter((p) => p.eligibility_status === 'likely_eligible').length;
      const possible = plans.filter((p) => p.eligibility_status === 'possibly_eligible').length;
      const notEligible = plans.filter((p) => p.eligibility_status === 'not_eligible').length;
      return [
        { label: 'Likely Eligible', value: likely, color: '#059669' },
        { label: 'Complete Profile to Confirm', value: possible, color: '#d97706' },
        { label: 'Criteria Not Met', value: notEligible, color: '#e11d48' },
      ];
    }
    const totalSchemes = overview?.schemes.length || 0;
    const newCount = (overview?.schemes || []).filter((s) => s.is_new).length;
    return [
      { label: 'Newly Introduced Schemes', value: newCount, color: '#0891b2' },
      {
        label: 'Established Verified Schemes',
        value: Math.max(0, totalSchemes - newCount),
        color: '#0f766e',
      },
    ];
  }, [vaultPlan, overview?.schemes]);

  const readinessBarData = useMemo(() => {
    const plans = vaultPlan?.scheme_plans || [];
    if (plans.length > 0) {
      return [...plans]
        .map((sp) => {
          const total = sp.matched_docs.length + sp.missing_docs.length;
          const readinessPct = total > 0 ? Math.round((sp.matched_docs.length / total) * 100) : 100;
          return { sp, readinessPct };
        })
        .sort((a, b) => b.readinessPct - a.readinessPct)
        .slice(0, 6)
        .map(({ sp, readinessPct }) => ({
          label: sp.scheme_name,
          badge: sp.scheme_code,
          sublabel: `${sp.matched_docs.length} matched · ${sp.missing_docs.length} missing`,
          value: readinessPct,
          maxValue: 100,
          colorClass:
            readinessPct >= 80
              ? 'bg-emerald-600 dark:bg-emerald-400'
              : readinessPct >= 50
                ? 'bg-teal-700 dark:bg-cyan-400'
                : 'bg-amber-500 dark:bg-amber-400',
        }));
    }
    return (overview?.schemes || []).slice(0, 6).map((s) => {
      const rulesCount = (overview?.rules || []).filter(
        (r) => r.scheme_id === s.id && r.status === 'active'
      ).length;
      return {
        label: s.name,
        badge: s.code,
        sublabel: s.authority,
        value: rulesCount,
        maxValue: Math.max(4, rulesCount),
      };
    });
  }, [vaultPlan, overview?.schemes, overview?.rules]);

  const categoryColumnData = useMemo(() => {
    const counts: Record<string, { total: number; eligible: number }> = {};
    const plansById = new Map((vaultPlan?.scheme_plans || []).map((p) => [p.scheme_id, p]));
    for (const s of overview?.schemes || []) {
      const cat = (s.beneficiary_category || s.target_group || 'Citizen')
        .split(/[,/]/)[0]
        .trim()
        .slice(0, 12);
      if (!counts[cat]) counts[cat] = { total: 0, eligible: 0 };
      counts[cat].total += 1;
      if (plansById.get(s.id)?.eligibility_status === 'likely_eligible') {
        counts[cat].eligible += 1;
      }
    }
    return Object.entries(counts)
      .slice(0, 6)
      .map(([label, v]) => ({
        label,
        primary: v.total,
        secondary: vaultPlan ? v.eligible : undefined,
      }));
  }, [overview?.schemes, vaultPlan]);

  const selectedScheme =
    overview?.schemes.find((s) => s.id === selectedSchemeId) || overview?.schemes[0];
  const activeSchemeRules =
    overview?.rules.filter(
      (r) => r.scheme_id === (selectedScheme?.id || selectedSchemeId) && r.status === 'active'
    ) || [];

  const handleBookmarkScheme = async (schemeId: string, title: string) => {
    if (!firebaseUid) {
      setAuthModalOpen(true);
      return;
    }
    setSavingId(schemeId);
    setBookmarkError(null);
    try {
      await saveSchemeBookmark(
        schemeId,
        title,
        `Saved from Dashboard (${new Date().toLocaleDateString('en-IN')})`
      );
    } catch (err) {
      setBookmarkError(err instanceof Error ? err.message : 'Unable to save bookmark.');
    } finally {
      setSavingId(null);
    }
  };

  const filteredSchemePlans = (vaultPlan?.scheme_plans || []).filter((sp) => {
    if (schemeFilter === 'eligible') return sp.eligibility_status === 'likely_eligible';
    if (schemeFilter === 'new') return sp.is_new;
    if (schemeFilter === 'action') return sp.missing_docs.length > 0 || sp.eligibility_status !== 'likely_eligible';
    return true;
  });

  const quickActions: Array<{
    title: string;
    titleTe: string;
    desc: string;
    page: PageId;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      title: 'Application Assistant (FormSathi)',
      titleTe: 'దరఖాస్తు సహాయకుడు',
      desc: 'Follow the 7-stage scheme guide, AI form mapping, Vault check & portal handoff.',
      page: 'readiness_hub',
      icon: FileCheck2,
    },
    {
      title: 'Schemes & Rules Explorer',
      titleTe: 'పథకాలు & నియమాలు',
      desc: 'Search verified schemes, inspect Old-vs-New rules, and check eligibility criteria.',
      page: 'schemes_hub',
      icon: FileSearch,
    },
    {
      title: 'Document Guide & Vault',
      titleTe: 'డాక్యుమెంట్ గైడ్ & వాల్ట్',
      desc: 'Store your dossier & certificates once for reuse and expiry tracking.',
      page: 'profile_vault',
      icon: FolderLock,
    },
    {
      title: 'Ask JanSetu AI',
      titleTe: 'జనసేతు AI సహాయం',
      desc: 'Ask bilingual questions with circular citations, web search & voice advisor.',
      page: 'jansetu',
      icon: MessageSquareText,
    },
    {
      title: 'Book Officer Appointment',
      titleTe: 'అధికారి అపాయింట్‌మెంట్',
      desc: 'Schedule visits with Gov or Private officers (Police, Doctor, Bank, IAS, Revenue) by place & issue.',
      page: 'appointments',
      icon: Calendar,
    },
    {
      title: 'Deadlines & Nearby Help',
      titleTe: 'గడువులు & సహాయ కేంద్రాలు',
      desc: 'Track scheme deadlines, renewal alerts, and live MeeSeva, hospital & bank centers.',
      page: 'services_help',
      icon: MapPin,
    },
    {
      title: 'Raise a Complaint',
      titleTe: 'ఫిర్యాదు నమోదు చేయండి',
      desc: 'Report application delays, DBT payment issues, or department grievances with tracking.',
      page: 'complaints',
      icon: MessageSquareWarning,
    },
  ];

  return (
    <div className="space-y-8">
      {/* A. Personal Overview + State & District Switcher */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-teal-800 dark:text-cyan-300">
              {lang === 'te' ? 'డ్యాష్‌బోర్డ్' : 'Citizen Dashboard'} ·{' '}
              {user?.name || 'Citizen Visitor'} · {locDistrict}, {locState}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
              {lang === 'te' ? 'డ్యాష్‌బోర్డ్ — మీ పథకాల అవలోకనం' : 'Dashboard'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Verified active circular rules, newly introduced schemes, revised rules, and your real
              saved application drafts—all connected to your Profile &amp; Document Vault.
            </p>
          </div>

          <form
            onSubmit={handleSaveLocation}
            className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 shrink-0"
          >
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                State
              </label>
              <select
                value={locState}
                onChange={(e) => setLocState(e.target.value)}
                aria-label="Select State"
                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
              >
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                District
              </label>
              <input
                type="text"
                value={locDistrict}
                onChange={(e) => setLocDistrict(e.target.value)}
                placeholder="District"
                aria-label="Enter District"
                className="w-32 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={savingLocation}
              className="px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {savingLocation ? 'Saving...' : 'Save Location'}
            </button>
          </form>
        </div>

        {locationNotice && (
          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            {locationNotice}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!quickQuestion.trim()) {
              setJanSetuDrawerOpen(true);
              return;
            }
            sessionStorage.setItem('niyamsetu_pending_q', quickQuestion.trim());
            setPage('jansetu');
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={quickQuestion}
            onChange={(e) => setQuickQuestion(e.target.value)}
            placeholder={
              lang === 'te'
                ? 'స్కాలర్‌షిప్ ఆదాయ పరిమితి, కొత్త నియమాలు లేదా పత్రాల గురించి అడగండి...'
                : 'Ask JanSetu AI about any scheme, new rule, deadline, or required document...'
            }
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100"
            aria-label="Ask JanSetu AI a question"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            <span>Ask JanSetu AI</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Instant AI assistance is also docked at the bottom-right on every page.
          </div>
          <button
            type="button"
            onClick={() => setJanSetuDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-teal-700 dark:border-cyan-400 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:bg-teal-50 dark:hover:bg-cyan-950/30 cursor-pointer"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>Open Quick JanSetu AI Chat</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {quickActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.page}
                type="button"
                onClick={() => setPage(act.page)}
                className="card-3d text-left rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors cursor-pointer space-y-2"
              >
                <Icon className="w-4 h-4 text-teal-800 dark:text-cyan-300" aria-hidden="true" />
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lang === 'te' ? act.titleTe : act.title}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {act.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Application Status Tracker Slide (Positioned directly before Citizen Service Navigator) */}
      <section
        aria-label="Track Applied Application Status"
        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-teal-800 dark:text-cyan-300">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Application Status Tracker</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {lang === 'te'
                ? 'దరఖాస్తు స్థితి & ఆమోదం ట్రాకింగ్'
                : 'Track Your Applied Application & Approval Status'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter your Application ID (from your FormSathi Auto-Fill receipt) or Portal Reference
              Number to check exact stage progress and whether your application is approved or
              pending.
            </p>
          </div>

          <form onSubmit={handleTrackById} className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                placeholder="Enter Application ID or Ref No."
                aria-label="Enter Application ID to track"
                className="w-64 sm:w-72 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={trackingBusy || !trackQuery.trim()}
              className="px-3.5 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {trackingBusy ? 'Tracking...' : 'Track Status'}
            </button>
            {customTrackedApp && (
              <button
                type="button"
                onClick={() => {
                  setCustomTrackedApp(null);
                  setTrackQuery('');
                  setTrackingError(null);
                }}
                className="px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Reset
              </button>
            )}
          </form>
        </div>

        {trackingError && (
          <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{trackingError}</span>
          </div>
        )}

        {applications.length > 0 && !customTrackedApp && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {applications.map((appItem, idx) => (
                <button
                  key={appItem.id}
                  type="button"
                  onClick={() => {
                    setSlideIndex(idx);
                    setTrackingError(null);
                  }}
                  className={`px-2.5 py-1 rounded border text-[11px] font-mono font-semibold cursor-pointer transition-colors ${
                    idx === slideIndex
                      ? 'border-teal-800 dark:border-cyan-400 bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-teal-700'
                  }`}
                >
                  {appItem.scheme_code} · {appItem.id}
                </button>
              ))}
            </div>

            {applications.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() =>
                    setSlideIndex((i) => (i - 1 + applications.length) % applications.length)
                  }
                  className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Previous application slide"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="tabular-nums px-1">
                  {slideIndex + 1} / {applications.length}
                </span>
                <button
                  type="button"
                  onClick={() => setSlideIndex((i) => (i + 1) % applications.length)}
                  className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Next application slide"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {activeTrackedApp ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-teal-100 dark:bg-cyan-950/60 text-teal-900 dark:text-cyan-200 font-bold">
                    ID: {activeTrackedApp.id}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {activeTrackedApp.scheme_code}
                  </span>
                  {activeTrackedApp.portal_reference_number && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      · Portal Ref: {activeTrackedApp.portal_reference_number}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {activeTrackedApp.scheme_name}
                </h3>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Department: {activeTrackedApp.handling_department || 'Government Welfare Desk'} ·
                  Updated {new Date(activeTrackedApp.updated_at).toLocaleDateString('en-IN')}
                  {typeof activeTrackedApp.elapsed_days === 'number' &&
                    typeof activeTrackedApp.expected_processing_days === 'number' &&
                    ` · ${activeTrackedApp.elapsed_days} / ${activeTrackedApp.expected_processing_days} days SLA`}
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1 shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border ${
                    activeTrackedApp.approval_status === 'approved'
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                      : activeTrackedApp.approval_status === 'action_required'
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
                        : activeTrackedApp.approval_status === 'under_review'
                          ? 'border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-teal-900 dark:text-cyan-200'
                          : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {activeTrackedApp.approval_label ||
                      (activeTrackedApp.status === 'submitted_confirmed'
                        ? 'Submitted · Under Department Review'
                        : activeTrackedApp.status === 'ready_for_portal'
                          ? 'Prepared · Ready for Official Portal'
                          : 'Draft Prepared')}
                  </span>
                </span>
              </div>
            </div>

            {/* 4-Stage Visual Progress Stepper */}
            {activeTrackedApp.timeline_events && activeTrackedApp.timeline_events.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {activeTrackedApp.timeline_events.map((ev, idx) => (
                  <div
                    key={ev.stage}
                    className={`rounded-md border p-3 space-y-1 text-xs ${
                      ev.status === 'done'
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20'
                        : ev.status === 'delayed'
                          ? 'border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/20'
                          : ev.status === 'current'
                            ? 'border-teal-500 dark:border-cyan-500 bg-teal-50/60 dark:bg-cyan-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-mono text-[10px] font-bold uppercase">
                      <span>Step {idx + 1}</span>
                      <span>
                        {ev.status === 'done'
                          ? 'Done'
                          : ev.status === 'delayed'
                            ? 'Attention'
                            : ev.status === 'current'
                              ? 'In Progress'
                              : 'Pending'}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {ev.label}
                    </div>
                    {ev.note && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        {ev.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Documents Provided in Application ({activeTrackedApp.attached_documents.length})
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  {activeTrackedApp.attached_documents.length > 0
                    ? activeTrackedApp.attached_documents.join(', ')
                    : 'No documents attached yet'}
                </div>
                {activeTrackedApp.missing_requirements.length > 0 && (
                  <div className="text-rose-700 dark:text-rose-400 pt-1">
                    Pending: {activeTrackedApp.missing_requirements.join('; ')}
                  </div>
                )}
              </div>

              <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Verification &amp; Partner Desk Checks
                </div>
                {activeTrackedApp.org_verifications &&
                activeTrackedApp.org_verifications.length > 0 ? (
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                    {activeTrackedApp.org_verifications.map((ov) => (
                      <li key={ov.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{ov.org_name}</span>
                        <StatusText status={ov.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">
                    {activeTrackedApp.status === 'submitted_confirmed'
                      ? 'Awaiting department / partner officer sign-off.'
                      : 'Complete FormSathi Auto-Fill and submit on the official portal to initiate verification.'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openSchemeInAssistant(activeTrackedApp.scheme_id)}
                  className="px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  Open in FormSathi
                </button>
                <button
                  type="button"
                  onClick={() => setDelayModalApp(activeTrackedApp)}
                  className="px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-xs font-semibold text-amber-900 dark:text-amber-300 cursor-pointer"
                >
                  Delay Assistant
                </button>
                <button
                  type="button"
                  onClick={() => openComplaintForApp(activeTrackedApp)}
                  className="px-3 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 cursor-pointer"
                >
                  Raise Complaint
                </button>
              </div>
              {activeTrackedApp.portal_url && (
                <a
                  href={activeTrackedApp.portal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline"
                >
                  <span>Visit Official Portal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {token
                ? 'No applied applications yet. Prepare an application using FormSathi Auto-Fill to receive a trackable Application ID and completion receipt.'
                : 'Sign in to view your saved application slides or track an Application ID.'}
            </span>
            <button
              type="button"
              onClick={() =>
                token
                  ? openSchemeInAssistant(overview?.schemes[0]?.id || 'sch-pm-01')
                  : setAuthModalOpen(true)
              }
              className="px-3 py-1.5 rounded bg-teal-800 text-white text-xs font-semibold cursor-pointer shrink-0"
            >
              {token ? 'Prepare Application in FormSathi' : 'Sign In to Track'}
            </button>
          </div>
        )}
      </section>

      {/* Citizen Service Navigator (Plain-language problem -> Department & Checklist) */}
      <ServiceNavigatorPanel />

      {/* Graphical Citizen Analytics: Eligibility Donut, Document Readiness Bars & Sector Coverage */}
      <section aria-label="Citizen Eligibility & Vault Graphics" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DonutChart
          title={vaultPlan ? 'Personal 16-Scheme Eligibility Split' : 'Verified Scheme Catalog Overview'}
          subtitle={
            vaultPlan
              ? 'Live evaluation from your saved profile & Document Vault'
              : 'Sign in to evaluate personal eligibility across all schemes'
          }
          centerLabel={vaultPlan ? 'Eligible Now' : 'Schemes'}
          centerValue={
            vaultPlan
              ? vaultPlan.scheme_plans.filter((p) => p.eligibility_status === 'likely_eligible').length
              : overview?.schemes.length || 0
          }
          slices={eligibilityChartSlices}
        />

        <HorizontalBarChart
          title={vaultPlan ? 'Top Document Readiness Scores' : 'Active Circular Rules per Scheme'}
          subtitle={
            vaultPlan
              ? 'Percentage of mandatory certificates currently matched in Vault'
              : 'Verified statutory rules tracked by NiyamSetu'
          }
          data={readinessBarData}
          valueSuffix={vaultPlan ? '%' : ' rules'}
        />

        <VerticalColumnChart
          title="Schemes by Sector"
          subtitle={
            vaultPlan
              ? 'Total verified schemes vs. schemes where you qualify'
              : 'Catalog coverage across citizen welfare sectors'
          }
          primaryLabel="Total Schemes"
          secondaryLabel={vaultPlan ? 'Eligible' : undefined}
          data={categoryColumnData}
        />
      </section>

      {/* E. Real Application Overview (Zero fabricated counts) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Your Application Overview (Real Drafts &amp; Portal Confirmations)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tracks only applications you actually prepared in FormSathi or confirmed on an official
              government portal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPage('complaints')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <MessageSquareWarning className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Raise a Complaint</span>
            </button>
            <button
              type="button"
              onClick={() => setPage('services_help')}
              className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
            >
              Manage All Drafts
            </button>
            <button
              type="button"
              onClick={() => openSchemeInAssistant(overview?.schemes[0]?.id || 'sch-pm-01')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Start Application Assistant</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-mono text-xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {appStats.inProgress}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Drafts In Progress</div>
          </div>
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-mono text-xl font-bold tabular-nums text-teal-800 dark:text-cyan-300">
              {appStats.ready}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Ready for Official Portal</div>
          </div>
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {appStats.confirmed}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Confirmed Submitted</div>
          </div>
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-mono text-xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
              {appStats.missingTotal}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Missing Info / Docs Items</div>
          </div>
        </div>

        {applications.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              No application drafts saved yet. Choose any scheme below and click &ldquo;Check My
              Eligibility &amp; Apply&rdquo; to prepare a verified application packet.
            </span>
            <button
              type="button"
              onClick={() => setPage('schemes_hub')}
              className="font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer shrink-0"
            >
              Browse Verified Schemes →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
            {applications.slice(0, 4).map((app) => {
              const sch = schemesById.get(app.scheme_id);
              return (
                <div
                  key={app.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      <span className="font-bold text-teal-800 dark:text-cyan-300">
                        {app.scheme_code}
                      </span>
                      <StatusText status={app.status} />
                      {typeof app.elapsed_days === 'number' &&
                        typeof app.expected_processing_days === 'number' && (
                          <span
                            className={
                              app.is_overdue
                                ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            · {app.elapsed_days}/{app.expected_processing_days}d SLA
                            {app.is_overdue ? ' (SLA Exceeded)' : ''}
                          </span>
                        )}
                      {sch?.deadline_date && (
                        <span className="text-slate-500 dark:text-slate-400">
                          · Deadline: {sch.deadline_date}
                        </span>
                      )}
                      {app.portal_reference_number && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          · Ref: {app.portal_reference_number}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {app.scheme_name}
                    </div>
                    {app.missing_requirements.length > 0 && (
                      <div className="text-amber-700 dark:text-amber-300">
                        Awaiting: {app.missing_requirements.slice(0, 2).join('; ')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDelayModalApp(app)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 font-semibold text-amber-900 dark:text-amber-300 hover:border-amber-500 cursor-pointer whitespace-nowrap"
                    >
                      <Clock className="w-3 h-3" />
                      <span>Delay Assistant</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openComplaintForApp(app)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-300 dark:border-rose-800 font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer whitespace-nowrap"
                    >
                      <MessageSquareWarning className="w-3 h-3" />
                      <span>Complaint</span>
                    </button>
                    {app.portal_url && (
                      <a
                        href={app.portal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 whitespace-nowrap"
                      >
                        <span>Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openSchemeInAssistant(app.scheme_id)}
                      className="px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Open in FormSathi
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved Personal Profile & Memorized Document Vault Summary */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Saved Citizen Dossier &amp; Memorized Document Vault
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Persisted across sessions and reused across FormSathi form mapping, Eligibility
              checks, and JanSetu AI
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPage('profile_vault')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-teal-700 dark:border-cyan-400 text-teal-800 dark:text-cyan-300 text-xs font-semibold hover:bg-teal-50 dark:hover:bg-cyan-950/30 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <FolderLock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Manage Document Guide &amp; Vault</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Citizen Profile</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {user?.name || 'Not signed in'}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {user?.category || 'General'} · {user?.education_level || 'Citizen'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">State &amp; District</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {locDistrict && locState ? `${locDistrict}, ${locState}` : 'Address pending'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {user?.address || 'Add street address in Profile Vault'}
              {user?.pincode ? ` · ${user.pincode}` : ''}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Saved Income &amp; Marks</div>
            <div className="text-sm font-mono font-semibold tabular-nums text-teal-800 dark:text-cyan-300">
              {user?.family_income !== null && user?.family_income !== undefined
                ? `₹${user.family_income.toLocaleString('en-IN')}`
                : 'Income —'}{' '}
              ·{' '}
              {user?.marks_percent !== null && user?.marks_percent !== undefined
                ? `${user.marks_percent}%`
                : 'Marks —'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Synced from profile &amp; verified docs
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">Memorized Documents</div>
            <div className="text-xl font-mono font-bold tabular-nums text-teal-800 dark:text-cyan-300">
              {memorizedDocs.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {memorizedDocs.length > 0
                ? memorizedDocs
                    .slice(0, 2)
                    .map((d) => d.doc_type)
                    .join(', ')
                : 'Upload or save documents once'}
            </div>
          </div>
        </div>
      </section>

      {/* B. Newly Introduced Government Schemes (Full Source & Deadline Metadata) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Newly Introduced Government Schemes &amp; Personal Relevance
              </h2>
              {token && (
                <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  · {eligibleNewCount} of {newSchemesForStudents.length} Likely Eligible Now
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Shows department, launch date, target beneficiaries, opening &amp; deadline dates,
              eligibility summary, and official source. Final approval rests with the portal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPage('schemes_hub')}
            className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer self-start sm:self-auto"
          >
            Explore All {overview?.schemes.length || 16} Schemes →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {newPlansWithEligibility.map(({ scheme: sch, plan }) => {
            const isEligible = plan?.eligibility_status === 'likely_eligible';
            return (
              <div
                key={sch.id}
                className={`rounded-md border p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isEligible
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-semibold text-teal-800 dark:text-cyan-300">
                      {sch.code} · NEW ({sch.introduced_date || '2026'})
                    </span>
                    {plan ? (
                      <StatusText status={plan.eligibility_status} />
                    ) : (
                      sch.application_status && <StatusText status={sch.application_status} />
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {lang === 'te' ? sch.name_te : sch.name}
                  </h3>

                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                    <div>
                      <strong>Department:</strong> {sch.authority}
                    </div>
                    <div>
                      <strong>Target:</strong> {sch.target_group || sch.beneficiary_category}
                    </div>
                    <div className="text-teal-800 dark:text-cyan-300 font-semibold">
                      <strong>Benefits:</strong> {sch.benefit_summary}
                    </div>
                    <div>
                      <strong>Eligibility:</strong> {sch.eligibility_summary || sch.description}
                    </div>
                  </div>

                  <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-0.5 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-teal-800 dark:text-cyan-300 shrink-0" />
                      <span>
                        Opens: {sch.opening_date || '2026-07-15'} · Deadline:{' '}
                        <strong className="text-amber-700 dark:text-amber-300">
                          {sch.deadline_date || '2026-12-31'}
                        </strong>
                      </span>
                    </div>
                    <div className="truncate">
                      Source: {sch.source_notification || `${sch.code} Circular`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setDetailSchemeId(sch.id)}
                    className="font-semibold text-slate-700 dark:text-slate-200 hover:underline cursor-pointer"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => openSchemeInAssistant(sch.id)}
                    className="font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
                  >
                    Check My Eligibility &amp; Apply →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* C. Newly Updated Rules (Clear distinction: NEW RULE vs REVISED RULE) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Newly Updated &amp; Revised Government Rules
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distinguishes newly introduced v1 clauses from revised v2+ circular amendments
              affecting existing schemes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPage('schemes_hub')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer self-start sm:self-auto"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Compare Old vs New Rules</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {newlyUpdatedRules.map((r) => {
            const sch = schemesById.get(r.scheme_id);
            const isRevised = r.version >= 2;
            return (
              <div
                key={r.id}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                        isRevised
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-teal-100 text-teal-900 dark:bg-cyan-950/60 dark:text-cyan-300 border border-teal-300 dark:border-cyan-800'
                      }`}
                    >
                      {isRevised ? `REVISED RULE · v${r.version}` : 'NEW RULE · v1'}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {sch?.code || r.scheme_id}
                    </span>
                  </div>
                  <StatusText status={r.status} />
                </div>

                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {r.label}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {lang === 'te' ? r.condition_text_te : r.condition_text}
                </p>

                <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Effective: {r.valid_from}</span>
                  <SourceCitationButton
                    documentId={r.document_id}
                    pageNumber={r.page_number}
                    clauseRef={r.clause_reference}
                    label={`p.${r.page_number} · cl.${r.clause_reference}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* D. Personal Eligibility Opportunities (All-16-Scheme Deterministic + Gemini AI Planner) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Personal Eligibility Opportunities — All 16 Schemes
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Evaluates every scheme against verified circular thresholds and your {memorizedDocs.length} Vault document(s). Never guarantees official approval.
            </p>
          </div>
          <button
            type="button"
            disabled={runningAiPlan || !token}
            onClick={() => void handleRunAiAllSchemes()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-60 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {runningAiPlan
                ? 'Analyzing all 16 schemes with Gemini...'
                : 'Generate AI Advanced Tasks (All 16 Schemes)'}
            </span>
          </button>
        </div>

        {!token ? (
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span>
              Sign in as a Citizen or via Google Auth to evaluate all 16 schemes against your
              memorized document vault and generate personalized tasks.
            </span>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1.5 rounded bg-teal-800 text-white font-semibold cursor-pointer self-start"
            >
              Sign In
            </button>
          </div>
        ) : loadingPlan && !vaultPlan ? (
          <div className="py-6 text-xs text-slate-500 dark:text-slate-400">
            Evaluating all 16 schemes against your saved profile and memorized documents...
          </div>
        ) : (
          <>
            {planError && (
              <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{planError}</span>
              </div>
            )}

            {vaultPlan && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <div className="font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {vaultPlan.eligible_count}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Likely Eligible Schemes
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <div className="font-mono text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {vaultPlan.possible_count}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Needs Info / Docs
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <div className="font-mono text-xl font-bold tabular-nums text-slate-700 dark:text-slate-300">
                      {vaultPlan.not_eligible_count}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Criteria Not Met Today
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <div className="font-mono text-xl font-bold tabular-nums text-teal-800 dark:text-cyan-300">
                      {vaultPlan.total_schemes_evaluated}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Total Schemes Evaluated
                    </div>
                  </div>
                </div>

                {vaultPlan.executive_strategy && (
                  <div className="rounded-md border border-teal-200 dark:border-cyan-900 bg-teal-50/50 dark:bg-cyan-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-teal-900 dark:text-cyan-200">
                        AI Strategy &amp; Cross-Scheme Advanced Tasks · {vaultPlan.model_used}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {new Date(vaultPlan.generated_at).toLocaleTimeString('en-IN')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                      {vaultPlan.executive_strategy}
                    </p>
                    {vaultPlan.cross_scheme_advanced_tasks.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                        {vaultPlan.cross_scheme_advanced_tasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {task.title}
                              </span>
                              <span
                                className={`font-mono uppercase text-[10px] font-semibold ${
                                  task.priority === 'high'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : task.priority === 'medium'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {task.priority}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300">{task.action}</p>
                            {task.impacted_schemes.length > 0 && (
                              <div className="font-mono text-[11px] text-teal-800 dark:text-cyan-300">
                                Schemes: {task.impacted_schemes.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['all', `All ${vaultPlan.scheme_plans.length} Schemes`],
                      ['eligible', `Likely Eligible (${vaultPlan.eligible_count})`],
                      [
                        'new',
                        `Newly Introduced (${vaultPlan.scheme_plans.filter((s) => s.is_new).length})`,
                      ],
                      ['action', 'Needs Action / Missing Docs'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSchemeFilter(id)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                        schemeFilter === id
                          ? 'bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                  {filteredSchemePlans.map((sp) => (
                    <div key={sp.scheme_id} className="p-4 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                            <span className="font-semibold text-teal-800 dark:text-cyan-300">
                              {sp.scheme_code}
                            </span>
                            {sp.is_new && (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                · NEW SCHEME
                              </span>
                            )}
                            <span className="text-slate-500 dark:text-slate-400">
                              · {sp.target_group}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {sp.scheme_name}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                          <StatusText status={sp.eligibility_status} />
                          <button
                            type="button"
                            onClick={() => setDetailSchemeId(sp.scheme_id)}
                            className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => openSchemeInAssistant(sp.scheme_id)}
                            className="px-2.5 py-1 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                          >
                            Apply Assistant
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-800 space-y-1">
                          <div className="font-semibold text-slate-700 dark:text-slate-300">
                            Document Vault Readiness
                          </div>
                          <div className="text-emerald-700 dark:text-emerald-400">
                            Matched ({sp.matched_docs.length}):{' '}
                            {sp.matched_docs.length > 0 ? sp.matched_docs.join(', ') : 'None yet'}
                          </div>
                          {sp.missing_docs.length > 0 && (
                            <div className="text-amber-700 dark:text-amber-400">
                              Missing ({sp.missing_docs.length}): {sp.missing_docs.join(', ')}
                            </div>
                          )}
                        </div>

                        <div className="rounded bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-800 space-y-1">
                          <div className="font-semibold text-slate-700 dark:text-slate-300">
                            Why Recommended &amp; Predefined Tasks
                          </div>
                          <ul className="space-y-0.5 text-slate-600 dark:text-slate-400">
                            {sp.predefined_tasks.map((task, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400 shrink-0 mt-0.5" />
                                <span>{task}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {sp.advanced_tasks.length > 0 && (
                        <div className="rounded bg-teal-50/50 dark:bg-cyan-950/20 border border-teal-200 dark:border-cyan-900 p-2.5 text-xs space-y-1">
                          <div className="font-semibold text-teal-900 dark:text-cyan-200">
                            AI Advanced Optimization Tasks ({sp.scheme_code})
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300">
                            {sp.advanced_tasks.map((adv, idx) => (
                              <li key={idx}>{adv}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Rules Snapshot */}
        <section className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Current Verified Criteria — {selectedScheme ? `${selectedScheme.code}` : 'PM-01'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active rules currently powering citizen answers and FormSathi checks
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedSchemeId}
                onChange={(e) => setSelectedSchemeId(e.target.value)}
                aria-label="Select scheme to inspect verified rules"
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[210px]"
              >
                {(overview?.schemes || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {lang === 'te' ? s.name_te : s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPage('whatif')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>What-If</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeSchemeRules.map((r) => (
              <div
                key={r.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {lang === 'te' ? r.condition_text_te : r.condition_text}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {r.label} · Version {r.version}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusText status={r.status} />
                  <SourceCitationButton
                    documentId={r.document_id}
                    pageNumber={r.page_number}
                    clauseRef={r.clause_reference}
                    label={`p.${r.page_number} · cl.${r.clause_reference}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Citizen Impact Alerts & Cloud Bookmarks */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Saved Schemes (Cloud Sync)
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {firebaseUid ? `${bookmarks.length} saved` : 'Sign in to sync'}
              </span>
            </div>

            {!firebaseUid ? (
              <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                <p>
                  Sign in with Google via Firebase Auth to save and sync target schemes across
                  sessions.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-teal-700 dark:border-cyan-400 text-teal-800 dark:text-cyan-300 font-semibold cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Continue with Google</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(overview?.schemes || []).slice(0, 8).map((sch) => (
                    <button
                      key={sch.id}
                      type="button"
                      disabled={savingId === sch.id}
                      onClick={() => void handleBookmarkScheme(sch.id, sch.name)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
                    >
                      <Bookmark className="w-3 h-3 text-teal-800 dark:text-cyan-300" />
                      <span>{savingId === sch.id ? 'Saving...' : `Bookmark ${sch.code}`}</span>
                    </button>
                  ))}
                </div>

                {bookmarkError && (
                  <div className="text-xs text-rose-700 dark:text-rose-400">{bookmarkError}</div>
                )}

                {bookmarks.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No schemes bookmarked yet. Click a scheme above to save it to Firestore.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {bm.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {bm.note}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteSchemeBookmark(bm.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          aria-label={`Remove ${bm.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Verified Rule Change Alerts
              </h2>
              <button
                type="button"
                onClick={() => setPage('services_help')}
                className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                Deadlines &amp; Nearby Help
              </button>
            </div>

            {citizenAlerts.length === 0 ? (
              <div className="py-4 text-sm text-slate-500 dark:text-slate-400 space-y-2">
                <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                  <Bell className="w-4 h-4" aria-hidden="true" />
                  <span>No citizen alerts published yet</span>
                </div>
                <p className="text-xs leading-relaxed">
                  Verified policy updates published via Government Portal Policy Ripple appear here
                  automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {citizenAlerts.map((al) => (
                  <div
                    key={al.id}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1"
                  >
                    <div className="text-xs font-semibold text-teal-800 dark:text-cyan-300">
                      Rule Update Notice · {new Date(al.created_at).toLocaleDateString('en-IN')}
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {lang === 'te' ? al.message_te : al.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <SchemeDetailModal schemeId={detailSchemeId} onClose={() => setDetailSchemeId(null)} />
      <DelayAssistantModal
        application={delayModalApp}
        onClose={() => setDelayModalApp(null)}
        onRaiseComplaint={(app) => openComplaintForApp(app)}
      />
    </div>
  );
};

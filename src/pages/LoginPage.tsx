import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Building2,
  Mic,
  Moon,
  Newspaper,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useApp, type PageId } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { AuthHero3DScene } from '../components/three/AuthHero3DScene';
import { LoginVoiceAndNewsDesk } from '../components/landing/LoginVoiceAndNewsDesk';
import { LatestUpdatesShowcase } from '../components/landing/LatestUpdatesShowcase';
import type {
  CitizenInterestTopic,
  NewsFeedPayload,
  OrganizationType,
  UserRole,
} from '../types/niyamsetu';

const ALL_TOPICS: CitizenInterestTopic[] = [
  'Government schemes and notifications',
  'National and international news',
  'Gold and silver market updates',
  'Stock market updates',
  'Education, scholarships and employment',
  "Agriculture and farmers' updates",
  'Technology and AI',
  'Business and economy',
  'Health and public services',
  'State and district news',
];

const DEFAULT_LOGIN_TOPICS: CitizenInterestTopic[] = [
  'Government schemes and notifications',
  'Education, scholarships and employment',
  'Technology and AI',
];

function readSavedInterests(): CitizenInterestTopic[] {
  try {
    const raw = localStorage.getItem('niyamsetu_saved_interests');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((t): t is CitizenInterestTopic => ALL_TOPICS.includes(t));
      }
    }
  } catch {
    // ignore invalid JSON
  }
  return DEFAULT_LOGIN_TOPICS;
}

function readSavedLocation(): { state: string; district: string } {
  try {
    const raw = localStorage.getItem('niyamsetu_guest_location');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          state: String(parsed.state || 'Telangana'),
          district: String(parsed.district || 'Hyderabad'),
        };
      }
    }
  } catch {
    // ignore
  }
  return { state: 'Telangana', district: 'Hyderabad' };
}

export const LoginPage: React.FC = () => {
  const {
    lang,
    setLang,
    dark,
    toggleDark,
    overview,
    signInAsDemoRole,
    signInWithGoogle,
    signInWithCredentials,
    registerStudent,
    setPage,
  } = useApp();

  const [hoveredRole, setHoveredRole] = useState<'STUDENT' | 'ORGANIZATION' | 'ADMIN'>('STUDENT');
  const [selectedOrgType, setSelectedOrgType] = useState<OrganizationType>('hospital');
  const [authTab, setAuthTab] = useState<'roles' | 'login' | 'register'>('roles');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedInterests, setSelectedInterests] = useState<CitizenInterestTopic[]>(() =>
    readSavedInterests()
  );
  const [savedLocation, setSavedLocation] = useState<{ state: string; district: string }>(() =>
    readSavedLocation()
  );
  const [newsFeed, setNewsFeed] = useState<NewsFeedPayload | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsRefreshing, setNewsRefreshing] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const loadPublicNews = useCallback(
    async (topics: CitizenInterestTopic[], forceRefresh = false) => {
      if (forceRefresh) setNewsRefreshing(true);
      else setNewsLoading(true);
      setNewsError(null);
      try {
        const params = new URLSearchParams();
        params.set('interests', topics.join(','));
        if (savedLocation.state) params.set('state', savedLocation.state);
        if (savedLocation.district) params.set('district', savedLocation.district);
        params.set('lang', lang);
        if (forceRefresh) params.set('refresh', '1');
        const res = await apiRequest<NewsFeedPayload>(`/public/news-feed?${params.toString()}`);
        setNewsFeed(res);
      } catch (err) {
        setNewsError(err instanceof Error ? err.message : 'Unable to load daily updates.');
      } finally {
        setNewsLoading(false);
        setNewsRefreshing(false);
      }
    },
    [lang, savedLocation.district, savedLocation.state]
  );

  useEffect(() => {
    void loadPublicNews(selectedInterests, false);
  }, [selectedInterests, loadPublicNews]);

  const toggleLoginInterest = (topic: CitizenInterestTopic) => {
    setSelectedInterests((prev) => {
      const exists = prev.includes(topic);
      const next = exists
        ? prev.length > 1
          ? prev.filter((item) => item !== topic)
          : prev
        : prev.length < 10
          ? [...prev, topic]
          : prev;
      try {
        localStorage.setItem('niyamsetu_saved_interests', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleLocationChange = (next: { state: string; district: string }) => {
    setSavedLocation(next);
    try {
      localStorage.setItem('niyamsetu_guest_location', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const handleQuickAccess = async (targetPage: PageId) => {
    setBusy(true);
    setError(null);
    try {
      await signInAsDemoRole('STUDENT');
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open Citizen Portal.');
    } finally {
      setBusy(false);
    }
  };

  const handleRoleAccess = async (role: UserRole, orgType?: OrganizationType) => {
    setBusy(true);
    setError(null);
    try {
      await signInAsDemoRole(role, orgType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter workspace.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user') && !msg.includes('cancelled-popup-request')) {
        setError(msg || 'Google Sign-In failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithCredentials(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await registerStudent(name, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const roleCards: Array<{
    role: 'STUDENT' | 'ORGANIZATION' | 'ADMIN';
    title: string;
    subtitle: string;
    scope: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      role: 'STUDENT',
      title: lang === 'te' ? 'పౌర పోర్టల్ (Citizen Portal)' : 'Citizen Portal',
      subtitle: 'Ravi Kumar · Personal Profile, Emergency Card & Document Vault',
      scope: 'Dashboard, Schemes & Rules Explorer, FormSathi Application Assistant, Emergency Info & Document Vault, Help Centers Map',
      icon: User,
    },
    {
      role: 'ORGANIZATION',
      title:
        lang === 'te'
          ? 'ప్రభుత్వ భాగస్వామ్య సంస్థలు (Organizations Area)'
          : 'Government Portal · Organization Area',
      subtitle: 'Hospitals (Emergency Photo/Biometrics) · Banks · Colleges · MeeSeva',
      scope: 'Dedicated partner verification workspace for Hospitals, Banks, Colleges & Citizen Centers.',
      icon: Building2,
    },
    {
      role: 'ADMIN',
      title:
        lang === 'te'
          ? 'ప్రధాన ప్రభుత్వ పర్యవేక్షణ (Main Government Oversight)'
          : 'Government Portal · Main Government Admin',
      subtitle: 'Dr. Kavitha Rao · Master Website Inspector & Policy Oversight',
      scope: 'Scheme Usage & Rule Usefulness Analytics, RuleWeaver & Review Queue, and Policy Ripple Oversight.',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left 3D Visual Panel */}
      <section className="lg:w-[52%] bg-slate-950 text-slate-100 flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="flex items-center justify-between gap-4 z-10">
          <div className="font-display text-xl font-bold tracking-tight text-white">
            {lang === 'te' ? 'నియమ్‌సేతు AI' : 'NiyamSetu AI'}
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>{overview?.metrics.schemes_count ?? 16} Schemes</span>
            <span>·</span>
            <span>{overview?.metrics.total_rules ?? 82} Rules</span>
          </div>
        </div>

        <div className="my-4 lg:my-0 flex-1 min-h-[320px] sm:min-h-[380px] relative">
          <AuthHero3DScene activeRoleHighlight={hoveredRole} />
        </div>

        <div className="space-y-3 z-10 max-w-xl">
          <p className="text-xs font-semibold tracking-wide text-cyan-400">
            {lang === 'te'
              ? 'భారత ప్రభుత్వ పథకాలు, ప్రజా సేవలు & నియమాల వేదిక'
              : 'Indian Government Scheme, Public Service & Rules Intelligence Platform'}
          </p>
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white headline-balance">
            {lang === 'te'
              ? 'నియమాలను అర్థం చేసుకోండి. ప్రయోజనాలను కనుగొనండి. దరఖాస్తులను పూర్తి చేయండి.'
              : 'Understand the rules. Find your benefits. Complete your applications.'}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Two distinct experiences built on one verified rules engine: citizens get simple
            scheme discovery, eligibility checks, document intelligence, and guided FormSathi
            applications; government staff manage rules, sources, reviews, and policy ripples.
          </p>
        </div>
      </section>

      {/* Right Authentication & Role Access Card */}
      <section className="lg:w-[48%] flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center p-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                lang === 'en'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('te')}
              className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                lang === 'te'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              తెలుగు
            </button>
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-teal-700 cursor-pointer"
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto my-8 space-y-6">
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              {lang === 'te' ? 'మీ ఖాతాలోకి ప్రవేశించండి' : 'Sign In to Your Workspace'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Sections and controls adapt automatically to your verified role.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-teal-700 dark:hover:border-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{busy ? 'Connecting...' : 'Continue with Google (Firebase Cloud Sync)'}</span>
          </button>

          <div className="flex gap-1 p-1 rounded-md bg-slate-200/70 dark:bg-slate-800">
            {[
              ['roles', 'Role Access'],
              ['login', 'Email Sign In'],
              ['register', 'New Citizen'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setAuthTab(id as 'roles' | 'login' | 'register');
                  setError(null);
                }}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {authTab === 'roles' && (
            <div className="space-y-3">
              {roleCards.map((card) => {
                const Icon = card.icon;
                const active = hoveredRole === card.role;
                return (
                  <div
                    key={card.role}
                    onMouseEnter={() => setHoveredRole(card.role)}
                    className={`rounded-lg border bg-white dark:bg-slate-900 p-4 card-3d space-y-2.5 ${
                      active
                        ? 'border-teal-700 dark:border-cyan-400'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onFocus={() => setHoveredRole(card.role)}
                      onClick={() =>
                        handleRoleAccess(
                          card.role,
                          card.role === 'ORGANIZATION' ? selectedOrgType : undefined
                        )
                      }
                      className="w-full text-left flex items-start justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-md bg-teal-800/10 dark:bg-cyan-400/15 text-teal-800 dark:text-cyan-300 shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {card.title}
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {card.subtitle}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                            {card.scope}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    </button>

                    {card.role === 'ORGANIZATION' && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                        {(
                          [
                            ['hospital', 'Hospital'],
                            ['bank', 'Bank'],
                            ['college', 'College'],
                            ['other', 'MeeSeva / Other'],
                          ] as Array<[OrganizationType, string]>
                        ).map(([ot, lbl]) => (
                          <button
                            key={ot}
                            type="button"
                            onClick={() => {
                              setSelectedOrgType(ot);
                              void handleRoleAccess('ORGANIZATION', ot);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                              selectedOrgType === ot
                                ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {authTab === 'login' && (
            <form onSubmit={handleCredentials} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@niyamsetu.demo"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (demo: NiyamDemo2026!)"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {authTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Ananya Reddy"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ananya@example.com"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password (minimum 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create password"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Creating Account...' : 'Create Citizen Account'}
              </button>
            </form>
          )}

        </div>

        <div className="space-y-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#login-voice-desk"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-teal-700/30 dark:border-cyan-400/30 bg-teal-800/10 dark:bg-cyan-500/10 text-xs font-semibold text-teal-900 dark:text-cyan-200 hover:border-teal-700 dark:hover:border-cyan-400"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>
                {lang === 'te'
                  ? 'వాయిస్ సహాయకుడు & వార్తలు వినండి (EN / హిందీ / తెలుగు)'
                  : 'Live Voice Help & Listen to News (EN / हिन्दी / తెలుగు)'}
              </span>
            </a>
            <a
              href="#login-interest-news"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline"
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>
                {lang === 'te'
                  ? 'తాజా నవీకరణల కోసం క్రిందికి స్క్రోల్ చేయండి'
                  : 'Latest Updates Across India'}
              </span>
              <ArrowDown className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Server-enforced RBAC · Google Firebase Auth &amp; Firestore · Deterministic eligibility math
          </div>
        </div>
      </section>
      </div>

      {/* Login Page Only: Side-by-side Live Voice Advisor & Spoken News Reader (EN / HI / TE) */}
      <LoginVoiceAndNewsDesk
        newsFeed={newsFeed}
        newsLoading={newsLoading}
        defaultLang={lang}
      />

      {/* Live Scrolling "Latest Updates Across India" Showcase directly below Voice & News Desk */}
      <LatestUpdatesShowcase
        lang={lang}
        allInterestTopics={ALL_TOPICS}
        selectedInterests={selectedInterests}
        onToggleInterest={toggleLoginInterest}
        location={savedLocation}
        onLocationChange={handleLocationChange}
        newsFeed={newsFeed}
        newsLoading={newsLoading}
        newsRefreshing={newsRefreshing}
        newsError={newsError}
        onRefresh={() => void loadPublicNews(selectedInterests, true)}
        onQuickAccess={(targetPage) => void handleQuickAccess(targetPage)}
      />
    </div>
  );
};

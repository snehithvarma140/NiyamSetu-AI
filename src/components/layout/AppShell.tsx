import React, { useState } from 'react';
import {
  Activity,
  BellRing,
  Building2,
  CalendarCheck2,
  FileCheck2,
  FileSearch,
  FolderLock,
  GitBranch,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { useApp, type PageId } from '../../context/AppContext';
import { tr } from '../../i18n/translations';
import { AuthModal } from '../ui/AuthModal';
import { JanSetuDrawer } from '../ui/JanSetuDrawer';
import { SourceViewerModal } from '../ui/SourceViewerModal';

interface NavItem {
  id: PageId;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'citizen' | 'org' | 'governance';
  matches?: PageId[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  // Citizen Portal
  { id: 'student_home', labelKey: 'nav_student_home', icon: Home, group: 'citizen' },
  {
    id: 'schemes_hub',
    labelKey: 'nav_schemes_hub',
    icon: FileSearch,
    group: 'citizen',
    matches: ['schemes_hub', 'eligibility', 'whatif'],
  },
  {
    id: 'readiness_hub',
    labelKey: 'nav_readiness_hub',
    icon: FileCheck2,
    group: 'citizen',
    matches: ['readiness_hub', 'formsathi'],
  },
  { id: 'profile_vault', labelKey: 'nav_profile_vault', icon: FolderLock, group: 'citizen' },
  {
    id: 'appointments',
    labelKey: 'nav_appointments',
    icon: CalendarCheck2,
    group: 'citizen',
  },
  {
    id: 'services_help',
    labelKey: 'nav_services_help',
    icon: BellRing,
    group: 'citizen',
    matches: ['services_help', 'deadlines', 'help_centers', 'complaints', 'faq'],
  },
  {
    id: 'jansetu',
    labelKey: 'nav_jansetu',
    icon: MessageSquareText,
    group: 'citizen',
    matches: ['jansetu', 'grievance'],
  },

  // Organizations Area (Hospitals, Banks, Colleges, MeeSeva/CSC)
  { id: 'org_workspace', labelKey: 'nav_org_workspace', icon: Building2, group: 'org' },

  // Main Government Oversight Area
  { id: 'admin_dash', labelKey: 'nav_admin_dash', icon: LayoutDashboard, group: 'governance' },
  {
    id: 'governance_hub',
    labelKey: 'nav_governance_hub',
    icon: GitBranch,
    group: 'governance',
    matches: ['governance_hub', 'ruleweaver', 'review', 'ripple'],
  },
  { id: 'app_monitoring', labelKey: 'nav_app_monitoring', icon: Activity, group: 'governance' },
  {
    id: 'gov_admin',
    labelKey: 'nav_gov_admin',
    icon: ShieldCheck,
    group: 'governance',
    matches: ['gov_admin', 'dev_dash'],
  },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    page,
    setPage,
    lang,
    setLang,
    dark,
    toggleDark,
    user,
    setAuthModalOpen,
    signOut,
    overview,
    resetDemoData,
    setJanSetuDrawerOpen,
  } = useApp();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isOfficer = user?.role === 'ADMIN' || isPlatformAdmin;
  const isOrg = user?.role === 'ORGANIZATION';

  const visibleItems = ALL_NAV_ITEMS.filter((item) => {
    if (isOfficer) {
      // Main Gov sees Government Oversight sections only
      return item.group === 'governance';
    }
    if (isOrg) {
      // Partner Organizations stay in the dedicated Organization Workspace
      return item.group === 'org';
    }
    return item.group === 'citizen';
  });

  const isItemActive = (item: NavItem) => {
    if (item.matches) return item.matches.includes(page);
    return item.id === page;
  };

  const activeNav = visibleItems.find(isItemActive) || visibleItems[0] || ALL_NAV_ITEMS[0];
  const groupLabel =
    activeNav.group === 'org'
      ? tr(lang, 'group_org')
      : activeNav.group === 'citizen'
        ? tr(lang, 'group_citizen')
        : tr(lang, 'group_governance');

  const draftCount = overview?.metrics.draft_rules ?? 0;

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDemoData();
    } finally {
      setResetting(false);
    }
  };

  const renderNavSection = (group: NavItem['group'], titleKey: string) => {
    const items = visibleItems.filter((i) => i.group === group);
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {tr(lang, titleKey)}
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPage(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-teal-800/10 dark:bg-cyan-400/15 text-teal-900 dark:text-cyan-200 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0 truncate">
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{tr(lang, item.labelKey)}</span>
              </span>
              {item.id === 'governance_hub' && draftCount > 0 && (
                <span className="text-xs font-mono tabular-nums text-amber-700 dark:text-amber-400 font-semibold shrink-0">
                  {draftCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const navOrder = isOfficer
    ? renderNavSection('governance', 'group_governance')
    : isOrg
      ? renderNavSection('org', 'group_org')
      : renderNavSection('citizen', 'group_citizen');

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() =>
              setPage(isOfficer ? 'admin_dash' : isOrg ? 'org_workspace' : 'student_home')
            }
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {tr(lang, 'brand')}
          </button>
          {user && (
            <span className="text-[10px] font-mono font-semibold text-teal-800 dark:text-cyan-300 bg-teal-50 dark:bg-cyan-950/50 border border-teal-200 dark:border-cyan-800 px-1.5 py-0.5 rounded">
              {user.role === 'PLATFORM_ADMIN'
                ? 'GOV ROOT'
                : user.role === 'ADMIN'
                  ? 'GOV'
                  : user.role === 'ORGANIZATION'
                    ? (user.organization_type || 'ORG').toUpperCase()
                    : 'CITIZEN'}
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-2" aria-label="Primary Navigation">
          {navOrder}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            {user ? (
              <>
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out / Switch Portal</span>
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Go to Portal Login</span>
              </>
            )}
          </button>
          {isOfficer && (
            <button
              type="button"
              disabled={resetting}
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{resetting ? 'Resetting...' : tr(lang, 'reset_demo')}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                {tr(lang, 'brand')}
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-2">{navOrder}</nav>
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{user ? 'Sign Out / Switch Portal' : 'Go to Portal Login'}</span>
              </button>
              {isOfficer && (
                <button
                  type="button"
                  disabled={resetting}
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{resetting ? 'Resetting...' : tr(lang, 'reset_demo')}</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="hidden sm:inline text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {groupLabel}
              </span>
              <span className="hidden sm:inline text-slate-400 dark:text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {tr(lang, activeNav.labelKey)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!isOfficer && !isOrg && (
              <button
                type="button"
                onClick={() => setJanSetuDrawerOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-teal-700/40 dark:border-cyan-400/40 text-teal-800 dark:text-cyan-300 hover:bg-teal-50 dark:hover:bg-cyan-950/30 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{lang === 'te' ? 'జనసేతు AI' : 'Ask JanSetu AI'}</span>
              </button>
            )}

            <div
              className="flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              role="group"
              aria-label="Language selection"
            >
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  lang === 'en'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('te')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  lang === 'te'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                తెలుగు
              </button>
            </div>

            <button
              type="button"
              onClick={toggleDark}
              className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={dark ? 'Light theme' : 'Dark theme'}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1.5 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {user
                ? `${user.name.split(' ')[0]} · ${
                    user.role === 'STUDENT'
                      ? 'CITIZEN'
                      : user.role === 'ORGANIZATION'
                        ? 'ORG'
                        : 'GOV'
                  }`
                : tr(lang, 'sign_in')}
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Mobile Horizontal Quick-Section Selector */}
          {visibleItems.length > 1 && (
            <nav
              aria-label="Quick section selector"
              className="lg:hidden -mx-4 px-4 pb-4 mb-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto snap-x"
            >
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPage(item.id)}
                    className={`snap-start shrink-0 min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-teal-800 dark:bg-cyan-500 border-teal-800 dark:border-cyan-500 text-white dark:text-slate-950 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-teal-700/50 dark:hover:border-cyan-400/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{tr(lang, item.labelKey)}</span>
                  </button>
                );
              })}
            </nav>
          )}
          {children}
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-4 sm:px-6 lg:px-8 py-4">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <p>{tr(lang, 'disclaimer_short')}</p>
            <p className="shrink-0">{tr(lang, 'sample_notice')}</p>
          </div>
        </footer>
      </div>

      {/* Persistent Citizen JanSetu AI Floating Trigger */}
      {!isOfficer && !isOrg && (
        <button
          type="button"
          onClick={() => setJanSetuDrawerOpen(true)}
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 shadow-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
          aria-label="Open JanSetu AI Assistant Drawer"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          <span>{lang === 'te' ? 'జనసేతు AI సహాయం' : 'Ask JanSetu AI'}</span>
        </button>
      )}

      {!isOfficer && !isOrg && <JanSetuDrawer />}
      <AuthModal />
      <SourceViewerModal />
    </div>
  );
};

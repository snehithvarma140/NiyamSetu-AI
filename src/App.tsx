import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { StudentHome } from './pages/student/StudentHome';
import { ProfileVaultPage } from './pages/student/ProfileVaultPage';
import { JanSetuPage } from './pages/student/JanSetuPage';
import { SchemesHubPage } from './pages/student/SchemesHubPage';
import { ReadinessHubPage } from './pages/student/ReadinessHubPage';
import { ServicesHelpPage } from './pages/student/ServicesHelpPage';
import { OfficerAppointmentsPage } from './pages/student/OfficerAppointmentsPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { GovernanceLifecycleHubPage } from './pages/admin/GovernanceLifecycleHubPage';
import { GovMonitoringPage } from './pages/admin/GovMonitoringPage';
import { GovAdminSecurityPage } from './pages/admin/GovAdminSecurityPage';
import { OrganizationWorkspacePage } from './pages/admin/OrganizationWorkspacePage';

function WorkspaceRouter() {
  const { page, user } = useApp();
  const isOfficer = user?.role === 'ADMIN' || user?.role === 'PLATFORM_ADMIN';
  const isOrg = user?.role === 'ORGANIZATION';

  // Enforce strict role guard on Government Oversight & Organization views
  const mainGovOnlyPages = new Set([
    'admin_dash',
    'governance_hub',
    'ruleweaver',
    'review',
    'ripple',
    'app_monitoring',
    'gov_admin',
    'dev_dash',
  ]);
  if (mainGovOnlyPages.has(page) && !isOfficer) {
    return isOrg ? <OrganizationWorkspacePage /> : <StudentHome />;
  }
  if (page === 'org_workspace' && !isOrg) {
    return isOfficer ? <AdminDashboard /> : <StudentHome />;
  }

  switch (page) {
    case 'student_home':
      return isOfficer ? <AdminDashboard /> : isOrg ? <OrganizationWorkspacePage /> : <StudentHome />;
    case 'profile_vault':
      return <ProfileVaultPage />;
    case 'schemes_hub':
      return <SchemesHubPage initialTab="eligibility" />;
    case 'eligibility':
      return <SchemesHubPage initialTab="eligibility" />;
    case 'whatif':
      return <SchemesHubPage initialTab="whatif" />;
    case 'appointments':
      return <OfficerAppointmentsPage />;
    case 'readiness_hub':
      return <ReadinessHubPage />;
    case 'formsathi':
      return <ReadinessHubPage />;
    case 'services_help':
      return <ServicesHelpPage initialTab="deadlines" />;
    case 'deadlines':
      return <ServicesHelpPage initialTab="deadlines" />;
    case 'help_centers':
      return <ServicesHelpPage initialTab="help_centers" />;
    case 'complaints':
      return <ServicesHelpPage initialTab="complaints" />;
    case 'faq':
      return <ServicesHelpPage initialTab="faq" />;
    case 'jansetu':
      return <JanSetuPage initialTab="qa" />;
    case 'grievance':
      return <JanSetuPage initialTab="grievance" />;
    case 'admin_dash':
      return <AdminDashboard />;
    case 'org_workspace':
      return <OrganizationWorkspacePage />;
    case 'governance_hub':
      return <GovernanceLifecycleHubPage initialTab="ruleweaver" />;
    case 'ruleweaver':
      return <GovernanceLifecycleHubPage initialTab="ruleweaver" />;
    case 'review':
      return <GovernanceLifecycleHubPage initialTab="review" />;
    case 'ripple':
      return <GovernanceLifecycleHubPage initialTab="ripple" />;
    case 'app_monitoring':
      return <GovMonitoringPage />;
    case 'gov_admin':
    case 'dev_dash':
      return <GovAdminSecurityPage />;
    default:
      return isOfficer ? (
        <AdminDashboard />
      ) : isOrg ? (
        <OrganizationWorkspacePage />
      ) : (
        <StudentHome />
      );
  }
}

function AppContent() {
  const { mapsQuotaExceeded, user } = useApp();

  return (
    <>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {!user ? (
        <LoginPage />
      ) : (
        <AppShell>
          <WorkspaceRouter />
        </AppShell>
      )}
    </>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unexpected application error.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 text-center shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              Reload NiyamSetu AI
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AppErrorBoundary>
  );
}


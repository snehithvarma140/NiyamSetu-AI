import React, { useState } from 'react';
import { Building2, ShieldCheck, User, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { OrganizationType, UserRole } from '../../types/niyamsetu';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    setAuthModalOpen,
    user,
    firebaseUid,
    signInAsDemoRole,
    signInWithGoogle,
    signInWithCredentials,
    registerStudent,
    signOut,
    setPage,
  } = useApp();

  const [tab, setTab] = useState<'roles' | 'login' | 'register'>('roles');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authModalOpen) return null;

  const portalLabel =
    user?.role === 'STUDENT'
      ? 'Citizen Portal'
      : user?.role === 'ORGANIZATION'
        ? `Organization Portal${user.organization_name ? ` · ${user.organization_name}` : ''}`
        : 'Government Oversight Portal';

  const handleGoogleSignIn = async () => {
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

  const handleRoleSwitch = async (role: UserRole, orgType?: OrganizationType) => {
    setBusy(true);
    setError(null);
    try {
      await signInAsDemoRole(role, orgType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithCredentials(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={user ? 'Signed-In Profile Details' : 'Account and Role Workspace Access'}
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {user ? 'My Account & Profile' : 'Workspace Access & Role Controls'}
          </h3>
          <button
            type="button"
            onClick={() => setAuthModalOpen(false)}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
            aria-label="Close profile modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {user ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {user.name}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {user.email}
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-cyan-300">
                      <span>{portalLabel}</span>
                      {firebaseUid ? <span>· Google Cloud Sync Active</span> : null}
                    </div>
                  </div>
                </div>

                {(user.state || user.district || user.department) && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    {user.district || user.state ? (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Location: </span>
                        <span className="font-medium">
                          {[user.district, user.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    ) : null}
                    {user.department ? (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Department: </span>
                        <span className="font-medium">{user.department}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {user.role === 'STUDENT' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalOpen(false);
                      setPage('profile_vault');
                    }}
                    className="px-3.5 py-2 text-xs font-semibold rounded-md border border-teal-700 dark:border-cyan-400 text-teal-800 dark:text-cyan-300 hover:bg-teal-50 dark:hover:bg-cyan-950/30 cursor-pointer"
                  >
                    Open Profile &amp; Document Vault
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    setAuthModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
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
                <span>{busy ? 'Connecting...' : 'Continue with Google (Firebase Sync)'}</span>
              </button>

              <div className="flex gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-800">
                {[
                  ['roles', 'Portal Workspaces'],
                  ['login', 'Email Sign In'],
                  ['register', 'New Citizen'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setTab(id as 'roles' | 'login' | 'register');
                      setError(null);
                    }}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      tab === id
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

          {tab === 'roles' && (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a portal to access server-enforced Citizen Services or Government
                Administration workspaces.
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleRoleSwitch('STUDENT')}
                className="w-full text-left rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors flex items-start gap-3 cursor-pointer"
              >
                <User className="w-4 h-4 text-teal-800 dark:text-cyan-300 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Citizen Portal
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Personal Dashboard, Schemes &amp; Rules Explorer, FormSathi Application
                    Assistant, Document Guide &amp; Vault, Deadlines &amp; Help Map. Cannot approve rules.
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleRoleSwitch('ORGANIZATION', 'hospital')}
                className="w-full text-left rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors flex items-start gap-3 cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-teal-800 dark:text-cyan-300 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Government Portal · Organization Area
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Hospitals (Emergency Photo/Biometric Lookup), Banks (DBT), Colleges
                    (Bonafide), and MeeSeva Verification Desks.
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleRoleSwitch('ADMIN')}
                className="w-full text-left rounded-md border border-slate-200 dark:border-slate-800 p-3.5 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors flex items-start gap-3 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Government Portal · Main Oversight Admin
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Scheme Usage &amp; Rule Analytics, RuleWeaver Ingestion, Human Review Queue,
                    and Policy Ripple Approvals.
                  </div>
                </div>
              </button>
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@niyamsetu.demo"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
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
                  placeholder="Enter password"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 px-4 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {tab === 'register' && (
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
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ananya@example.com"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
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
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 px-4 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Creating account...' : 'Create Citizen Account'}
              </button>
            </form>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

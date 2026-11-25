import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  createOrUpdateBookmark,
  deleteMemorizedDocumentFromFirestore,
  removeBookmark,
  saveMemorizedDocumentToFirestore,
  saveUserFullProfile,
  signInWithGooglePopup,
  signOutFirebase,
  subscribePublicSchemesCatalog,
  subscribeUserBookmarks,
  subscribeUserDocuments,
  type FirestoreSchemeCatalogItem,
  type SavedBookmark,
} from '../lib/firebase';
import { subscribeSupabaseRealtime } from '../lib/supabase';
import { apiRequest } from '../services/api';
import type {
  AlertItem,
  ApplicationDraftRecord,
  AppointmentSectorType,
  AppointmentStatus,
  ComplaintCategory,
  ComplaintChannel,
  ComplaintRecord,
  ComplaintStatus,
  DocumentRecord,
  ImpactReport,
  LanguageCode,
  MemorizedDocument,
  OfficerAppointmentRecord,
  OfficerRoleCategory,
  OrganizationType,
  RuleLink,
  RuleRecord,
  SchemeRecord,
  UserProfile,
  UserRole,
} from '../types/niyamsetu';

export type PageId =
  | 'student_home'
  | 'profile_vault'
  | 'schemes_hub'
  | 'readiness_hub'
  | 'services_help'
  | 'appointments'
  | 'governance_hub'
  | 'jansetu'
  | 'eligibility'
  | 'whatif'
  | 'formsathi'
  | 'deadlines'
  | 'grievance'
  | 'help_centers'
  | 'complaints'
  | 'faq'
  | 'admin_dash'
  | 'org_workspace'
  | 'app_monitoring'
  | 'gov_admin'
  | 'dev_dash'
  | 'ruleweaver'
  | 'review'
  | 'ripple';

export interface OverviewSnapshot {
  metrics: {
    total_rules: number;
    draft_rules: number;
    active_rules: number;
    applied_impacts: number;
    audit_events: number;
    documents_count: number;
    schemes_count: number;
  };
  schemes: SchemeRecord[];
  documents: DocumentRecord[];
  rules: RuleRecord[];
  rule_links: RuleLink[];
  impact_reports: ImpactReport[];
  alerts: AlertItem[];
}

export interface SourceInspectionTarget {
  documentId: string;
  pageNumber?: number;
  clauseRef?: string;
}

export interface SaveMemorizedDocumentInput {
  id?: string;
  doc_type: string;
  title: string;
  scheme_id: string;
  doc_number?: string;
  extracted_name?: string;
  extracted_income?: number | null;
  extracted_marks?: number | null;
  extracted_address?: string;
  notes?: string;
  expiry_date?: string;
  file_name?: string;
  file_size_bytes?: number;
  file_mime?: string;
  source_activity?: MemorizedDocument['source_activity'];
  syncProfile?: boolean;
}

interface PrepareApplicationInput {
  id?: string;
  schemeId: string;
  form_fields: Record<string, string>;
  attached_documents: string[];
  missing_requirements: string[];
  ai_mapping_summary?: string;
  status?: 'draft' | 'ready_for_portal';
}

interface UpdateApplicationInput {
  form_fields?: Record<string, string>;
  attached_documents?: string[];
  missing_requirements?: string[];
  status?: 'draft' | 'ready_for_portal';
  confirmPortalSubmission?: boolean;
  portal_reference_number?: string;
}

interface AppContextValue {
  page: PageId;
  setPage: (p: PageId) => void;
  lang: LanguageCode;
  setLang: (l: LanguageCode) => void;
  dark: boolean;
  toggleDark: () => void;
  user: UserProfile | null;
  firebaseUid: string | null;
  token: string | null;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  signInAsDemoRole: (role: UserRole, organizationType?: OrganizationType) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithCredentials: (email: string, password: string) => Promise<void>;
  registerStudent: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  overview: OverviewSnapshot | null;
  refreshOverview: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  sourceTarget: SourceInspectionTarget | null;
  openSourceViewer: (target: SourceInspectionTarget) => void;
  closeSourceViewer: () => void;
  ripplePulseTick: number;
  triggerRipplePulse: () => void;
  mapsQuotaExceeded: boolean;
  setMapsQuotaExceeded: (v: boolean) => void;
  bookmarks: SavedBookmark[];
  schemesCatalog: FirestoreSchemeCatalogItem[];
  saveSchemeBookmark: (schemeId: string, title: string, note: string) => Promise<void>;
  deleteSchemeBookmark: (id: string) => Promise<void>;
  memorizedDocs: MemorizedDocument[];
  refreshUserDocuments: () => Promise<void>;
  saveUserProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>;
  saveMemorizedDocument: (input: SaveMemorizedDocumentInput) => Promise<MemorizedDocument>;
  deleteMemorizedDocument: (id: string) => Promise<void>;
  applications: ApplicationDraftRecord[];
  refreshApplications: () => Promise<void>;
  prepareApplicationDraft: (input: PrepareApplicationInput) => Promise<ApplicationDraftRecord>;
  updateApplicationDraft: (id: string, updates: UpdateApplicationInput) => Promise<ApplicationDraftRecord>;
  deleteApplicationDraft: (id: string) => Promise<void>;
  activeAssistantSchemeId: string;
  setActiveAssistantSchemeId: (id: string) => void;
  openSchemeInAssistant: (schemeId: string) => void;
  janSetuDrawerOpen: boolean;
  setJanSetuDrawerOpen: (open: boolean) => void;
  complaints: ComplaintRecord[];
  refreshComplaints: () => Promise<void>;
  submitComplaint: (input: {
    department: string;
    org_type: OrganizationType | 'government';
    scheme_id?: string;
    application_id?: string;
    category: ComplaintCategory;
    subject: string;
    description: string;
    attachments?: Array<{ name: string; size_bytes: number; mime_type: string }>;
    submission_channel: ComplaintChannel;
    external_reference_number?: string;
    reminder_date?: string;
  }) => Promise<ComplaintRecord>;
  updateComplaint: (
    id: string,
    updates: {
      status?: ComplaintStatus;
      message?: string;
      resolution_note?: string;
      reminder_date?: string;
    }
  ) => Promise<ComplaintRecord>;
  complaintPrefillApp: ApplicationDraftRecord | null;
  setComplaintPrefillApp: (app: ApplicationDraftRecord | null) => void;
  openComplaintForApp: (app?: ApplicationDraftRecord | null) => void;
  appointments: OfficerAppointmentRecord[];
  refreshAppointments: () => Promise<void>;
  bookOfficerAppointment: (input: {
    sector_type: AppointmentSectorType;
    officer_role: OfficerRoleCategory;
    office_or_officer_name?: string;
    state: string;
    district: string;
    place_locality: string;
    reason: string;
    issue_details?: string;
    preferred_date: string;
    preferred_time: string;
    citizen_phone?: string;
    urgency?: 'routine' | 'priority' | 'urgent';
    related_reference?: string;
  }) => Promise<OfficerAppointmentRecord>;
  updateOfficerAppointment: (
    id: string,
    updates: {
      status?: AppointmentStatus;
      assigned_officer_name?: string;
      officer_notes?: string;
      preferred_date?: string;
      preferred_time?: string;
    }
  ) => Promise<OfficerAppointmentRecord>;
}

const AppContext = createContext<AppContextValue | null>(null);

function defaultLandingPageForRole(role: UserRole): PageId {
  if (role === 'ADMIN' || role === 'PLATFORM_ADMIN') return 'admin_dash';
  if (role === 'ORGANIZATION') return 'org_workspace';
  return 'student_home';
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [page, setPageState] = useState<PageId>('student_home');
  const setPage = useCallback((nextPage: PageId) => {
    setPageState(nextPage);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);
  const [lang, setLang] = useState<LanguageCode>('en');
  const [dark, setDark] = useState<boolean>(false);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [overview, setOverview] = useState<OverviewSnapshot | null>(null);
  const [sourceTarget, setSourceTarget] = useState<SourceInspectionTarget | null>(null);
  const [ripplePulseTick, setRipplePulseTick] = useState(0);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([]);
  const [schemesCatalog, setSchemesCatalog] = useState<FirestoreSchemeCatalogItem[]>([]);
  const [memorizedDocs, setMemorizedDocs] = useState<MemorizedDocument[]>([]);
  const [applications, setApplications] = useState<ApplicationDraftRecord[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [appointments, setAppointments] = useState<OfficerAppointmentRecord[]>([]);
  const [complaintPrefillApp, setComplaintPrefillApp] = useState<ApplicationDraftRecord | null>(null);
  const [activeAssistantSchemeId, setActiveAssistantSchemeId] = useState<string>('sch-pm-01');
  const [janSetuDrawerOpen, setJanSetuDrawerOpen] = useState<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [dark]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [page]);

  useEffect(() => {
    if (!user) return;
    try {
      if (Array.isArray(user.interests) && user.interests.length > 0) {
        localStorage.setItem('niyamsetu_saved_interests', JSON.stringify(user.interests));
      }
      if (user.state || user.district) {
        localStorage.setItem(
          'niyamsetu_guest_location',
          JSON.stringify({ state: user.state || 'Telangana', district: user.district || 'Hyderabad' })
        );
      }
    } catch {
      // ignore storage quota errors
    }
  }, [user]);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    let unsubBookmarks: (() => void) | null = null;
    let unsubDocs: (() => void) | null = null;
    let unsubCatalog: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubBookmarks) {
        unsubBookmarks();
        unsubBookmarks = null;
      }
      if (unsubDocs) {
        unsubDocs();
        unsubDocs = null;
      }
      if (unsubCatalog) {
        unsubCatalog();
        unsubCatalog = null;
      }
      if (fbUser) {
        setFirebaseUid(fbUser.uid);
        unsubBookmarks = subscribeUserBookmarks(
          fbUser.uid,
          (items) => setBookmarks(items),
          (err) => console.warn('Bookmark subscription warning:', err.message)
        );
        unsubDocs = subscribeUserDocuments(
          fbUser.uid,
          (docs) => {
            if (docs.length > 0) {
              setMemorizedDocs((prev) => {
                const byId = new Map(prev.map((d) => [d.id, d]));
                for (const d of docs) byId.set(d.id, d);
                return Array.from(byId.values());
              });
            }
          },
          () => undefined
        );
        unsubCatalog = subscribePublicSchemesCatalog(
          (items) => setSchemesCatalog(items),
          () => undefined
        );
      } else {
        setFirebaseUid(null);
        setBookmarks([]);
        setSchemesCatalog([]);
      }
    });
    return () => {
      unsubAuth();
      if (unsubBookmarks) unsubBookmarks();
      if (unsubDocs) unsubDocs();
      if (unsubCatalog) unsubCatalog();
    };
  }, []);

  const refreshOverview = useCallback(async () => {
    try {
      const data = await apiRequest<OverviewSnapshot>('/overview', { token });
      setOverview(data);
    } catch (err) {
      console.error('Overview load failed:', err);
    }
  }, [token]);

  const refreshUserDocuments = useCallback(async () => {
    if (!token) {
      setMemorizedDocs([]);
      return;
    }
    try {
      const res = await apiRequest<{ documents: MemorizedDocument[] }>('/user-documents', { token });
      setMemorizedDocs(res.documents || []);
    } catch {
      // ignore if session expired
    }
  }, [token]);

  const refreshApplications = useCallback(async () => {
    if (!token) {
      setApplications([]);
      return;
    }
    try {
      const res = await apiRequest<{ applications: ApplicationDraftRecord[] }>('/applications', {
        token,
      });
      setApplications(res.applications || []);
    } catch {
      // ignore
    }
  }, [token]);

  const refreshComplaints = useCallback(async () => {
    if (!token) {
      setComplaints([]);
      return;
    }
    try {
      const res = await apiRequest<{ complaints: ComplaintRecord[] }>('/complaints', { token });
      setComplaints(res.complaints || []);
    } catch {
      // ignore
    }
  }, [token]);

  const refreshAppointments = useCallback(async () => {
    if (!token) {
      setAppointments([]);
      return;
    }
    try {
      const res = await apiRequest<{ appointments: OfficerAppointmentRecord[] }>('/appointments', {
        token,
      });
      setAppointments(res.appointments || []);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    void refreshUserDocuments();
    void refreshApplications();
    void refreshComplaints();
    void refreshAppointments();
  }, [refreshUserDocuments, refreshApplications, refreshComplaints, refreshAppointments]);

  useEffect(() => {
    return subscribeSupabaseRealtime(() => {
      void refreshOverview();
    });
  }, [refreshOverview]);

  const signInAsDemoRole = useCallback(
    async (role: UserRole, organizationType?: OrganizationType) => {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/demo-signin', {
        method: 'POST',
        body: { role, ...(organizationType ? { organization_type: organizationType } : {}) },
      });
      setToken(res.token);
      setUser(res.user);
      setAuthModalOpen(false);
      setPage(defaultLandingPageForRole(res.user.role));
    },
    []
  );

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    const result = await signInWithGooglePopup(lang);
    if (!result) {
      return false;
    }
    const { firebaseUser, idToken } = result;
    setFirebaseUid(firebaseUser.uid);
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/google-sync', {
      method: 'POST',
      body: { idToken },
    });
    setToken(res.token);
    setUser(res.user);
    setAuthModalOpen(false);
    setPage(defaultLandingPageForRole(res.user.role));
    return true;
  }, [lang, setPage]);

  const signInWithCredentials = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.token);
    setUser(res.user);
    setAuthModalOpen(false);
    setPage(defaultLandingPageForRole(res.user.role));
  }, [setPage]);

  const registerStudent = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/register', {
        method: 'POST',
        body: { name, email, password, language_preference: lang },
      });
      setToken(res.token);
      setUser(res.user);
      setAuthModalOpen(false);
      setPage('student_home');
    },
    [lang, setPage]
  );

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setMemorizedDocs([]);
    setApplications([]);
    setComplaints([]);
    setAppointments([]);
    setComplaintPrefillApp(null);
    setFirebaseUid(null);
    setAuthModalOpen(false);
    setJanSetuDrawerOpen(false);
    void signOutFirebase().catch(() => undefined);
    setPage('student_home');
  }, [setPage]);

  const resetDemoData = useCallback(async () => {
    await apiRequest('/demo/reset', { method: 'POST', token });
    setRipplePulseTick((n) => n + 1);
    await refreshOverview();
    await refreshUserDocuments();
    await refreshApplications();
    await refreshComplaints();
    await refreshAppointments();
  }, [
    token,
    refreshOverview,
    refreshUserDocuments,
    refreshApplications,
    refreshComplaints,
    refreshAppointments,
  ]);

  const triggerRipplePulse = useCallback(() => {
    setRipplePulseTick((n) => n + 1);
  }, []);

  const saveSchemeBookmark = useCallback(
    async (schemeId: string, title: string, note: string) => {
      if (!firebaseUid) {
        throw new Error('Sign in with Google first to save scheme bookmarks to Firestore.');
      }
      await createOrUpdateBookmark({
        id: `${firebaseUid}_${schemeId}`,
        ownerId: firebaseUid,
        schemeId,
        title,
        note,
      });
    },
    [firebaseUid]
  );

  const deleteSchemeBookmark = useCallback(async (id: string) => {
    await removeBookmark(id);
  }, []);

  const saveUserProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<UserProfile> => {
      if (!token) throw new Error('Please sign in first.');
      const res = await apiRequest<{ profile: UserProfile }>('/profile', {
        method: 'PUT',
        token,
        body: updates,
      });
      setUser(res.profile);
      if (firebaseUid) {
        void saveUserFullProfile(firebaseUid, res.profile).catch(() => undefined);
      }
      return res.profile;
    },
    [token, firebaseUid]
  );

  const saveMemorizedDocument = useCallback(
    async (input: SaveMemorizedDocumentInput): Promise<MemorizedDocument> => {
      if (!token) throw new Error('Please sign in first to memorize documents.');
      const res = await apiRequest<{ document: MemorizedDocument }>('/user-documents', {
        method: 'POST',
        token,
        body: input,
      });
      await refreshUserDocuments();
      try {
        const pRes = await apiRequest<{ profile: UserProfile }>('/profile', { token });
        setUser(pRes.profile);
      } catch {
        // ignore
      }
      if (firebaseUid) {
        void saveMemorizedDocumentToFirestore({
          id: res.document.id,
          ownerId: firebaseUid,
          docType: res.document.doc_type,
          title: res.document.title,
          schemeId: res.document.scheme_id,
          docNumber: res.document.doc_number,
          extractedName: res.document.extracted_name,
          extractedIncome: res.document.extracted_income,
          extractedMarks: res.document.extracted_marks,
          extractedAddress: res.document.extracted_address,
          notes: res.document.notes,
          sourceActivity: res.document.source_activity,
        }).catch(() => undefined);
      }
      return res.document;
    },
    [token, firebaseUid, refreshUserDocuments]
  );

  const deleteMemorizedDocument = useCallback(
    async (id: string): Promise<void> => {
      if (!token) return;
      await apiRequest(`/user-documents/${id}`, { method: 'DELETE', token });
      await refreshUserDocuments();
      if (firebaseUid) {
        void deleteMemorizedDocumentFromFirestore(id).catch(() => undefined);
      }
    },
    [token, firebaseUid, refreshUserDocuments]
  );

  const prepareApplicationDraft = useCallback(
    async (input: PrepareApplicationInput): Promise<ApplicationDraftRecord> => {
      if (!token) throw new Error('Please sign in to save application drafts.');
      const res = await apiRequest<{ application: ApplicationDraftRecord }>(
        '/applications/prepare',
        {
          method: 'POST',
          token,
          body: input,
        }
      );
      await refreshApplications();
      return res.application;
    },
    [token, refreshApplications]
  );

  const updateApplicationDraft = useCallback(
    async (id: string, updates: UpdateApplicationInput): Promise<ApplicationDraftRecord> => {
      if (!token) throw new Error('Please sign in to update application.');
      const res = await apiRequest<{ application: ApplicationDraftRecord }>(
        `/applications/${id}`,
        {
          method: 'PATCH',
          token,
          body: updates,
        }
      );
      await refreshApplications();
      return res.application;
    },
    [token, refreshApplications]
  );

  const deleteApplicationDraft = useCallback(
    async (id: string): Promise<void> => {
      if (!token) return;
      await apiRequest(`/applications/${id}`, { method: 'DELETE', token });
      await refreshApplications();
    },
    [token, refreshApplications]
  );

  const openSchemeInAssistant = useCallback((schemeId: string) => {
    setActiveAssistantSchemeId(schemeId);
    setPage('readiness_hub');
  }, []);

  const submitComplaint = useCallback(
    async (input: {
      department: string;
      org_type: OrganizationType | 'government';
      scheme_id?: string;
      application_id?: string;
      category: ComplaintCategory;
      subject: string;
      description: string;
      attachments?: Array<{ name: string; size_bytes: number; mime_type: string }>;
      submission_channel: ComplaintChannel;
      external_reference_number?: string;
      reminder_date?: string;
    }): Promise<ComplaintRecord> => {
      if (!token) throw new Error('Please sign in to submit a complaint.');
      const res = await apiRequest<{ complaint: ComplaintRecord }>('/complaints', {
        method: 'POST',
        token,
        body: {
          ...input,
          reference_number: input.external_reference_number,
        },
      });
      await refreshComplaints();
      return res.complaint;
    },
    [token, refreshComplaints]
  );

  const updateComplaint = useCallback(
    async (
      id: string,
      updates: {
        status?: ComplaintStatus;
        message?: string;
        resolution_note?: string;
        reminder_date?: string;
      }
    ): Promise<ComplaintRecord> => {
      if (!token) throw new Error('Please sign in to update complaint.');
      const res = await apiRequest<{ complaint: ComplaintRecord }>(`/complaints/${id}`, {
        method: 'PATCH',
        token,
        body: {
          ...updates,
          note: updates.message,
        },
      });
      await refreshComplaints();
      return res.complaint;
    },
    [token, refreshComplaints]
  );

  const openComplaintForApp = useCallback((app?: ApplicationDraftRecord | null) => {
    setComplaintPrefillApp(app || null);
    setPage('complaints');
  }, [setPage]);

  const bookOfficerAppointment = useCallback(
    async (input: {
      sector_type: AppointmentSectorType;
      officer_role: OfficerRoleCategory;
      office_or_officer_name?: string;
      state: string;
      district: string;
      place_locality: string;
      reason: string;
      issue_details?: string;
      preferred_date: string;
      preferred_time: string;
      citizen_phone?: string;
      urgency?: 'routine' | 'priority' | 'urgent';
      related_reference?: string;
    }): Promise<OfficerAppointmentRecord> => {
      if (!token) throw new Error('Please sign in to book an officer appointment.');
      const res = await apiRequest<{ appointment: OfficerAppointmentRecord }>('/appointments', {
        method: 'POST',
        token,
        body: input,
      });
      await refreshAppointments();
      return res.appointment;
    },
    [token, refreshAppointments]
  );

  const updateOfficerAppointment = useCallback(
    async (
      id: string,
      updates: {
        status?: AppointmentStatus;
        assigned_officer_name?: string;
        officer_notes?: string;
        preferred_date?: string;
        preferred_time?: string;
      }
    ): Promise<OfficerAppointmentRecord> => {
      if (!token) throw new Error('Please sign in to update appointment.');
      const res = await apiRequest<{ appointment: OfficerAppointmentRecord }>(`/appointments/${id}`, {
        method: 'PATCH',
        token,
        body: updates,
      });
      await refreshAppointments();
      return res.appointment;
    },
    [token, refreshAppointments]
  );

  return (
    <AppContext.Provider
      value={{
        page,
        setPage,
        lang,
        setLang,
        dark,
        toggleDark: () => setDark((d) => !d),
        user,
        firebaseUid,
        token,
        authModalOpen,
        setAuthModalOpen,
        signInAsDemoRole,
        signInWithGoogle,
        signInWithCredentials,
        registerStudent,
        signOut,
        overview,
        refreshOverview,
        resetDemoData,
        sourceTarget,
        openSourceViewer: (t) => setSourceTarget(t),
        closeSourceViewer: () => setSourceTarget(null),
        ripplePulseTick,
        triggerRipplePulse,
        mapsQuotaExceeded,
        setMapsQuotaExceeded,
        bookmarks,
        schemesCatalog,
        saveSchemeBookmark,
        deleteSchemeBookmark,
        memorizedDocs,
        refreshUserDocuments,
        saveUserProfile,
        saveMemorizedDocument,
        deleteMemorizedDocument,
        applications,
        refreshApplications,
        prepareApplicationDraft,
        updateApplicationDraft,
        deleteApplicationDraft,
        activeAssistantSchemeId,
        setActiveAssistantSchemeId,
        openSchemeInAssistant,
        janSetuDrawerOpen,
        setJanSetuDrawerOpen,
        complaints,
        refreshComplaints,
        submitComplaint,
        updateComplaint,
        complaintPrefillApp,
        setComplaintPrefillApp,
        openComplaintForApp,
        appointments,
        refreshAppointments,
        bookOfficerAppointment,
        updateOfficerAppointment,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

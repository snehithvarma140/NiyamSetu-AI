import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Fingerprint,
  GraduationCap,
  HeartPulse,
  Landmark,
  Loader2,
  Lock,
  MapPin,
  MessageSquareWarning,
  PhoneCall,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { HorizontalBarChart, VerticalColumnChart } from '../../components/charts/AnalyticsCharts';
import { ComplaintsPanel } from '../../components/student/ComplaintsPanel';
import { VoiceTranscribeButton } from '../../components/voice/VoiceTranscribeButton';
import type {
  AppointmentStatus,
  ComplaintRecord,
  EmergencyLookupResult,
  OfficerAppointmentRecord,
  OrganizationTaskRecord,
  OrganizationType,
} from '../../types/niyamsetu';

interface EmergencyCandidateHint {
  id: string;
  name: string;
  biometric_id: string;
  district: string;
  photo_data_url?: string;
}

interface OrgAnalyticsPayload {
  sector?: OrganizationType;
  is_demo_metrics?: boolean;
  tasks_verified: number;
  tasks_pending: number;
  tasks_flagged: number;
  complaints_open: number;
  complaints_resolved: number;
  most_accessed_schemes: Array<{ label: string; code: string; count: number }>;
  complaint_categories: Array<{ category: string; count: number }>;
  monthly_trend: Array<{ label: string; requests: number; resolved: number }>;
  common_difficulties: string[];
}

interface OrgsPayload {
  effective_sector?: OrganizationType | '';
  tasks: OrganizationTaskRecord[];
  appointments?: OfficerAppointmentRecord[];
  complaints?: ComplaintRecord[];
  org_analytics?: OrgAnalyticsPayload;
  recent_emergency_lookups: Array<{
    id: string;
    timestamp: string;
    actor_name: string;
    details: string;
    source_reference: string;
  }>;
  enrolled_emergency_count: number;
}

type OrgSectionTab = 'operations' | 'analytics' | 'grievances';

const ORG_SECTORS: Array<{
  id: OrganizationType;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'hospital',
    label: 'Hospitals & Emergency',
    subtitle: 'Biometric & Photo Emergency Lookup, Medical Boards & UDID Verification',
    icon: HeartPulse,
  },
  {
    id: 'bank',
    label: 'Banks & DBT Desks',
    subtitle: 'NPCI Aadhaar Seeding, Direct Benefit Transfers & IFSC Verification',
    icon: Landmark,
  },
  {
    id: 'college',
    label: 'Colleges & Universities',
    subtitle: 'Bonafide, Enrolment & 75% Attendance Attestation',
    icon: GraduationCap,
  },
  {
    id: 'other',
    label: 'MeeSeva / CSC & Hostels',
    subtitle: 'Revenue Barcodes & Hostel Residency Checks',
    icon: Building2,
  },
];

const SECTOR_GUIDANCE: Record<
  OrganizationType,
  {
    title: string;
    schemes: string[];
    rules: string[];
    defaultSchemeCode: string;
    subjectPlaceholder: string;
  }
> = {
  hospital: {
    title: 'Hospital Trauma, UDID Disability & Health Scheme Protocols',
    schemes: [
      'MED-10 (Medical & Health Emergency Support)',
      'SKM-09 (Saksham PwD / UDID Scholarship)',
      'State Aarogyasri / PM-JAY Empanelled Cashless Desk',
    ],
    rules: [
      'Biometric & Photo emergency lookup returns ONLY verified Blood Group, Allergies, Conditions, Medications & ICE Contact. Non-emergency records remain blocked.',
      'Treat all unidentified or unverified arrivals under UNKNOWN blood group protocol until cross-matched.',
      'Every emergency lookup writes an immutable actor + timestamp audit entry.',
    ],
    defaultSchemeCode: 'MED-10',
    subjectPlaceholder: 'e.g., District Medical Board UDID Disability Certification (>40%)',
  },
  bank: {
    title: 'Banking, NPCI Aadhaar Seeding & Scholarship DBT Rules',
    schemes: [
      'PM-01 (Post-Matric DBT Remittance)',
      'PRG-03 (Pragati Technical Scholarship)',
      'EBC-12 & MIN-08 Direct Bank Transfers',
    ],
    rules: [
      'Verify NPCI mapper active status alongside 11-character IFSC & Account Holder Name match before signing DBT clearance.',
      'Flag dormant accounts or Aadhaar mismatch immediately so citizens can resolve failures before payment cycles.',
      'Never request or record citizen OTPs, PINs, or netbanking credentials.',
    ],
    defaultSchemeCode: 'PM-01',
    subjectPlaceholder: 'e.g., NPCI Aadhaar-DBT Mapper & Active IFSC Clearance',
  },
  college: {
    title: 'College Nodal Cell, Bonafide & Attendance Verification Rules',
    schemes: [
      'RTF-06 (State Reimbursement of Tuition Fee)',
      'STE-02 (State Merit & Hostel Maintenance)',
      'CSS-05 (Central Sector Scholarship)',
    ],
    rules: [
      'Confirm minimum 75% semester attendance threshold before attesting RTF-06 & STE-02 fee reimbursement renewals.',
      'Validate bonafide enrolment seal, academic year roll number, and AISHE code alignment.',
      'Escalate institutional fee disputes directly through the Organization Complaint Desk.',
    ],
    defaultSchemeCode: 'RTF-06',
    subjectPlaceholder: 'e.g., Semester 75%+ Biometric Attendance & Bonafide Attestation',
  },
  other: {
    title: 'MeeSeva / CSC Barcode Verification & Hostel Residency Rules',
    schemes: [
      'HST-07 (Hostel & Mess Residency Grant)',
      'ALL INCOME/CASTE-DEPENDENT SCHEMES',
    ],
    rules: [
      'Cross-verify digital Tahsildar barcode number and financial-year validity on income & community certificates.',
      'Certify monthly hostel mess attendance logs accurately before warden sign-off.',
    ],
    defaultSchemeCode: 'HST-07',
    subjectPlaceholder: 'e.g., MeeSeva Revenue Income Barcode / Hostel Mess Muster Check',
  },
};

export const OrganizationWorkspacePage: React.FC = () => {
  const { user, token } = useApp();
  const [sector, setSector] = useState<OrganizationType>(user?.organization_type || 'hospital');
  const [activeSection, setActiveSection] = useState<OrgSectionTab>('operations');

  const [tasks, setTasks] = useState<OrganizationTaskRecord[]>([]);
  const [appointments, setAppointments] = useState<OfficerAppointmentRecord[]>([]);
  const [orgComplaints, setOrgComplaints] = useState<ComplaintRecord[]>([]);
  const [orgAnalytics, setOrgAnalytics] = useState<OrgAnalyticsPayload | null>(null);
  const [auditLookups, setAuditLookups] = useState<OrgsPayload['recent_emergency_lookups']>([]);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [candidates, setCandidates] = useState<EmergencyCandidateHint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Appointments Desk Controls
  const [aptStatusFilter, setAptStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [aptBusyId, setAptBusyId] = useState<string | null>(null);
  const [editingAptId, setEditingAptId] = useState<string | null>(null);
  const [aptOfficerDraft, setAptOfficerDraft] = useState('');
  const [aptNotesDraft, setAptNotesDraft] = useState('');
  const [aptDateDraft, setAptDateDraft] = useState('');
  const [aptTimeDraft, setAptTimeDraft] = useState('');

  // Emergency Responder Lookup State (Biometric & Photo only — QR removed)
  const [lookupMode, setLookupMode] = useState<'biometric' | 'image'>('biometric');
  const [biometricToken, setBiometricToken] = useState('BIO-RAVI-7842');
  const [citizenHint, setCitizenHint] = useState('');
  const [uploadedPhotoPreview, setUploadedPhotoPreview] = useState<string | null>(null);
  const [uploadedPhotoBase64, setUploadedPhotoBase64] = useState<string>('');
  const [uploadedPhotoMime, setUploadedPhotoMime] = useState<string>('image/png');
  const [uploadedPhotoName, setUploadedPhotoName] = useState<string>('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<EmergencyLookupResult | null>(null);

  // Queue search & status filter
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'pending' | 'verified' | 'flagged'>('all');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Interactive Sector Utility & Verification Logger
  const [newCitizenName, setNewCitizenName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newSchemeCode, setNewSchemeCode] = useState(SECTOR_GUIDANCE[sector].defaultSchemeCode);
  const [newRefCode, setNewRefCode] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [createTaskNotice, setCreateTaskNotice] = useState<string | null>(null);

  // Sector-specific interactive verification calculators / validators
  const [bankIfsc, setBankIfsc] = useState('SBIN0004120');
  const [npciActive, setNpciActive] = useState(true);
  const [classesAttended, setClassesAttended] = useState('68');
  const [totalClasses, setTotalClasses] = useState('84');
  const [meesevaBarcode, setMeesevaBarcode] = useState('MEESEVA-IC-2026-99412');

  useEffect(() => {
    if (user?.organization_type) {
      setSector(user.organization_type);
      setNewSchemeCode(SECTOR_GUIDANCE[user.organization_type].defaultSchemeCode);
    }
  }, [user?.organization_type]);

  const switchSection = (next: OrgSectionTab) => {
    setActiveSection(next);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const loadWorkspace = async (targetSector?: OrganizationType) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const activeSector = targetSector || sector;
    try {
      const [orgRes, candRes] = await Promise.all([
        apiRequest<OrgsPayload>('/gov/organizations', { token }),
        apiRequest<{ candidates: EmergencyCandidateHint[] }>('/gov/emergency-candidates', {
          token,
        }),
      ]);
      if (orgRes.effective_sector) {
        setSector(orgRes.effective_sector);
        setNewSchemeCode(SECTOR_GUIDANCE[orgRes.effective_sector].defaultSchemeCode);
      } else {
        setNewSchemeCode(SECTOR_GUIDANCE[activeSector].defaultSchemeCode);
      }
      setTasks(orgRes.tasks || []);
      setAppointments(orgRes.appointments || []);
      setOrgComplaints(orgRes.complaints || []);
      setOrgAnalytics(orgRes.org_analytics || null);
      setAuditLookups(orgRes.recent_emergency_lookups || []);
      setEnrolledCount(orgRes.enrolled_emergency_count || 0);
      setCandidates(candRes.candidates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organization workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace(sector);
  }, [token]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setLookupError('Emergency image must be under 2.5 MB.');
      return;
    }
    setLookupError(null);
    setUploadedPhotoName(file.name);
    setUploadedPhotoMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setUploadedPhotoPreview(dataUrl);
      const idx = dataUrl.indexOf(',');
      setUploadedPhotoBase64(idx >= 0 ? dataUrl.slice(idx + 1) : '');
    };
    reader.readAsDataURL(file);
  };

  const selectCandidatePhotoForScan = (cand: EmergencyCandidateHint) => {
    if (!cand.photo_data_url) return;
    setLookupMode('image');
    setUploadedPhotoPreview(cand.photo_data_url);
    setUploadedPhotoName(`${cand.name.toLowerCase().replace(/\s+/g, '_')}_emergency.svg`);
    setUploadedPhotoMime('image/svg+xml');
    const idx = cand.photo_data_url.indexOf(',');
    const payload = idx >= 0 ? cand.photo_data_url.slice(idx + 1) : '';
    try {
      if (cand.photo_data_url.includes(';base64,')) {
        setUploadedPhotoBase64(payload);
      } else {
        const decoded = decodeURIComponent(payload);
        const bytes = new TextEncoder().encode(decoded);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        setUploadedPhotoBase64(btoa(binary));
      }
    } catch {
      setUploadedPhotoBase64(payload);
    }
    setCitizenHint(cand.name);
  };

  const runEmergencyLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const bodyPayload =
        lookupMode === 'biometric'
          ? { mode: 'biometric', biometric_token: biometricToken }
          : {
              mode: 'image',
              imageBase64: uploadedPhotoBase64,
              mimeType: uploadedPhotoMime,
              fileName: uploadedPhotoName,
              citizen_hint: citizenHint,
            };

      const res = await apiRequest<EmergencyLookupResult>('/gov/emergency-lookup', {
        method: 'POST',
        token,
        body: bodyPayload,
      });
      setLookupResult(res);
      void loadWorkspace(sector);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Emergency identification failed.');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleTaskVerify = async (taskId: string, status: 'verified' | 'flagged') => {
    if (!token) return;
    setActionBusyId(taskId);
    try {
      await apiRequest(`/gov/organizations/tasks/${taskId}/verify`, {
        method: 'POST',
        token,
        body: { status },
      });
      await loadWorkspace(sector);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task status.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleAppointmentAction = async (
    aptId: string,
    updates: {
      status: AppointmentStatus;
      assigned_officer_name?: string;
      officer_notes?: string;
      preferred_date?: string;
      preferred_time?: string;
    }
  ) => {
    if (!token) return;
    setAptBusyId(aptId);
    setError(null);
    try {
      await apiRequest(`/appointments/${aptId}`, {
        method: 'PATCH',
        token,
        body: updates,
      });
      setEditingAptId(null);
      await loadWorkspace(sector);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update appointment.');
    } finally {
      setAptBusyId(null);
    }
  };

  const handleCreateSectorTask = async (e: React.FormEvent, initialStatus: 'pending' | 'verified' | 'flagged') => {
    e.preventDefault();
    if (!token || !newCitizenName.trim() || !newSubject.trim()) return;
    setCreatingTask(true);
    setCreateTaskNotice(null);
    try {
      const res = await apiRequest<{ task: OrganizationTaskRecord }>('/gov/organizations/tasks', {
        method: 'POST',
        token,
        body: {
          org_type: sector,
          citizen_name: newCitizenName.trim(),
          subject: newSubject.trim(),
          scheme_code: newSchemeCode.trim() || guidance.defaultSchemeCode,
          reference_code: newRefCode.trim() || undefined,
          notes: newNotes.trim() || undefined,
          status: initialStatus,
        },
      });
      setNewCitizenName('');
      setNewSubject('');
      setNewRefCode('');
      setNewNotes('');
      setCreateTaskNotice(
        `Logged "${res.task.subject}" (${res.task.reference_code}) as ${res.task.status.toUpperCase()}.`
      );
      await loadWorkspace(sector);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log new verification entry.');
    } finally {
      setCreatingTask(false);
    }
  };

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return tasks.filter((t) => {
      if (t.org_type !== sector) return false;
      if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false;
      if (
        q &&
        !t.citizen_name.toLowerCase().includes(q) &&
        !t.subject.toLowerCase().includes(q) &&
        !t.scheme_code.toLowerCase().includes(q) &&
        !t.reference_code.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [tasks, sector, taskStatusFilter, taskSearch]);

  const filteredComplaints = useMemo(
    () => orgComplaints.filter((c) => c.org_type === sector),
    [orgComplaints, sector]
  );

  const sectorAppointments = useMemo(
    () => appointments.filter((a) => a.org_type === sector),
    [appointments, sector]
  );

  const filteredAppointments = useMemo(
    () =>
      sectorAppointments.filter(
        (a) => aptStatusFilter === 'all' || a.status === aptStatusFilter
      ),
    [sectorAppointments, aptStatusFilter]
  );

  // Interactive check computed helpers
  const ifscValid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc.trim().toUpperCase());
  const attNum = Number(classesAttended) || 0;
  const attDen = Number(totalClasses) || 0;
  const attendancePct = attDen > 0 ? Math.round((attNum / attDen) * 1000) / 10 : 0;
  const barcodeValid = /^(MEESEVA|CGG|MRO|TS)-[A-Z0-9-]+$/i.test(meesevaBarcode.trim());

  const sectorMeta = ORG_SECTORS.find((s) => s.id === sector) || ORG_SECTORS[0];
  const SectorIcon = sectorMeta.icon;
  const guidance = SECTOR_GUIDANCE[sector];

  const sectionTabs: Array<{
    id: OrgSectionTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'operations',
      label: `1. Operations, Appointments & Desk (${tasks.filter((t) => t.org_type === sector).length + sectorAppointments.length})`,
      icon: ClipboardCheck,
    },
    {
      id: 'analytics',
      label: '2. Sector Analytics & Volume',
      icon: BarChart3,
    },
    {
      id: 'grievances',
      label: `3. Grievances & Compliance (${filteredComplaints.length})`,
      icon: MessageSquareWarning,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Role Isolation Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded border border-teal-300 dark:border-cyan-700 bg-teal-50 dark:bg-cyan-950/40 text-teal-800 dark:text-cyan-300">
              ISOLATED ORGANIZATION PORTAL · {sector.toUpperCase()} ONLY
            </span>
            {user?.organization_name && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {user.organization_name}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {sectorMeta.label} — Partner Operations Desk
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Strictly scoped to your authorized {sectorMeta.label} workspace across 3 structured desks:
            live citizen verifications, sector turnaround analytics, and grievance compliance.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void loadWorkspace(sector)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer self-start whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Organization Desk</span>
        </button>
      </div>

      {/* Role Scoping Strip */}
      <div className="rounded-lg border border-teal-200 dark:border-cyan-800 bg-teal-50/60 dark:bg-cyan-950/20 p-3.5 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <SectorIcon className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
          <div>
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {sectorMeta.label}
            </span>{' '}
            <span className="text-slate-600 dark:text-slate-300">· {sectorMeta.subtitle}</span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 shrink-0">
          <Lock className="w-3 h-3" />
          <span>Sector Isolated</span>
        </div>
      </div>

      {/* Responsive 3-Section Switcher */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto flex-nowrap snap-x p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Organization Workspace Sections"
      >
        {sectionTabs.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchSection(item.id)}
              className={`snap-start shrink-0 min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-sm'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 1: OPERATIONS, SECTOR UTILITY WORKBENCH & VERIFICATION QUEUE  */}
      {/* ===================================================================== */}
      {activeSection === 'operations' && (
        <div className="space-y-6">
          {/* HOSPITAL EMERGENCY PHOTO / BIOMETRIC RESPONDER LOOKUP */}
          {sector === 'hospital' && (
            <section className="rounded-lg border border-rose-300 dark:border-rose-900/70 bg-white dark:bg-slate-900 p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 shrink-0">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Hospital Emergency Patient Identification (Biometric or Photo)
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Enrolled Emergency Vaults:{' '}
                      <span className="font-mono font-semibold">{enrolledCount}</span> · Returns
                      strictly life-critical Blood Group, Allergies, Conditions, Medications &amp;
                      Emergency Contact. Private financial/academic files remain locked.
                    </p>
                  </div>
                </div>

                <div className="flex items-center p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start gap-1">
                  <button
                    type="button"
                    onClick={() => setLookupMode('biometric')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      lookupMode === 'biometric'
                        ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-cyan-300 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Biometric Scan / ID</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLookupMode('image')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      lookupMode === 'image'
                        ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-cyan-300 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Photo / Image Scan</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form onSubmit={runEmergencyLookup} className="lg:col-span-5 space-y-4">
                  {lookupMode === 'biometric' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Citizen Biometric Passkey / Emergency Token
                        </label>
                        <input
                          type="text"
                          value={biometricToken}
                          onChange={(e) => setBiometricToken(e.target.value)}
                          placeholder="e.g., BIO-RAVI-7842"
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Quick Responder Biometric Test Tokens:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {candidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setBiometricToken(c.biometric_id)}
                              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-mono text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
                            >
                              {c.biometric_id} ({c.name.split(' ')[0]})
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Upload Patient Emergency Photo (Gemini Vision Match)
                      </label>
                      <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 text-center cursor-pointer hover:border-teal-700 dark:hover:border-cyan-400 transition-colors">
                        {uploadedPhotoPreview ? (
                          <img
                            src={uploadedPhotoPreview}
                            alt="Uploaded patient preview"
                            className="w-24 h-24 rounded-lg object-cover border border-slate-300 dark:border-slate-700 mb-2"
                          />
                        ) : (
                          <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
                        )}
                        <span className="text-xs font-semibold text-teal-800 dark:text-cyan-300">
                          {uploadedPhotoName
                            ? `Selected: ${uploadedPhotoName}`
                            : 'Choose Patient Photo / Camera Capture'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          PNG, JPG, SVG up to 2.5 MB
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Optional Visual Tag / Patient Name Hint
                        </label>
                        <input
                          type="text"
                          value={citizenHint}
                          onChange={(e) => setCitizenHint(e.target.value)}
                          placeholder="e.g., Ravi Kumar or initials on medical card"
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                        />
                      </div>

                      {candidates.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            Test with Registered Citizen Portrait:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {candidates.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => selectCandidatePhotoForScan(c)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-medium hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
                              >
                                {c.photo_data_url && (
                                  <img
                                    src={c.photo_data_url}
                                    alt={c.name}
                                    className="w-4 h-4 rounded-sm"
                                  />
                                )}
                                <span>{c.name.split(' ')[0]}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {lookupError && (
                    <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-800 dark:text-rose-200">
                      {lookupError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={lookupBusy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {lookupBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : lookupMode === 'biometric' ? (
                      <Fingerprint className="w-4 h-4" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    <span>
                      {lookupBusy
                        ? 'Verifying Emergency Identity...'
                        : 'Retrieve Critical Emergency Info'}
                    </span>
                  </button>
                </form>

                {/* Right: Critical Emergency Medical Output */}
                <div className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 flex flex-col justify-between">
                  {!lookupResult ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-8 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                      <ShieldAlert className="w-7 h-7 text-rose-500 dark:text-rose-400" />
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        Ready for Emergency Identification
                      </p>
                      <p className="max-w-md">
                        Enter a biometric passkey or upload a patient photo on the left to retrieve
                        verified Blood Group, Allergies, Chronic Conditions, Medications &amp; ICE
                        Contact. Every access is recorded in the audit log.
                      </p>
                    </div>
                  ) : !lookupResult.matched || !lookupResult.citizen_summary ? (
                    <div className="space-y-3 py-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4" />
                        <span>No Matching Emergency Profile Found</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {lookupResult.match_reason}
                      </p>
                      <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                        Clinical Protocol: Treat patient under <strong>UNKNOWN</strong> blood group
                        protocol until verified cross-match is completed. Lookup logged (ID:{' '}
                        <span className="font-mono">{lookupResult.lookup_id}</span>).
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-3">
                          {lookupResult.citizen_summary.photo_data_url && (
                            <img
                              src={lookupResult.citizen_summary.photo_data_url}
                              alt={lookupResult.citizen_summary.name}
                              className="w-14 h-14 rounded-lg border border-slate-300 dark:border-slate-700 object-cover shrink-0"
                            />
                          )}
                          <div>
                            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                              {lookupResult.citizen_summary.name}
                            </div>
                            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                              Age {lookupResult.citizen_summary.age_years ?? 'Unknown'} ·{' '}
                              {lookupResult.citizen_summary.district},{' '}
                              {lookupResult.citizen_summary.state}
                            </div>
                            <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                              Verified via {lookupResult.match_method.toUpperCase()} (
                              {Math.round(lookupResult.confidence * 100)}% confidence)
                            </div>
                          </div>
                        </div>

                        <div className="rounded-md border-2 border-rose-600 dark:border-rose-500 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2 text-center shrink-0">
                          <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
                            Blood Group
                          </div>
                          <div className="font-mono text-2xl font-bold text-rose-800 dark:text-rose-200">
                            {lookupResult.citizen_summary.blood_group}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-3">
                          <div className="font-bold text-amber-900 dark:text-amber-300">
                            CRITICAL ALLERGIES
                          </div>
                          <div className="mt-1 text-slate-900 dark:text-slate-100 font-semibold">
                            {lookupResult.citizen_summary.allergies}
                          </div>
                        </div>

                        <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            CHRONIC CONDITIONS
                          </div>
                          <div className="mt-1 text-slate-900 dark:text-slate-100 font-semibold">
                            {lookupResult.citizen_summary.chronic_conditions}
                          </div>
                        </div>

                        <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            CURRENT MEDICATIONS
                          </div>
                          <div className="mt-1 text-slate-900 dark:text-slate-100">
                            {lookupResult.citizen_summary.medications}
                          </div>
                        </div>

                        <div className="rounded border border-teal-300 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/30 p-3">
                          <div className="font-bold text-teal-900 dark:text-cyan-300 flex items-center gap-1">
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>EMERGENCY CONTACT</span>
                          </div>
                          <div className="mt-1 text-slate-900 dark:text-slate-100 font-semibold">
                            {lookupResult.citizen_summary.emergency_contact_name} (
                            {lookupResult.citizen_summary.emergency_contact_relation})
                          </div>
                          <div className="font-mono text-teal-800 dark:text-cyan-300 font-bold">
                            {lookupResult.citizen_summary.emergency_contact_phone}
                          </div>
                        </div>
                      </div>

                      <div className="rounded border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-xs">
                        <span className="font-bold text-rose-800 dark:text-rose-300">
                          Medical Warnings:{' '}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200">
                          {lookupResult.citizen_summary.medical_warnings}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <span>
                          Biometric ID: {lookupResult.citizen_summary.biometric_id} · Organ Donor:{' '}
                          {lookupResult.citizen_summary.organ_donor ? 'YES' : 'NO'}
                        </span>
                        <span>Audit ID: {lookupResult.lookup_id} · Non-emergency PII withheld</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* CITIZEN OFFICER APPOINTMENTS ROUTED TO THIS ORGANIZATION */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                  <span>
                    Citizen Officer Appointments ({filteredAppointments.length})
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Citizen requests for {sectorMeta.label} officers (Government &amp; Private) filtered by place and issue.
                </p>
              </div>

              <select
                value={aptStatusFilter}
                onChange={(e) => setAptStatusFilter(e.target.value as 'all' | AppointmentStatus)}
                aria-label="Filter organization appointments by status"
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="requested">Requested</option>
                <option value="confirmed">Confirmed</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {filteredAppointments.length === 0 ? (
              <div className="rounded border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400">
                No citizen appointments queued for {sectorMeta.label} under the current status filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAppointments.map((apt) => {
                  const isEditing = editingAptId === apt.id;
                  return (
                    <article
                      key={apt.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-teal-800 dark:text-cyan-300">
                              {apt.reference_code}
                            </span>
                            <span className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase">
                              {apt.sector_type}
                            </span>
                            {apt.urgency !== 'routine' && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase">
                                {apt.urgency}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mt-1">
                            {apt.officer_role.includes('Doctor') ? (
                              <Stethoscope className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400" />
                            ) : (
                              <Landmark className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400" />
                            )}
                            <span>{apt.officer_role}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400">
                            {apt.office_or_officer_name}
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase">
                          {apt.status}
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                        <div className="font-semibold">
                          Citizen: {apt.citizen_name}{' '}
                          {apt.citizen_phone && (
                            <span className="font-mono text-slate-500">· {apt.citizen_phone}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {apt.place_locality}, {apt.district}, {apt.state}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-slate-600 dark:text-slate-400">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {apt.preferred_date} · {apt.preferred_time}
                          </span>
                        </div>
                      </div>

                      <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {apt.reason}
                        </div>
                        {apt.issue_details && (
                          <p className="text-slate-600 dark:text-slate-400">{apt.issue_details}</p>
                        )}
                      </div>

                      {(apt.assigned_officer_name || apt.officer_notes) && !isEditing && (
                        <div className="rounded border border-teal-200 dark:border-cyan-900 bg-teal-50/70 dark:bg-cyan-950/30 p-2 text-[11px] space-y-0.5">
                          {apt.assigned_officer_name && (
                            <div className="font-semibold text-teal-900 dark:text-cyan-300 flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              <span>{apt.assigned_officer_name}</span>
                            </div>
                          )}
                          {apt.officer_notes && (
                            <div className="text-slate-700 dark:text-slate-300">{apt.officer_notes}</div>
                          )}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="rounded border border-cyan-500/40 bg-white dark:bg-slate-900 p-3 space-y-2">
                          <input
                            type="text"
                            value={aptOfficerDraft}
                            onChange={(e) => setAptOfficerDraft(e.target.value)}
                            placeholder="Assigned Officer Name"
                            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={aptDateDraft}
                              onChange={(e) => setAptDateDraft(e.target.value)}
                              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-mono"
                            />
                            <input
                              type="text"
                              value={aptTimeDraft}
                              onChange={(e) => setAptTimeDraft(e.target.value)}
                              placeholder="Time slot"
                              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-mono"
                            />
                          </div>
                          <textarea
                            rows={2}
                            value={aptNotesDraft}
                            onChange={(e) => setAptNotesDraft(e.target.value)}
                            placeholder="Officer instructions / desk room number"
                            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={aptBusyId === apt.id}
                              onClick={() =>
                                void handleAppointmentAction(apt.id, {
                                  status: 'rescheduled',
                                  assigned_officer_name: aptOfficerDraft,
                                  officer_notes: aptNotesDraft,
                                  preferred_date: aptDateDraft,
                                  preferred_time: aptTimeDraft,
                                })
                              }
                              className="px-2.5 py-1 rounded bg-sky-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Save Schedule &amp; Notes
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAptId(null)}
                              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              Cancel Edit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {apt.status !== 'confirmed' && apt.status !== 'completed' && (
                            <button
                              type="button"
                              disabled={aptBusyId === apt.id}
                              onClick={() =>
                                void handleAppointmentAction(apt.id, { status: 'confirmed' })
                              }
                              className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Confirm
                            </button>
                          )}
                          {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                            <button
                              type="button"
                              disabled={aptBusyId === apt.id}
                              onClick={() =>
                                void handleAppointmentAction(apt.id, { status: 'completed' })
                              }
                              className="px-2.5 py-1 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:text-slate-950 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Mark Completed
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAptId(apt.id);
                              setAptOfficerDraft(apt.assigned_officer_name || '');
                              setAptNotesDraft(apt.officer_notes || '');
                              setAptDateDraft(apt.preferred_date);
                              setAptTimeDraft(apt.preferred_time);
                            }}
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Assign / Reschedule
                          </button>
                          {apt.status !== 'cancelled' && apt.status !== 'completed' && (
                            <button
                              type="button"
                              disabled={aptBusyId === apt.id}
                              onClick={() =>
                                void handleAppointmentAction(apt.id, { status: 'cancelled' })
                              }
                              className="px-2.5 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* SECTOR UTILITY TOOLKIT + NEW VERIFICATION ENTRY LOGGER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Interactive Sector Validator Tool */}
            <section className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <SectorIcon className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Interactive {sectorMeta.label.split('&')[0].trim()} Readiness Tool
                </h2>
              </div>

              {sector === 'bank' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Verify 11-Character Bank IFSC Code
                    </label>
                    <input
                      type="text"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      maxLength={11}
                      placeholder="e.g., SBIN0004120"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={npciActive}
                      onChange={(e) => setNpciActive(e.target.checked)}
                      className="rounded"
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      NPCI Aadhaar Mapper Status Active (Direct Benefit Transfer enabled)
                    </span>
                  </label>
                  <div
                    className={`rounded border p-3 ${
                      ifscValid && npciActive
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {ifscValid && npciActive
                      ? `IFSC ${bankIfsc} matches RBI 11-char structure and NPCI Aadhaar DBT seeding is ready.`
                      : !ifscValid
                        ? 'Invalid IFSC format — verify merged branch codes (4 letters + 0 + 6 alphanumeric).'
                        : 'NPCI Aadhaar Mapper inactive — advise citizen to submit Aadhaar Seeding Form at branch.'}
                  </div>
                </div>
              )}

              {sector === 'college' && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Sessions Attended
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={classesAttended}
                        onChange={(e) => setClassesAttended(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Total Sessions Held
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={totalClasses}
                        onChange={(e) => setTotalClasses(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div
                    className={`rounded border p-3 ${
                      attendancePct >= 75
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    Computed Attendance: <strong className="font-mono">{attendancePct}%</strong> —{' '}
                    {attendancePct >= 75
                      ? 'Meets mandatory 75% threshold for RTF-06 & STE-02 fee reimbursement renewal.'
                      : 'Below 75% mandatory threshold — condonation / medical record required before attestation.'}
                  </div>
                </div>
              )}

              {sector === 'other' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Validate Revenue Certificate Barcode / Hostel Token
                    </label>
                    <input
                      type="text"
                      value={meesevaBarcode}
                      onChange={(e) => setMeesevaBarcode(e.target.value.toUpperCase())}
                      placeholder="MEESEVA-IC-2026-99412"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div
                    className={`rounded border p-3 ${
                      barcodeValid
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {barcodeValid
                      ? 'Barcode prefix recognized (MEESEVA / CGG / MRO / TS). Confirm Financial Year 2026-27 seal before signing.'
                      : 'Unrecognized certificate prefix — verify against physical MeeSeva QR/barcode receipt.'}
                  </div>
                </div>
              )}

              {sector === 'hospital' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      Medical Board &amp; Trauma Triage Quick Standards
                    </div>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                      <li>UDID renewal threshold for SKM-09 Saksham: &ge; 40% benchmark disability.</li>
                      <li>Unidentified trauma arrival: record as <strong>UNKNOWN</strong> blood type until lab cross-match.</li>
                      <li>All emergency vault views auto-log responder actor ID for transparency.</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>

            {/* Log New Sector Verification Case */}
            <section className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <PlusCircle className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Log New Citizen Verification / Desk Assessment
                </h2>
              </div>

              <form onSubmit={(e) => void handleCreateSectorTask(e, 'pending')} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Citizen Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newCitizenName}
                      onChange={(e) => setNewCitizenName(e.target.value)}
                      placeholder="e.g., Ravi Kumar"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Scheme Code
                    </label>
                    <input
                      type="text"
                      value={newSchemeCode}
                      onChange={(e) => setNewSchemeCode(e.target.value.toUpperCase())}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Verification Subject *
                    </label>
                    <input
                      type="text"
                      required
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder={guidance.subjectPlaceholder}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Desk Reference ID
                    </label>
                    <input
                      type="text"
                      value={newRefCode}
                      onChange={(e) => setNewRefCode(e.target.value)}
                      placeholder="Auto-generated if empty"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Verification Notes / Findings
                    </label>
                    <VoiceTranscribeButton
                      onTranscript={(txt) => setNewNotes((prev) => (prev ? `${prev} ${txt}` : txt))}
                      disabled={creatingTask}
                      label="Dictate Findings"
                    />
                  </div>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Record certificate check, IFSC status, attendance %, or discrepancy..."
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                </div>

                {createTaskNotice && (
                  <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                    {createTaskNotice}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={creatingTask}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>{creatingTask ? 'Saving...' : 'Queue Pending Task'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={creatingTask || !newCitizenName.trim() || !newSubject.trim()}
                    onClick={(e) => void handleCreateSectorTask(e, 'verified')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Log &amp; Mark Verified</span>
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Organization Sector Verification Queue */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {sectorMeta.label} — Verification &amp; Operations Queue
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Filter citizen requests by verification status or search by name, scheme, or desk
                  reference code.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Filter citizen or code..."
                    className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs w-48"
                  />
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {(['all', 'pending', 'verified', 'flagged'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTaskStatusFilter(st)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize cursor-pointer ${
                        taskStatusFilter === st
                          ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-cyan-300 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No verification tasks match the current filter in this organization sector.
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div key={task.id} className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="font-semibold text-teal-800 dark:text-cyan-300">
                          {task.scheme_code} · {task.reference_code}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            task.status === 'verified'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : task.status === 'flagged'
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}
                        >
                          {task.status.toUpperCase()}
                        </span>
                        {task.gov_inspected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-semibold">
                            <ShieldCheck className="w-3 h-3" />
                            AUDITED
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {task.subject}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        Citizen: <span className="font-semibold">{task.citizen_name}</span> ·{' '}
                        Desk: <span className="font-semibold">{task.org_name}</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">{task.notes}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={actionBusyId === task.id}
                        onClick={() => void handleTaskVerify(task.id, 'verified')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionBusyId === task.id}
                        onClick={() => void handleTaskVerify(task.id, 'flagged')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Flag</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Recent Emergency Medical Access Audit Feed (Hospital Only) */}
          {sector === 'hospital' && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Hospital Emergency Access Audit Trail
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {auditLookups.length} recorded
                </span>
              </div>

              {auditLookups.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  No hospital emergency lookups recorded yet in this session.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {auditLookups.map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.actor_name} ·{' '}
                          <span className="font-mono">{item.source_reference}</span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400">{item.details}</div>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {new Date(item.timestamp).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: SECTOR ANALYTICS, KPI SUMMARY & FRICTION INSIGHTS          */}
      {/* ===================================================================== */}
      {activeSection === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {orgAnalytics?.tasks_verified ??
                  tasks.filter((t) => t.org_type === sector && t.status === 'verified').length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Verified Desk Records
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-mono text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {orgAnalytics?.tasks_pending ??
                  tasks.filter((t) => t.org_type === sector && t.status === 'pending').length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Pending Verification Queue
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-mono text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
                {orgAnalytics?.tasks_flagged ??
                  tasks.filter((t) => t.org_type === sector && t.status === 'flagged').length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Flagged Discrepancies
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-mono text-2xl font-bold tabular-nums text-teal-800 dark:text-cyan-300">
                {orgAnalytics?.complaints_open ?? filteredComplaints.filter((c) => c.status !== 'resolved').length}{' '}
                <span className="text-sm font-normal text-slate-500">
                  / {orgAnalytics?.complaints_resolved ?? filteredComplaints.filter((c) => c.status === 'resolved').length} resolved
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Open Sector Grievances
              </div>
            </div>
          </div>

          {orgAnalytics && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {sectorMeta.label} — Service Volume &amp; Difficulty Analytics
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Most accessed sector schemes, monthly turnaround, and recurring verification
                    friction points.
                  </p>
                </div>
                {orgAnalytics.is_demo_metrics && (
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 self-start">
                    Operational + Baseline Metrics
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <HorizontalBarChart
                  title="Most Accessed Sector Schemes"
                  subtitle="Volume across verification & citizen queries"
                  data={(orgAnalytics.most_accessed_schemes || []).map((s) => ({
                    label: s.label,
                    badge: s.code,
                    value: s.count,
                  }))}
                  valueSuffix=" req"
                />
                <VerticalColumnChart
                  title="Monthly Requests vs Resolved"
                  subtitle="Operational handling cadence"
                  primaryLabel="Requests"
                  secondaryLabel="Resolved"
                  data={(orgAnalytics.monthly_trend || []).map((m) => ({
                    label: m.label,
                    primary: m.requests,
                    secondary: m.resolved,
                  }))}
                />
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Common Citizen Verification Difficulties in This Sector
                  </h3>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {(orgAnalytics.common_difficulties || []).map((issue, idx) => (
                    <li
                      key={`${idx}-${issue.slice(0, 12)}`}
                      className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-slate-800 dark:text-slate-200 leading-relaxed"
                    >
                      <span className="font-mono font-bold text-amber-800 dark:text-amber-300 mr-1.5">
                        0{idx + 1}.
                      </span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: CITIZEN GRIEVANCES & VERIFIED COMPLIANCE PROTOCOLS         */}
      {/* ===================================================================== */}
      {activeSection === 'grievances' && (
        <div className="space-y-6">
          <ComplaintsPanel
            mode="org"
            complaintsOverride={filteredComplaints}
            onRefreshOrg={() => void loadWorkspace(sector)}
          />

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <BookOpen className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {guidance.title}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
              <div className="md:col-span-5 space-y-1.5">
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  Linked Public Schemes &amp; Services
                </div>
                <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                  {guidance.schemes.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="md:col-span-7 space-y-1.5">
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  Verified Compliance &amp; Handling Checklist
                </div>
                <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                  {guidance.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

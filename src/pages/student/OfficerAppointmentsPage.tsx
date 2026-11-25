import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Landmark,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { VoiceTranscribeButton } from '../../components/voice/VoiceTranscribeButton';
import type {
  AppointmentSectorType,
  AppointmentStatus,
  OfficerRoleCategory,
  OrganizationType,
} from '../../types/niyamsetu';

interface OfficerRoleOption {
  role: OfficerRoleCategory;
  defaultSector: AppointmentSectorType;
  allowedSectors: AppointmentSectorType[];
  orgType: OrganizationType;
  orgDeskLabel: string;
  placeholderOffice: string;
  exampleReasons: string[];
}

const OFFICER_ROLES: OfficerRoleOption[] = [
  {
    role: 'Police Officer / SHO',
    defaultSector: 'government',
    allowedSectors: ['government'],
    orgType: 'other',
    orgDeskLabel: 'MeeSeva / CSC & Public Offices',
    placeholderOffice: 'e.g., Madhapur Police Station (SHO Desk)',
    exampleReasons: [
      'Passport / Scholarship Police Verification',
      'Lost Document / FIR Copy Assistance',
      'Public Grievance / Community Safety Petition',
    ],
  },
  {
    role: 'Government Doctor / Medical Officer',
    defaultSector: 'government',
    allowedSectors: ['government'],
    orgType: 'hospital',
    orgDeskLabel: 'Hospitals & Emergency',
    placeholderOffice: 'e.g., Gandhi Government General Hospital',
    exampleReasons: [
      'UDID Disability Medical Board Assessment',
      'Aarogyasri / PM-JAY Cashless Approval',
      'Outpatient Specialist Consultation',
    ],
  },
  {
    role: 'Private Doctor / Clinic Specialist',
    defaultSector: 'private',
    allowedSectors: ['private'],
    orgType: 'hospital',
    orgDeskLabel: 'Hospitals & Emergency',
    placeholderOffice: 'e.g., Care / Apollo Specialty Clinic',
    exampleReasons: [
      'Specialist Medical Second Opinion',
      'Diagnostic & Health Scheme Empanelment Check',
      'Follow-up Clinical Consultation',
    ],
  },
  {
    role: 'Bank Manager / DBT Officer',
    defaultSector: 'government',
    allowedSectors: ['government', 'private'],
    orgType: 'bank',
    orgDeskLabel: 'Banks & DBT Desks',
    placeholderOffice: 'e.g., SBI / HDFC Branch Manager & DBT Nodal Desk',
    exampleReasons: [
      'NPCI Aadhaar Seeding & DBT Activation',
      'Education Loan / Scholarship Disbursement Hold',
      'KYC / Frozen Account Resolution',
    ],
  },
  {
    role: 'IAS / District Collector / RDO',
    defaultSector: 'government',
    allowedSectors: ['government'],
    orgType: 'other',
    orgDeskLabel: 'MeeSeva / CSC & Public Offices',
    placeholderOffice: 'e.g., District Collectorate Prajavani Desk',
    exampleReasons: [
      'Prajavani District Grievance Hearing',
      'Inter-Department Welfare Relief Escalation',
      'Land / Revenue Dispute Appeal',
    ],
  },
  {
    role: 'Revenue / Tahsildar / MeeSeva Officer',
    defaultSector: 'government',
    allowedSectors: ['government', 'private'],
    orgType: 'other',
    orgDeskLabel: 'MeeSeva / CSC & Public Offices',
    placeholderOffice: 'e.g., Serilingampally Mandal Tahsildar / MeeSeva',
    exampleReasons: [
      'Income / Caste / Residence Certificate Verification',
      'Ration Card / Rythu Bandhu Land Record Sync',
      'E-Sign / Barcode Attestation Correction',
    ],
  },
  {
    role: 'College Principal / Nodal Officer',
    defaultSector: 'government',
    allowedSectors: ['government', 'private'],
    orgType: 'college',
    orgDeskLabel: 'Colleges & Universities',
    placeholderOffice: 'e.g., University Scholarship Nodal Cell / Principal Office',
    exampleReasons: [
      'Bonafide & 75% Attendance Biometric Attestation',
      'Post-Matric Fee Reimbursement Renewal Sign-off',
      'Hostel / Tuition Fee Dues Clearance',
    ],
  },
  {
    role: 'Municipal / Public Utility Officer',
    defaultSector: 'government',
    allowedSectors: ['government', 'private'],
    orgType: 'other',
    orgDeskLabel: 'MeeSeva / CSC & Public Offices',
    placeholderOffice: 'e.g., Municipal Circle / Water & Sanitation Office',
    exampleReasons: [
      'Birth / Death Certificate Correction',
      'Property / Municipal Service Grievance',
      'Local Infrastructure & Utility Escalation',
    ],
  },
];

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

const TIME_SLOTS = [
  '10:00 AM - 10:30 AM',
  '11:00 AM - 11:30 AM',
  '12:00 PM - 12:30 PM',
  '02:30 PM - 03:00 PM',
  '04:00 PM - 04:30 PM',
  '05:00 PM - 05:30 PM',
];

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  requested: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  confirmed: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  rescheduled: 'bg-sky-100 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800',
  completed: 'bg-teal-100 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800',
  cancelled: 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
};

export const OfficerAppointmentsPage: React.FC = () => {
  const {
    user,
    token,
    lang,
    appointments,
    bookOfficerAppointment,
    updateOfficerAppointment,
    setAuthModalOpen,
  } = useApp();

  const tomorrowIso = useMemo(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().slice(0, 10);
  }, []);

  const [sectorType, setSectorType] = useState<AppointmentSectorType>('government');
  const [officerRole, setOfficerRole] = useState<OfficerRoleCategory>('Police Officer / SHO');
  const [officeName, setOfficeName] = useState('');
  const [stateVal, setStateVal] = useState(user?.state || 'Telangana');
  const [districtVal, setDistrictVal] = useState(user?.district || 'Hyderabad');
  const [placeLocality, setPlaceLocality] = useState('');
  const [citizenPhone, setCitizenPhone] = useState(user?.phone || '');
  const [reason, setReason] = useState('');
  const [issueDetails, setIssueDetails] = useState('');
  const [preferredDate, setPreferredDate] = useState(tomorrowIso);
  const [preferredTime, setPreferredTime] = useState(TIME_SLOTS[0]);
  const [urgency, setUrgency] = useState<'routine' | 'priority' | 'urgent'>('routine');
  const [relatedReference, setRelatedReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');

  const selectedMeta = useMemo(
    () => OFFICER_ROLES.find((r) => r.role === officerRole) || OFFICER_ROLES[0],
    [officerRole]
  );

  const handleRoleSelect = (role: OfficerRoleCategory) => {
    setOfficerRole(role);
    const meta = OFFICER_ROLES.find((r) => r.role === role);
    if (meta && !meta.allowedSectors.includes(sectorType)) {
      setSectorType(meta.defaultSector);
    }
  };

  const handleSectorSelect = (nextSector: AppointmentSectorType) => {
    setSectorType(nextSector);
    if (nextSector === 'private' && !selectedMeta.allowedSectors.includes('private')) {
      setOfficerRole('Private Doctor / Clinic Specialist');
    } else if (nextSector === 'government' && !selectedMeta.allowedSectors.includes('government')) {
      setOfficerRole('Government Doctor / Medical Officer');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (!token) {
      setAuthModalOpen(true);
      return;
    }

    if (!placeLocality.trim() || !reason.trim() || !preferredDate) {
      setError('Please enter your place/locality, issue/reason, and preferred date.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await bookOfficerAppointment({
        sector_type: sectorType,
        officer_role: officerRole,
        office_or_officer_name: officeName.trim() || `${officerRole} Desk`,
        state: stateVal,
        district: districtVal.trim() || 'Hyderabad',
        place_locality: placeLocality.trim(),
        reason: reason.trim(),
        issue_details: issueDetails.trim(),
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        citizen_phone: citizenPhone.trim() || undefined,
        urgency,
        related_reference: relatedReference.trim() || undefined,
      });
      setFeedback(
        `Appointment ${created.reference_code} booked with ${created.officer_role} and routed to ${created.org_name}.`
      );
      setOfficeName('');
      setReason('');
      setIssueDetails('');
      setRelatedReference('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await updateOfficerAppointment(id, { status: 'cancelled' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel appointment.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredAppointments = useMemo(() => {
    if (statusFilter === 'all') return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {lang === 'te'
              ? 'ప్రభుత్వ & ప్రైవేట్ అధికారుల అపాయింట్‌మెంట్లు'
              : 'Government & Private Officer Appointments'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Schedule appointments with Police, Government or Private Doctors, Bank Officers, IAS /
            Collectors, Tahsildars, College Nodal Officers, or Municipal Officers by place and issue.
            Every request routes directly to the matching Organization Portal desk.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-teal-200 dark:border-cyan-800 bg-teal-50/70 dark:bg-cyan-950/30 text-xs font-medium text-teal-900 dark:text-cyan-300 shrink-0">
          <ShieldCheck className="w-4 h-4" />
          <span>Connected to Existing Organization Desks</span>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-900 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Appointment Booking Form */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Book New Officer Appointment
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select officer sector, specific role, location, and reason.
              </p>
            </div>

            <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 p-1 gap-1 self-start">
              <button
                type="button"
                onClick={() => handleSectorSelect('government')}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                  sectorType === 'government'
                    ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Government Officer
              </button>
              <button
                type="button"
                onClick={() => handleSectorSelect('private')}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                  sectorType === 'private'
                    ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Private Officer
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Officer Category / Role
              </label>
              <select
                value={officerRole}
                onChange={(e) => handleRoleSelect(e.target.value as OfficerRoleCategory)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium"
              >
                {OFFICER_ROLES.map((opt) => (
                  <option key={opt.role} value={opt.role}>
                    {opt.role}
                  </option>
                ))}
              </select>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Building2 className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400" />
                <span>
                  Handled in Organizations Portal under{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {selectedMeta.orgDeskLabel}
                  </strong>
                </span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Specific Office / Officer / Hospital / Station Name
              </label>
              <input
                type="text"
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                placeholder={selectedMeta.placeholderOffice}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                State
              </label>
              <select
                value={stateVal}
                onChange={(e) => setStateVal(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              >
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                District
              </label>
              <input
                type="text"
                required
                value={districtVal}
                onChange={(e) => setDistrictVal(e.target.value)}
                placeholder="e.g., Hyderabad"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Place / Area / Mandal *
              </label>
              <input
                type="text"
                required
                value={placeLocality}
                onChange={(e) => setPlaceLocality(e.target.value)}
                placeholder="e.g., Madhapur / Circle-20 / Kukatpally"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={citizenPhone}
                onChange={(e) => setCitizenPhone(e.target.value)}
                placeholder="+91 98XXXXXXXX"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Reason / Issue Subject *
                </label>
                <VoiceTranscribeButton
                  onTranscript={(txt) => setReason((prev) => (prev ? `${prev} ${txt}` : txt))}
                  label="Speak Reason"
                />
              </div>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly state your issue or verification need"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
              <div className="flex flex-wrap gap-1.5">
                {selectedMeta.exampleReasons.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setReason(sample)}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-600 dark:text-slate-300 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Detailed Issue &amp; Documents Carrying
                </label>
                <VoiceTranscribeButton
                  onTranscript={(txt) => setIssueDetails((prev) => (prev ? `${prev} ${txt}` : txt))}
                  label="Dictate Details"
                />
              </div>
              <textarea
                rows={3}
                value={issueDetails}
                onChange={(e) => setIssueDetails(e.target.value)}
                placeholder="Include relevant dates, grievance numbers, medical urgency, or documents you are bringing."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preferred Date *
              </label>
              <input
                type="date"
                required
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preferred Time Slot *
              </label>
              <select
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Priority / Urgency
              </label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as 'routine' | 'priority' | 'urgent')}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              >
                <option value="routine">Routine</option>
                <option value="priority">Priority (Deadline / Financial)</option>
                <option value="urgent">Urgent (Medical / Emergency Petition)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Related Application / Ref ID (Optional)
              </label>
              <input
                type="text"
                value={relatedReference}
                onChange={(e) => setRelatedReference(e.target.value)}
                placeholder="e.g., NS-2026-PM01-8841"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 py-2.5 px-4 text-xs font-bold cursor-pointer disabled:opacity-60"
          >
            <Calendar className="w-4 h-4" />
            <span>
              {submitting
                ? 'Scheduling Appointment...'
                : token
                  ? 'Submit Appointment Request'
                  : 'Sign In to Book Appointment'}
            </span>
          </button>
        </form>

        {/* Right: Booked Appointments List */}
        <section className="xl:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                My Officer Appointments ({appointments.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live confirmation status, assigned officer name &amp; rescheduled notes from Organization desks.
              </p>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | AppointmentStatus)}
              aria-label="Filter appointments by status"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="requested">Requested</option>
              <option value="confirmed">Confirmed</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {!token ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Sign in with your Citizen account to book and view appointments across Government and Private officers.
              </p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-4 py-2 rounded-md bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 font-semibold cursor-pointer"
              >
                Sign In to Citizen Portal
              </button>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No appointments match the selected filter. Use the booking form to schedule an officer visit.
            </div>
          ) : (
            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {filteredAppointments.map((apt) => (
                <article
                  key={apt.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-teal-800 dark:text-cyan-300">
                          {apt.reference_code}
                        </span>
                        <span className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase">
                          {apt.sector_type === 'government' ? 'Govt Officer' : 'Private Officer'}
                        </span>
                        {apt.urgency !== 'routine' && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 text-[10px] font-bold uppercase">
                            {apt.urgency}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        {apt.officer_role.includes('Doctor') ? (
                          <Stethoscope className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400" />
                        ) : (
                          <Landmark className="w-3.5 h-3.5 text-teal-700 dark:text-cyan-400" />
                        )}
                        <span>{apt.officer_role}</span>
                      </h3>
                      <div className="text-slate-600 dark:text-slate-400 font-medium">
                        {apt.office_or_officer_name}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded border text-[11px] font-bold uppercase ${STATUS_BADGE[apt.status]}`}
                    >
                      {apt.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {apt.place_locality}, {apt.district}, {apt.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {apt.preferred_date} · {apt.preferred_time}
                      </span>
                    </div>
                  </div>

                  <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Issue: {apt.reason}
                    </div>
                    {apt.issue_details && (
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {apt.issue_details}
                      </p>
                    )}
                    {apt.related_reference && (
                      <div className="text-[11px] font-mono text-slate-500">
                        Ref: {apt.related_reference}
                      </div>
                    )}
                  </div>

                  {(apt.assigned_officer_name || apt.officer_notes) && (
                    <div className="rounded border border-teal-200 dark:border-cyan-900 bg-teal-50/70 dark:bg-cyan-950/25 p-2.5 space-y-1">
                      {apt.assigned_officer_name && (
                        <div className="flex items-center gap-1.5 font-semibold text-teal-900 dark:text-cyan-300">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Assigned Officer: {apt.assigned_officer_name}</span>
                        </div>
                      )}
                      {apt.officer_notes && (
                        <p className="text-slate-700 dark:text-slate-300">{apt.officer_notes}</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                      <span>Desk: {apt.org_name}</span>
                      {apt.citizen_phone && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3" />
                          {apt.citizen_phone}
                        </span>
                      )}
                    </div>
                    {apt.status !== 'cancelled' && apt.status !== 'completed' && (
                      <button
                        type="button"
                        disabled={busyId === apt.id}
                        onClick={() => void handleCancel(apt.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>{busyId === apt.id ? 'Cancelling...' : 'Cancel'}</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

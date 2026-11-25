import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Bookmark,
  BookOpen,
  Building2,
  Camera,
  CheckCircle2,
  FilePlus2,
  FileUp,
  Fingerprint,
  FolderLock,
  HeartPulse,
  Landmark,
  MapPin,
  Newspaper,
  Pencil,
  PhoneCall,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type {
  AllSchemesAiPlanResult,
  BloodGroupType,
  CitizenInterestTopic,
  DocumentGuideMetadata,
  LanguageCode,
  MemorizedDocument,
  NotificationPreferences,
} from '../../types/niyamsetu';

const MAX_CLIENT_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'];

const DOC_TYPE_OPTIONS = [
  'Income certificate',
  'Marksheet',
  'Bank passbook copy',
  'Enrolment certificate',
  'Bonafide certificate',
  'Caste / Community certificate',
  'Aadhaar / Residence Proof',
  'UDID Disability certificate',
  'Sports Merit certificate',
  'Hostel Warden certificate',
  'NSQF Assessment certificate',
  'Research / Synopsis Approval',
];

const QUICK_CORE_CERTS: Array<{
  doc_type: string;
  shortLabel: string;
  defaultNotes: string;
}> = [
  {
    doc_type: 'Income certificate',
    shortLabel: 'Income Cert',
    defaultNotes: 'Tehsildar / MeeSeva Verified Annual Family Income Certificate',
  },
  {
    doc_type: 'Marksheet',
    shortLabel: 'Marksheet',
    defaultNotes: 'Qualifying Board / University Official Marksheet',
  },
  {
    doc_type: 'Bank passbook copy',
    shortLabel: 'Bank DBT Passbook',
    defaultNotes: 'NPCI Aadhaar-Seeded Savings Bank Passbook Front Page',
  },
  {
    doc_type: 'Enrolment certificate',
    shortLabel: 'Enrolment / Bonafide',
    defaultNotes: 'Head of Institution Signed Current Academic Year Bonafide',
  },
  {
    doc_type: 'Caste / Community certificate',
    shortLabel: 'Caste / EWS Cert',
    defaultNotes: 'MRO / Sub-Collector Digital Caste or EWS Certificate',
  },
  {
    doc_type: 'Aadhaar / Residence Proof',
    shortLabel: 'Aadhaar / Domicile',
    defaultNotes: 'UIDAI e-KYC & State Residence Verification',
  },
  {
    doc_type: 'UDID Disability certificate',
    shortLabel: 'UDID Card',
    defaultNotes: 'SWAVALAMBAN District Medical Board UDID Card',
  },
  {
    doc_type: 'Hostel Warden certificate',
    shortLabel: 'Hostel Proof',
    defaultNotes: 'Recognized Hostel Warden Attendance & Mess Certificate',
  },
];

const CITIZEN_INTEREST_TOPICS: CitizenInterestTopic[] = [
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

const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  scheme_updates: true,
  rule_changes: true,
  deadlines: true,
  daily_digest: true,
  complaint_updates: true,
};

const NOTIF_PREF_ITEMS: Array<{ key: keyof NotificationPreferences; label: string }> = [
  { key: 'scheme_updates', label: 'New Government Schemes & Benefits' },
  { key: 'rule_changes', label: 'Verified Circular & Rule Revisions' },
  { key: 'deadlines', label: 'Upcoming Deadlines & Document Renewals' },
  { key: 'daily_digest', label: 'Personalized Daily Interest Digest' },
  { key: 'complaint_updates', label: 'Complaint & Grievance Status Updates' },
];

interface DocumentGuideResponse {
  catalog: DocumentGuideMetadata[];
  scheme_classifications: Array<{
    doc_name: string;
    requirement_level: 'mandatory' | 'additional' | 'optional' | 'not_applicable';
    guide: DocumentGuideMetadata;
  }>;
  vault_warnings: Array<{
    doc_id: string;
    title: string;
    severity: 'warning' | 'ok';
    message: string;
  }>;
}

export const ProfileVaultPage: React.FC = () => {
  const {
    user,
    token,
    lang,
    overview,
    memorizedDocs,
    saveUserProfile,
    saveMemorizedDocument,
    deleteMemorizedDocument,
    refreshUserDocuments,
    setAuthModalOpen,
    setPage,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'vault' | 'guide'>('vault');
  const [guideSchemeId, setGuideSchemeId] = useState<string>('sch-pm-01');
  const [guideData, setGuideData] = useState<DocumentGuideResponse | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);

  // Personal info state (all 19 profile & dossier fields)
  const [name, setName] = useState(user?.name || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [guardianName, setGuardianName] = useState(user?.guardian_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [langPref, setLangPref] = useState<LanguageCode>(user?.language_preference || 'en');

  const [address, setAddress] = useState(user?.address || '');
  const [district, setDistrict] = useState(user?.district || '');
  const [stateName, setStateName] = useState(user?.state || '');
  const [pincode, setPincode] = useState(user?.pincode || '');

  const [educationLevel, setEducationLevel] = useState(user?.education_level || '');
  const [institutionName, setInstitutionName] = useState(user?.institution_name || '');
  const [rollNumber, setRollNumber] = useState(user?.roll_number || '');
  const [category, setCategory] = useState(user?.category || '');
  const [marks, setMarks] = useState(
    user?.marks_percent !== undefined && user?.marks_percent !== null
      ? String(user.marks_percent)
      : ''
  );
  const [disabilityPercent, setDisabilityPercent] = useState(
    user?.disability_percent !== undefined && user?.disability_percent !== null
      ? String(user.disability_percent)
      : ''
  );

  const [income, setIncome] = useState(
    user?.family_income !== undefined && user?.family_income !== null
      ? String(user.family_income)
      : ''
  );
  const [bankName, setBankName] = useState(user?.bank_name || '');
  const [bankIfsc, setBankIfsc] = useState(user?.bank_ifsc || '');
  const [bankLast4, setBankLast4] = useState(user?.bank_account_last4 || '');
  const [incomeCertNo, setIncomeCertNo] = useState(user?.income_cert_number || '');
  const [casteCertNo, setCasteCertNo] = useState(user?.caste_cert_number || '');

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Emergency Info & Biometric/Photo Responder Pass state
  const [bloodGroup, setBloodGroup] = useState<BloodGroupType>(
    user?.emergency_profile?.blood_group || 'UNKNOWN'
  );
  const [emAllergies, setEmAllergies] = useState(
    user?.emergency_profile?.allergies || ''
  );
  const [emConditions, setEmConditions] = useState(
    user?.emergency_profile?.chronic_conditions || ''
  );
  const [emMedications, setEmMedications] = useState(
    user?.emergency_profile?.medications || ''
  );
  const [emWarnings, setEmWarnings] = useState(
    user?.emergency_profile?.medical_warnings || ''
  );
  const [emContactName, setEmContactName] = useState(
    user?.emergency_profile?.emergency_contact_name || ''
  );
  const [emContactPhone, setEmContactPhone] = useState(
    user?.emergency_profile?.emergency_contact_phone || ''
  );
  const [emContactRelation, setEmContactRelation] = useState(
    user?.emergency_profile?.emergency_contact_relation || ''
  );
  const [emOrganDonor, setEmOrganDonor] = useState(
    Boolean(user?.emergency_profile?.organ_donor)
  );
  const [emBiometricId, setEmBiometricId] = useState(
    user?.emergency_profile?.biometric_id || ''
  );
  const [emPhotoUrl, setEmPhotoUrl] = useState(
    user?.emergency_profile?.photo_data_url || ''
  );
  const [savingEmergency, setSavingEmergency] = useState(false);
  const [emergencyNotice, setEmergencyNotice] = useState<string | null>(null);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  // My Interests & Notification Preferences state
  const [interests, setInterests] = useState<CitizenInterestTopic[]>(
    user?.interests || [
      'Government schemes and notifications',
      'Education, scholarships and employment',
    ]
  );
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    user?.notification_preferences || DEFAULT_NOTIF_PREFS
  );
  const [savingInterests, setSavingInterests] = useState(false);
  const [interestNotice, setInterestNotice] = useState<string | null>(null);
  const [interestError, setInterestError] = useState<string | null>(null);
  const [deletingSavedId, setDeletingSavedId] = useState<string | null>(null);

  // Add/Edit/Memorize document form state
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docType, setDocType] = useState('Income certificate');
  const [docTitle, setDocTitle] = useState('');
  const [docSchemeId, setDocSchemeId] = useState('ALL');
  const [docNumber, setDocNumber] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [docExtractedName, setDocExtractedName] = useState(user?.name || '');
  const [docIncome, setDocIncome] = useState('');
  const [docMarks, setDocMarks] = useState('');
  const [docAddress, setDocAddress] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [syncProfile, setSyncProfile] = useState(true);
  const [savingDoc, setSavingDoc] = useState(false);
  const [quickSavingType, setQuickSavingType] = useState<string | null>(null);
  const [extractingFile, setExtractingFile] = useState(false);
  const [docNotice, setDocNotice] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // Vault filter + live 16-scheme coverage
  const [searchQuery, setSearchQuery] = useState('');
  const [filterScheme, setFilterScheme] = useState('ALL_FILTER');
  const [vaultPlan, setVaultPlan] = useState<AllSchemesAiPlanResult | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setDateOfBirth(user.date_of_birth || '');
    setGender(user.gender || '');
    setGuardianName(user.guardian_name || '');
    setPhone(user.phone || '');
    setLangPref(user.language_preference || 'en');
    setAddress(user.address || '');
    setDistrict(user.district || '');
    setStateName(user.state || '');
    setPincode(user.pincode || '');
    setEducationLevel(user.education_level || '');
    setInstitutionName(user.institution_name || '');
    setRollNumber(user.roll_number || '');
    setCategory(user.category || '');
    setMarks(
      user.marks_percent !== undefined && user.marks_percent !== null
        ? String(user.marks_percent)
        : ''
    );
    setDisabilityPercent(
      user.disability_percent !== undefined && user.disability_percent !== null
        ? String(user.disability_percent)
        : ''
    );
    setIncome(
      user.family_income !== undefined && user.family_income !== null
        ? String(user.family_income)
        : ''
    );
    setBankName(user.bank_name || '');
    setBankIfsc(user.bank_ifsc || '');
    setBankLast4(user.bank_account_last4 || '');
    setIncomeCertNo(user.income_cert_number || '');
    setCasteCertNo(user.caste_cert_number || '');
    setDocExtractedName(user.name || '');
    if (user.emergency_profile) {
      setBloodGroup(user.emergency_profile.blood_group || 'UNKNOWN');
      setEmAllergies(user.emergency_profile.allergies || '');
      setEmConditions(user.emergency_profile.chronic_conditions || '');
      setEmMedications(user.emergency_profile.medications || '');
      setEmWarnings(user.emergency_profile.medical_warnings || '');
      setEmContactName(user.emergency_profile.emergency_contact_name || '');
      setEmContactPhone(user.emergency_profile.emergency_contact_phone || '');
      setEmContactRelation(user.emergency_profile.emergency_contact_relation || '');
      setEmOrganDonor(Boolean(user.emergency_profile.organ_donor));
      setEmBiometricId(user.emergency_profile.biometric_id || '');
      setEmPhotoUrl(user.emergency_profile.photo_data_url || '');
    }
    if (user.interests) {
      setInterests(user.interests);
    }
    if (user.notification_preferences) {
      setNotifPrefs(user.notification_preferences);
    }
  }, [user]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    apiRequest<{ plan: AllSchemesAiPlanResult }>('/eligibility/vault-summary', { token })
      .then((res) => {
        if (active) setVaultPlan(res.plan);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, memorizedDocs, user]);

  useEffect(() => {
    let active = true;
    setGuideLoading(true);
    apiRequest<DocumentGuideResponse>(`/document-guide?schemeId=${encodeURIComponent(guideSchemeId)}`, {
      token,
    })
      .then((res) => {
        if (active) setGuideData(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setGuideLoading(false);
      });
    return () => {
      active = false;
    };
  }, [guideSchemeId, token, memorizedDocs.length]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return memorizedDocs.filter((d) => {
      if (filterScheme !== 'ALL_FILTER' && d.scheme_id !== filterScheme) return false;
      if (!q) return true;
      const hay =
        `${d.doc_type} ${d.title} ${d.doc_number} ${d.extracted_name} ${d.notes} ${d.scheme_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [memorizedDocs, searchQuery, filterScheme]);

  const vaultCoverageStats = useMemo(() => {
    if (!vaultPlan) return { matchedSlots: 0, totalSlots: 0, pct: 0 };
    let matched = 0;
    let missing = 0;
    for (const s of vaultPlan.scheme_plans) {
      matched += s.matched_docs.length;
      missing += s.missing_docs.length;
    }
    const total = matched + missing;
    return {
      matchedSlots: matched,
      totalSlots: total,
      pct: total > 0 ? Math.round((matched / total) * 100) : 0,
    };
  }, [vaultPlan]);

  if (!user || !token) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
        <FolderLock className="w-8 h-8 mx-auto text-teal-800 dark:text-cyan-300" />
        <h1 className="font-display text-xl font-bold">Document Guide &amp; Memorized Vault</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Sign in to save your citizen identity, guardian details, bank DBT info, and reusable
          certificates across all 16 schemes.
        </p>
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
        >
          Sign In to Access Vault
        </button>
      </div>
    );
  }

  const filledFields = [
    name,
    dateOfBirth,
    gender,
    guardianName,
    phone,
    address,
    district,
    stateName,
    pincode,
    educationLevel,
    institutionName,
    rollNumber,
    category,
    income,
    marks,
    bankName,
    bankIfsc,
    bankLast4,
    incomeCertNo,
  ].filter((v) => String(v || '').trim() !== '').length;
  const completenessPct = Math.round((filledFields / 19) * 100);

  const initials = (name || user.name || 'CU')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    setProfileError(null);
    try {
      await saveUserProfile({
        name,
        date_of_birth: dateOfBirth,
        gender,
        guardian_name: guardianName,
        phone,
        language_preference: langPref,
        address,
        district,
        state: stateName,
        pincode,
        category,
        education_level: educationLevel,
        institution_name: institutionName,
        roll_number: rollNumber,
        family_income: income === '' ? null : Number(income),
        marks_percent: marks === '' ? null : Number(marks),
        disability_percent: disabilityPercent === '' ? null : Number(disabilityPercent),
        bank_name: bankName,
        bank_ifsc: bankIfsc.toUpperCase(),
        bank_account_last4: bankLast4,
        income_cert_number: incomeCertNo,
        caste_cert_number: casteCertNo,
      });
      setProfileNotice(
        'Full Citizen & Scholar Dossier saved across your account and Cloud Firestore.'
      );
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleEmergencyPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEmergencyError(null);
    if (!file.type.startsWith('image/')) {
      setEmergencyError('Upload a PNG, JPG, JPEG, or WEBP portrait image.');
      e.target.value = '';
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      setEmergencyError('Emergency portrait must be under 2.5 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEmPhotoUrl(reader.result);
        setEmergencyNotice('Emergency portrait loaded. Click "Save Emergency Info" to persist.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleEnrollBiometricToken = async () => {
    setEmergencyError(null);
    const prefix = (name || user.name || 'CITIZEN')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 4)
      .toUpperCase() || 'USER';
    const generated = `BIO-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Attempt platform WebAuthn passkey registration when available in browser context
    try {
      if (typeof window !== 'undefined' && window.PublicKeyCredential && navigator.credentials?.create) {
        const challenge = new Uint8Array(16);
        window.crypto.getRandomValues(challenge);
        const userIdBytes = new TextEncoder().encode(user.id.slice(0, 16));
        await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'NiyamSetu Emergency Pass' },
            user: {
              id: userIdBytes,
              name: user.email,
              displayName: name || user.name,
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'preferred',
            },
            timeout: 12000,
          },
        });
      }
    } catch {
      // Nested iframe or unsupported hardware falls back cleanly to signed BIO passkey ID
    }
    setEmBiometricId(generated);
    setEmergencyNotice(
      `Biometric Responder Token ${generated} generated. Save Emergency Info to activate hospital scan lookup.`
    );
  };

  const handleSaveEmergencyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmergency(true);
    setEmergencyNotice(null);
    setEmergencyError(null);
    try {
      await saveUserProfile({
        emergency_profile: {
          blood_group: bloodGroup,
          allergies: emAllergies.trim(),
          chronic_conditions: emConditions.trim(),
          medications: emMedications.trim(),
          medical_warnings: emWarnings.trim(),
          emergency_contact_name: emContactName.trim(),
          emergency_contact_phone: emContactPhone.trim(),
          emergency_contact_relation: emContactRelation.trim(),
          organ_donor: emOrganDonor,
          biometric_id: emBiometricId.trim(),
          biometric_enrolled: Boolean(emBiometricId.trim()),
          photo_data_url: emPhotoUrl,
          updated_at: new Date().toISOString(),
        },
      });
      setEmergencyNotice(
        'Emergency Info saved & linked to your Biometric & Photo Responder Pass. Authorized Hospital teams can retrieve critical vitals only.'
      );
    } catch (err) {
      setEmergencyError(err instanceof Error ? err.message : 'Unable to save Emergency Info.');
    } finally {
      setSavingEmergency(false);
    }
  };

  const toggleInterest = (topic: CitizenInterestTopic) => {
    setInterests((prev) =>
      prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic]
    );
  };

  const handleSaveInterests = async () => {
    setSavingInterests(true);
    setInterestNotice(null);
    setInterestError(null);
    try {
      try {
        localStorage.setItem('niyamsetu_saved_interests', JSON.stringify(interests));
      } catch {
        // ignore storage errors
      }
      await saveUserProfile({
        interests,
        notification_preferences: notifPrefs,
      });
      setInterestNotice('Saved your daily update topics and notification preferences.');
    } catch (err) {
      setInterestError(err instanceof Error ? err.message : 'Unable to save interests.');
    } finally {
      setSavingInterests(false);
    }
  };

  const handleDeleteSavedUpdate = async (updateId: string) => {
    if (!token) return;
    setDeletingSavedId(updateId);
    setInterestError(null);
    try {
      await apiRequest(`/profile/saved-updates/${encodeURIComponent(updateId)}`, {
        method: 'DELETE',
        token,
      });
      await saveUserProfile({});
    } catch (err) {
      setInterestError(err instanceof Error ? err.message : 'Unable to remove saved update.');
    } finally {
      setDeletingSavedId(null);
    }
  };

  const resetDocForm = () => {
    setEditingDocId(null);
    setDocType('Income certificate');
    setDocTitle('');
    setDocSchemeId('ALL');
    setDocNumber('');
    setDocExpiryDate('');
    setDocExtractedName(name || user.name);
    setDocIncome('');
    setDocMarks('');
    setDocAddress('');
    setDocNotes('');
  };

  const startEditDocument = (doc: MemorizedDocument) => {
    setEditingDocId(doc.id);
    setDocType(doc.doc_type);
    setDocTitle(doc.title);
    setDocSchemeId(doc.scheme_id || 'ALL');
    setDocNumber(doc.doc_number || '');
    setDocExpiryDate(doc.expiry_date || '');
    setDocExtractedName(doc.extracted_name || name || user.name);
    setDocIncome(doc.extracted_income !== null ? String(doc.extracted_income) : '');
    setDocMarks(doc.extracted_marks !== null ? String(doc.extracted_marks) : '');
    setDocAddress(doc.extracted_address || '');
    setDocNotes(doc.notes || '');
    setDocNotice(`Editing "${doc.title}". Update fields below and click Save Changes.`);
    setDocError(null);
  };

  const handleSaveManualDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDoc(true);
    setDocNotice(null);
    setDocError(null);
    try {
      const saved = await saveMemorizedDocument({
        ...(editingDocId ? { id: editingDocId } : {}),
        doc_type: docType,
        title: docTitle.trim() || `${docType} (${name || user.name})`,
        scheme_id: docSchemeId,
        doc_number: docNumber,
        expiry_date: docExpiryDate || undefined,
        extracted_name: docExtractedName || name || user.name,
        extracted_income: docIncome === '' ? null : Number(docIncome),
        extracted_marks: docMarks === '' ? null : Number(docMarks),
        extracted_address: docAddress || address,
        notes: docNotes,
        source_activity: 'vault_manual',
        syncProfile,
      });
      setDocNotice(
        editingDocId
          ? `Updated memorized document "${saved.title}" in your Vault.`
          : `Memorized "${saved.title}" in your Vault. Automatically active across Dashboard, FormSathi & Procedures.`
      );
      resetDocForm();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Unable to save document.');
    } finally {
      setSavingDoc(false);
    }
  };

  const handleQuickMemorize = async (preset: (typeof QUICK_CORE_CERTS)[number]) => {
    const existing = memorizedDocs.find(
      (d) => d.doc_type.toLowerCase() === preset.doc_type.toLowerCase()
    );
    if (existing) {
      startEditDocument(existing);
      return;
    }
    setQuickSavingType(preset.doc_type);
    setDocNotice(null);
    setDocError(null);
    try {
      const inferredNum =
        preset.doc_type === 'Income certificate'
          ? incomeCertNo
          : preset.doc_type === 'Caste / Community certificate'
            ? casteCertNo
            : preset.doc_type === 'Bank passbook copy' && bankIfsc
              ? `${bankIfsc}-${bankLast4 || 'DBT'}`
              : preset.doc_type === 'Enrolment certificate' && rollNumber
                ? rollNumber
                : '';

      const saved = await saveMemorizedDocument({
        doc_type: preset.doc_type,
        title: `${preset.doc_type} — ${name || user.name}`,
        scheme_id: 'ALL',
        doc_number: inferredNum,
        extracted_name: name || user.name,
        extracted_income:
          preset.doc_type === 'Income certificate' && income !== '' ? Number(income) : null,
        extracted_marks: preset.doc_type === 'Marksheet' && marks !== '' ? Number(marks) : null,
        extracted_address: [address, district, stateName, pincode].filter(Boolean).join(', '),
        notes: preset.defaultNotes,
        source_activity: 'vault_manual',
        syncProfile: false,
      });
      setDocNotice(
        `Quick-memorized "${saved.title}" into your Vault using your saved profile data.`
      );
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Quick-memorize failed.');
    } finally {
      setQuickSavingType(null);
    }
  };

  const handleUploadExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocNotice(null);
    setDocError(null);

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      setDocError('Unsupported format. Upload PDF, PNG, JPG, JPEG, or TXT only.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
      setDocError('File exceeds the 5 MB limit. Compress or select a smaller document.');
      e.target.value = '';
      return;
    }

    setExtractingFile(true);
    try {
      const isText = file.type.startsWith('text/') || lowerName.endsWith('.txt');
      const payload: Record<string, unknown> = {
        fileName: file.name,
        fileSizeBytes: file.size,
        expiryDate: docExpiryDate || undefined,
        saveToVault: true,
        schemeId: docSchemeId,
      };
      if (isText) {
        payload.textContent = await file.text();
        payload.mimeType = 'text/plain';
      } else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        payload.inlineBase64 = btoa(binary);
        payload.mimeType = file.type || 'application/pdf';
      }

      const res = await apiRequest<{
        extracted: {
          detected_document_type: string;
        };
      }>('/formsathi/extract-file', {
        method: 'POST',
        token,
        body: payload,
      });

      await refreshUserDocuments();
      setDocNotice(
        `Extracted & memorized "${res.extracted.detected_document_type}" from ${file.name}. Available across all activities.`
      );
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Document extraction failed.');
    } finally {
      setExtractingFile(false);
      e.target.value = '';
    }
  };

  const warningList = (guideData?.vault_warnings || []).filter((w) => w.severity === 'warning');

  return (
    <div className="space-y-6">
      {/* Page Title & Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {lang === 'te'
              ? 'డాక్యుమెంట్ గైడ్ & వాల్ట్'
              : 'Document Guide, Citizen Dossier & Vault'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Maintain your 19-field dossier and memorized certificates, check expiry alerts, and
            inspect scheme-by-scheme Mandatory vs Additional document intelligence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto flex-nowrap snap-x"
            role="tablist"
            aria-label="Document Vault and Guide Tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'vault'}
              onClick={() => {
                setActiveTab('vault');
                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
              }}
              className={`snap-start shrink-0 min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                activeTab === 'vault'
                  ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <FolderLock className="w-3.5 h-3.5 shrink-0" />
              <span>Vault &amp; Dossier ({memorizedDocs.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'guide'}
              onClick={() => {
                setActiveTab('guide');
                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
              }}
              className={`snap-start shrink-0 min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                activeTab === 'guide'
                  ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Document Guide (12)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPage('student_home')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dashboard &amp; AI Plan</span>
          </button>
        </div>
      </div>

      {/* TOP FEATURE: Emergency Info & Hospital Responder Photo/Biometric Pass */}
      <section
        aria-label="Emergency Medical & Responder Information"
        className="rounded-lg border-2 border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 p-5 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-rose-200 dark:border-rose-900/70 pb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-rose-950 dark:text-rose-100">
                  Emergency Info &amp; Life-Safety Responder Pass
                </h2>
                <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-mono text-[11px] font-semibold">
                  {bloodGroup === 'UNKNOWN' ? 'Blood Group: Pending' : `Blood Group: ${bloodGroup}`}
                </span>
                {emBiometricId && (
                  <span className="px-2 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-white font-mono text-[11px]">
                    {emBiometricId}
                  </span>
                )}
              </div>
              <p className="text-xs text-rose-900/80 dark:text-rose-200/80 mt-0.5">
                Critical allergies, conditions, blood group, and ICE contact accessible to verified
                hospital responders via photo scan or biometric token during an emergency. Private
                income, caste, and academic records remain strictly locked.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleEnrollBiometricToken}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-xs font-semibold text-rose-800 dark:text-rose-200 hover:border-rose-500 cursor-pointer"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>{emBiometricId ? 'Regenerate Biometric Pass' : 'Enroll Biometric Pass'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveEmergencyProfile} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Portrait Photo & Biometric Tile */}
            <div className="lg:col-span-3 rounded-md border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                {emPhotoUrl ? (
                  <img
                    src={emPhotoUrl}
                    alt={`${name || user.name} Emergency Portrait`}
                    className="w-16 h-16 rounded-md object-cover border border-rose-200 dark:border-rose-800 shrink-0 bg-slate-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-700 dark:text-rose-300 font-bold text-lg shrink-0">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {name || user.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {emBiometricId || 'No Biometric ID yet'}
                  </div>
                  <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-500 cursor-pointer">
                    <Camera className="w-3 h-3" />
                    <span>{emPhotoUrl ? 'Change Photo' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleEmergencyPhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Biometric Token ID
                </label>
                <input
                  type="text"
                  value={emBiometricId}
                  onChange={(e) => setEmBiometricId(e.target.value.toUpperCase())}
                  placeholder="BIO-RAVI-7842"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>

            {/* Medical & Emergency Contact Grid */}
            <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Blood Group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value as BloodGroupType)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-semibold"
                >
                  {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as BloodGroupType[]).map(
                    (bg) => (
                      <option key={bg} value={bg}>
                        {bg === 'UNKNOWN' ? 'UNKNOWN (Pending Lab Confirmation)' : bg}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Documented Allergies (comma-separated)
                </label>
                <input
                  type="text"
                  value={emAllergies}
                  onChange={(e) => setEmAllergies(e.target.value)}
                  placeholder="Penicillin, Peanuts, Sulfa drugs"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chronic Conditions (comma-separated)
                </label>
                <input
                  type="text"
                  value={emConditions}
                  onChange={(e) => setEmConditions(e.target.value)}
                  placeholder="Asthma, Type 1 Diabetes"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Active Medications
                </label>
                <input
                  type="text"
                  value={emMedications}
                  onChange={(e) => setEmMedications(e.target.value)}
                  placeholder="Salbutamol Inhaler, Insulin"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Critical Responder Warning
                </label>
                <input
                  type="text"
                  value={emWarnings}
                  onChange={(e) => setEmWarnings(e.target.value)}
                  placeholder="Avoid NSAIDs; EpiPen in backpack"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                />
              </div>

              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emOrganDonor}
                    onChange={(e) => setEmOrganDonor(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Registered Organ Donor</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ICE Contact Name
                </label>
                <input
                  type="text"
                  value={emContactName}
                  onChange={(e) => setEmContactName(e.target.value)}
                  placeholder="Srinivas Rao"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ICE Contact Phone
                </label>
                <input
                  type="tel"
                  value={emContactPhone}
                  onChange={(e) => setEmContactPhone(e.target.value)}
                  placeholder="+91 98480 22311"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Relation
                </label>
                <input
                  type="text"
                  value={emContactRelation}
                  onChange={(e) => setEmContactRelation(e.target.value)}
                  placeholder="Father / Mother / Spouse"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Only Hospital Emergency Responders &amp; Main Gov Audit see emergency data upon
                biometric/photo verification.
              </span>
            </div>

            <button
              type="submit"
              disabled={savingEmergency}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>{savingEmergency ? 'Saving Emergency Info...' : 'Save Emergency Info'}</span>
            </button>
          </div>

          {emergencyNotice && (
            <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
              {emergencyNotice}
            </div>
          )}
          {emergencyError && (
            <div className="rounded border border-rose-300 dark:border-rose-800 bg-rose-100 dark:bg-rose-950 px-3 py-2 text-xs text-rose-900 dark:text-rose-200">
              {emergencyError}
            </div>
          )}
        </form>
      </section>

      {/* My Interests & Daily Updates Personalization */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-md bg-teal-50 dark:bg-cyan-950/50 text-teal-800 dark:text-cyan-300 shrink-0">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                My Interests &amp; Daily Updates
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Choose up to 10 topics for your Citizen Dashboard news digest and configure alert
                preferences. Market updates are purely informational—not financial advice.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={savingInterests}
            onClick={() => void handleSaveInterests()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap self-start"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{savingInterests ? 'Saving...' : 'Save Interests & Preferences'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Topics ({interests.length} selected)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CITIZEN_INTEREST_TOPICS.map((topic) => {
                const selected = interests.includes(topic);
                return (
                  <label
                    key={topic}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
                      selected
                        ? 'border-teal-700 dark:border-cyan-400 bg-teal-50/70 dark:bg-cyan-950/30 text-slate-900 dark:text-slate-100 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleInterest(topic)}
                      className="rounded border-slate-300 text-teal-800"
                    />
                    <span>{topic}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
              <span>Notification Preferences</span>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 divide-y divide-slate-200 dark:divide-slate-800">
              {NOTIF_PREF_ITEMS.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer"
                >
                  <span className="text-slate-700 dark:text-slate-200">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(notifPrefs[item.key])}
                    onChange={(e) =>
                      setNotifPrefs((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-teal-800"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {interestNotice && (
          <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
            {interestNotice}
          </div>
        )}
        {interestError && (
          <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
            {interestError}
          </div>
        )}

        {/* Saved Updates Bookmarks */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Bookmark className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
              <span>Saved News &amp; Circular Bookmarks ({(user.saved_updates || []).length})</span>
            </div>
          </div>
          {!user.saved_updates || user.saved_updates.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No saved updates yet. Save any government notification or daily briefing from your
              Citizen Dashboard to access it here.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {user.saved_updates.map((upd) => (
                <div
                  key={upd.id}
                  className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex items-start justify-between gap-2 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-[11px] font-mono text-teal-800 dark:text-cyan-300 truncate">
                      {upd.is_gov_notification ? 'GOV NOTIFICATION' : upd.category} ·{' '}
                      {upd.source_name}
                    </div>
                    <a
                      href={upd.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-slate-900 dark:text-slate-100 hover:underline block truncate"
                    >
                      {upd.title}
                    </a>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Saved {new Date(upd.saved_at).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={deletingSavedId === upd.id}
                    onClick={() => void handleDeleteSavedUpdate(upd.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                    aria-label={`Remove saved update ${upd.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Vault Expiry / Missing Certificate ID Warnings */}
      {warningList.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Vault Verification &amp; Expiry Warnings ({warningList.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {warningList.map((w) => (
              <div
                key={w.doc_id}
                className="rounded border border-amber-200 dark:border-amber-800 bg-white/80 dark:bg-slate-900 px-3 py-2"
              >
                <strong className="text-slate-900 dark:text-slate-100">{w.title}:</strong>{' '}
                <span className="text-amber-800 dark:text-amber-300">{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'guide' ? (
        /* TAB 2: Document Guide & Intelligence */
        <section className="space-y-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Scheme-Specific Document Classification &amp; Official Requirements
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a scheme to distinguish Mandatory, Additional, Optional, and Not Applicable
                documents along with issuing department, validity, formats, and 5 MB upload limits.
              </p>
            </div>
            <select
              value={guideSchemeId}
              onChange={(e) => setGuideSchemeId(e.target.value)}
              aria-label="Select scheme for document classification"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs max-w-sm"
            >
              {(overview?.schemes || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>

          {guideLoading && !guideData ? (
            <div className="text-sm text-slate-500 py-6">Loading document intelligence...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(guideData?.scheme_classifications || []).map((item) => {
                const inVault = memorizedDocs.some(
                  (d) =>
                    d.doc_type.toLowerCase().includes(item.doc_name.toLowerCase().split(' ')[0]) ||
                    item.doc_name.toLowerCase().includes(d.doc_type.toLowerCase().split(' ')[0])
                );
                const levelColor =
                  item.requirement_level === 'mandatory'
                    ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                    : item.requirement_level === 'additional'
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                      : item.requirement_level === 'optional'
                        ? 'bg-teal-100 text-teal-900 dark:bg-cyan-950/60 dark:text-cyan-300 border-teal-300 dark:border-cyan-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700';

                return (
                  <div
                    key={item.doc_name}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {lang === 'te' ? item.guide.name_te : item.guide.name}
                        </h3>
                        <span className="text-[11px] font-mono text-slate-500">
                          {item.guide.category} · Max {item.guide.max_size_mb} MB (
                          {item.guide.accepted_formats.join(', ')})
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase ${levelColor}`}
                        >
                          {item.requirement_level.replace('_', ' ')}
                        </span>
                        {inVault && (
                          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            ✓ In Your Vault
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-slate-700 dark:text-slate-300">
                      <strong>What it is:</strong> {item.guide.what_it_is}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      <strong>Why required:</strong> {item.guide.why_required}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                      <div>
                        <strong>Issuing Dept:</strong> {item.guide.issuing_department}
                      </div>
                      <div>
                        <strong>Validity:</strong> {item.guide.validity_period}
                      </div>
                      <div className="sm:col-span-2">
                        <strong>Where to obtain:</strong> {item.guide.where_to_obtain}
                      </div>
                      {item.guide.official_alternatives.length > 0 && (
                        <div className="sm:col-span-2 text-teal-800 dark:text-cyan-300">
                          <strong>Official Alternatives:</strong>{' '}
                          {item.guide.official_alternatives.join(' | ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* TAB 1: Citizen Dossier & Memorized Document Vault */
        <>
          {/* Executive Digital Citizen & Scholar Identity Dossier Banner */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-start sm:items-center gap-4">
                <div className="w-14 h-14 rounded-lg bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 flex items-center justify-center font-display text-lg font-bold shrink-0">
                  {initials}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {name || user.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      <BadgeCheck className="w-3.5 h-3.5" />
                      <span>Citizen Dossier</span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{user.email}</span>
                    {phone && <span className="font-mono">{phone}</span>}
                    {dateOfBirth && <span className="font-mono">DOB: {dateOfBirth}</span>}
                    {gender && <span>{gender}</span>}
                    {guardianName && <span>Guardian: {guardianName}</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
                <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Profile Dossier
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-teal-800 dark:text-cyan-300">
                    {completenessPct}%
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Vault Docs</div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {memorizedDocs.length}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Eligible Schemes
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {vaultPlan
                      ? `${vaultPlan.eligible_count}/${vaultPlan.total_schemes_evaluated}`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                  <span>Academic &amp; Category Record</span>
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-medium">
                  {educationLevel || 'Education track unset'} · {category || 'Category unset'}
                </div>
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  {institutionName || 'Institution unset'} {rollNumber ? `(${rollNumber})` : ''}
                </div>
                <div className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                  Marks: {marks !== '' ? `${marks}%` : '—'} · Income:{' '}
                  {income !== '' ? `₹${Number(income).toLocaleString('en-IN')}` : '—'}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                  <span>DBT Bank &amp; Certificate IDs</span>
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-medium">
                  {bankName || 'Bank not linked'}{' '}
                  {bankLast4 ? <span className="font-mono">· ••••{bankLast4}</span> : ''}
                </div>
                <div className="font-mono text-slate-500 dark:text-slate-400">
                  IFSC: {bankIfsc || 'Unset'}
                </div>
                <div className="font-mono text-slate-600 dark:text-slate-300 truncate">
                  Inc ID: {incomeCertNo || 'Unset'} · Caste ID: {casteCertNo || 'Unset'}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span>16-Scheme Vault Doc Coverage</span>
                  <span className="font-mono tabular-nums text-teal-800 dark:text-cyan-300">
                    {vaultCoverageStats.pct}%
                  </span>
                </div>
                <div className="h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-teal-800 dark:bg-cyan-400 transition-all"
                    style={{ width: `${vaultCoverageStats.pct}%` }}
                  />
                </div>
                <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {vaultCoverageStats.matchedSlots} of {vaultCoverageStats.totalSlots} scheme doc
                  checks satisfied by Vault.
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Structured 4-Group Personal Identity & Dossier Form */}
            <section className="lg:col-span-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    1. Personal Dossier, Academic &amp; DBT Bank Profile
                  </h2>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    A. Identity &amp; Guardian
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Full Name (as on certificates)
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Parent / Guardian Name
                      </label>
                      <input
                        type="text"
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                        placeholder="e.g., Srinivas Rao"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Gender
                      </label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Mobile Number
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98480 00000"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    B. Residential Domicile
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Residential Address
                    </label>
                    <textarea
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House No., Street, Colony, Mandal / Landmark"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        District
                      </label>
                      <input
                        type="text"
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        placeholder="Hyderabad"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        placeholder="Telangana"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        PIN Code
                      </label>
                      <input
                        type="text"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        placeholder="500044"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    C. Academic &amp; Inclusion Category
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Institution / College Name
                      </label>
                      <input
                        type="text"
                        value={institutionName}
                        onChange={(e) => setInstitutionName(e.target.value)}
                        placeholder="e.g., Osmania University College of Engineering"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Hall Ticket / Enrolment Roll No.
                      </label>
                      <input
                        type="text"
                        value={rollNumber}
                        onChange={(e) => setRollNumber(e.target.value)}
                        placeholder="OUCE-24CS-109"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Education Track / Course
                      </label>
                      <input
                        type="text"
                        value={educationLevel}
                        onChange={(e) => setEducationLevel(e.target.value)}
                        placeholder="e.g., B.Tech CSE Year 2"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Social Category / Quota
                      </label>
                      <input
                        type="text"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="General / EWS / OBC / SC / ST / Minority"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Qualifying Exam Marks (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={marks}
                        onChange={(e) => setMarks(e.target.value)}
                        placeholder="72"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        UDID Disability % (0 if N/A)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={disabilityPercent}
                        onChange={(e) => setDisabilityPercent(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    D. Financial, DBT Bank &amp; Certificate IDs
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Annual Family Income (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={income}
                        onChange={(e) => setIncome(e.target.value)}
                        placeholder="280000"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Income Cert Number
                      </label>
                      <input
                        type="text"
                        value={incomeCertNo}
                        onChange={(e) => setIncomeCertNo(e.target.value)}
                        placeholder="INC-TS-2026-4418"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Caste / EWS Cert No.
                      </label>
                      <input
                        type="text"
                        value={casteCertNo}
                        onChange={(e) => setCasteCertNo(e.target.value)}
                        placeholder="EWS-TS-2026-8821"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        DBT Bank Name
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="State Bank of India"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Bank IFSC Code
                      </label>
                      <input
                        type="text"
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        placeholder="SBIN0020142"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Account Last 4 Digits
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={bankLast4}
                        onChange={(e) => setBankLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="6742"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                {profileNotice && (
                  <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                    {profileNotice}
                  </div>
                )}
                {profileError && (
                  <div className="rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
                    {profileError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 px-4 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer"
                >
                  {savingProfile ? 'Saving Full Dossier...' : 'Save Full Citizen & Scholar Dossier'}
                </button>
              </form>
            </section>

            {/* Right: Quick-Memorize + Enter/Edit/Upload Memorized Document */}
            <section className="lg:col-span-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {editingDocId
                      ? '2. Edit Memorized Document'
                      : '2. Quick-Memorize, Upload or Add Document'}
                  </h2>
                </div>
                {editingDocId ? (
                  <button
                    type="button"
                    onClick={resetDocForm}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Edit</span>
                  </button>
                ) : (
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {memorizedDocs.length} memorized
                  </span>
                )}
              </div>

              {/* 1-Click Quick-Memorize Core Certificates */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  1-Click Quick-Memorize Core Certificates (or click Saved to Edit):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUICK_CORE_CERTS.map((preset) => {
                    const alreadySaved = memorizedDocs.some(
                      (d) => d.doc_type.toLowerCase() === preset.doc_type.toLowerCase()
                    );
                    const busy = quickSavingType === preset.doc_type;
                    return (
                      <button
                        key={preset.doc_type}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleQuickMemorize(preset)}
                        className={`text-left rounded border px-2.5 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
                          alreadySaved
                            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-teal-700 dark:hover:border-cyan-400'
                        }`}
                      >
                        <div className="font-semibold truncate">{preset.shortLabel}</div>
                        <div className="text-[10px] font-mono opacity-80">
                          {busy ? 'Saving...' : alreadySaved ? 'Saved · Edit' : '+ Memorize'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-900 dark:text-slate-100">
                    Upload File &amp; Auto-Memorize (Max 5 MB):
                  </strong>{' '}
                  Upload a sample `.txt`, `.pdf`, `.png`, or `.jpg` to extract &amp; memorize fields
                  into your Vault.
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer shrink-0">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{extractingFile ? 'Extracting...' : 'Upload & Memorize'}</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.png,.jpg,.jpeg"
                    onChange={handleUploadExtract}
                    disabled={extractingFile}
                    className="hidden"
                  />
                </label>
              </div>

              <form onSubmit={handleSaveManualDoc} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Document Type
                    </label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    >
                      {DOC_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Linked Scheme Scope
                    </label>
                    <select
                      value={docSchemeId}
                      onChange={(e) => setDocSchemeId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    >
                      <option value="ALL">ALL — Reusable Across All 16 Schemes</option>
                      {(overview?.schemes || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Document Title
                    </label>
                    <input
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder={`e.g., ${docType} (2026-27)`}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Certificate / Ref No.
                    </label>
                    <input
                      type="text"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="INC-TS-2026-1904"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Expiry Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={docExpiryDate}
                      onChange={(e) => setDocExpiryDate(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Name on Document
                    </label>
                    <input
                      type="text"
                      value={docExtractedName}
                      onChange={(e) => setDocExtractedName(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Income Figure (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={docIncome}
                      onChange={(e) => setDocIncome(e.target.value)}
                      placeholder="240000"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Marks (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={docMarks}
                      onChange={(e) => setDocMarks(e.target.value)}
                      placeholder="76"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Address Printed on Document
                    </label>
                    <input
                      type="text"
                      value={docAddress}
                      onChange={(e) => setDocAddress(e.target.value)}
                      placeholder="Matches residential domicile"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Issuing Authority / Verification Notes
                    </label>
                    <input
                      type="text"
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                      placeholder="Issued by Mandal Revenue Office / Principal"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncProfile}
                    onChange={(e) => setSyncProfile(e.target.checked)}
                    className="accent-teal-800 dark:accent-cyan-400"
                  />
                  <span>Auto-sync extracted income, marks, or address to my Personal Profile</span>
                </label>

                {docNotice && (
                  <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                    {docNotice}
                  </div>
                )}
                {docError && (
                  <div className="rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
                    {docError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingDoc}
                  className="w-full py-2.5 px-4 rounded-md border border-teal-800 dark:border-cyan-400 bg-teal-800/10 dark:bg-cyan-400/15 hover:bg-teal-800 hover:text-white dark:hover:bg-cyan-400 dark:hover:text-slate-950 text-teal-900 dark:text-cyan-200 text-sm font-semibold transition-colors cursor-pointer"
                >
                  {savingDoc
                    ? 'Saving Document...'
                    : editingDocId
                      ? 'Update Memorized Document'
                      : 'Memorize Document to Vault'}
                </button>
              </form>
            </section>
          </div>

          {/* Stored / Memorized Documents Vault with Search, Filter & Edit */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Your Memorized Document Vault ({filteredDocs.length}
                  {filteredDocs.length !== memorizedDocs.length
                    ? ` of ${memorizedDocs.length}`
                    : ''}
                  )
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Automatically reused across Dashboard Eligibility, FormSathi Application
                  Assistant, Procedures, and JanSetu AI.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search cert type, ref no, notes..."
                    aria-label="Search memorized documents"
                    className="w-full sm:w-56 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs"
                  />
                </div>

                <select
                  value={filterScheme}
                  onChange={(e) => setFilterScheme(e.target.value)}
                  aria-label="Filter documents by scheme"
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="ALL_FILTER">All Vault Entries</option>
                  <option value="ALL">Reusable (ALL Schemes)</option>
                  {(overview?.schemes || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} Only
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setPage('readiness_hub')}
                  className="text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer whitespace-nowrap px-2"
                >
                  Open Application Assistant →
                </button>
              </div>
            </div>

            {filteredDocs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                {memorizedDocs.length === 0
                  ? 'No memorized documents yet. Use the 1-Click Quick-Memorize buttons or upload a certificate above.'
                  : 'No Vault documents match your search or scheme filter.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`rounded-md border p-4 flex items-start justify-between gap-3 ${
                      editingDocId === doc.id
                        ? 'border-teal-800 dark:border-cyan-400 bg-teal-50/40 dark:bg-cyan-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-teal-800 dark:text-cyan-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-semibold">{doc.doc_type}</span>
                        <span>·</span>
                        <span>{doc.scheme_id === 'ALL' ? 'All 16 Schemes' : doc.scheme_id}</span>
                        {doc.expiry_date && (
                          <span className="text-amber-700 dark:text-amber-300">
                            · Exp: {doc.expiry_date}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {doc.title}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                        {doc.doc_number ? `Ref: ${doc.doc_number} · ` : ''}
                        Name: {doc.extracted_name || '—'}
                        {doc.extracted_income !== null
                          ? ` · ₹${doc.extracted_income.toLocaleString('en-IN')}`
                          : ''}
                        {doc.extracted_marks !== null ? ` · ${doc.extracted_marks}%` : ''}
                      </div>
                      {doc.file_name && (
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          File: {doc.file_name}
                          {doc.file_size_bytes
                            ? ` (${Math.round(doc.file_size_bytes / 1024)} KB)`
                            : ''}
                        </div>
                      )}
                      {doc.extracted_address && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{doc.extracted_address}</span>
                        </div>
                      )}
                      {doc.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 pt-0.5">
                          {doc.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditDocument(doc)}
                        className="p-1.5 text-slate-500 hover:text-teal-800 dark:hover:text-cyan-300 cursor-pointer"
                        aria-label={`Edit ${doc.title}`}
                        title="Edit document"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMemorizedDocument(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label={`Delete ${doc.title}`}
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

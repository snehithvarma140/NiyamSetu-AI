import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileCheck2,
  FileUp,
  FolderLock,
  Info,
  Layers,
  Printer,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { saveReadinessCheckToFirestore } from '../../lib/firebase';
import { StatusText } from '../../components/ui/StatusText';
import type {
  DocumentGuideMetadata,
  MemorizedDocument,
  ReadinessReport,
  SchemeProcedure8Q,
  SchemeRecord,
} from '../../types/niyamsetu';

const MAX_CLIENT_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'];

const ALL_SAMPLE_DOCS = [
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

const PACKET_PRESETS: Array<{
  label: string;
  schemeId: string;
  docs: string[];
  income: string;
  marks: string;
  nameIncome: string;
  nameMarks: string;
}> = [
  {
    label: 'PM-01 Clean Ready',
    schemeId: 'sch-pm-01',
    docs: ['Income certificate', 'Marksheet', 'Bank passbook copy'],
    income: '210000',
    marks: '78',
    nameIncome: 'Ananya Sharma',
    nameMarks: 'Ananya Sharma',
  },
  {
    label: 'PM-01 Planted Error',
    schemeId: 'sch-pm-01',
    docs: ['Income certificate', 'Marksheet'],
    income: '280000',
    marks: '72',
    nameIncome: 'Ravi Kumar',
    nameMarks: 'Ravi Kumar R',
  },
  {
    label: 'STE-02 STEM Merit',
    schemeId: 'sch-ste-02',
    docs: ['Income certificate', 'Marksheet', 'Enrolment certificate'],
    income: '320000',
    marks: '84',
    nameIncome: 'Siddharth Nair',
    nameMarks: 'Siddharth Nair',
  },
  {
    label: 'SKM-09 Saksham UDID',
    schemeId: 'sch-skm-09',
    docs: ['UDID Disability certificate', 'Income certificate', 'Marksheet', 'Bank passbook copy'],
    income: '410000',
    marks: '64',
    nameIncome: 'Karthik Varma',
    nameMarks: 'Karthik Varma',
  },
];

interface SchemeDetailResponse {
  scheme: SchemeRecord;
  procedure_8q: SchemeProcedure8Q | null;
  doc_classifications: Array<{
    doc_name: string;
    requirement_level: 'mandatory' | 'additional' | 'optional' | 'not_applicable';
    guide: DocumentGuideMetadata;
  }>;
}

interface MapFormResponse {
  mapped_fields: Record<string, string>;
  ai_summary: string;
  validation_warnings: string[];
  model_used: string;
}

interface AutoFillCompletionReceipt {
  applicationId: string;
  generatedAt: string;
  applicantName: string;
  applicantEmail: string;
  schemeCode: string;
  schemeName: string;
  handlingDepartment: string;
  officialWebsite: string;
  applicationStatus: 'draft' | 'ready_for_portal' | 'submitted_confirmed';
  mappedFields: Record<string, string>;
  providedDocuments: Array<{
    name: string;
    requirementLevel: string;
    issuingDepartment: string;
    inVault: boolean;
  }>;
  missingItems: string[];
  aiSummary: string;
  modelUsed: string;
}

export const FormSathiPage: React.FC = () => {
  const {
    token,
    user,
    firebaseUid,
    setAuthModalOpen,
    overview,
    refreshOverview,
    memorizedDocs,
    refreshUserDocuments,
    saveMemorizedDocument,
    applications,
    prepareApplicationDraft,
    updateApplicationDraft,
    activeAssistantSchemeId,
    setActiveAssistantSchemeId,
    setPage,
  } = useApp();

  const [schemeDetail, setSchemeDetail] = useState<SchemeDetailResponse | null>(null);
  const [showVisualFlow, setShowVisualFlow] = useState(false);

  const [selectedDocs, setSelectedDocs] = useState<string[]>([
    'Income certificate',
    'Marksheet',
  ]);
  const [income, setIncome] = useState(() =>
    user?.family_income != null ? String(user.family_income) : ''
  );
  const [marks, setMarks] = useState(() =>
    user?.marks_percent != null ? String(user.marks_percent) : ''
  );
  const [nameIncome, setNameIncome] = useState(() => user?.name || '');
  const [nameMarks, setNameMarks] = useState(() => user?.name || '');
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [manualOverride, setManualOverride] = useState(false);

  const [memorizingPacket, setMemorizingPacket] = useState(false);
  const [mappingForm, setMappingForm] = useState(false);
  const [mappedResult, setMappedResult] = useState<MapFormResponse | null>(null);
  const [autoFillReceipt, setAutoFillReceipt] = useState<AutoFillCompletionReceipt | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedAppId, setCopiedAppId] = useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmingPortal, setConfirmingPortal] = useState(false);
  const [portalRefInput, setPortalRefInput] = useState('');
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const [reports, setReports] = useState<ReadinessReport[]>([]);
  const [activeReport, setActiveReport] = useState<ReadinessReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schemeId = activeAssistantSchemeId || 'sch-pm-01';

  // Fetch enriched 8Q Procedure + Doc Classifications whenever schemeId changes
  useEffect(() => {
    let active = true;
    setMappedResult(null);
    setAutoFillReceipt(null);
    setDraftNotice(null);
    apiRequest<SchemeDetailResponse>(`/schemes/${schemeId}/detail`, { token })
      .then((res) => {
        if (!active) return;
        setSchemeDetail(res);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [schemeId, token]);

  // Reset stale form inputs cleanly when switching/registering a citizen account
  useEffect(() => {
    setManualOverride(false);
    setMappedResult(null);
    setAutoFillReceipt(null);
    setIncome(user?.family_income != null ? String(user.family_income) : '');
    setMarks(user?.marks_percent != null ? String(user.marks_percent) : '');
    setNameIncome(user?.name || '');
    setNameMarks(user?.name || '');
    setFormFields({
      full_name: user?.name || '',
      date_of_birth: user?.date_of_birth || '',
      guardian_name: user?.guardian_name || '',
      state_district: [user?.state, user?.district].filter(Boolean).join(', '),
      address: [user?.address, user?.pincode].filter(Boolean).join(' - '),
      institution_name: user?.institution_name || '',
      roll_number: user?.roll_number || '',
      family_income: user?.family_income != null ? String(user.family_income) : '',
      marks_percent: user?.marks_percent != null ? String(user.marks_percent) : '',
      bank_ifsc: [
        user?.bank_name,
        user?.bank_ifsc,
        user?.bank_account_last4 ? `••••${user.bank_account_last4}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      income_cert_number: user?.income_cert_number || '',
      caste_cert_number: user?.caste_cert_number || '',
    });
  }, [user?.id, user?.name]);

  // Populate fields from Saved Profile + Vault
  const applyVaultData = (docsList: MemorizedDocument[], targetSchemeId: string) => {
    const applicable = docsList.filter(
      (d) => d.scheme_id === 'ALL' || d.scheme_id === targetSchemeId
    );
    const matchedDocTypes = Array.from(
      new Set(
        applicable
          .map(
            (d) =>
              ALL_SAMPLE_DOCS.find((s) => s.toLowerCase() === d.doc_type.toLowerCase()) ||
              d.doc_type
          )
          .filter(Boolean)
      )
    );
    if (matchedDocTypes.length > 0) {
      setSelectedDocs(matchedDocTypes);
    }

    const incomeDoc = applicable.find((d) => d.doc_type.toLowerCase().includes('income'));
    const marksDoc = applicable.find((d) => d.doc_type.toLowerCase().includes('mark'));
    if (incomeDoc?.extracted_income !== null && incomeDoc?.extracted_income !== undefined) {
      setIncome(String(incomeDoc.extracted_income));
    } else if (user?.family_income !== null && user?.family_income !== undefined) {
      setIncome(String(user.family_income));
    }
    if (marksDoc?.extracted_marks !== null && marksDoc?.extracted_marks !== undefined) {
      setMarks(String(marksDoc.extracted_marks));
    } else if (user?.marks_percent !== null && user?.marks_percent !== undefined) {
      setMarks(String(user.marks_percent));
    }
    if (incomeDoc?.extracted_name) {
      setNameIncome(incomeDoc.extracted_name);
    } else if (user?.name) {
      setNameIncome(user.name);
    }
    if (marksDoc?.extracted_name) {
      setNameMarks(marksDoc.extracted_name);
    } else if (user?.name) {
      setNameMarks(user.name);
    }

    // Pre-fill Stage C 8-Q portal inputs from profile
    setFormFields((prev) => ({
      full_name: user?.name || prev.full_name || '',
      date_of_birth: user?.date_of_birth || prev.date_of_birth || '',
      guardian_name: user?.guardian_name || prev.guardian_name || '',
      state_district:
        [user?.state, user?.district].filter(Boolean).join(', ') || prev.state_district || '',
      address:
        [user?.address, user?.pincode].filter(Boolean).join(' - ') || prev.address || '',
      institution_name: user?.institution_name || prev.institution_name || '',
      roll_number: user?.roll_number || prev.roll_number || '',
      family_income:
        user?.family_income != null ? String(user.family_income) : prev.family_income || '',
      marks_percent:
        user?.marks_percent != null ? String(user.marks_percent) : prev.marks_percent || '',
      bank_ifsc:
        [
          user?.bank_name,
          user?.bank_ifsc,
          user?.bank_account_last4 ? `••••${user.bank_account_last4}` : '',
        ]
          .filter(Boolean)
          .join(' · ') ||
        prev.bank_ifsc ||
        '',
      income_cert_number: user?.income_cert_number || prev.income_cert_number || '',
      caste_cert_number: user?.caste_cert_number || prev.caste_cert_number || '',
    }));
  };

  useEffect(() => {
    if (!manualOverride && (user || memorizedDocs.length > 0)) {
      applyVaultData(memorizedDocs, schemeId);
    }
  }, [user?.id, user?.family_income, user?.marks_percent, memorizedDocs.length, schemeId, manualOverride]);

  const loadReports = async () => {
    if (!token) return;
    try {
      const res = await apiRequest<{ reports: ReadinessReport[] }>('/formsathi/reports', {
        token,
      });
      setReports(res.reports);
      if (!activeReport && res.reports.length > 0) {
        setActiveReport(res.reports[0]);
      }
    } catch {
      // ignore if unauthenticated
    }
  };

  useEffect(() => {
    void loadReports();
  }, [token]);

  const currentSchemeDraft = useMemo(
    () => applications.find((a) => a.scheme_id === schemeId) || null,
    [applications, schemeId]
  );

  useEffect(() => {
    if (currentSchemeDraft?.portal_reference_number) {
      setPortalRefInput(currentSchemeDraft.portal_reference_number);
    }
  }, [currentSchemeDraft?.id]);

  const toggleDoc = (docName: string) => {
    setManualOverride(true);
    setSelectedDocs((prev) =>
      prev.includes(docName) ? prev.filter((d) => d !== docName) : [...prev, docName]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) {
      setAuthModalOpen(true);
      e.target.value = '';
      return;
    }

    setError(null);
    setExtractNote(null);

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      setError('Unsupported format. Accepted formats: .pdf, .png, .jpg, .jpeg, .txt');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
      setError('File exceeds the 5 MB security limit. Please compress or upload a smaller file.');
      e.target.value = '';
      return;
    }

    setExtracting(true);
    try {
      const isText = file.type.startsWith('text/') || lowerName.endsWith('.txt');
      const payload: Record<string, unknown> = {
        fileName: file.name,
        fileSizeBytes: file.size,
        saveToVault: true,
        schemeId,
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
          applicant_name: string | null;
          family_income: number | null;
          marks_percent: number | null;
          readability: string;
          notes: string;
        };
      }>('/formsathi/extract-file', {
        method: 'POST',
        token,
        body: payload,
      });

      const ext = res.extracted;
      setManualOverride(true);
      if (ext.family_income !== null) setIncome(String(ext.family_income));
      if (ext.marks_percent !== null) setMarks(String(ext.marks_percent));
      if (ext.applicant_name) setNameIncome(ext.applicant_name);
      const matched = ALL_SAMPLE_DOCS.find(
        (d) => d.toLowerCase() === ext.detected_document_type.toLowerCase()
      );
      if (matched) {
        setSelectedDocs((prev) => (prev.includes(matched) ? prev : [...prev, matched]));
      }
      await refreshUserDocuments();
      setExtractNote(
        `Extracted from ${file.name} (${(file.size / 1024).toFixed(0)} KB): ${ext.detected_document_type} (${ext.readability}). Memorized to Vault. ${ext.notes}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File extraction failed.');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  const handleMemorizePacket = async () => {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setMemorizingPacket(true);
    setError(null);
    setExtractNote(null);
    try {
      for (const docType of selectedDocs) {
        const isIncome = docType.toLowerCase().includes('income');
        const isMarks = docType.toLowerCase().includes('mark');
        await saveMemorizedDocument({
          doc_type: docType,
          title: `${docType} (${schemeId.toUpperCase()})`,
          scheme_id: 'ALL',
          extracted_name: isMarks ? nameMarks : nameIncome || user?.name || '',
          extracted_income: isIncome && income !== '' ? Number(income) : null,
          extracted_marks: isMarks && marks !== '' ? Number(marks) : null,
          extracted_address: user?.address || '',
          source_activity: 'formsathi_extract',
          syncProfile: isIncome || isMarks,
        });
      }
      setExtractNote(
        `Memorized ${selectedDocs.length} document(s) and extracted profile values to your Vault.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to memorize packet.');
    } finally {
      setMemorizingPacket(false);
    }
  };

  const handleMapFormWithAI = async () => {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setMappingForm(true);
    setError(null);
    try {
      const overridesPayload: Record<string, string> = {
        ...formFields,
        ...(user?.name && !formFields.full_name ? { full_name: user.name } : {}),
        ...(income !== '' ? { family_income: income } : {}),
        ...(marks !== '' ? { marks_percent: marks } : {}),
      };
      const res = await apiRequest<MapFormResponse>('/formsathi/map-form', {
        method: 'POST',
        token,
        body: { schemeId, overrides: overridesPayload },
      });
      const mergedFields: Record<string, string> = {
        ...formFields,
        ...res.mapped_fields,
      };
      if (!mergedFields.full_name && user?.name) {
        mergedFields.full_name = user.name;
      }
      setMappedResult(res);
      setFormFields(mergedFields);

      const missingItems = [
        ...(res.validation_warnings || []),
        ...(activeReport?.missing.map((m) => m.item) || []),
      ];
      const uniqueMissing = Array.from(new Set(missingItems));
      const targetStatus: 'draft' | 'ready_for_portal' =
        uniqueMissing.length === 0 ? 'ready_for_portal' : 'draft';

      const savedApp = await prepareApplicationDraft({
        ...(currentSchemeDraft && currentSchemeDraft.status !== 'submitted_confirmed'
          ? { id: currentSchemeDraft.id }
          : {}),
        schemeId,
        form_fields: mergedFields,
        attached_documents: selectedDocs,
        missing_requirements: uniqueMissing,
        ai_mapping_summary: res.ai_summary,
        status: targetStatus,
      });

      const docClassList = schemeDetail?.doc_classifications || [];
      const providedDocuments = selectedDocs.map((docName) => {
        const cls = docClassList.find(
          (c) => c.doc_name.toLowerCase() === docName.toLowerCase()
        );
        const inVault = memorizedDocs.some(
          (d) => d.doc_type.toLowerCase() === docName.toLowerCase()
        );
        return {
          name: docName,
          requirementLevel: cls?.requirement_level || 'supporting',
          issuingDepartment: cls?.guide?.issuing_department || 'Competent Government Authority',
          inVault,
        };
      });

      setAutoFillReceipt({
        applicationId: savedApp.id,
        generatedAt: new Date().toISOString(),
        applicantName: user?.name || mergedFields.full_name || 'Citizen Applicant',
        applicantEmail: user?.email || '',
        schemeCode: savedApp.scheme_code || schemeDetail?.scheme.code || schemeId,
        schemeName: savedApp.scheme_name || schemeDetail?.scheme.name || '',
        handlingDepartment:
          schemeDetail?.scheme.handling_department ||
          schemeDetail?.scheme.authority ||
          'Government Welfare Department',
        officialWebsite:
          schemeDetail?.procedure_8q?.official_website ||
          schemeDetail?.scheme.official_website ||
          savedApp.portal_url ||
          '',
        applicationStatus: savedApp.status,
        mappedFields: mergedFields,
        providedDocuments,
        missingItems: uniqueMissing,
        aiSummary: res.ai_summary,
        modelUsed: res.model_used,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI form mapping failed.');
    } finally {
      setMappingForm(false);
    }
  };

  const runCheck = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await apiRequest<{ report: ReadinessReport }>('/formsathi/check', {
        method: 'POST',
        token,
        body: {
          schemeId,
          uploadedDocuments: selectedDocs,
          family_income: income === '' ? null : Number(income),
          marks_percent: marks === '' ? null : Number(marks),
          name_on_income_cert: nameIncome,
          name_on_marksheet: nameMarks,
        },
      });
      setActiveReport(res.report);
      if (firebaseUid) {
        void saveReadinessCheckToFirestore({
          id: res.report.id,
          ownerId: firebaseUid,
          schemeId: res.report.scheme_id,
          applicantLabel: res.report.applicant_label,
          completedCount: res.report.completed.length,
          missingCount: res.report.missing.length,
          uncertainCount: res.report.uncertain.length,
        }).catch(() => undefined);
      }
      await loadReports();
      await refreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Readiness check failed.');
    } finally {
      setChecking(false);
    }
  };

  const handleSaveDraft = async (targetStatus: 'draft' | 'ready_for_portal') => {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setSavingDraft(true);
    setError(null);
    setDraftNotice(null);
    try {
      const missingItems = [
        ...(mappedResult?.validation_warnings || []),
        ...(activeReport?.missing.map((m) => m.item) || []),
      ];
      const saved = await prepareApplicationDraft({
        ...(currentSchemeDraft && currentSchemeDraft.status !== 'submitted_confirmed'
          ? { id: currentSchemeDraft.id }
          : {}),
        schemeId,
        form_fields: formFields,
        attached_documents: selectedDocs,
        missing_requirements: Array.from(new Set(missingItems)),
        ai_mapping_summary:
          mappedResult?.ai_summary ||
          `Prepared ${selectedDocs.length} document(s) and ${Object.values(formFields).filter(Boolean).length} portal field(s).`,
        status: targetStatus,
      });
      setDraftNotice(
        `Saved application as "${saved.status.replace(/_/g, ' ')}" (${saved.scheme_code}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save application draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleConfirmPortalSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !currentSchemeDraft) return;
    setConfirmingPortal(true);
    setError(null);
    setDraftNotice(null);
    try {
      const updated = await updateApplicationDraft(currentSchemeDraft.id, {
        confirmPortalSubmission: true,
        portal_reference_number: portalRefInput.trim() || undefined,
      });
      setDraftNotice(
        `Confirmed official portal submission for ${updated.scheme_code}${
          updated.portal_reference_number ? ` (Ref: ${updated.portal_reference_number})` : ''
        }.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record submission confirmation.');
    } finally {
      setConfirmingPortal(false);
    }
  };

  const buildReceiptText = (receipt: AutoFillCompletionReceipt): string => {
    return [
      'NIYAMSETU AI — AUTO-FILL APPLICATION & COMPLETION RECEIPT',
      '====================================================================',
      `Application Tracking ID : ${receipt.applicationId}`,
      `Generated At            : ${new Date(receipt.generatedAt).toLocaleString('en-IN')}`,
      `Status                  : ${receipt.applicationStatus.replace(/_/g, ' ').toUpperCase()}`,
      `Applicant Name          : ${receipt.applicantName}`,
      receipt.applicantEmail ? `Applicant Email         : ${receipt.applicantEmail}` : '',
      `Scheme                  : ${receipt.schemeCode} — ${receipt.schemeName}`,
      `Department              : ${receipt.handlingDepartment}`,
      `Official Portal         : ${receipt.officialWebsite}`,
      '',
      '--- AUTO-FILLED APPLICATION FIELDS ---',
      ...Object.entries(receipt.mappedFields)
        .filter(([, val]) => val.trim() !== '')
        .map(([k, val]) => `${k}: ${val}`),
      '',
      '--- DOCUMENTS PROVIDED BY WEBSITE PACKET & VAULT ---',
      ...receipt.providedDocuments.map(
        (d, idx) =>
          `${idx + 1}. ${d.name} [${d.requirementLevel.toUpperCase()}] — ${d.issuingDepartment}${
            d.inVault ? ' (Memorized in Vault)' : ' (Attached in Packet)'
          }`
      ),
      ...(receipt.missingItems.length > 0
        ? ['', '--- ACTION / ITEMS PENDING ---', ...receipt.missingItems.map((m) => `! ${m}`)]
        : []),
      '',
      'Summary:',
      receipt.aiSummary,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopyPreparedSummary = async () => {
    const text = autoFillReceipt
      ? buildReceiptText(autoFillReceipt)
      : [
          `Scheme: ${schemeDetail?.scheme.code || schemeId} — ${schemeDetail?.scheme.name || ''}`,
          `Portal: ${schemeDetail?.procedure_8q?.official_website || schemeDetail?.scheme.official_website || ''}`,
          '--- Prepared Portal Entries ---',
          ...Object.entries(formFields)
            .filter(([, val]) => val.trim() !== '')
            .map(([k, val]) => `${k}: ${val}`),
          '--- Attached Documents ---',
          ...selectedDocs.map((d) => `• ${d}`),
        ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleDownloadReceipt = () => {
    if (!autoFillReceipt) return;
    const text = buildReceiptText(autoFillReceipt);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${autoFillReceipt.schemeCode}-${autoFillReceipt.applicationId}-receipt.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteReport = async (id: string) => {
    if (!token) return;
    try {
      setError(null);
      await apiRequest(`/formsathi/reports/${id}`, { method: 'DELETE', token });
      if (activeReport?.id === id) setActiveReport(null);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete readiness report.');
    }
  };

  const proc8q = schemeDetail?.procedure_8q;
  const docClassifications = schemeDetail?.doc_classifications || [];

  return (
    <div className="space-y-6">
      {!user && (
        <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center justify-between gap-4 text-sm">
          <span>Sign in to save mapped drafts, Vault documents, and readiness reports.</span>
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="px-3 py-1.5 rounded bg-teal-800 text-white text-xs font-semibold cursor-pointer"
          >
            Sign In
          </button>
        </div>
      )}

      {/* STAGE A: Select Scheme or Service */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-mono font-bold text-teal-800 dark:text-cyan-300 uppercase">
              Stage A · Select Scheme or Service
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {schemeDetail?.scheme.code} — {schemeDetail?.scheme.name || 'Loading scheme...'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {schemeDetail?.scheme.authority} · Opens{' '}
              {schemeDetail?.scheme.opening_date || '2026-07-15'} · Deadline{' '}
              <strong className="text-amber-700 dark:text-amber-300">
                {schemeDetail?.scheme.deadline_date || '2026-12-31'}
              </strong>
            </p>
          </div>

          <select
            value={schemeId}
            onChange={(e) => setActiveAssistantSchemeId(e.target.value)}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm max-w-md"
            aria-label="Select scheme in Application Assistant"
          >
            {(overview?.schemes || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* STAGE B: Understand the 8-Question Scheme Procedure & Visual Process Flow */}
      {proc8q && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <span className="text-[11px] font-mono font-bold text-teal-800 dark:text-cyan-300 uppercase">
                Stage B · Understand the Scheme Procedure (8 Core Questions)
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Tailored Application Guide for {proc8q.scheme_code}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowVisualFlow((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-teal-700 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
              <span>{showVisualFlow ? 'Hide Visual Flow Diagrams' : 'Show Visual Flow Diagrams'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
              <div className="font-bold text-teal-800 dark:text-cyan-300">
                1. What is this application for?
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {proc8q.what_is_application_for}
              </p>
            </div>
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
              <div className="font-bold text-teal-800 dark:text-cyan-300">2. Who can apply?</div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {proc8q.who_can_apply}
              </p>
            </div>
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
              <div className="font-bold text-teal-800 dark:text-cyan-300">
                3. What info is needed?
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300">
                {proc8q.what_info_needed.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
              <div className="font-bold text-teal-800 dark:text-cyan-300">
                4. Official Website
              </div>
              <a
                href={proc8q.official_website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-teal-800 dark:text-cyan-300 hover:underline break-all"
              >
                <span>{proc8q.official_website}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <div className="text-[11px] text-slate-500 pt-1">
                Mandatory docs: {proc8q.what_documents_required.length} · Additional:{' '}
                {proc8q.additional_documents.length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3">
              <strong className="text-slate-900 dark:text-slate-100">
                7. What happens after submission:
              </strong>{' '}
              <span className="text-slate-600 dark:text-slate-300">
                {proc8q.what_happens_after_submission}
              </span>
            </div>
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3">
              <strong className="text-slate-900 dark:text-slate-100">
                8. How to track status:
              </strong>{' '}
              <span className="text-slate-600 dark:text-slate-300">{proc8q.how_to_track}</span>
            </div>
          </div>

          {showVisualFlow && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <figure className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-2">
                <img
                  src="/src/assets/images/scheme_process_flow_1795510220066.jpg"
                  alt="End-to-End Application Lifecycle Visual Flow"
                  referrerPolicy="no-referrer"
                  className="w-full h-44 object-contain rounded bg-white"
                />
                <figcaption className="text-[11px] text-slate-600 dark:text-slate-400">
                  Stage 1–5 Process Flow: Document Collection → Eligibility Verification → Official
                  Portal OTR Filing → Officer Verification → DBT Credit.
                </figcaption>
              </figure>
              <figure className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-2">
                <img
                  src="/src/assets/images/document_verification_flow_1795510201705.jpg"
                  alt="Document Convergence and Verification Flow"
                  referrerPolicy="no-referrer"
                  className="w-full h-44 object-contain rounded bg-white"
                />
                <figcaption className="text-[11px] text-slate-600 dark:text-slate-400">
                  Document Convergence: Income, Marksheet, Aadhaar/Domicile, Bank Passbook &amp;
                  Special Proofs verified for exact spelling match.
                </figcaption>
              </figure>
            </div>
          )}
        </section>
      )}

      {/* STAGE C & D: Required Information & Document Upload / Vault Validation */}
      <form onSubmit={runCheck} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stage D: Document Packet & Classifications */}
        <div className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold text-teal-800 dark:text-cyan-300 uppercase">
              Stage D · Documents &amp; Vault Validation
            </span>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Required vs Additional Documents
              </h2>
              {user && (
                <button
                  type="button"
                  onClick={() => setPage('profile_vault')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer"
                >
                  <FolderLock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Vault ({memorizedDocs.length})</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setManualOverride(false);
                    applyVaultData(memorizedDocs, schemeId);
                    setExtractNote(
                      `Loaded ${memorizedDocs.length} memorized document(s) and saved profile fields.`
                    );
                  }}
                  className="px-2 py-1 rounded border border-teal-700 dark:border-cyan-400 bg-teal-50 dark:bg-cyan-950/30 text-[11px] font-semibold text-teal-900 dark:text-cyan-200 cursor-pointer"
                >
                  Load from Memorized Vault ({memorizedDocs.length})
                </button>
              )}
              {PACKET_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setManualOverride(true);
                    setActiveAssistantSchemeId(preset.schemeId);
                    setSelectedDocs(preset.docs);
                    setIncome(preset.income);
                    setMarks(preset.marks);
                    setNameIncome(preset.nameIncome);
                    setNameMarks(preset.nameMarks);
                  }}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-medium text-teal-800 dark:text-cyan-300 hover:border-teal-700 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
            {ALL_SAMPLE_DOCS.map((docName) => {
              const checked = selectedDocs.includes(docName);
              const cls = docClassifications.find(
                (c) => c.doc_name.toLowerCase() === docName.toLowerCase()
              );
              const level = cls?.requirement_level || 'optional';
              return (
                <label
                  key={docName}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDoc(docName)}
                      className="accent-teal-800 dark:accent-cyan-400 shrink-0"
                    />
                    <span className="truncate font-medium">{docName}</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase shrink-0 ${
                      level === 'mandatory'
                        ? 'text-rose-700 dark:text-rose-400'
                        : level === 'additional'
                          ? 'text-amber-700 dark:text-amber-300'
                          : level === 'not_applicable'
                            ? 'text-slate-400 dark:text-slate-500'
                            : 'text-teal-700 dark:text-cyan-400'
                    }`}
                  >
                    {level.replace('_', ' ')}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Upload &amp; Validate Document (.pdf, .png, .jpg, .txt · Max 5 MB)
            </label>
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-teal-700 cursor-pointer">
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>{extracting ? 'Validating & memorizing...' : 'Upload & memorize document'}</span>
              <input
                type="file"
                accept=".txt,.pdf,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                disabled={extracting}
                className="hidden"
              />
            </label>
            {extractNote && (
              <p className="text-xs text-teal-800 dark:text-cyan-300">{extractNote}</p>
            )}
          </div>
        </div>

        {/* Stage C + E: Scheme-Specific Info Collection, Consistency Inputs & Mapping */}
        <div className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-mono font-bold text-teal-800 dark:text-cyan-300 uppercase">
                Stage C &amp; E · Collect Scheme Info &amp; AI Form Mapping
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Portal Fields, Consistency &amp; Readiness Check
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualOverride(true);
                setSelectedDocs(['Income certificate', 'Marksheet']);
                setIncome('280000');
                setMarks('72');
                setNameIncome(user?.name || 'Citizen Applicant');
                setNameMarks(`${user?.name || 'Citizen Applicant'} R`);
              }}
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
            >
              Load planted-error sample
            </button>
          </div>

          <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
            <span>
              Security Policy: Never enter official portal passwords, Aadhaar OTPs, banking PINs, or
              CVVs. Only draft application readiness fields are stored.
            </span>
          </div>

          {/* Core Eligibility & Spelling Consistency Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Family Annual Income (₹)
              </label>
              <input
                type="number"
                value={income}
                onChange={(e) => {
                  setManualOverride(true);
                  setIncome(e.target.value);
                }}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Qualifying Marks (%)
              </label>
              <input
                type="number"
                value={marks}
                onChange={(e) => {
                  setManualOverride(true);
                  setMarks(e.target.value);
                }}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Applicant Name on Income Certificate
              </label>
              <input
                type="text"
                value={nameIncome}
                onChange={(e) => {
                  setManualOverride(true);
                  setNameIncome(e.target.value);
                }}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Applicant Name on Marksheet
              </label>
              <input
                type="text"
                value={nameMarks}
                onChange={(e) => {
                  setManualOverride(true);
                  setNameMarks(e.target.value);
                }}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Scheme-Specific 8-Q Input Fields with "Why this is asked" */}
          {proc8q && proc8q.what_to_enter.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Official Portal Fields ({proc8q.scheme_code}) — Hover/Read Why Each Field Is Needed:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {proc8q.what_to_enter.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {field.label} {field.required && <span className="text-rose-600">*</span>}
                      </label>
                      <span
                        title={field.why_asked}
                        className="inline-flex items-center gap-1 text-[10px] text-teal-800 dark:text-cyan-300 cursor-help"
                      >
                        <Info className="w-3 h-3" />
                        <span>Why asked?</span>
                      </span>
                    </div>
                    <input
                      type="text"
                      value={formFields[field.key] || ''}
                      onChange={(e) =>
                        setFormFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.why_asked}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {field.why_asked}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={mappingForm}
              onClick={() => void handleMapFormWithAI()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-teal-800 dark:border-cyan-400 text-teal-900 dark:text-cyan-200 hover:bg-teal-50 dark:hover:bg-cyan-950/30 text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{mappingForm ? 'Mapping Fields...' : 'Auto-Fill & Map Form (AI)'}</span>
            </button>

            <button
              type="submit"
              disabled={checking}
              className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              {checking ? 'Validating...' : 'Run Readiness Check'}
            </button>

            <button
              type="button"
              disabled={memorizingPacket || selectedDocs.length === 0}
              onClick={() => void handleMemorizePacket()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 hover:border-teal-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <FolderLock className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" aria-hidden="true" />
              <span>{memorizingPacket ? 'Memorizing...' : 'Memorize Packet to Vault'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Official Auto-Fill Completion Receipt & Document Packet */}
      {mappedResult && (
        <section
          aria-label="Auto-Fill Completion Receipt and Documents Summary"
          className="rounded-lg border-2 border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 p-5 space-y-5 shadow-sm"
        >
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Auto-Fill Completed Successfully · Official Application Receipt</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {autoFillReceipt
                  ? `${autoFillReceipt.schemeCode} — ${autoFillReceipt.schemeName}`
                  : `AI Portal Form Mapping Summary · ${mappedResult.model_used}`}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Applicant:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {autoFillReceipt?.applicantName || user?.name || formFields.full_name}
                </strong>
                {autoFillReceipt && (
                  <>
                    {' '}
                    · Department: {autoFillReceipt.handlingDepartment} · Generated{' '}
                    {new Date(autoFillReceipt.generatedAt).toLocaleString('en-IN')}
                  </>
                )}
              </p>
            </div>

            {autoFillReceipt && (
              <div className="rounded-md border border-teal-200 dark:border-cyan-800 bg-teal-50/70 dark:bg-cyan-950/30 px-3.5 py-2.5 space-y-1 shrink-0">
                <div className="text-[10px] font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Trackable Application ID (Use on Dashboard)
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-teal-900 dark:text-cyan-200">
                    {autoFillReceipt.applicationId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(autoFillReceipt.applicationId)
                        .then(() => {
                          setCopiedAppId(true);
                          setTimeout(() => setCopiedAppId(false), 2000);
                        })
                        .catch(() => undefined);
                    }}
                    className="px-2 py-0.5 rounded border border-teal-700 dark:border-cyan-400 text-[11px] font-semibold text-teal-900 dark:text-cyan-200 cursor-pointer"
                  >
                    {copiedAppId ? 'Copied!' : 'Copy ID'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 p-3">
            {mappedResult.ai_summary}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Auto-Filled Form Fields Table */}
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Auto-Filled Application Fields
              </h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {Object.entries(autoFillReceipt?.mappedFields || formFields)
                  .filter(([, val]) => String(val).trim() !== '')
                  .map(([key, val]) => (
                    <div key={key} className="py-1.5 flex items-center justify-between gap-3">
                      <span className="font-mono text-slate-500 dark:text-slate-400 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                        {val}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Documents Provided by Website Packet */}
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Documents Provided by Website Packet (
                {autoFillReceipt?.providedDocuments.length ?? selectedDocs.length})
              </h3>
              <ul className="space-y-2 text-xs">
                {(autoFillReceipt?.providedDocuments ||
                  selectedDocs.map((d) => ({
                    name: d,
                    requirementLevel: 'supporting',
                    issuingDepartment: 'Verified Government Authority',
                    inVault: false,
                  }))
                ).map((docItem) => (
                  <li
                    key={docItem.name}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{docItem.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 pl-5">
                        Issued by: {docItem.issuingDepartment}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-bold uppercase text-teal-800 dark:text-cyan-300 shrink-0">
                      {docItem.inVault ? 'In Vault' : docItem.requirementLevel.replace('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {mappedResult.validation_warnings.length > 0 && (
            <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Action Required Before Official Portal Submission:</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {mappedResult.validation_warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyPreparedSummary()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-teal-700 dark:border-cyan-500 text-xs font-semibold text-teal-900 dark:text-cyan-200 cursor-pointer"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span>{copiedSummary ? 'Copied Full Receipt!' : 'Copy Receipt & Fields'}</span>
              </button>
              {autoFillReceipt && (
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Receipt (.txt)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPage('student_home')}
              className="px-3.5 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              Track Application ID on Dashboard →
            </button>
          </div>
        </section>
      )}

      {/* Deterministic Readiness Report */}
      {activeReport && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Application Readiness Report — {activeReport.applicant_label}
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Generated {new Date(activeReport.generated_at).toLocaleString('en-IN')} ·{' '}
                {activeReport.completed.length} completed · {activeReport.missing.length} missing ·{' '}
                {activeReport.uncertain.length} uncertain
              </p>
            </div>
            <StatusText
              status={
                activeReport.missing.length === 0 && activeReport.uncertain.length === 0
                  ? 'verified'
                  : 'pending_review'
              }
              labelOverride={
                activeReport.missing.length === 0 && activeReport.uncertain.length === 0
                  ? 'All checked items ready'
                  : 'Action / review needed'
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Completed Requirements', items: activeReport.completed },
              { title: 'Missing or Not Met', items: activeReport.missing },
              { title: 'Uncertain — Review Needed', items: activeReport.uncertain },
            ].map((group) => (
              <div
                key={group.title}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {group.title}
                  </h3>
                  <span className="font-mono text-xs tabular-nums text-slate-500">
                    {group.items.length}
                  </span>
                </div>

                {group.items.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">None</p>
                ) : (
                  <ul className="space-y-3">
                    {group.items.map((it, idx) => (
                      <li key={idx} className="text-xs space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {it.item}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300">{it.reason}</div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {it.citation}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
            {activeReport.disclaimer}
          </p>
        </section>
      )}

      {/* STAGE F & G: Guided Official Portal Handoff + Save Draft & Explicit Confirmation */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <span className="text-[11px] font-mono font-bold text-teal-800 dark:text-cyan-300 uppercase">
              Stage F &amp; G · Official Portal Handoff &amp; Submission Confirmation
            </span>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Save Draft &amp; Confirm Official Submission Yourself
            </h2>
          </div>
          {currentSchemeDraft && <StatusText status={currentSchemeDraft.status} />}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Save Draft & Open Official Portal */}
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3 text-xs">
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              Save your prepared packet as a draft or mark it{' '}
              <strong>Ready for Portal</strong>. Then open the official portal, complete CAPTCHA/OTP
              sign-in yourself, and submit.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={savingDraft || !user}
                onClick={() => void handleSaveDraft('draft')}
                className="px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold cursor-pointer disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={savingDraft || !user}
                onClick={() => void handleSaveDraft('ready_for_portal')}
                className="px-3.5 py-2 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingDraft ? 'Saving...' : 'Mark Ready for Official Portal'}
              </button>
              {schemeDetail?.scheme.official_website && (
                <a
                  href={schemeDetail.scheme.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-teal-700 dark:border-cyan-400 text-teal-800 dark:text-cyan-300 font-semibold hover:bg-teal-50 dark:hover:bg-cyan-950/30"
                >
                  <span>Open Official Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            {draftNotice && (
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{draftNotice}</span>
              </div>
            )}
          </div>

          {/* Explicit Submission Confirmation */}
          <form
            onSubmit={handleConfirmPortalSubmission}
            className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3 text-xs"
          >
            <div className="font-bold text-slate-900 dark:text-slate-100">
              Already submitted on the official government website?
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              NiyamSetu never invents confirmation numbers. Only confirm below after you actually
              receive your acknowledgement on the official portal.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={portalRefInput}
                onChange={(e) => setPortalRefInput(e.target.value)}
                placeholder="Optional Official Acknowledgement / Ref No."
                className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono"
              />
              <button
                type="submit"
                disabled={!currentSchemeDraft || confirmingPortal}
                className="px-3.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                {confirmingPortal ? 'Recording...' : 'Confirm Portal Submission'}
              </button>
            </div>
            {!currentSchemeDraft && (
              <p className="text-[11px] text-slate-500">
                Save a draft on the left first to enable portal submission confirmation.
              </p>
            )}
          </form>
        </div>
      </section>

      {reports.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Your Saved Readiness Checks (Private to {user?.name})
          </h3>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {reports.map((rep) => (
              <div key={rep.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveReport(rep)}
                  className="text-left hover:text-teal-800 dark:hover:text-cyan-300 cursor-pointer"
                >
                  <span className="font-semibold">{rep.applicant_label}</span> ·{' '}
                  <span className="font-mono tabular-nums text-slate-500">
                    {new Date(rep.generated_at).toLocaleString('en-IN')}
                  </span>{' '}
                  · {rep.completed.length} ok / {rep.missing.length} missing /{' '}
                  {rep.uncertain.length} uncertain
                </button>
                <button
                  type="button"
                  onClick={() => deleteReport(rep.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  aria-label="Delete readiness report"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

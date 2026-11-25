import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileText,
  FolderLock,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { SpeakButton } from '../../components/voice/SpeakButton';
import { CitizenEcosystem3DScene } from '../../components/three/CitizenEcosystem3DScene';
import type {
  MemorizedDocument,
  ProcedureStep,
  RequiredDocument,
  RuleRecord,
  SchemeRecord,
} from '../../types/niyamsetu';

interface ProcedureResponse {
  scheme: SchemeRecord;
  steps: ProcedureStep[];
  required_documents: RequiredDocument[];
  active_rules: Array<RuleRecord & { display_value: string; citation: string }>;
}

const PROCESS_PIPELINE_STAGES = [
  {
    stage: '01',
    title: 'Document Collection & Vault',
    subtitle: 'Gather & memorize Aadhaar, Income, Marks, Caste/UDID & Bank Proof',
  },
  {
    stage: '02',
    title: 'Eligibility & Name Check',
    subtitle: 'Verify income ceiling, marks cutoff & exact spelling match across certs',
  },
  {
    stage: '03',
    title: 'Portal Filing & OTR',
    subtitle: 'Submit application on NSP / ePass / AICTE / State Portal before cutoff',
  },
  {
    stage: '04',
    title: 'Institute & Officer Scrutiny',
    subtitle: 'Bonafide attestation & Mandal / District Welfare Officer verification',
  },
  {
    stage: '05',
    title: 'DBT Bank Credit',
    subtitle: 'NPCI Aadhaar-seeded account validation & direct benefit transfer',
  },
];

function inferAuthorityHint(docName: string): string {
  const lower = docName.toLowerCase();
  if (lower.includes('income')) return 'Tehsildar / MeeSeva e-District Portal (Valid FY Certificate)';
  if (lower.includes('mark') || lower.includes('grade') || lower.includes('score'))
    return 'Examination Board / University Registrar (Self-attested + Institute seal)';
  if (lower.includes('bank') || lower.includes('passbook') || lower.includes('ifsc'))
    return 'Scheduled Bank Branch (Active Aadhaar-seeded NPCI DBT account)';
  if (
    lower.includes('enrol') ||
    lower.includes('bonafide') ||
    lower.includes('admission') ||
    lower.includes('institute') ||
    lower.includes('fee')
  )
    return 'Head of Institution / College Principal (Official Stamp & Reg. No.)';
  if (lower.includes('caste') || lower.includes('community') || lower.includes('ews'))
    return 'Mandal Revenue Officer / Sub-Collector (Digital Barcode Verified)';
  if (lower.includes('udid') || lower.includes('disab'))
    return 'District Medical Board / SWAVALAMBAN UDID Portal (>=40% Benchmark)';
  if (lower.includes('hostel') || lower.includes('warden'))
    return 'Welfare Hostel Warden / Institutional Hostel Superintendent';
  if (lower.includes('land') || lower.includes('pattadar') || lower.includes('rythu'))
    return 'Revenue Mandal Office / Dharani / Webland Passbook';
  if (lower.includes('defence') || lower.includes('service') || lower.includes('ppo'))
    return 'Zila Sainik Board / Unit Commanding Officer / Home Dept.';
  if (lower.includes('sport') || lower.includes('medal'))
    return 'State Sports Authority / Recognized National Federation';
  if (lower.includes('research') || lower.includes('gate') || lower.includes('synopsis'))
    return 'University Research Cell / NTA Score Portal & Supervisor Approval';
  if (lower.includes('nsqf') || lower.includes('skill') || lower.includes('training'))
    return 'NSDC / Sector Skill Council Accredited Assessment Partner';
  if (lower.includes('aadhaar') || lower.includes('otr') || lower.includes('identity'))
    return 'UIDAI e-KYC / NSP One-Time Registration Portal';
  return 'Issuing Competent Authority / Self-attested Copy';
}

function isDocInVault(docName: string, memorizedDocs: MemorizedDocument[]): MemorizedDocument | null {
  const norm = docName.toLowerCase().trim();
  const tokens = norm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['certificate', 'proof', 'copy', 'official'].includes(w));

  for (const m of memorizedDocs) {
    const mText = `${m.doc_type} ${m.title}`.toLowerCase();
    if (mText.includes(norm) || norm.includes(m.doc_type.toLowerCase())) {
      return m;
    }
    if (tokens.some((tok) => mText.includes(tok))) {
      return m;
    }
  }
  return null;
}

function matchStepRequiredDocuments(
  step: ProcedureStep,
  allDocs: RequiredDocument[]
): RequiredDocument[] {
  if (allDocs.length === 0) return [];

  // 1. Direct rule key match
  const direct = allDocs.filter(
    (d) => step.linked_rule_key && d.linked_rule_key === step.linked_rule_key
  );

  // 2. Semantic keyword matching between step description/title and document text
  const stepText = `${step.title} ${step.description} ${step.linked_rule_key}`.toLowerCase();
  const keywordGroups: Array<[string[], string[]]> = [
    [
      ['income', 'ceiling', 'ews', 'parent', 'revenue', 'tehsildar', 'meeseva'],
      ['income', 'ews', 'revenue'],
    ],
    [
      ['mark', 'percent', 'merit', 'score', 'academic', 'exam', 'cgpa', 'gate', 'net'],
      ['mark', 'score', 'gate', 'academic', 'degree'],
    ],
    [
      ['bank', 'ifsc', 'dbt', 'passbook', 'account', 'npci', 'disburs', 'stipend'],
      ['bank', 'passbook', 'ifsc', 'account', 'dbt'],
    ],
    [
      ['enrol', 'bonafide', 'admit', 'admission', 'college', 'institution', 'upload', 'portal', 'otr'],
      ['enrol', 'bonafide', 'admission', 'aadhaar', 'otr', 'id', 'fee'],
    ],
    [
      ['caste', 'community', 'sc', 'st', 'obc', 'minority', 'tribal'],
      ['caste', 'community', 'minority', 'tribal'],
    ],
    [
      ['udid', 'disab', 'saksham'],
      ['udid', 'disab'],
    ],
    [
      ['hostel', 'warden', 'attendance'],
      ['hostel', 'warden', 'attendance'],
    ],
    [
      ['land', 'rythu', 'agri', 'farmer', 'pattadar'],
      ['land', 'pattadar', 'rythu', 'farmer'],
    ],
    [
      ['defence', 'police', 'martyr', 'ppo', 'sainik'],
      ['service', 'ppo', 'defence', 'discharge', 'martyr'],
    ],
    [
      ['sport', 'medal', 'khelo', 'federation'],
      ['sport', 'medal', 'federation'],
    ],
    [
      ['skill', 'nsqf', 'nsdc', 'training'],
      ['nsqf', 'skill', 'aadhaar', 'bank'],
    ],
  ];

  const semanticMatched = allDocs.filter((doc) => {
    const docText = `${doc.name} ${doc.description} ${doc.linked_rule_key}`.toLowerCase();
    return keywordGroups.some(
      ([stepKeys, docKeys]) =>
        stepKeys.some((k) => stepText.includes(k)) && docKeys.some((dk) => docText.includes(dk))
    );
  });

  const combinedMap = new Map<string, RequiredDocument>();
  for (const d of [...direct, ...semanticMatched]) {
    combinedMap.set(d.id, d);
  }

  // Ensure every stage visibly displays concrete required documents (no empty step dossier)
  if (combinedMap.size === 0) {
    if (step.order_number === 1) {
      allDocs.slice(0, 2).forEach((d) => combinedMap.set(d.id, d));
    } else if (step.order_number === 2) {
      allDocs.slice(1, 4).forEach((d) => combinedMap.set(d.id, d));
    } else {
      allDocs.forEach((d) => combinedMap.set(d.id, d));
    }
  }

  return Array.from(combinedMap.values());
}

export const ProceduresPage: React.FC = () => {
  const { lang, token, overview, memorizedDocs, setPage } = useApp();
  const [schemeId, setSchemeId] = useState<string>(() => {
    const pendingScheme = sessionStorage.getItem('niyamsetu_procedure_scheme');
    if (pendingScheme) {
      sessionStorage.removeItem('niyamsetu_procedure_scheme');
      return pendingScheme;
    }
    return 'sch-pm-01';
  });
  const [data, setData] = useState<ProcedureResponse | null>(null);
  const [focusedStage, setFocusedStage] = useState<number>(1);
  const [show3DWorkflow, setShow3DWorkflow] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pendingScheme = sessionStorage.getItem('niyamsetu_procedure_scheme');
    if (pendingScheme) {
      sessionStorage.removeItem('niyamsetu_procedure_scheme');
      setSchemeId(pendingScheme);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<ProcedureResponse>(`/jansetu/procedures/${schemeId}`, { token })
      .then((res) => {
        if (active) setData(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [schemeId, token, overview]);

  const effectiveRequiredDocs = useMemo<RequiredDocument[]>(() => {
    if (!data) return [];
    if (data.required_documents.length > 0) return data.required_documents;
    return data.active_rules
      .filter((r) => r.rule_type === 'required_document')
      .map((r) => ({
        id: r.id,
        scheme_id: r.scheme_id,
        name: String(r.value),
        name_te: r.label_te,
        description: r.condition_text,
        linked_rule_key: r.rule_key,
        active: true,
      }));
  }, [data]);

  const vaultMatchSummary = useMemo(() => {
    let saved = 0;
    for (const d of effectiveRequiredDocs) {
      if (isDocInVault(d.name, memorizedDocs)) saved += 1;
    }
    return { saved, total: effectiveRequiredDocs.length };
  }, [effectiveRequiredDocs, memorizedDocs]);

  return (
    <div className="space-y-6">
      {/* Header & Scheme Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Step-by-Step Procedure, Required Documents &amp; Visual Process Flow
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Visual stage-by-stage workflow showing exact required certificates inside every step,
            issuing authorities, Vault readiness, and Policy Ripple circular citations.
          </p>
        </div>

        <select
          value={schemeId}
          onChange={(e) => setSchemeId(e.target.value)}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          aria-label="Select scholarship scheme"
        >
          {(overview?.schemes || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {lang === 'te' ? s.name_te : s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Interactive 5-Stage Connected Process Pipeline + Image Process Flow Explanation */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-800 dark:text-cyan-300" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Visual Process Flow &amp; Document Convergence Pipeline
            </h2>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Stage-by-stage visual guide · Zero checklist guesswork
            </span>
            <button
              type="button"
              onClick={() => setShow3DWorkflow((v) => !v)}
              className="px-2.5 py-1 rounded border border-teal-700 dark:border-cyan-400 bg-teal-50 dark:bg-cyan-950/30 text-teal-900 dark:text-cyan-200 text-[11px] font-semibold cursor-pointer"
            >
              {show3DWorkflow ? 'Hide 3D Workflow Map' : 'Show 3D Workflow Map'}
            </button>
          </div>
        </div>

        {/* Connected Horizontal 5-Stage Flow */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {PROCESS_PIPELINE_STAGES.map((st, idx) => {
            const stageNum = idx + 1;
            const active = focusedStage === stageNum;
            return (
              <button
                key={st.stage}
                type="button"
                onClick={() => setFocusedStage(stageNum)}
                className={`relative text-left rounded-lg border p-3.5 transition-colors cursor-pointer ${
                  active
                    ? 'border-teal-800 dark:border-cyan-400 bg-teal-50/70 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-mono font-bold tabular-nums px-2 py-0.5 rounded bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950">
                    STAGE {st.stage}
                  </span>
                  {idx < PROCESS_PIPELINE_STAGES.length - 1 && (
                    <ArrowRight
                      className="hidden md:block w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {st.title}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {st.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        {show3DWorkflow && (
          <CitizenEcosystem3DScene
            activeStage={focusedStage}
            onSelectStage={(stage) => setFocusedStage(stage)}
            schemeCode={data?.scheme.code || 'PM-01'}
          />
        )}

        {/* Image Process Flow Explanations (2 Visual Diagrams Side by Side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
          <figure className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden flex flex-col">
            <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-2">
              <img
                src="/src/assets/images/scheme_process_flow_1795510220066.jpg"
                alt="5-Stage Welfare and Scholarship Process Flow Diagram from Document Collection to DBT Bank Credit"
                referrerPolicy="no-referrer"
                className="w-full h-52 object-contain rounded"
              />
            </div>
            <figcaption className="p-4 space-y-1.5">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                <span>Process Flow Image 1: End-to-End Application Lifecycle (Stages 1 to 5)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Illustrates how memorized Vault certificates feed directly into rule-verified
                eligibility checks, portal OTR submission, institute/MRO officer scrutiny, and
                NPCI Aadhaar-seeded DBT bank disbursement.
              </p>
            </figcaption>
          </figure>

          <figure className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden flex flex-col">
            <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-2">
              <img
                src="/src/assets/images/document_verification_flow_1795510201705.jpg"
                alt="Document Verification Convergence Flow showing Income, Marksheet, Aadhaar, Bank Passbook, and Enrolment converging into Verified Dossier"
                referrerPolicy="no-referrer"
                className="w-full h-52 object-contain rounded"
              />
            </div>
            <figcaption className="p-4 space-y-1.5">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                <span>Process Flow Image 2: Document Convergence &amp; Zero-Mismatch Verification</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Shows how each core certificate (Income, Marksheet, Enrolment/Bonafide, Bank
                Passbook, and Category/UDID proof) is cross-checked for name spelling, validity
                window, and clause compliance before final upload.
              </p>
            </figcaption>
          </figure>
        </div>
      </section>

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-sm text-slate-500">
          Loading verified scheme procedure &amp; required documents...
        </div>
      )}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Step-by-Step Procedure Cards WITH Required Documents Inside Each Step */}
          <section className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {data.scheme.code} · {lang === 'te' ? data.scheme.name_te : data.scheme.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {data.scheme.authority} · {data.scheme.benefit_summary}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300">
                {data.steps.length} Sequential Stages
              </span>
            </div>

            {data.steps.length === 0 ? (
              <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
                No procedural stages configured for this scheme yet. Inspect active required documents
                on the right.
              </div>
            ) : (
              <ol className="space-y-4">
                {data.steps.map((step, idx) => {
                  const linkedRule = data.active_rules.find(
                    (r) => r.rule_key === step.linked_rule_key
                  );
                  const stepDocs = matchStepRequiredDocuments(step, effectiveRequiredDocs);

                  return (
                    <li
                      key={step.id}
                      onMouseEnter={() => setFocusedStage(Math.min(5, step.order_number))}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3"
                    >
                      {/* Step Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <span className="px-2 py-1 rounded bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 text-xs font-mono font-bold tabular-nums shrink-0">
                            STEP 0{step.order_number}
                          </span>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {lang === 'te' ? step.title_te : step.title}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1">
                              {lang === 'te' ? step.description_te : step.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <SpeakButton
                            text={`Step ${step.order_number}: ${lang === 'te' ? step.title_te : step.title}. ${lang === 'te' ? step.description_te : step.description}`}
                            label="Read Step"
                            compact
                          />
                          {linkedRule && (
                            <SourceCitationButton
                              documentId={linkedRule.document_id}
                              pageNumber={linkedRule.page_number}
                              clauseRef={linkedRule.clause_reference}
                              label={linkedRule.citation}
                            />
                          )}
                        </div>
                      </div>

                      {/* Required Documents Inside Every Step Card */}
                      {stepDocs.length > 0 && (
                        <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
                              <span>Required Documents for Step 0{step.order_number}</span>
                            </span>
                            <span className="font-mono tabular-nums">
                              {stepDocs.length} doc{stepDocs.length > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {stepDocs.map((doc) => {
                              const vaultMatch = isDocInVault(doc.name, memorizedDocs);
                              return (
                                <div
                                  key={`${step.id}-${doc.id}`}
                                  className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                                >
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                        {lang === 'te' ? doc.name_te : doc.name}
                                      </span>
                                      {vaultMatch ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                                          <span>Saved in Vault</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                          <FileCheck2 className="w-3 h-3 shrink-0" />
                                          <span>Upload / Memorize Needed</span>
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                      {doc.description}
                                    </p>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                      <Building2 className="w-3 h-3 shrink-0 text-teal-800 dark:text-cyan-300" />
                                      <span>Authority: {inferAuthorityHint(doc.name)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {idx < data.steps.length - 1 && (
                        <div className="flex items-center justify-center pt-1 text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          <span>Proceed to Step 0{data.steps[idx + 1].order_number}</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Right Sidebar: Scheme Required Documents Dossier & Vault Readiness */}
          <section className="lg:col-span-5 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Required Documents Dossier
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mandatory certificates synced with your Personal Profile Vault &amp; FormSathi.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold tabular-nums px-2 py-1 rounded border border-teal-200 dark:border-cyan-800 bg-teal-50 dark:bg-cyan-950/40 text-teal-800 dark:text-cyan-300 shrink-0">
                  {vaultMatchSummary.saved}/{vaultMatchSummary.total} Ready
                </span>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {effectiveRequiredDocs.map((doc) => {
                  const rule = data.active_rules.find((r) => r.rule_key === doc.linked_rule_key);
                  const vaultMatch = isDocInVault(doc.name, memorizedDocs);
                  return (
                    <div key={doc.id} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-4 h-4 text-teal-800 dark:text-cyan-300 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {lang === 'te' ? doc.name_te : doc.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {doc.description}
                            </div>
                          </div>
                        </div>
                        {rule && (
                          <SourceCitationButton
                            documentId={rule.document_id}
                            pageNumber={rule.page_number}
                            clauseRef={rule.clause_reference}
                            label={`cl.${rule.clause_reference}`}
                          />
                        )}
                      </div>

                      <div className="pl-6 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">
                          {inferAuthorityHint(doc.name)}
                        </span>
                        {vaultMatch ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400 font-mono">
                            ✓ Vault: {vaultMatch.doc_number || vaultMatch.title}
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            Missing from Vault
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Policy Thresholds */}
              {data.active_rules.filter((r) => r.rule_type !== 'required_document').length > 0 && (
                <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Active Circular Thresholds &amp; Deadlines
                  </div>
                  <div className="space-y-1.5">
                    {data.active_rules
                      .filter((r) => r.rule_type !== 'required_document')
                      .map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
                        >
                          <span className="truncate">{lang === 'te' ? r.label_te : r.label}</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0 tabular-nums">
                            {r.display_value}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPage('profile_vault')}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-teal-800 dark:hover:border-cyan-400 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <FolderLock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Document Vault</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPage('formsathi')}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Verify in FormSathi AI</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

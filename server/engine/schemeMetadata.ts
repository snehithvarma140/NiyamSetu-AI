import type {
  DocumentGuideMetadata,
  DocumentRecord,
  MemorizedDocument,
  RuleRecord,
  SchemeProcedure8Q,
  SchemeRecord,
} from '../../src/types/niyamsetu.ts';
import { buildCitation, formatRuleDisplay } from './rulesEngine.ts';
import { db } from './store.ts';

interface StaticSchemeMeta {
  purpose: string;
  who_can_apply: string;
  beneficiary_category: string;
  states_applicable: string[];
  districts_applicable: string[];
  opening_date: string;
  official_website: string;
  contact_info: string;
  additional_docs: string[];
  portal_fields: Array<{
    key: string;
    label: string;
    why_asked: string;
    required: boolean;
    sensitive_note?: string;
  }>;
  post_submission: string;
  tracking_method: string;
  expected_processing_days?: number;
  handling_department?: string;
  grievance_portal_url?: string;
  grievance_email?: string;
}

const DEFAULT_PORTAL_FIELDS: StaticSchemeMeta['portal_fields'] = [
  {
    key: 'full_name',
    label: 'Applicant Full Name (exactly as on Aadhaar / Certificates)',
    why_asked: 'Cross-verified against Revenue Income Certificate and Exam Marksheet to avoid DBT rejection.',
    required: true,
  },
  {
    key: 'date_of_birth',
    label: 'Date of Birth',
    why_asked: 'Confirms age bracket eligibility and matches SSC / Board records.',
    required: true,
  },
  {
    key: 'guardian_name',
    label: 'Parent / Guardian Full Name',
    why_asked: 'Required by scholarship portals to validate family income certificate linkage.',
    required: true,
  },
  {
    key: 'state_district',
    label: 'Domicile State & District',
    why_asked: 'Routes the application to the correct District Welfare / Nodal Scrutiny Officer.',
    required: true,
  },
  {
    key: 'address',
    label: 'Permanent Residential Address & PIN',
    why_asked: 'Matches Tehsildar / MeeSeva domicile and postal verification records.',
    required: true,
  },
  {
    key: 'institution_name',
    label: 'Current Institution / College Name',
    why_asked: 'Determines which Head of Institution approves your online Bonafide verification.',
    required: true,
  },
  {
    key: 'roll_number',
    label: 'Hall Ticket / Enrolment Roll Number',
    why_asked: 'Identifies your current academic cohort on the institution verification desk.',
    required: true,
  },
  {
    key: 'family_income',
    label: 'Annual Family Income (₹)',
    why_asked: 'Evaluated deterministically against the scheme circular income ceiling.',
    required: true,
    sensitive_note: 'Used only for local eligibility & draft mapping; never shared externally.',
  },
  {
    key: 'marks_percent',
    label: 'Qualifying Examination Marks (%)',
    why_asked: 'Evaluated deterministically against the active merit cutoff.',
    required: true,
  },
  {
    key: 'bank_ifsc',
    label: 'DBT Bank Name & IFSC Code (Last 4 Digits Only)',
    why_asked: 'Prepares your NPCI Aadhaar-seeded DBT bank block without collecting full account numbers or PINs.',
    required: true,
    sensitive_note: 'Never enter passwords, OTPs, ATM PINs, or CVV.',
  },
];

const SCHEME_STATIC_META: Record<string, Partial<StaticSchemeMeta>> = {
  'sch-pm-01': {
    purpose: 'Reduce financial dropout barriers for post-matric students from low-income families across UG/PG courses.',
    who_can_apply: 'Domicile post-matric students enrolled in recognized colleges meeting family income and aggregate marks cutoffs.',
    beneficiary_category: 'Economically Weaker & Post-Matric Students',
    states_applicable: ['All India', 'Telangana', 'Andhra Pradesh'],
    opening_date: '2026-07-15',
    official_website: 'https://scholarships.gov.in/',
    contact_info: 'Helpdesk: 0120-6619540 · helpdesk-nsp@gov.in · State Higher Education Directorate',
    expected_processing_days: 45,
    handling_department: 'Ministry of Social Justice & Empowerment / State Higher Education Directorate',
    grievance_portal_url: 'https://pgportal.gov.in/',
    grievance_email: 'helpdesk-nsp@gov.in',
    additional_docs: ['Caste / Community certificate', 'Aadhaar / Residence Proof'],
  },
  'sch-ste-02': {
    purpose: 'Support textbooks, laboratory equipment, and academic supplies for STEM and polytechnic learners.',
    who_can_apply: 'Full-time B.Tech, B.Sc, and Diploma students enrolled in AICTE/State-approved institutions.',
    beneficiary_category: 'STEM & Technical Students',
    states_applicable: ['All India', 'Telangana', 'Andhra Pradesh'],
    opening_date: '2026-08-01',
    official_website: 'https://scholarships.gov.in/',
    contact_info: 'Directorate of Technical Education · dte-scholarship@sample.gov.in',
    expected_processing_days: 35,
    handling_department: 'Directorate of Technical Education',
    grievance_portal_url: 'https://pgportal.gov.in/',
    grievance_email: 'dte-scholarship@sample.gov.in',
    additional_docs: ['Bonafide certificate', 'Aadhaar / Residence Proof'],
  },
  'sch-prg-03': {
    purpose: 'Increase female participation in engineering, technical degree, and diploma programmes.',
    who_can_apply: 'Girl students (up to 2 per family) admitted to 1st year or lateral-entry 2nd year AICTE-approved degree/diploma.',
    beneficiary_category: 'Women in Technical Education',
    states_applicable: ['All India'],
    opening_date: '2026-08-15',
    official_website: 'https://www.aicte-india.org/schemes/students-development-schemes/PRAGATI',
    contact_info: 'AICTE Pragati Cell: 011-29581000 · pragati@aicte-india.org',
    expected_processing_days: 45,
    handling_department: 'All India Council for Technical Education (AICTE)',
    grievance_portal_url: 'https://pgportal.gov.in/',
    grievance_email: 'pragati@aicte-india.org',
    additional_docs: ['Aadhaar / Residence Proof', 'Director/Principal Declaration Certificate'],
  },
  'sch-nmm-04': {
    purpose: 'Prevent secondary-school dropouts among meritorious students from economically weaker households.',
    who_can_apply: 'Class IX to XII students in Government / Government-aided / Local Body schools who cleared NMMS selection.',
    beneficiary_category: 'School Students (Classes IX–XII)',
    states_applicable: ['All India'],
    opening_date: '2026-08-01',
    official_website: 'https://scholarships.gov.in/',
    contact_info: 'Ministry of Education NMMS Desk · State SCERT Examination Board',
    expected_processing_days: 40,
    handling_department: 'Ministry of Education / State SCERT',
    grievance_portal_url: 'https://pgportal.gov.in/',
    additional_docs: ['Caste / Community certificate'],
  },
  'sch-css-05': {
    purpose: 'Reward top Class XII board performers pursuing regular undergraduate and postgraduate degrees.',
    who_can_apply: 'Students above the 80th percentile in Class XII Board exams enrolled in regular full-time colleges.',
    beneficiary_category: 'Merit Undergraduate & Postgraduate Students',
    states_applicable: ['All India'],
    opening_date: '2026-07-20',
    official_website: 'https://scholarships.gov.in/',
    contact_info: 'Department of Higher Education CSSS Cell · scholarships.gov.in',
    expected_processing_days: 45,
    handling_department: 'Department of Higher Education (CSSS)',
    grievance_portal_url: 'https://pgportal.gov.in/',
    additional_docs: ['Aadhaar / Residence Proof'],
  },
  'sch-rtf-06': {
    purpose: 'Provide 100% statutory tuition fee reimbursement so eligible learners pay zero regulatory tuition fee.',
    who_can_apply: 'State-domicile students admitted under convenor quota in Degree, Engineering, Pharmacy, MBA, and MCA programmes.',
    beneficiary_category: 'SC / ST / BC / EBC / Minority State Students',
    states_applicable: ['Telangana', 'Andhra Pradesh'],
    opening_date: '2026-08-10',
    official_website: 'https://telanganaepass.cgg.gov.in/',
    contact_info: 'ePass Helpdesk: 040-23390228 · helpdesk-epass@sample.gov.in',
    expected_processing_days: 30,
    handling_department: 'State Social Welfare / ePass Tuition Reimbursement Cell',
    grievance_portal_url: 'https://telanganaepass.cgg.gov.in/',
    grievance_email: 'helpdesk-epass@sample.gov.in',
    additional_docs: ['Caste / Community certificate', 'Aadhaar / Residence Proof'],
  },
  'sch-hst-07': {
    purpose: 'Cover monthly boarding and mess expenses for outstation college hostellers.',
    who_can_apply: 'Full-time college students staying in Government Welfare or recognized College Hostels with 75%+ attendance.',
    beneficiary_category: 'Hostel & Outstation Students',
    states_applicable: ['Telangana', 'Andhra Pradesh'],
    opening_date: '2026-09-01',
    official_website: 'https://telanganaepass.cgg.gov.in/',
    contact_info: 'Directorate of Collegiate & Hostel Welfare · District Social Welfare Office',
    additional_docs: ['Bonafide certificate'],
  },
  'sch-skl-08': {
    purpose: 'Sponsor NSQF-aligned technical upskilling, IT/AI certification, and trainee stipends.',
    who_can_apply: 'Youth aged 18–29 enrolled in NSDC / Skill India accredited vocational training centres.',
    beneficiary_category: 'Youth, ITI & Skill Trainees',
    states_applicable: ['All India'],
    opening_date: '2026-09-10',
    official_website: 'https://www.skillindiadigital.gov.in/',
    contact_info: 'Skill India Digital Toll-Free: 8800055555',
    additional_docs: ['Aadhaar / Residence Proof'],
  },
  'sch-skm-09': {
    purpose: 'Provide tuition, assistive hardware, and learning incidentals to Divyangjan technical learners.',
    who_can_apply: 'Students with >=40% benchmark disability holding a valid UDID card admitted to AICTE degree/diploma programmes.',
    beneficiary_category: 'Persons with Disabilities (Divyangjan)',
    states_applicable: ['All India'],
    opening_date: '2026-10-12',
    official_website: 'https://www.aicte-india.org/schemes/students-development-schemes/SAKSHAM',
    contact_info: 'AICTE Saksham Desk · saksham@aicte-india.org',
    additional_docs: ['Aadhaar / Residence Proof'],
    portal_fields: [
      ...DEFAULT_PORTAL_FIELDS,
      {
        key: 'disability_percent',
        label: 'UDID Benchmark Disability Percentage (%)',
        why_asked: 'Must be >= 40% per AICTE Saksham eligibility clause.',
        required: true,
      },
    ],
  },
  'sch-med-10': {
    purpose: 'Assist medical, dental, nursing, and allied health students with clinical kits and textbooks.',
    who_can_apply: 'Students enrolled in NMC/INC/PCI recognized MBBS, BDS, B.Sc Nursing, B.Pharm, and Paramedical institutions.',
    beneficiary_category: 'Medical, Nursing & Allied Health Students',
    states_applicable: ['Telangana', 'Andhra Pradesh', 'All India'],
    opening_date: '2026-10-20',
    official_website: 'https://scholarships.gov.in/',
    contact_info: 'Directorate of Medical Education · dme-stipend@sample.gov.in',
    additional_docs: ['Bonafide certificate'],
  },
  'sch-agr-11': {
    purpose: 'Encourage next-generation agricultural and veterinary science graduates from farming households.',
    who_can_apply: 'Children of small/marginal farmers pursuing B.Sc Agriculture, Horticulture, Forestry, Fisheries, or B.V.Sc.',
    beneficiary_category: 'Farmer Families & Agricultural Scholars',
    states_applicable: ['Telangana', 'Andhra Pradesh', 'All India'],
    opening_date: '2026-11-01',
    official_website: 'https://icar.org.in/',
    contact_info: 'State Agricultural University Extension Cell · rythu-vidya@sample.gov.in',
    additional_docs: ['Aadhaar / Residence Proof'],
  },
  'sch-min-12': {
    purpose: 'Support professional degree education for meritorious students from notified minority communities.',
    who_can_apply: 'Notified Minority community students (Muslim, Christian, Sikh, Buddhist, Jain, Parsi) in professional/technical courses.',
    beneficiary_category: 'Minority Community Students',
    states_applicable: ['All India'],
    opening_date: '2026-08-05',
    official_website: 'https://scholarships.gov.in/',
    contact_info: 'Ministry of Minority Affairs Helpline · mcm-helpdesk@sample.gov.in',
    additional_docs: ['Hostel Warden certificate'],
  },
  'sch-trb-13': {
    purpose: 'Fund Scheduled Tribe scholars admitted to premier national institutions and postgraduate research.',
    who_can_apply: 'Scheduled Tribe (ST) students with verified community certificate admitted to IITs, NITs, IIMs, or recognized PG programmes.',
    beneficiary_category: 'Scheduled Tribe (ST) Scholars',
    states_applicable: ['All India', 'Telangana', 'Andhra Pradesh'],
    opening_date: '2026-07-10',
    official_website: 'https://tribal.nic.in/',
    contact_info: 'Ministry of Tribal Affairs Fellowship Desk · fellowship-tribal@gov.in',
    additional_docs: ['Aadhaar / Residence Proof'],
  },
  'sch-res-14': {
    purpose: 'Sponsor applied M.Tech, M.Sc, and Ph.D research in clean energy, agri-tech, water, and civic AI.',
    who_can_apply: 'Full-time postgraduate/doctoral scholars with GATE/NET or university research synopsis approval.',
    beneficiary_category: 'Postgraduate & Doctoral Researchers',
    states_applicable: ['All India', 'Telangana'],
    opening_date: '2026-11-08',
    official_website: 'https://dst.gov.in/',
    contact_info: 'State Council of Science & Innovation · research-cell@sample.gov.in',
    additional_docs: ['Enrolment certificate'],
  },
  'sch-def-15': {
    purpose: 'Honour armed forces, CAPF, and state police personnel wards with higher-education financial support.',
    who_can_apply: 'Dependent wards/widows of Ex-Servicemen, Defence, Coast Guard, CAPF, and State Police martyrs.',
    beneficiary_category: 'Wards of Armed Forces & Police Personnel',
    states_applicable: ['All India'],
    opening_date: '2026-09-15',
    official_website: 'https://ksb.gov.in/',
    contact_info: 'Kendriya Sainik Board: 011-26715250 · Zila Sainik Welfare Office',
    additional_docs: ['Enrolment certificate'],
  },
  'sch-spr-16': {
    purpose: 'Provide nutrition, coaching, and academic tuition aid to state/national medal-winning student athletes.',
    who_can_apply: 'Full-time school/college athletes holding State, National, or Khelo India recognized medal certificates.',
    beneficiary_category: 'Student Athletes & Medalists',
    states_applicable: ['All India', 'Telangana', 'Andhra Pradesh'],
    opening_date: '2026-11-12',
    official_website: 'https://kheloindia.gov.in/',
    contact_info: 'Sports Authority of India / State Sports Authority · khelo-grant@sample.gov.in',
    additional_docs: ['Income certificate'],
  },
};

export const DOCUMENT_GUIDE_CATALOG: DocumentGuideMetadata[] = [
  {
    name: 'Income certificate',
    name_te: 'ఆదాయ ధృవీకరణ పత్రం',
    category: 'Financial & Means Proof',
    what_it_is: 'Official annual household income declaration issued by the Revenue Department.',
    why_required: 'Verifies that total annual family income falls within the scheme circular ceiling.',
    issuing_department: 'Revenue Department (Tehsildar / MRO)',
    where_to_obtain: 'MeeSeva / e-District Citizen Portal or Mandal Revenue Office',
    validity_period: '1 Financial Year (valid for the current academic application cycle)',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Ration Card + Employer Salary Certificate (only where circular permits)'],
  },
  {
    name: 'Marksheet',
    name_te: 'మార్కుల జాబితా',
    category: 'Academic Merit Proof',
    what_it_is: 'Consolidated statement of marks / CGPA from your qualifying board or university exam.',
    why_required: 'Validates minimum percentage or percentile cutoff required by scheme rules.',
    issuing_department: 'State Examination Board / University Registrar',
    where_to_obtain: 'DigiLocker, College Examination Cell, or Board Portal',
    validity_period: 'Permanent academic record',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['DigiLocker Digital Marksheet / Provisional Grade Sheet attested by Principal'],
  },
  {
    name: 'Bank passbook copy',
    name_te: 'బ్యాంక్ పాస్‌బుక్ కాపీ',
    category: 'DBT Disbursement Proof',
    what_it_is: 'First page of an active student savings bank passbook clearly printing Name, Account No., and IFSC.',
    why_required: 'Required for NPCI Aadhaar-seeded Direct Benefit Transfer (DBT) of scholarship funds.',
    issuing_department: 'Scheduled Commercial / Public Sector Bank',
    where_to_obtain: 'Home Bank Branch or verified netbanking statement PDF',
    validity_period: 'Active account status required',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Cancelled Cheque with printed account holder name & IFSC'],
  },
  {
    name: 'Enrolment certificate',
    name_te: 'నమోదు / బోనఫైడ్ ధృవీకరణ పత్రం',
    category: 'Institutional Verification',
    what_it_is: 'Current-year student enrolment and attendance confirmation signed by the Head of Institution.',
    why_required: 'Proves active full-time study in an eligible recognized course for the current semester.',
    issuing_department: 'Head of Institution / College Principal / Registrar',
    where_to_obtain: 'College Administrative / Scholarship Desk',
    validity_period: 'Current Academic Year (1 Year)',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Bonafide certificate + Paid Tuition Fee Receipt'],
  },
  {
    name: 'Bonafide certificate',
    name_te: 'బోనఫైడ్ సర్టిఫికెట్',
    category: 'Institutional Verification',
    what_it_is: 'Official letterhead certificate confirming student admission, course year, and regular attendance.',
    why_required: 'Used by nodal officers to prevent duplicate or inactive-student scholarship claims.',
    issuing_department: 'School / College Principal Office',
    where_to_obtain: 'Institution Administrative Office or NSP Bonafide Form upload',
    validity_period: 'Current Academic Year',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Enrolment certificate with AISHE/UDISE code'],
  },
  {
    name: 'Caste / Community certificate',
    name_te: 'కుల / కమ్యూనిటీ ధృవీకరణ పత్రం',
    category: 'Category & Reservation Proof',
    what_it_is: 'Digitally barcoded certificate confirming SC, ST, OBC, BC, EWS, or Minority community status.',
    why_required: 'Mandatory for reserved-category, tribal, or minority welfare scholarship tracks.',
    issuing_department: 'Mandal Revenue Officer / Sub-Collector',
    where_to_obtain: 'MeeSeva / e-District Portal or DigiLocker',
    validity_period: 'Permanent (EWS certificates valid for 1 Financial Year)',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Self-declaration Affidavit for Minority track (where notified)'],
  },
  {
    name: 'Aadhaar / Residence Proof',
    name_te: 'ఆధార్ / నివాస ధృవీకరణ పత్రం',
    category: 'Identity & Domicile Proof',
    what_it_is: 'UIDAI Aadhaar / Masked Aadhaar or State Domicile certificate establishing identity and residence.',
    why_required: 'Required for One-Time Registration (OTR) e-KYC and preventing duplicate claims.',
    issuing_department: 'UIDAI / Revenue Mandal Office',
    where_to_obtain: 'myAadhaar / DigiLocker / MeeSeva Domicile',
    validity_period: 'Active identity record (keep address & mobile OTP updated)',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Aadhaar Enrolment Slip (EID) + Residence Certificate'],
  },
  {
    name: 'UDID Disability certificate',
    name_te: 'UDID దివ్యాంగ ధృవీకరణ పత్రం',
    category: 'Special Inclusion Proof',
    what_it_is: 'Unique Disability ID card issued by the District Medical Board confirming >=40% benchmark disability.',
    why_required: 'Mandatory for AICTE Saksham and Divyangjan reservation allowances.',
    issuing_department: 'Department of Empowerment of Persons with Disabilities / District Medical Board',
    where_to_obtain: 'swavlambancard.gov.in / District Government Hospital Medical Board',
    validity_period: 'Permanent or up to validity expiry date printed on UDID card',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['State SADAREM / Medical Board Certificate while UDID is under renewal'],
  },
  {
    name: 'Hostel Warden certificate',
    name_te: 'హాస్టల్ వార్డెన్ ధృవీకరణ పత్రం',
    category: 'Residential Proof',
    what_it_is: 'Hostel residency and monthly mess attendance certificate signed by Warden and Principal.',
    why_required: 'Establishes outstation hosteller status for boarding and mess allowances.',
    issuing_department: 'College Hostel Superintendent / Welfare Hostel Warden',
    where_to_obtain: 'Institution Hostel Office',
    validity_period: 'Current Semester / Academic Year',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Registered Welfare Hostel Allotment Letter + Mess Receipt'],
  },
  {
    name: 'Sports Merit certificate',
    name_te: 'క్రీడా మెరిట్ ధృవీకరణ పత్రం',
    category: 'Achievement Proof',
    what_it_is: 'Recognized State/National/Khelo India tournament medal or participation certificate.',
    why_required: 'Confirms athletic merit for Khelo India Sports Grant eligibility.',
    issuing_department: 'State Sports Authority / Recognized National Sports Federation',
    where_to_obtain: 'Sports Authority Portal or Federation Registrar',
    validity_period: 'Issued within the last 2 sporting seasons',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['University Inter-Varsity Medal Certificate counter-signed by Sports Director'],
  },
  {
    name: 'NSQF Assessment certificate',
    name_te: 'NSQF నైపుణ్య ధృవీకరణ పత్రం',
    category: 'Skill Training Proof',
    what_it_is: 'National Skills Qualifications Framework batch enrolment or assessment registration slip.',
    why_required: 'Verifies training centre accreditation and NSQF level under Skill India.',
    issuing_department: 'NSDC / Sector Skill Council',
    where_to_obtain: 'Skill India Digital Hub Portal',
    validity_period: 'Course duration / Certificate validity',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Accredited Training Partner Batch Admission Letter'],
  },
  {
    name: 'Research / Synopsis Approval',
    name_te: 'పరిశోధన సినాప్సిస్ ఆమోదం',
    category: 'Research & Academic Proof',
    what_it_is: 'University Research Cell approval of PG/PhD project synopsis + valid GATE/NET scorecard.',
    why_required: 'Validates original research scope and supervisor endorsement for Research Fellowship.',
    issuing_department: 'University Research Board / NTA',
    where_to_obtain: 'Department Research Coordinator & NTA Scorecard Portal',
    validity_period: 'Fellowship tenure',
    accepted_formats: ['PDF', 'JPG', 'PNG'],
    max_size_mb: 5,
    official_alternatives: ['Departmental Research Committee (DRC) Provisional Minute Copy'],
  },
];

export function enrichSchemeRecord(scheme: SchemeRecord): SchemeRecord {
  const state = db.getState();
  const meta = SCHEME_STATIC_META[scheme.id] || {};
  const activeRules = state.rules.filter((r) => r.scheme_id === scheme.id && r.status === 'active');
  const deadlineRule = activeRules.find((r) => r.rule_type === 'deadline');
  const reqDocsFromRules = state.required_documents
    .filter((d) => d.scheme_id === scheme.id && d.active)
    .map((d) => d.name);
  const reqDocsFallback = activeRules
    .filter((r) => r.rule_type === 'required_document')
    .map((r) => String(r.value));
  const required_docs_list = reqDocsFromRules.length > 0 ? reqDocsFromRules : reqDocsFallback;

  const docsForScheme = state.documents.filter((d) => d.scheme_id === scheme.id);
  const latestDoc: DocumentRecord | undefined = docsForScheme
    .slice()
    .sort((a, b) => b.version - a.version)[0];

  const eligRules = activeRules.filter((r) => r.rule_type === 'eligibility');
  const eligibility_summary =
    eligRules.length > 0
      ? eligRules.map((r) => `${r.label}: ${formatRuleDisplay(r)}`).join(' · ')
      : scheme.description;

  const deadlineIso =
    (deadlineRule ? String(deadlineRule.value) : undefined) ||
    state.deadlines
      .filter((dl) => dl.scheme_id === scheme.id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date ||
    '2026-12-31';

  const daysUntil = Math.ceil(
    (new Date(`${deadlineIso}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const application_status: SchemeRecord['application_status'] =
    daysUntil < 0 ? 'closed' : daysUntil <= 21 ? 'closing_soon' : 'open';

  return {
    ...scheme,
    purpose: meta.purpose || scheme.description,
    who_can_apply: meta.who_can_apply || `${scheme.target_group || 'Eligible learners'} meeting verified criteria.`,
    eligibility_summary,
    beneficiary_category: meta.beneficiary_category || scheme.target_group || 'Students & Citizens',
    states_applicable: meta.states_applicable || ['All India', 'Telangana', 'Andhra Pradesh'],
    districts_applicable: meta.districts_applicable || ['All Districts'],
    opening_date: meta.opening_date || scheme.introduced_date || '2026-07-01',
    deadline_date: deadlineIso,
    official_website: meta.official_website || latestDoc?.source_url || 'https://scholarships.gov.in/',
    contact_info: meta.contact_info || `${scheme.authority} Official Nodal Helpdesk`,
    source_notification: latestDoc
      ? `${latestDoc.doc_number} (${latestDoc.title})`
      : `${scheme.code} Official Circular`,
    last_verified_date: latestDoc?.effective_date || scheme.introduced_date || '2026-11-01',
    application_status,
    required_docs_list,
    additional_docs_list: meta.additional_docs || ['Aadhaar / Residence Proof'],
    expected_processing_days: meta.expected_processing_days || 45,
    handling_department: meta.handling_department || scheme.authority,
    grievance_portal_url: meta.grievance_portal_url || 'https://pgportal.gov.in/',
    grievance_email: meta.grievance_email || undefined,
  };
}

export function getSchemeProcedure8Q(schemeId: string): SchemeProcedure8Q | null {
  const state = db.getState();
  const raw = state.schemes.find((s) => s.id === schemeId);
  if (!raw) return null;
  const scheme = enrichSchemeRecord(raw);
  const activeRules = state.rules.filter((r) => r.scheme_id === schemeId && r.status === 'active');
  const meta = SCHEME_STATIC_META[schemeId] || {};

  const mandatoryDocs = scheme.required_docs_list || [];
  const additionalDocs = scheme.additional_docs_list || ['Aadhaar / Residence Proof'];
  const fields = meta.portal_fields || DEFAULT_PORTAL_FIELDS;

  return {
    scheme_id: scheme.id,
    scheme_code: scheme.code,
    scheme_name: scheme.name,
    what_is_application_for: `${scheme.name} (${scheme.code}) provides ${scheme.benefit_summary}. Purpose: ${scheme.purpose}`,
    who_can_apply: scheme.who_can_apply || scheme.eligibility_summary || '',
    what_info_needed: fields.map((f) => f.label),
    what_documents_required: mandatoryDocs,
    additional_documents: additionalDocs,
    official_website: scheme.official_website || 'https://scholarships.gov.in/',
    what_to_enter: fields.map((f) => ({
      key: f.key,
      label: f.label,
      why_asked: f.why_asked,
      required: f.required,
    })),
    what_happens_after_submission:
      meta.post_submission ||
      `After submitting on ${scheme.official_website}, your Head of Institution verifies Bonafide enrolment online, followed by District/State Welfare Officer verification against ${scheme.source_notification} and NPCI Aadhaar-seeded DBT payout.`,
    how_to_track:
      meta.tracking_method ||
      `Save your official portal Application Reference Number after submission and track verification stages ("Institute Verification" -> "District Officer" -> "PFMS / DBT Sanctioned") directly on ${scheme.official_website}.`,
    active_rule_citations: activeRules.map((r) => buildCitation(r)),
  };
}

export function getSchemeDocumentClassifications(schemeId: string): Array<{
  doc_name: string;
  requirement_level: 'mandatory' | 'additional' | 'optional' | 'not_applicable';
  guide: DocumentGuideMetadata;
}> {
  const state = db.getState();
  const raw = state.schemes.find((s) => s.id === schemeId);
  const scheme = raw ? enrichSchemeRecord(raw) : null;
  const mandatorySet = new Set((scheme?.required_docs_list || []).map((d) => d.toLowerCase()));
  const additionalSet = new Set((scheme?.additional_docs_list || []).map((d) => d.toLowerCase()));

  return DOCUMENT_GUIDE_CATALOG.map((guide) => {
    const low = guide.name.toLowerCase();
    let requirement_level: 'mandatory' | 'additional' | 'optional' | 'not_applicable' = 'not_applicable';
    if (mandatorySet.has(low) || Array.from(mandatorySet).some((m) => m.includes(low.split(' ')[0]))) {
      requirement_level = 'mandatory';
    } else if (
      additionalSet.has(low) ||
      Array.from(additionalSet).some((a) => a.includes(low.split(' ')[0]))
    ) {
      requirement_level = 'additional';
    } else if (low.includes('aadhaar') || low.includes('bonafide')) {
      requirement_level = 'optional';
    }
    return {
      doc_name: guide.name,
      requirement_level,
      guide,
    };
  });
}

export function buildVaultExpiryAndMismatchWarnings(docs: MemorizedDocument[]): Array<{
  doc_id: string;
  title: string;
  severity: 'warning' | 'ok';
  message: string;
}> {
  const now = Date.now();
  return docs.map((d) => {
    if (d.expiry_date) {
      const expTs = new Date(`${d.expiry_date}T00:00:00`).getTime();
      if (!Number.isNaN(expTs)) {
        const days = Math.ceil((expTs - now) / (1000 * 60 * 60 * 24));
        if (days < 0) {
          return {
            doc_id: d.id,
            title: d.title,
            severity: 'warning',
            message: `Expired on ${d.expiry_date}. Renew via ${d.doc_type.toLowerCase().includes('income') ? 'MeeSeva / Tehsildar' : 'issuing office'} before portal submission.`,
          };
        }
        if (days <= 30) {
          return {
            doc_id: d.id,
            title: d.title,
            severity: 'warning',
            message: `Expiring in ${days} day(s) (${d.expiry_date}). Plan renewal soon.`,
          };
        }
      }
    }
    if (!d.doc_number || !d.doc_number.trim()) {
      return {
        doc_id: d.id,
        title: d.title,
        severity: 'warning',
        message: 'Certificate number / ID is blank. Add the printed certificate number for faster form mapping.',
      };
    }
    return {
      doc_id: d.id,
      title: d.title,
      severity: 'ok',
      message: 'Metadata complete in Vault (preliminary check — official portal verification still applies).',
    };
  });
}

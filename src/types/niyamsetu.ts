export type UserRole = 'STUDENT' | 'ORGANIZATION' | 'ADMIN' | 'PLATFORM_ADMIN' | 'DEVELOPER';

export type OrganizationType = 'hospital' | 'bank' | 'college' | 'other';

export type BloodGroupType =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'UNKNOWN';

export interface EmergencyProfile {
  blood_group: BloodGroupType;
  allergies: string;
  chronic_conditions: string;
  medications: string;
  medical_warnings: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  biometric_id: string;
  biometric_enrolled: boolean;
  photo_data_url?: string;
  organ_donor?: boolean;
  emergency_qr_token?: string;
  regenerate_qr_token?: boolean;
  updated_at?: string;
}

export type CitizenInterestTopic =
  | 'Government schemes and notifications'
  | 'National and international news'
  | 'Gold and silver market updates'
  | 'Stock market updates'
  | 'Education, scholarships and employment'
  | "Agriculture and farmers' updates"
  | 'Technology and AI'
  | 'Business and economy'
  | 'Health and public services'
  | 'State and district news';

export interface NotificationPreferences {
  scheme_updates: boolean;
  rule_changes: boolean;
  deadlines: boolean;
  daily_digest: boolean;
  complaint_updates: boolean;
}

export interface SavedNewsUpdate {
  id: string;
  title: string;
  summary: string;
  category: string;
  source_name: string;
  source_url: string;
  published_at: string;
  is_gov_notification: boolean;
  saved_at: string;
}

export type LanguageCode = 'en' | 'te';
export type VoiceLanguageCode = 'en' | 'hi' | 'te';

export type RuleStatus =
  | 'draft'
  | 'under_review'
  | 'correction_requested'
  | 'active'
  | 'superseded'
  | 'rejected';

export type RuleType =
  | 'eligibility'
  | 'required_document'
  | 'deadline'
  | 'procedure_step'
  | 'benefit'
  | 'exception';

export type RuleOperator = '<=' | '>=' | '=' | 'contains' | 'required';

export type VerificationStatus = 'verified' | 'pending_review' | 'conflict_flagged';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organization_type?: OrganizationType;
  organization_name?: string;
  language_preference: LanguageCode;
  department?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  guardian_name?: string;
  address?: string;
  district?: string;
  state?: string;
  pincode?: string;
  category?: string;
  education_level?: string;
  institution_name?: string;
  roll_number?: string;
  family_income?: number | null;
  marks_percent?: number | null;
  disability_percent?: number | null;
  bank_name?: string;
  bank_ifsc?: string;
  bank_account_last4?: string;
  income_cert_number?: string;
  caste_cert_number?: string;
  emergency_profile?: EmergencyProfile;
  interests?: CitizenInterestTopic[];
  notification_preferences?: NotificationPreferences;
  saved_updates?: SavedNewsUpdate[];
  created_at: string;
  updated_at?: string;
}

export interface MemorizedDocument {
  id: string;
  user_id: string;
  doc_type: string;
  title: string;
  scheme_id: string;
  doc_number: string;
  extracted_name: string;
  extracted_income: number | null;
  extracted_marks: number | null;
  extracted_address: string;
  notes: string;
  expiry_date?: string;
  file_name?: string;
  file_size_bytes?: number;
  file_mime?: string;
  source_activity: 'vault_manual' | 'vault_upload' | 'formsathi_extract' | 'eligibility_sync';
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  scheme_id: string;
  title: string;
  doc_number: string;
  authority: string;
  jurisdiction: string;
  publication_date: string;
  effective_date: string;
  subject: string;
  version: number;
  amends_document_id: string | null;
  source_url: string;
  verification_status: VerificationStatus;
  uploaded_by: string;
  created_at: string;
}

export interface DocumentPage {
  id: string;
  document_id: string;
  page_number: number;
  text: string;
  extraction_confidence: number;
}

export interface SchemeRecord {
  id: string;
  code: string;
  name: string;
  name_te: string;
  authority: string;
  description: string;
  description_te: string;
  benefit_summary: string;
  active: boolean;
  is_new?: boolean;
  introduced_date?: string;
  target_group?: string;
  schema_version?: string;
  purpose?: string;
  who_can_apply?: string;
  eligibility_summary?: string;
  beneficiary_category?: string;
  states_applicable?: string[];
  districts_applicable?: string[];
  opening_date?: string;
  deadline_date?: string;
  official_website?: string;
  contact_info?: string;
  source_notification?: string;
  last_verified_date?: string;
  application_status?: 'open' | 'closing_soon' | 'upcoming' | 'closed';
  required_docs_list?: string[];
  additional_docs_list?: string[];
  expected_processing_days?: number;
  handling_department?: string;
  grievance_portal_url?: string;
  grievance_email?: string;
}

export interface RuleRecord {
  id: string;
  document_id: string;
  scheme_id: string;
  rule_key: string;
  version: number;
  rule_type: RuleType;
  label: string;
  label_te: string;
  condition_text: string;
  condition_text_te: string;
  field: string;
  operator: RuleOperator;
  value: string | number;
  applies_to: string;
  page_number: number;
  clause_reference: string;
  confidence: number;
  status: RuleStatus;
  valid_from: string;
  valid_to: string | null;
}

export interface RuleChange {
  id: string;
  scheme_id: string;
  rule_key: string;
  old_rule_id: string | null;
  new_rule_id: string | null;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
  summary: string;
  detected_at: string;
  review_status: 'pending' | 'approved' | 'rejected';
}

export type LinkedEntityType =
  | 'eligibility'
  | 'procedure_step'
  | 'required_document'
  | 'application_check'
  | 'deadline'
  | 'alerts';

export interface RuleLink {
  id: string;
  rule_key: string;
  scheme_id: string;
  linked_type: LinkedEntityType;
  linked_id: string;
  dependency_label: string;
}

export type ImpactItemStatus = 'proposed' | 'approved' | 'applied' | 'rejected';

export interface ImpactItem {
  id: string;
  impact_report_id: string;
  rule_id: string;
  rule_key: string;
  linked_type: LinkedEntityType;
  linked_id: string;
  target_title: string;
  old_text: string;
  proposed_text: string;
  reason: string;
  source_citation: string;
  status: ImpactItemStatus;
}

export interface ImpactReport {
  id: string;
  rule_change_id: string;
  rule_id: string;
  scheme_id: string;
  title: string;
  generated_at: string;
  status: 'pending_review' | 'partially_applied' | 'applied';
  items: ImpactItem[];
}

export interface ProcedureStep {
  id: string;
  scheme_id: string;
  order_number: number;
  title: string;
  title_te: string;
  description: string;
  description_te: string;
  linked_rule_key: string;
}

export interface RequiredDocument {
  id: string;
  scheme_id: string;
  name: string;
  name_te: string;
  description: string;
  linked_rule_key: string;
  active: boolean;
}

export interface ReadinessCheckItem {
  item: string;
  reason: string;
  why_it_matters: string;
  citation: string;
}

export interface ReadinessReport {
  id: string;
  user_id: string;
  scheme_id: string;
  applicant_label: string;
  generated_at: string;
  completed: ReadinessCheckItem[];
  missing: ReadinessCheckItem[];
  uncertain: ReadinessCheckItem[];
  disclaimer: string;
}

export interface DeadlineTask {
  id: string;
  scheme_id: string;
  rule_key: string;
  title: string;
  title_te: string;
  due_date: string;
  owner_role: UserRole;
  status: 'pending' | 'completed' | 'needs_review';
  needs_ripple_review: boolean;
}

export interface AlertItem {
  id: string;
  target_role: UserRole | 'ALL';
  scheme_id: string;
  rule_change_id: string;
  priority: 'high' | 'normal';
  message: string;
  message_te: string;
  read: boolean;
  created_at: string;
}

export interface ReviewQueueItem {
  id: string;
  item_type: 'rule' | 'conflict' | 'source_document';
  item_id: string;
  scheme_id: string;
  reason: string;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'correction_requested';
  decision_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: UserRole;
  action: string;
  object_type: string;
  object_id: string;
  source_reference: string;
  details: string;
  timestamp: string;
}

export interface MonitoredSource {
  id: string;
  name: string;
  department: string;
  url: string;
  check_frequency: string;
  last_checked: string;
  last_status: 'verified' | 'new_document_found' | 'unchanged' | 'outdated';
  active: boolean;
}

export interface EligibilityEvaluationResult {
  scheme: SchemeRecord;
  status: 'likely_eligible' | 'possibly_eligible' | 'not_eligible';
  conditions: Array<{
    rule_id: string;
    label: string;
    expected: string;
    provided: string;
    outcome: 'met' | 'not_met' | 'missing_info';
    citation: string;
  }>;
}

export interface WhatIfResult {
  scheme_id: string;
  rows: Array<{
    rule_key: string;
    label: string;
    v1_display: string;
    v1_outcome: 'met' | 'not_met' | 'cannot_determine';
    v2_display: string;
    v2_outcome: 'met' | 'not_met' | 'cannot_determine';
    v2_status: RuleStatus;
  }>;
  v1_eligible: boolean;
  v2_eligible: boolean;
  outcome_changed: boolean;
  explanation: string;
}

export interface SchemeEligibilityTask {
  scheme_id: string;
  scheme_code: string;
  scheme_name: string;
  is_new: boolean;
  target_group: string;
  eligibility_status: 'likely_eligible' | 'possibly_eligible' | 'not_eligible';
  benefit_summary: string;
  matched_docs: string[];
  missing_docs: string[];
  predefined_tasks: string[];
  advanced_tasks: string[];
}

export interface AllSchemesAiPlanResult {
  generated_at: string;
  model_used: string;
  profile_summary: string;
  memorized_docs_count: number;
  total_schemes_evaluated: number;
  eligible_count: number;
  possible_count: number;
  not_eligible_count: number;
  executive_strategy: string;
  cross_scheme_advanced_tasks: Array<{
    priority: 'high' | 'medium' | 'low';
    title: string;
    action: string;
    impacted_schemes: string[];
  }>;
  scheme_plans: SchemeEligibilityTask[];
}

export interface DeveloperOverviewPayload {
  api_version: string;
  schema_count: number;
  new_schemas_count: number;
  total_rules_ast: number;
  avg_extraction_confidence: number;
  firestore_collections: Array<{
    path: string;
    isolation_model: string;
    required_fields: number;
  }>;
  api_endpoints: Array<{
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    path: string;
    auth: string;
    purpose: string;
  }>;
  scheme_schemas: Array<{
    scheme_id: string;
    code: string;
    name: string;
    schema_version: string;
    introduced_date: string;
    is_new: boolean;
    target_group: string;
    eligibility_fields: string[];
    required_documents: string[];
    active_rules_count: number;
    draft_rules_count: number;
  }>;
}

export interface DocumentGuideMetadata {
  name: string;
  name_te: string;
  category: string;
  what_it_is: string;
  why_required: string;
  issuing_department: string;
  where_to_obtain: string;
  validity_period: string;
  accepted_formats: string[];
  max_size_mb: number;
  official_alternatives: string[];
}

export interface SchemeProcedure8Q {
  scheme_id: string;
  scheme_code: string;
  scheme_name: string;
  what_is_application_for: string;
  who_can_apply: string;
  what_info_needed: string[];
  what_documents_required: string[];
  additional_documents: string[];
  official_website: string;
  what_to_enter: Array<{
    key: string;
    label: string;
    why_asked: string;
    required: boolean;
  }>;
  what_happens_after_submission: string;
  how_to_track: string;
  active_rule_citations: string[];
}

export interface ApplicationDraftRecord {
  id: string;
  user_id: string;
  scheme_id: string;
  scheme_code: string;
  scheme_name: string;
  status: 'draft' | 'ready_for_portal' | 'submitted_confirmed';
  form_fields: Record<string, string>;
  attached_documents: string[];
  missing_requirements: string[];
  ai_mapping_summary: string;
  portal_url: string;
  portal_reference_number?: string;
  user_confirmed_submission: boolean;
  created_at: string;
  updated_at: string;
  confirmed_at?: string | null;
  submitted_at?: string | null;
  last_status_update?: string;
  expected_processing_days?: number;
  elapsed_days?: number;
  is_overdue?: boolean;
  handling_department?: string;
  approval_status?: 'approved' | 'under_review' | 'action_required' | 'ready_for_portal' | 'draft';
  approval_label?: string;
  org_verifications?: Array<{
    id: string;
    org_type: OrganizationType;
    org_name: string;
    status: 'pending' | 'verified' | 'flagged';
    reference_code: string;
    verified_by?: string;
    updated_at: string;
  }>;
  timeline_events?: Array<{
    stage: string;
    label: string;
    timestamp: string;
    status: 'done' | 'current' | 'upcoming' | 'delayed';
    note?: string;
  }>;
}

export interface SchemeUsageStat {
  scheme_id: string;
  scheme_code: string;
  scheme_name: string;
  target_group: string;
  applications_count: number;
  confirmed_count: number;
  readiness_checks_count: number;
  memorized_docs_count: number;
  active_rules_count: number;
  total_usage_score: number;
}

export interface RuleUsefulnessStat {
  rule_id: string;
  scheme_id: string;
  scheme_code: string;
  rule_key: string;
  label: string;
  rule_type: RuleType;
  version: number;
  citation: string;
  evaluations_triggered: number;
  met_count: number;
  not_met_count: number;
  missing_count: number;
  linked_dependencies_count: number;
  confidence: number;
  usefulness_score: number;
}

export interface OrganizationTaskRecord {
  id: string;
  org_type: OrganizationType;
  org_name: string;
  citizen_id: string;
  citizen_name: string;
  citizen_email: string;
  subject: string;
  scheme_code: string;
  reference_code: string;
  status: 'pending' | 'verified' | 'flagged';
  notes: string;
  updated_at: string;
  verified_by?: string;
  gov_inspected?: boolean;
  gov_inspected_by?: string;
  gov_inspection_note?: string;
  gov_inspected_at?: string;
}

export interface EmergencyLookupResult {
  lookup_id: string;
  matched: boolean;
  match_method: 'biometric' | 'image';
  confidence: number;
  match_reason: string;
  accessed_at: string;
  responder_name: string;
  citizen_summary: {
    id: string;
    name: string;
    age_years: number | null;
    date_of_birth: string;
    district: string;
    state: string;
    blood_group: BloodGroupType;
    allergies: string;
    chronic_conditions: string;
    medications: string;
    medical_warnings: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relation: string;
    biometric_id: string;
    biometric_enrolled: boolean;
    photo_data_url?: string;
    organ_donor?: boolean;
  } | null;
}

export interface GovMonitoringPayload {
  totals: {
    drafts: number;
    ready_for_portal: number;
    submitted_confirmed: number;
    readiness_checks: number;
    registered_citizens: number;
  };
  missing_document_bottlenecks: Array<{
    document_name: string;
    missing_count: number;
  }>;
  scheme_activity: Array<{
    scheme_id: string;
    scheme_code: string;
    scheme_name: string;
    drafts_count: number;
    confirmed_count: number;
    readiness_checks_count: number;
  }>;
  recent_applications: Array<{
    id: string;
    scheme_code: string;
    scheme_name: string;
    status: ApplicationDraftRecord['status'];
    missing_count: number;
    updated_at: string;
  }>;
  scheme_usage: SchemeUsageStat[];
  rule_usefulness: RuleUsefulnessStat[];
  org_summary: {
    total_tasks: number;
    pending_tasks: number;
    verified_tasks: number;
    flagged_tasks: number;
    gov_inspected_count: number;
    emergency_lookups_count: number;
    by_type: Array<{
      org_type: OrganizationType;
      total: number;
      pending: number;
      verified: number;
      flagged: number;
    }>;
  };
  recent_emergency_lookups: Array<{
    id: string;
    timestamp: string;
    actor_name: string;
    details: string;
    source_reference: string;
  }>;
  complaints_summary?: {
    total: number;
    open: number;
    resolved: number;
    by_category: Array<{ category: string; count: number }>;
    by_org_type: Array<{ org_type: OrganizationType | 'government'; count: number }>;
  };
  regional_demand?: Array<{
    state: string;
    district: string;
    citizens: number;
    applications: number;
    complaints: number;
  }>;
  feedback_intelligence?: {
    unanswered_faq_reports: number;
    delay_flagged_apps_count: number;
    top_unanswered_questions: UnansweredFaqReport[];
  };
}

export interface RuleComparisonRow {
  rule_key: string;
  label: string;
  old_rule: RuleRecord | null;
  new_rule: RuleRecord | null;
  old_display: string;
  new_display: string;
  change_type: 'added' | 'modified' | 'removed' | 'unchanged';
  citation: string;
  review_status: RuleStatus;
}

export interface NewsFeedItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source_name: string;
  source_url: string;
  published_at: string;
  is_gov_notification: boolean;
  is_market_informational?: boolean;
  badge_type?: 'breaking' | 'new_scheme' | 'rule_change' | 'deadline' | 'market' | 'update';
  department?: string;
  deadline_date?: string;
}

export interface MarketQuoteItem {
  symbol: string;
  label: string;
  price: string;
  change: string;
  direction: 'up' | 'down' | 'flat';
  source: string;
  timestamp: string;
}

export interface NewsFeedPayload {
  generated_at: string;
  interests: CitizenInterestTopic[];
  gov_notifications: NewsFeedItem[];
  interest_updates: NewsFeedItem[];
  market_quotes?: MarketQuoteItem[];
  live_market_available: boolean;
  market_notice: string;
  model_used: string;
}

export interface GovChangeAlert {
  id: string;
  scheme_id: string;
  scheme_code: string;
  scheme_name: string;
  rule_key: string;
  summary: string;
  effective_date: string;
  reason: 'active_application' | 'bookmarked_scheme' | 'interest_match';
}

export interface ServiceNavigatorResult {
  department: string;
  service_name: string;
  required_documents: string[];
  official_steps: string[];
  official_portal: string;
  related_scheme_codes: string[];
  verified_vs_general_note: string;
  model_used: string;
}

export interface DelayAnalysisResult {
  application_id: string;
  scheme_code: string;
  scheme_name: string;
  verified_status: string;
  submission_date: string | null;
  last_update: string;
  handling_department: string;
  expected_processing_days: number;
  elapsed_days: number;
  is_overdue: boolean;
  pending_documents: string[];
  next_steps: string[];
  official_contact: string;
  grievance_channel: string;
  verified_reasons: string[];
  possible_explanations: string[];
  unknown_factors: string[];
  ai_explanation: string;
  analyzed_at: string;
  model_used: string;
}

export type ComplaintCategory =
  | 'Application Delay'
  | 'Document Verification Issue'
  | 'DBT / Bank Payment Delay'
  | 'Hospital / Health Scheme Issue'
  | 'College Bonafide / Institution Issue'
  | 'Portal / Technical Error'
  | 'Service Quality / Behavior';

export type ComplaintStatus =
  | 'submitted'
  | 'under_review'
  | 'in_progress'
  | 'resolved'
  | 'escalated';

export type ComplaintChannel = 'niyamsetu_tracked' | 'external_manual';

export interface ComplaintRecord {
  id: string;
  user_id: string;
  citizen_name: string;
  department: string;
  org_type: OrganizationType | 'government';
  scheme_id?: string;
  application_id?: string;
  category: ComplaintCategory;
  subject: string;
  description: string;
  attachments: Array<{ name: string; size_bytes: number; mime_type: string }>;
  submission_channel: ComplaintChannel;
  reference_number: string;
  status: ComplaintStatus;
  updates: Array<{ timestamp: string; actor: string; message: string }>;
  resolution_note?: string;
  reminder_date?: string;
  created_at: string;
  updated_at: string;
}

export type FaqCategory =
  | 'Account and profile'
  | 'Government schemes'
  | 'Eligibility and benefits'
  | 'Applications and forms'
  | 'Required documents'
  | 'Application delays and tracking'
  | 'Complaints and grievances'
  | 'Emergency information'
  | 'Nearby services'
  | 'Privacy and security';

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  official_reference: string;
  related_ids: string[];
  views: number;
  helpful_count: number;
  not_helpful_count: number;
}

export interface UnansweredFaqReport {
  id: string;
  question: string;
  category: FaqCategory;
  user_id?: string;
  created_at: string;
}

export type AppointmentSectorType = 'government' | 'private';

export type OfficerRoleCategory =
  | 'Police Officer / SHO'
  | 'Government Doctor / Medical Officer'
  | 'Private Doctor / Clinic Specialist'
  | 'Bank Manager / DBT Officer'
  | 'IAS / District Collector / RDO'
  | 'Revenue / Tahsildar / MeeSeva Officer'
  | 'College Principal / Nodal Officer'
  | 'Municipal / Public Utility Officer';

export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'rescheduled'
  | 'completed'
  | 'cancelled';

export interface OfficerAppointmentRecord {
  id: string;
  reference_code: string;
  user_id: string;
  citizen_name: string;
  citizen_email: string;
  citizen_phone: string;
  sector_type: AppointmentSectorType;
  officer_role: OfficerRoleCategory;
  org_type: OrganizationType;
  org_name: string;
  office_or_officer_name: string;
  state: string;
  district: string;
  place_locality: string;
  reason: string;
  issue_details: string;
  preferred_date: string;
  preferred_time: string;
  urgency: 'routine' | 'priority' | 'urgent';
  related_reference?: string;
  status: AppointmentStatus;
  assigned_officer_name?: string;
  officer_notes?: string;
  created_at: string;
  updated_at: string;
}

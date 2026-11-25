import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import {
  hashPassword,
  optionalAuth,
  requireAuth,
  requireRole,
  signSessionToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import {
  analyzeApplicationDelayWithAI,
  answerCitizenQuestionWithAI,
  buildSpokenNewsBriefingText,
  chatWithJanSetuMultiTurn,
  draftGrievanceOrRtiWithAI,
  extractApplicationDocumentFields,
  extractRulesFromDocument,
  fetchInterestBasedNewsWithSearch,
  generateAllSchemesAdvancedPlan,
  mapApplicationFormWithAI,
  mapsGroundedAnswer,
  matchEmergencyCitizenPhotoWithAI,
  resolveCitizenServiceNavigatorWithAI,
  searchGroundedAnswer,
  synthesizeSpeechWithGemini,
  transcribeAudioWithGemini,
} from '../engine/aiService.ts';
import {
  appendAuditLog,
  applyImpactReportItem,
  buildAllSchemesPredefinedAnalysis,
  buildCitation,
  buildDeveloperOverview,
  compareSchemeVersions,
  computeSchemeAndRuleAnalytics,
  evaluateAllSchemesEligibility,
  formatRuleDisplay,
  getActiveRulesForScheme,
  retrieveApprovedRulesForQuery,
  reviewRuleDecision,
  runFormSathiReadinessCheck,
  runWhatIfSimulation,
} from '../engine/rulesEngine.ts';
import {
  DOCUMENT_GUIDE_CATALOG,
  buildVaultExpiryAndMismatchWarnings,
  enrichSchemeRecord,
  getSchemeDocumentClassifications,
  getSchemeProcedure8Q,
} from '../engine/schemeMetadata.ts';
import { db } from '../engine/store.ts';
import {
  evaluateEligibilityViaSupabaseRpc,
  isSupabaseConfigured,
  searchRulesInSupabase,
  syncStateToSupabase,
  uploadDocumentToSupabaseStorage,
} from '../engine/supabasePlugin.ts';
import type {
  AllSchemesAiPlanResult,
  ApplicationDraftRecord,
  AppointmentSectorType,
  AppointmentStatus,
  BloodGroupType,
  CitizenInterestTopic,
  ComplaintCategory,
  ComplaintRecord,
  ComplaintStatus,
  DelayAnalysisResult,
  EmergencyLookupResult,
  EmergencyProfile,
  FaqCategory,
  GovChangeAlert,
  GovMonitoringPayload,
  LanguageCode,
  MemorizedDocument,
  NewsFeedItem,
  NewsFeedPayload,
  NotificationPreferences,
  OfficerAppointmentRecord,
  OfficerRoleCategory,
  OrganizationType,
  RuleOperator,
  RuleType,
  SavedNewsUpdate,
  UserRole,
  VoiceLanguageCode,
} from '../../src/types/niyamsetu.ts';

function normalizeVoiceLang(raw: unknown): VoiceLanguageCode {
  if (raw === 'hi') return 'hi';
  if (raw === 'te') return 'te';
  return 'en';
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'text/plain',
]);
const FORBIDDEN_FORM_KEY_PATTERN = /(password|passcode|otp|pin|cvv|mpin|secret)/i;

function sanitizeFormFields(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_FORM_KEY_PATTERN.test(k)) {
      throw new Error(`Security policy blocks collecting sensitive field "${k}" (no passwords, OTPs, or PINs).`);
    }
    if (typeof v === 'string' || typeof v === 'number') {
      result[k.slice(0, 64)] = String(v).trim().slice(0, 500);
    }
  }
  return result;
}

export const apiRouter = express.Router();

apiRouter.use(optionalAuth);

// Health check
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NiyamSetu AI Unified Engine' });
});

// ---------------------------------------------------------------------------
// 1. AUTHENTICATION & ROLES
// ---------------------------------------------------------------------------
apiRouter.post('/auth/demo-signin', (req, res) => {
  const role = String(req.body?.role || 'STUDENT') as UserRole;
  const orgTypeRaw = String(req.body?.organization_type || 'hospital') as OrganizationType;
  const state = db.getState();
  const user =
    role === 'ORGANIZATION'
      ? state.users.find((u) => u.role === 'ORGANIZATION' && u.organization_type === orgTypeRaw) ||
        state.users.find((u) => u.role === 'ORGANIZATION')
      : state.users.find((u) => u.role === role);
  if (!user) {
    res.status(400).json({ error: 'Invalid demo role requested.' });
    return;
  }
  const { password_hash: _, ...profile } = user;
  const token = signSessionToken(profile);
  res.json({ token, user: profile });
});

apiRouter.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const state = db.getState();
  const user = state.users.find((u) => u.email.toLowerCase() === email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const { password_hash: _, ...profile } = user;
  const token = signSessionToken(profile);
  res.json({ token, user: profile });
});

apiRouter.post('/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const language_preference = (req.body?.language_preference === 'te' ? 'te' : 'en') as LanguageCode;

  if (!name || !email || password.length < 8) {
    res
      .status(400)
      .json({ error: 'Name, valid email, and a password of at least 8 characters are required.' });
    return;
  }

  const state = db.getState();
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  // Self-registration strictly assigns STUDENT role (never self-escalates)
  const newUser = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    email,
    role: 'STUDENT' as UserRole,
    language_preference,
    created_at: new Date().toISOString(),
    password_hash: hashPassword(password),
  };
  state.users.push(newUser);
  db.save();

  const { password_hash: _, ...profile } = newUser;
  const token = signSessionToken(profile);
  res.status(201).json({ token, user: profile });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  const { password_hash: _, ...profile } = user;
  res.json({ user: profile });
});

// ---------------------------------------------------------------------------
// 1B. PERSONAL PROFILE & MEMORIZED DOCUMENT VAULT
// ---------------------------------------------------------------------------
apiRouter.get('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  const { password_hash: _, ...profile } = user;
  res.json({ profile });
});

apiRouter.put('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
  if (name) user.name = name;
  if (req.body?.language_preference === 'en' || req.body?.language_preference === 'te') {
    user.language_preference = req.body.language_preference;
  }
  if (typeof req.body?.phone === 'string') user.phone = req.body.phone.trim().slice(0, 32);
  if (typeof req.body?.address === 'string') user.address = req.body.address.trim().slice(0, 300);
  if (typeof req.body?.district === 'string') user.district = req.body.district.trim().slice(0, 80);
  if (typeof req.body?.state === 'string') user.state = req.body.state.trim().slice(0, 80);
  if (typeof req.body?.pincode === 'string') user.pincode = req.body.pincode.trim().slice(0, 16);
  if (typeof req.body?.category === 'string') user.category = req.body.category.trim().slice(0, 64);
  if (typeof req.body?.education_level === 'string') {
    user.education_level = req.body.education_level.trim().slice(0, 120);
  }
  if (req.body?.family_income !== undefined) {
    const val =
      req.body.family_income === '' || req.body.family_income === null
        ? null
        : Number(req.body.family_income);
    user.family_income = val !== null && !Number.isNaN(val) ? Math.max(0, Math.min(100000000, val)) : null;
  }
  if (req.body?.marks_percent !== undefined) {
    const val =
      req.body.marks_percent === '' || req.body.marks_percent === null
        ? null
        : Number(req.body.marks_percent);
    user.marks_percent = val !== null && !Number.isNaN(val) ? Math.max(0, Math.min(100, val)) : null;
  }
  if (typeof req.body?.date_of_birth === 'string') {
    user.date_of_birth = req.body.date_of_birth.trim().slice(0, 24);
  }
  if (typeof req.body?.gender === 'string') {
    user.gender = req.body.gender.trim().slice(0, 32);
  }
  if (typeof req.body?.guardian_name === 'string') {
    user.guardian_name = req.body.guardian_name.trim().slice(0, 120);
  }
  if (typeof req.body?.institution_name === 'string') {
    user.institution_name = req.body.institution_name.trim().slice(0, 180);
  }
  if (typeof req.body?.roll_number === 'string') {
    user.roll_number = req.body.roll_number.trim().slice(0, 64);
  }
  if (req.body?.disability_percent !== undefined) {
    const val =
      req.body.disability_percent === '' || req.body.disability_percent === null
        ? null
        : Number(req.body.disability_percent);
    user.disability_percent =
      val !== null && !Number.isNaN(val) ? Math.max(0, Math.min(100, val)) : null;
  }
  if (typeof req.body?.bank_name === 'string') {
    user.bank_name = req.body.bank_name.trim().slice(0, 120);
  }
  if (typeof req.body?.bank_ifsc === 'string') {
    user.bank_ifsc = req.body.bank_ifsc.trim().toUpperCase().slice(0, 20);
  }
  if (typeof req.body?.bank_account_last4 === 'string') {
    user.bank_account_last4 = req.body.bank_account_last4.trim().slice(0, 8);
  }
  if (typeof req.body?.income_cert_number === 'string') {
    user.income_cert_number = req.body.income_cert_number.trim().slice(0, 80);
  }
  if (typeof req.body?.caste_cert_number === 'string') {
    user.caste_cert_number = req.body.caste_cert_number.trim().slice(0, 80);
  }
  if (req.body?.emergency_profile && typeof req.body.emergency_profile === 'object') {
    const rawEp = req.body.emergency_profile as Partial<EmergencyProfile>;
    const allowedGroups = new Set<BloodGroupType>([
      'A+',
      'A-',
      'B+',
      'B-',
      'AB+',
      'AB-',
      'O+',
      'O-',
      'UNKNOWN',
    ]);
    const existingEp: EmergencyProfile = user.emergency_profile || {
      blood_group: 'UNKNOWN',
      allergies: '',
      chronic_conditions: '',
      medications: '',
      medical_warnings: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      emergency_contact_relation: '',
      biometric_id: `BIO-${user.id.slice(-6).toUpperCase()}`,
      biometric_enrolled: false,
    };
    const nextPhoto =
      typeof rawEp.photo_data_url === 'string' &&
      rawEp.photo_data_url.startsWith('data:image/') &&
      rawEp.photo_data_url.length <= 2_800_000
        ? rawEp.photo_data_url
        : existingEp.photo_data_url;

    user.emergency_profile = {
      blood_group:
        rawEp.blood_group && allowedGroups.has(rawEp.blood_group)
          ? rawEp.blood_group
          : existingEp.blood_group,
      allergies:
        typeof rawEp.allergies === 'string'
          ? rawEp.allergies.trim().slice(0, 300)
          : existingEp.allergies,
      chronic_conditions:
        typeof rawEp.chronic_conditions === 'string'
          ? rawEp.chronic_conditions.trim().slice(0, 300)
          : existingEp.chronic_conditions,
      medications:
        typeof rawEp.medications === 'string'
          ? rawEp.medications.trim().slice(0, 300)
          : existingEp.medications,
      medical_warnings:
        typeof rawEp.medical_warnings === 'string'
          ? rawEp.medical_warnings.trim().slice(0, 300)
          : existingEp.medical_warnings,
      emergency_contact_name:
        typeof rawEp.emergency_contact_name === 'string'
          ? rawEp.emergency_contact_name.trim().slice(0, 120)
          : existingEp.emergency_contact_name,
      emergency_contact_phone:
        typeof rawEp.emergency_contact_phone === 'string'
          ? rawEp.emergency_contact_phone.trim().slice(0, 32)
          : existingEp.emergency_contact_phone,
      emergency_contact_relation:
        typeof rawEp.emergency_contact_relation === 'string'
          ? rawEp.emergency_contact_relation.trim().slice(0, 64)
          : existingEp.emergency_contact_relation,
      biometric_id:
        typeof rawEp.biometric_id === 'string' && rawEp.biometric_id.trim()
          ? rawEp.biometric_id.trim().slice(0, 128)
          : existingEp.biometric_id,
      biometric_enrolled:
        typeof rawEp.biometric_enrolled === 'boolean'
          ? rawEp.biometric_enrolled
          : existingEp.biometric_enrolled,
      emergency_qr_token:
        (rawEp as { regenerate_qr_token?: boolean }).regenerate_qr_token || !existingEp.emergency_qr_token
          ? `QR-EMR-${user.id.slice(-4).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
          : existingEp.emergency_qr_token,
      photo_data_url: nextPhoto,
      organ_donor:
        typeof rawEp.organ_donor === 'boolean' ? rawEp.organ_donor : existingEp.organ_donor,
      updated_at: new Date().toISOString(),
    };
  }
  if (Array.isArray(req.body?.interests)) {
    const allowedInterests = new Set<CitizenInterestTopic>([
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
    ]);
    user.interests = req.body.interests
      .map((item: unknown) => String(item).trim() as CitizenInterestTopic)
      .filter((item: CitizenInterestTopic) => allowedInterests.has(item));
  }
  if (req.body?.notification_preferences && typeof req.body.notification_preferences === 'object') {
    const prefs = req.body.notification_preferences as Partial<NotificationPreferences>;
    user.notification_preferences = {
      scheme_updates:
        typeof prefs.scheme_updates === 'boolean'
          ? prefs.scheme_updates
          : user.notification_preferences?.scheme_updates ?? true,
      rule_changes:
        typeof prefs.rule_changes === 'boolean'
          ? prefs.rule_changes
          : user.notification_preferences?.rule_changes ?? true,
      deadlines:
        typeof prefs.deadlines === 'boolean'
          ? prefs.deadlines
          : user.notification_preferences?.deadlines ?? true,
      daily_digest:
        typeof prefs.daily_digest === 'boolean'
          ? prefs.daily_digest
          : user.notification_preferences?.daily_digest ?? true,
      complaint_updates:
        typeof prefs.complaint_updates === 'boolean'
          ? prefs.complaint_updates
          : user.notification_preferences?.complaint_updates ?? true,
    };
  }
  user.updated_at = new Date().toISOString();

  appendAuditLog({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'Personal profile & address updated',
    objectType: 'user_profile',
    objectId: user.id,
    sourceReference: 'Profile Vault',
    details: `Saved profile & emergency details for ${user.district || 'citizen'} (${user.state || 'India'}).`,
  });
  db.save();

  const { password_hash: _, ...profile } = user;
  res.json({ profile });
});

apiRouter.post('/profile/saved-updates', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  const title = String(req.body?.title || '').trim().slice(0, 180);
  if (!title) {
    res.status(400).json({ error: 'Update title is required.' });
    return;
  }
  const id = String(req.body?.id || `upd-${Date.now().toString(36)}`).trim().slice(0, 80);
  const existingList = Array.isArray(user.saved_updates) ? user.saved_updates : [];
  if (!existingList.some((u) => u.id === id)) {
    const saved: SavedNewsUpdate = {
      id,
      title,
      summary: String(req.body?.summary || '').trim().slice(0, 600),
      category: String(req.body?.category || 'General Update').trim().slice(0, 80),
      source_name: String(req.body?.source_name || 'NiyamSetu').trim().slice(0, 120),
      source_url: String(req.body?.source_url || 'https://india.gov.in/').trim().slice(0, 300),
      published_at: String(req.body?.published_at || new Date().toISOString()).slice(0, 40),
      is_gov_notification: Boolean(req.body?.is_gov_notification),
      saved_at: new Date().toISOString(),
    };
    user.saved_updates = [saved, ...existingList].slice(0, 40);
    user.updated_at = new Date().toISOString();
    db.save();
  }
  res.json({ saved_updates: user.saved_updates || [] });
});

apiRouter.delete('/profile/saved-updates/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const user = state.users.find((u) => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  user.saved_updates = (user.saved_updates || []).filter((u) => u.id !== req.params.id);
  user.updated_at = new Date().toISOString();
  db.save();
  res.json({ saved_updates: user.saved_updates });
});

apiRouter.get('/user-documents', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const docs = state.user_documents.filter((d) => d.user_id === req.user!.id);
  res.json({ documents: docs });
});

apiRouter.post('/user-documents', requireAuth, (req: AuthenticatedRequest, res) => {
  const doc_type = String(req.body?.doc_type || '').trim().slice(0, 120);
  const title = String(req.body?.title || doc_type).trim().slice(0, 180);
  const scheme_id = String(req.body?.scheme_id || 'ALL').trim().slice(0, 64) || 'ALL';
  const doc_number = String(req.body?.doc_number || '').trim().slice(0, 80);
  const extracted_name = String(req.body?.extracted_name || req.user!.name).trim().slice(0, 120);
  const extracted_address = String(req.body?.extracted_address || '').trim().slice(0, 300);
  const notes = String(req.body?.notes || '').trim().slice(0, 1000);

  const rawInc = req.body?.extracted_income;
  const extracted_income =
    rawInc === '' || rawInc === null || rawInc === undefined || Number.isNaN(Number(rawInc))
      ? null
      : Math.max(0, Math.min(100000000, Number(rawInc)));

  const rawMrk = req.body?.extracted_marks;
  const extracted_marks =
    rawMrk === '' || rawMrk === null || rawMrk === undefined || Number.isNaN(Number(rawMrk))
      ? null
      : Math.max(0, Math.min(100, Number(rawMrk)));

  const sourceRaw = String(req.body?.source_activity || 'vault_manual');
  const source_activity: MemorizedDocument['source_activity'] =
    sourceRaw === 'vault_upload' ||
    sourceRaw === 'formsathi_extract' ||
    sourceRaw === 'eligibility_sync'
      ? sourceRaw
      : 'vault_manual';

  const expiry_date =
    typeof req.body?.expiry_date === 'string' ? req.body.expiry_date.trim().slice(0, 24) : '';
  const file_name =
    typeof req.body?.file_name === 'string' ? req.body.file_name.trim().slice(0, 180) : '';
  const file_mime =
    typeof req.body?.file_mime === 'string' ? req.body.file_mime.trim().toLowerCase().slice(0, 80) : '';
  const rawSize = req.body?.file_size_bytes;
  const file_size_bytes =
    rawSize !== undefined && rawSize !== null && !Number.isNaN(Number(rawSize))
      ? Number(rawSize)
      : undefined;

  if (file_mime && !ALLOWED_UPLOAD_MIME_TYPES.has(file_mime)) {
    res.status(400).json({ error: 'Unsupported file format. Accepted formats: PDF, PNG, JPG, JPEG, TXT.' });
    return;
  }
  if (file_size_bytes !== undefined && file_size_bytes > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: 'File exceeds the 5 MB upload safety limit.' });
    return;
  }

  if (!doc_type || !title) {
    res.status(400).json({ error: 'Document type and title are required.' });
    return;
  }

  const state = db.getState();
  const now = new Date().toISOString();
  const existingId = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const existingIdx = existingId
    ? state.user_documents.findIndex((d) => d.id === existingId && d.user_id === req.user!.id)
    : -1;

  let savedDoc: MemorizedDocument;
  if (existingIdx >= 0) {
    savedDoc = {
      ...state.user_documents[existingIdx],
      doc_type,
      title,
      scheme_id,
      doc_number,
      extracted_name,
      extracted_income,
      extracted_marks,
      extracted_address,
      notes,
      expiry_date: expiry_date || state.user_documents[existingIdx].expiry_date,
      file_name: file_name || state.user_documents[existingIdx].file_name,
      file_mime: file_mime || state.user_documents[existingIdx].file_mime,
      file_size_bytes: file_size_bytes ?? state.user_documents[existingIdx].file_size_bytes,
      updated_at: now,
    };
    state.user_documents[existingIdx] = savedDoc;
  } else {
    savedDoc = {
      id: `udoc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: req.user!.id,
      doc_type,
      title,
      scheme_id,
      doc_number,
      extracted_name,
      extracted_income,
      extracted_marks,
      extracted_address,
      notes,
      expiry_date: expiry_date || undefined,
      file_name: file_name || undefined,
      file_mime: file_mime || undefined,
      file_size_bytes,
      source_activity,
      created_at: now,
      updated_at: now,
    };
    state.user_documents.unshift(savedDoc);
  }

  // Optionally sync extracted facts back into the user's persistent profile if empty or requested
  const user = state.users.find((u) => u.id === req.user!.id);
  if (user) {
    if (extracted_income !== null && (req.body?.syncProfile || user.family_income == null)) {
      user.family_income = extracted_income;
    }
    if (extracted_marks !== null && (req.body?.syncProfile || user.marks_percent == null)) {
      user.marks_percent = extracted_marks;
    }
    if (extracted_address && (req.body?.syncProfile || !user.address)) {
      user.address = extracted_address;
    }
    user.updated_at = now;
  }

  appendAuditLog({
    actorId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: 'Document memorized to personal Vault',
    objectType: 'user_document',
    objectId: savedDoc.id,
    sourceReference: savedDoc.scheme_id,
    details: `${savedDoc.doc_type}: "${savedDoc.title}" stored for cross-activity reuse.`,
  });
  db.save();

  res.status(201).json({ document: savedDoc });
});

apiRouter.delete('/user-documents/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const idx = state.user_documents.findIndex((d) => d.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Memorized document not found.' });
    return;
  }
  if (
    state.user_documents[idx].user_id !== req.user!.id &&
    req.user!.role !== 'PLATFORM_ADMIN'
  ) {
    res.status(403).json({ error: 'You can only delete your own memorized documents.' });
    return;
  }
  state.user_documents.splice(idx, 1);
  db.save();
  res.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// 2. PUBLIC OVERVIEW, SCHEMES & DOCUMENT CITATION VIEWER
// ---------------------------------------------------------------------------
apiRouter.get('/overview', (_req, res) => {
  const state = db.getState();
  const draftCount = state.rules.filter((r) => r.status === 'draft').length;
  const activeCount = state.rules.filter((r) => r.status === 'active').length;
  const appliedImpactsCount = state.impact_reports.reduce(
    (sum, r) => sum + r.items.filter((i) => i.status === 'applied').length,
    0
  );

  res.json({
    metrics: {
      total_rules: state.rules.length,
      draft_rules: draftCount,
      active_rules: activeCount,
      applied_impacts: appliedImpactsCount,
      audit_events: state.audit_log.length,
      documents_count: state.documents.length,
      schemes_count: state.schemes.length,
    },
    schemes: state.schemes.map(enrichSchemeRecord),
    documents: state.documents,
    rules: state.rules,
    rule_links: state.rule_links,
    impact_reports: state.impact_reports,
    alerts: state.alerts,
  });
});

apiRouter.get('/schemes', (_req, res) => {
  const state = db.getState();
  res.json({
    schemes: state.schemes.map(enrichSchemeRecord),
    active_rules: state.rules.filter((r) => r.status === 'active'),
  });
});

apiRouter.get('/schemes/:id/detail', (req, res) => {
  const state = db.getState();
  const raw = state.schemes.find((s) => s.id === req.params.id);
  if (!raw) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }
  const scheme = enrichSchemeRecord(raw);
  const procedure_8q = getSchemeProcedure8Q(scheme.id);
  const doc_classifications = getSchemeDocumentClassifications(scheme.id);
  const comparison = compareSchemeVersions(scheme.id);
  const documents = state.documents.filter((d) => d.scheme_id === scheme.id);
  const rules = state.rules.filter((r) => r.scheme_id === scheme.id);
  const deadlines = state.deadlines.filter((d) => d.scheme_id === scheme.id);
  const steps = state.procedure_steps
    .filter((p) => p.scheme_id === scheme.id)
    .sort((a, b) => a.order_number - b.order_number);

  res.json({
    scheme,
    procedure_8q,
    doc_classifications,
    comparison,
    documents,
    rules,
    deadlines,
    steps,
  });
});

apiRouter.get('/document-guide', (req: AuthenticatedRequest, res) => {
  const schemeId = typeof req.query.schemeId === 'string' ? req.query.schemeId : '';
  const state = db.getState();
  const scheme_classifications = schemeId
    ? getSchemeDocumentClassifications(schemeId)
    : [];
  const userDocs = req.user
    ? state.user_documents.filter((d) => d.user_id === req.user!.id)
    : [];
  const vault_warnings = buildVaultExpiryAndMismatchWarnings(userDocs);

  res.json({
    catalog: DOCUMENT_GUIDE_CATALOG,
    scheme_classifications,
    vault_warnings,
  });
});

apiRouter.get('/documents/:id/pages', (req, res) => {
  const state = db.getState();
  const doc = state.documents.find((d) => d.id === req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }
  const pages = state.document_pages
    .filter((p) => p.document_id === doc.id)
    .sort((a, b) => a.page_number - b.page_number);
  const rules = state.rules.filter((r) => r.document_id === doc.id);
  res.json({ document: doc, pages, rules });
});

// ---------------------------------------------------------------------------
// 3. RULEWEAVER — VERSION COMPARISON & AI INGESTION
// ---------------------------------------------------------------------------
apiRouter.get('/ruleweaver/comparison/:schemeId', (req, res) => {
  const state = db.getState();
  const scheme = state.schemes.find((s) => s.id === req.params.schemeId);
  if (!scheme) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }
  const docs = state.documents.filter((d) => d.scheme_id === scheme.id);
  const rows = compareSchemeVersions(scheme.id);
  const changes = state.rule_changes.filter((c) => c.scheme_id === scheme.id);

  res.json({
    scheme,
    documents: docs,
    comparison: rows,
    changes,
  });
});

apiRouter.post(
  '/ruleweaver/ingest',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const docNumber = String(req.body?.docNumber || '').trim();
      const schemeId = String(req.body?.schemeId || 'sch-pm-01').trim();
      const effectiveDate = String(req.body?.effectiveDate || new Date().toISOString().slice(0, 10));
      const rawText = String(req.body?.rawText || '').trim();
      const inlineBase64 = req.body?.inlineBase64 ? String(req.body.inlineBase64) : undefined;
      const mimeType = req.body?.mimeType ? String(req.body.mimeType) : undefined;

      if (!title || !docNumber || (!rawText && !inlineBase64)) {
        res.status(400).json({
          error: 'Document title, document number, and notification text or file are required.',
        });
        return;
      }

      const state = db.getState();
      const scheme = state.schemes.find((s) => s.id === schemeId);
      if (!scheme) {
        res.status(404).json({ error: 'Selected scheme not found.' });
        return;
      }

      const extraction = await extractRulesFromDocument({
        title,
        docNumber,
        rawText,
        inlineBase64,
        mimeType,
      });

      const existingDocs = state.documents.filter((d) => d.scheme_id === schemeId);
      const nextVersion =
        existingDocs.reduce((max, d) => Math.max(max, d.version), 0) + 1;
      const docId = `doc-${Date.now().toString(36)}`;

      let storedSourceUrl = 'Uploaded via RuleWeaver';
      if (isSupabaseConfigured()) {
        const buffer = inlineBase64
          ? Buffer.from(inlineBase64, 'base64')
          : Buffer.from(rawText, 'utf8');
        const ext = mimeType?.includes('pdf') ? 'pdf' : 'txt';
        const uploadRes = await uploadDocumentToSupabaseStorage({
          docId,
          fileName: `${docNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`,
          buffer,
          contentType: mimeType || 'text/plain',
        });
        if (uploadRes.storagePath) {
          storedSourceUrl = `supabase://niyamsetu-documents/${uploadRes.storagePath}`;
        }
      }

      const newDoc = {
        id: docId,
        scheme_id: schemeId,
        title,
        doc_number: docNumber,
        authority: scheme.authority,
        jurisdiction: 'Statewide',
        publication_date: new Date().toISOString().slice(0, 10),
        effective_date: effectiveDate,
        subject: `Extracted amendment v${nextVersion}`,
        version: nextVersion,
        amends_document_id: existingDocs[existingDocs.length - 1]?.id || null,
        source_url: storedSourceUrl,
        verification_status: 'pending_review' as const,
        uploaded_by: req.user!.id,
        created_at: new Date().toISOString(),
      };
      state.documents.push(newDoc);

      extraction.pages.forEach((p) => {
        state.document_pages.push({
          id: `pg-${docId}-${p.page_number}`,
          document_id: docId,
          page_number: p.page_number,
          text: p.text,
          extraction_confidence: p.extraction_confidence,
        });
      });

      const createdRules = extraction.rules.map((r, idx) => {
        const ruleId = `R-U${Date.now().toString(36)}-${idx}`;
        const numericVal = Number(r.value);
        const parsedValue =
          !Number.isNaN(numericVal) &&
          (r.field === 'family_income' || r.field === 'marks_percent')
            ? numericVal
            : r.value;

        const record = {
          id: ruleId,
          document_id: docId,
          scheme_id: schemeId,
          rule_key: r.rule_key,
          version: nextVersion,
          rule_type: (r.rule_type as RuleType) || 'eligibility',
          label: r.label,
          label_te: r.label_te || r.label,
          condition_text: r.condition_text,
          condition_text_te: r.condition_text_te || r.condition_text,
          field: r.field,
          operator: (r.operator as RuleOperator) || '<=',
          value: parsedValue,
          applies_to: r.applies_to || 'All Applicants',
          page_number: r.page_number || 1,
          clause_reference: r.clause_reference || '1',
          confidence: Math.min(0.99, Math.max(0.5, Number(r.confidence) || 0.85)),
          status: 'draft' as const,
          valid_from: effectiveDate,
          valid_to: null,
        };
        state.rules.push(record);

        const prevRule = state.rules
          .filter(
            (pr) =>
              pr.scheme_id === schemeId &&
              pr.rule_key === record.rule_key &&
              pr.id !== record.id
          )
          .sort((a, b) => b.version - a.version)[0];

        state.rule_changes.push({
          id: `rc-${ruleId}`,
          scheme_id: schemeId,
          rule_key: record.rule_key,
          old_rule_id: prevRule ? prevRule.id : null,
          new_rule_id: record.id,
          change_type: prevRule ? 'modified' : 'added',
          summary: `${record.label}: ${record.condition_text}`,
          detected_at: new Date().toISOString(),
          review_status: 'pending',
        });

        state.review_queue.unshift({
          id: `rq-${ruleId}`,
          item_type: 'rule',
          item_id: record.id,
          scheme_id: schemeId,
          reason:
            record.confidence < 0.9
              ? `Low confidence (${Math.round(record.confidence * 100)}%) — verify source page ${record.page_number}`
              : `Extracted from ${docNumber} — awaiting Human Review`,
          confidence: record.confidence,
          status: 'pending',
          decision_note: '',
          reviewed_by: null,
          reviewed_at: null,
        });

        return record;
      });

      appendAuditLog({
        actorId: req.user!.id,
        actorName: req.user!.name,
        actorRole: req.user!.role,
        action: 'Notification ingested via RuleWeaver',
        objectType: 'document',
        objectId: docId,
        sourceReference: docNumber,
        details: `Extracted ${createdRules.length} draft rule(s) into Human Review Queue.`,
      });

      db.save();
      res.status(201).json({
        document: newDoc,
        extracted_rules: createdRules,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document ingestion failed.';
      res.status(500).json({ error: message });
    }
  }
);

// ---------------------------------------------------------------------------
// 4. HUMAN REVIEW QUEUE
// ---------------------------------------------------------------------------
apiRouter.get(
  '/review-queue',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (_req, res) => {
    const state = db.getState();
    const items = state.review_queue.map((q) => {
      const rule = state.rules.find((r) => r.id === q.item_id);
      const oldRule = rule
        ? state.rules
            .filter(
              (r) =>
                r.scheme_id === rule.scheme_id &&
                r.rule_key === rule.rule_key &&
                r.version < rule.version
            )
            .sort((a, b) => b.version - a.version)[0] || null
        : null;
      const doc = rule ? state.documents.find((d) => d.id === rule.document_id) : null;
      return {
        queue_item: q,
        rule,
        old_rule: oldRule,
        document: doc,
        citation: rule ? buildCitation(rule) : '',
      };
    });
    res.json({ items });
  }
);

apiRouter.post(
  '/review-queue/:ruleId/decide',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    try {
      const decision =
        req.body?.decision === 'rejected'
          ? 'rejected'
          : req.body?.decision === 'correction_requested'
          ? 'correction_requested'
          : 'approved';
      const note = String(req.body?.note || '').trim();
      const editedConditionText = req.body?.condition_text
        ? String(req.body.condition_text).trim()
        : null;
      const editedValue = req.body?.value !== undefined ? req.body.value : null;

      const state = db.getState();
      const targetRule = state.rules.find((r) => r.id === req.params.ruleId);
      if (!targetRule) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }

      if (editedConditionText) {
        targetRule.condition_text = editedConditionText;
      }
      if (editedValue !== null && editedValue !== '') {
        const num = Number(editedValue);
        targetRule.value =
          !Number.isNaN(num) &&
          (targetRule.field === 'family_income' || targetRule.field === 'marks_percent')
            ? num
            : String(editedValue);
      }

      const result = reviewRuleDecision({
        ruleId: req.params.ruleId,
        decision,
        note,
        actor: {
          id: req.user!.id,
          name: req.user!.name,
          role: req.user!.role,
        },
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Review action failed.';
      res.status(400).json({ error: message });
    }
  }
);

apiRouter.post(
  '/review-queue/approve-all',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const draftRules = state.rules.filter((r) => r.status === 'draft');
    const results = draftRules.map((r) =>
      reviewRuleDecision({
        ruleId: r.id,
        decision: 'approved',
        note: 'Batch approved by reviewer',
        actor: {
          id: req.user!.id,
          name: req.user!.name,
          role: req.user!.role,
        },
      })
    );
    res.json({ approved_count: results.length, results });
  }
);

// ---------------------------------------------------------------------------
// 5. POLICY RIPPLE ENGINE
// ---------------------------------------------------------------------------
apiRouter.get('/ripple', (_req, res) => {
  const state = db.getState();
  const amendmentRules = state.rules.filter((r) => r.version >= 2);
  res.json({
    amendment_rules: amendmentRules,
    rule_links: state.rule_links,
    impact_reports: state.impact_reports,
  });
});

apiRouter.post(
  '/ripple/:reportId/items/:itemId',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    try {
      const action = req.body?.action === 'reject' ? 'reject' : 'apply';
      const report = applyImpactReportItem({
        reportId: req.params.reportId,
        itemId: req.params.itemId,
        action,
        actor: {
          id: req.user!.id,
          name: req.user!.name,
          role: req.user!.role,
        },
      });
      res.json({ report });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update ripple item.';
      res.status(400).json({ error: message });
    }
  }
);

apiRouter.post(
  '/ripple/:reportId/apply-all',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    try {
      const state = db.getState();
      const report = state.impact_reports.find((r) => r.id === req.params.reportId);
      if (!report) {
        res.status(404).json({ error: 'Impact report not found.' });
        return;
      }
      for (const item of report.items) {
        if (item.status === 'proposed' || item.status === 'approved') {
          applyImpactReportItem({
            reportId: report.id,
            itemId: item.id,
            action: 'apply',
            actor: {
              id: req.user!.id,
              name: req.user!.name,
              role: req.user!.role,
            },
          });
        }
      }
      res.json({ report });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not apply ripple updates.';
      res.status(400).json({ error: message });
    }
  }
);

// ---------------------------------------------------------------------------
// 6. JANSETU AI — GROUNDED BILINGUAL GUIDANCE & PROCEDURES
// ---------------------------------------------------------------------------
apiRouter.post('/jansetu/ask', async (req: AuthenticatedRequest, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    const lang = normalizeVoiceLang(req.body?.lang);
    if (!question) {
      res.status(400).json({ error: 'Please enter a question.' });
      return;
    }

    const state = db.getState();
    const approvedRules = retrieveApprovedRulesForQuery(question, true);
    const docTitlesById = Object.fromEntries(
      state.documents.map((d) => [d.id, `${d.doc_number} (${d.title})`])
    );

    const schemesSummary = state.schemes
      .map(
        (s) =>
          `- ${s.code} (${s.name}): ${s.benefit_summary}${s.is_new ? ' [NEW PLAN]' : ''} | Authority: ${s.authority}`
      )
      .join('\n');

    let userProfileContext: string | undefined;
    if (req.user) {
      const fullUser = state.users.find((u) => u.id === req.user!.id);
      const userDocs = state.user_documents.filter((d) => d.user_id === req.user!.id);
      if (fullUser) {
        userProfileContext = `Applicant: ${fullUser.name} | Category: ${fullUser.category || 'Unset'} | Education: ${fullUser.education_level || 'Unset'} | Income: ${fullUser.family_income != null ? `₹${fullUser.family_income}` : 'Unset'} | Marks: ${fullUser.marks_percent != null ? `${fullUser.marks_percent}%` : 'Unset'} | Saved Vault Docs (${userDocs.length}): ${userDocs.map((d) => d.doc_type).join(', ') || 'None'}`;
      }
    }

    const aiResponse = await answerCitizenQuestionWithAI({
      question,
      lang,
      approvedRules,
      pages: state.document_pages,
      docTitlesById,
      schemesSummary,
      userProfileContext,
    });

    const citedRules = state.rules.filter(
      (r) => r.status === 'active' && aiResponse.cited_rule_ids.includes(r.id)
    );

    const citations = citedRules.map((r) => ({
      rule_id: r.id,
      document_id: r.document_id,
      page_number: r.page_number,
      clause_reference: r.clause_reference,
      label: buildCitation(r),
      condition_text: lang === 'te' ? r.condition_text_te : r.condition_text,
    }));

    appendAuditLog({
      actorId: req.user?.id || 'guest-citizen',
      actorName: req.user?.name || 'Citizen Visitor',
      actorRole: req.user?.role || 'STUDENT',
      action: 'JanSetu question answered by Gemini AI',
      objectType: 'query',
      objectId: `q-${Date.now().toString(36)}`,
      sourceReference:
        citations.map((c) => c.label).join('; ') || 'Gemini AI Guidance',
      details: question,
    });
    db.save();

    res.json({
      question,
      lang,
      answer: aiResponse.answer,
      abstained: aiResponse.abstained,
      grounding_mode: aiResponse.grounding_mode,
      citations,
      disclaimer:
        lang === 'te'
          ? 'ఇది సిస్టమ్‌లోని ఆమోదించిన పత్రాలు మరియు Gemini AI ఆధారంగా అందించిన మార్గదర్శకత్వం మాత్రమే; తుది ఆమోదం సంబంధిత శాఖ పోర్టల్ ద్వారా జరుగుతుంది.'
          : 'Guidance powered by Gemini AI & verified NiyamSetu circular rules. Always verify final submission on the issuing government portal.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JanSetu AI request failed.';
    res.status(500).json({ error: message });
  }
});

apiRouter.get('/jansetu/procedures/:schemeId', (req, res) => {
  const state = db.getState();
  const scheme = state.schemes.find((s) => s.id === req.params.schemeId);
  if (!scheme) {
    res.status(404).json({ error: 'Scheme not found.' });
    return;
  }
  const steps = state.procedure_steps
    .filter((p) => p.scheme_id === scheme.id)
    .sort((a, b) => a.order_number - b.order_number);
  const requiredDocs = state.required_documents.filter(
    (d) => d.scheme_id === scheme.id && d.active
  );
  const activeRules = getActiveRulesForScheme(scheme.id).map((r) => ({
    ...r,
    display_value: formatRuleDisplay(r),
    citation: buildCitation(r),
  }));

  res.json({
    scheme,
    steps,
    required_documents: requiredDocs,
    active_rules: activeRules,
  });
});

// ---------------------------------------------------------------------------
// 7. FORMSATHI AI — APPLICATION READINESS & SYNTHETIC DOC EXTRACTION
// ---------------------------------------------------------------------------
apiRouter.get('/formsathi/reports', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  // Strict ownership check: only return reports belonging to the signed-in user
  const ownReports = state.readiness_reports.filter((r) => r.user_id === req.user!.id);
  const activeReqDocs = state.required_documents.filter((d) => d.active);
  res.json({ reports: ownReports, required_documents: activeReqDocs });
});

apiRouter.post('/formsathi/check', requireAuth, (req: AuthenticatedRequest, res) => {
  const schemeId = String(req.body?.schemeId || 'sch-pm-01');
  const uploadedDocuments = Array.isArray(req.body?.uploadedDocuments)
    ? req.body.uploadedDocuments.map(String)
    : [];
  const rawIncome = req.body?.family_income;
  const rawMarks = req.body?.marks_percent;
  const family_income =
    rawIncome === '' || rawIncome === null || rawIncome === undefined ? null : Number(rawIncome);
  const marks_percent =
    rawMarks === '' || rawMarks === null || rawMarks === undefined ? null : Number(rawMarks);
  const name_on_income_cert = String(req.body?.name_on_income_cert || '');
  const name_on_marksheet = String(req.body?.name_on_marksheet || '');

  const report = runFormSathiReadinessCheck({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: req.user!.role,
    schemeId,
    uploadedDocuments,
    family_income: Number.isNaN(family_income) ? null : family_income,
    marks_percent: Number.isNaN(marks_percent) ? null : marks_percent,
    name_on_income_cert,
    name_on_marksheet,
  });

  res.status(201).json({ report });
});

apiRouter.post('/formsathi/extract-file', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const fileName = String(req.body?.fileName || 'synthetic_document.txt');
    const textContent = req.body?.textContent ? String(req.body.textContent) : undefined;
    const inlineBase64 = req.body?.inlineBase64 ? String(req.body.inlineBase64) : undefined;
    const mimeType = req.body?.mimeType ? String(req.body.mimeType).toLowerCase() : undefined;
    const fileSizeBytes = req.body?.fileSizeBytes !== undefined ? Number(req.body.fileSizeBytes) : undefined;
    const expiryDate = typeof req.body?.expiryDate === 'string' ? req.body.expiryDate.trim().slice(0, 24) : '';
    const saveToVault = req.body?.saveToVault !== false;
    const schemeId = String(req.body?.schemeId || 'ALL').slice(0, 64) || 'ALL';

    if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ error: 'Unsupported file type. Upload PDF, PNG, JPG, JPEG, or TXT.' });
      return;
    }
    if (fileSizeBytes !== undefined && !Number.isNaN(fileSizeBytes) && fileSizeBytes > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: 'File size exceeds 5 MB upload limit.' });
      return;
    }
    if (inlineBase64 && Buffer.byteLength(inlineBase64, 'base64') > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: 'Encoded file payload exceeds 5 MB upload limit.' });
      return;
    }
    if (!textContent && !inlineBase64) {
      res.status(400).json({ error: 'Document content is required.' });
      return;
    }

    const extracted = await extractApplicationDocumentFields({
      fileName,
      textContent,
      inlineBase64,
      mimeType,
    });

    let memorized_document: MemorizedDocument | null = null;
    if (saveToVault) {
      const state = db.getState();
      const now = new Date().toISOString();
      const user = state.users.find((u) => u.id === req.user!.id);
      memorized_document = {
        id: `udoc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: req.user!.id,
        doc_type: extracted.detected_document_type.slice(0, 120),
        title: `${extracted.detected_document_type} (${fileName})`.slice(0, 180),
        scheme_id: schemeId,
        doc_number: `EXT-${Date.now().toString().slice(-6)}`,
        extracted_name: (extracted.applicant_name || req.user!.name).slice(0, 120),
        extracted_income: extracted.family_income,
        extracted_marks: extracted.marks_percent,
        extracted_address: user?.address || '',
        notes: extracted.notes.slice(0, 1000),
        expiry_date: expiryDate || undefined,
        file_name: fileName.slice(0, 180),
        file_mime: mimeType,
        file_size_bytes: !Number.isNaN(fileSizeBytes || NaN) ? fileSizeBytes : undefined,
        source_activity: 'formsathi_extract',
        created_at: now,
        updated_at: now,
      };
      state.user_documents.unshift(memorized_document);
      if (user) {
        if (extracted.family_income !== null && user.family_income == null) {
          user.family_income = extracted.family_income;
        }
        if (extracted.marks_percent !== null && user.marks_percent == null) {
          user.marks_percent = extracted.marks_percent;
        }
        user.updated_at = now;
      }
      db.save();
    }

    res.json({ extracted, memorized_document });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Document extraction failed.';
    res.status(500).json({ error: message });
  }
});

apiRouter.post('/formsathi/map-form', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schemeId = String(req.body?.schemeId || 'sch-pm-01');
    const overrides = sanitizeFormFields(req.body?.overrides);
    const state = db.getState();
    const rawScheme = state.schemes.find((s) => s.id === schemeId);
    if (!rawScheme) {
      res.status(404).json({ error: 'Scheme not found.' });
      return;
    }
    const scheme = enrichSchemeRecord(rawScheme);
    const proc8q = getSchemeProcedure8Q(schemeId);
    const user = state.users.find((u) => u.id === req.user!.id);
    const memorizedDocs = state.user_documents.filter((d) => d.user_id === req.user!.id);

    const mappedResult = await mapApplicationFormWithAI({
      schemeName: scheme.name,
      schemeCode: scheme.code,
      officialWebsite: scheme.official_website || 'https://scholarships.gov.in/',
      targetFields: proc8q?.what_to_enter || [],
      userProfile: (user || { name: req.user!.name }) as unknown as Record<string, unknown>,
      memorizedDocs,
      userOverrides: overrides,
    });

    res.json({
      scheme,
      procedure_8q: proc8q,
      doc_classifications: getSchemeDocumentClassifications(schemeId),
      ...mappedResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form mapping failed.';
    res.status(400).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// 7B. CITIZEN APPLICATIONS (DRAFT -> READY -> EXPLICIT USER CONFIRMATION + DELAY INTELLIGENCE)
// ---------------------------------------------------------------------------
function enrichApplicationWithSla(app: ApplicationDraftRecord): ApplicationDraftRecord {
  const state = db.getState();
  const rawScheme = state.schemes.find((s) => s.id === app.scheme_id);
  const scheme = rawScheme ? enrichSchemeRecord(rawScheme) : null;
  const expectedDays = scheme?.expected_processing_days || 45;
  const refDate = app.submitted_at || app.confirmed_at || app.created_at;
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24))
  );
  const isOverdue = app.status === 'submitted_confirmed' && elapsedDays > expectedDays;

  const timeline_events: NonNullable<ApplicationDraftRecord['timeline_events']> = [
    {
      stage: 'prepared',
      label: 'Draft Prepared in FormSathi',
      timestamp: app.created_at,
      status: 'done',
      note: `${app.attached_documents.length} Vault document(s) attached`,
    },
    {
      stage: 'ready',
      label: 'Readiness Verified for Portal',
      timestamp: app.updated_at,
      status:
        app.status === 'ready_for_portal' || app.status === 'submitted_confirmed'
          ? 'done'
          : app.missing_requirements.length > 0
            ? 'delayed'
            : 'current',
      note:
        app.missing_requirements.length > 0
          ? `${app.missing_requirements.length} missing requirement(s)`
          : 'All mapped fields populated',
    },
    {
      stage: 'submitted',
      label: 'Confirmed Portal Submission',
      timestamp: app.submitted_at || app.confirmed_at || '',
      status: app.status === 'submitted_confirmed' ? 'done' : 'upcoming',
      note: app.portal_reference_number
        ? `Portal Ref: ${app.portal_reference_number}`
        : 'Pending citizen portal filing',
    },
    {
      stage: 'review',
      label: 'Department & DBT Verification',
      timestamp: app.last_status_update || app.updated_at,
      status:
        app.status !== 'submitted_confirmed'
          ? 'upcoming'
          : isOverdue
            ? 'delayed'
            : 'current',
      note:
        app.status === 'submitted_confirmed'
          ? isOverdue
            ? `${elapsedDays} days elapsed (exceeds ${expectedDays}-day published SLA)`
            : `${elapsedDays} of ${expectedDays} published SLA days elapsed`
          : `Expected SLA: ${expectedDays} days post-submission`,
    },
  ];

  const orgVerifications = state.organization_tasks
    .filter((t) => t.citizen_id === app.user_id && t.scheme_code === app.scheme_code)
    .map((t) => ({
      id: t.id,
      org_type: t.org_type,
      org_name: t.org_name,
      status: t.status,
      reference_code: t.reference_code,
      verified_by: t.verified_by,
      updated_at: t.updated_at,
    }));

  const hasFlagged = orgVerifications.some((v) => v.status === 'flagged');
  const hasVerified = orgVerifications.some((v) => v.status === 'verified');

  let approval_status: NonNullable<ApplicationDraftRecord['approval_status']> = 'draft';
  let approval_label = 'Draft Saved (Not Yet Submitted)';
  if (app.status === 'submitted_confirmed') {
    if (hasFlagged) {
      approval_status = 'action_required';
      approval_label = 'Action Required (Flagged by Verifier)';
    } else if (hasVerified) {
      approval_status = 'approved';
      approval_label = 'Approved & Verified';
    } else {
      approval_status = 'under_review';
      approval_label = 'Submitted · Under Department Review';
    }
  } else if (app.status === 'ready_for_portal') {
    approval_status = 'ready_for_portal';
    approval_label = 'Ready for Official Portal (Pending Submission)';
  }

  return {
    ...app,
    submitted_at: app.submitted_at || app.confirmed_at || null,
    last_status_update: app.last_status_update || app.updated_at,
    expected_processing_days: expectedDays,
    elapsed_days: elapsedDays,
    is_overdue: isOverdue,
    handling_department: scheme?.handling_department || scheme?.authority || 'Welfare Department',
    approval_status,
    approval_label,
    org_verifications: orgVerifications,
    timeline_events,
  };
}

apiRouter.get('/applications', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const ownApps = state.applications
    .filter((a) => a.user_id === req.user!.id)
    .map(enrichApplicationWithSla);
  res.json({ applications: ownApps });
});

apiRouter.get('/applications/track/:trackingId', requireAuth, (req: AuthenticatedRequest, res) => {
  const query = decodeURIComponent(String(req.params.trackingId || '')).trim().toLowerCase();
  if (!query) {
    res.status(400).json({ error: 'Please enter an Application ID or Portal Reference Number.' });
    return;
  }

  const state = db.getState();
  const isPrivileged =
    req.user!.role === 'ADMIN' ||
    req.user!.role === 'PLATFORM_ADMIN' ||
    req.user!.role === 'ORGANIZATION';
  const pool = isPrivileged
    ? state.applications
    : state.applications.filter((a) => a.user_id === req.user!.id);

  const exactMatch =
    pool.find((a) => a.id.toLowerCase() === query) ||
    pool.find((a) => (a.portal_reference_number || '').toLowerCase() === query) ||
    pool.find((a) => a.scheme_code.toLowerCase() === query && a.status === 'submitted_confirmed') ||
    pool.find((a) => a.scheme_code.toLowerCase() === query);
  const partialMatch =
    exactMatch ||
    pool.find(
      (a) =>
        a.id.toLowerCase().includes(query) ||
        (a.portal_reference_number || '').toLowerCase().includes(query) ||
        a.scheme_code.toLowerCase().includes(query)
    );

  if (!partialMatch) {
    res.status(404).json({
      error: `No application found for ID "${req.params.trackingId}". Check your Auto-Fill receipt or saved applications list.`,
    });
    return;
  }

  res.json({ application: enrichApplicationWithSla(partialMatch) });
});

apiRouter.post('/applications/:id/delay-analysis', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = db.getState();
    const rawApp = state.applications.find((a) => a.id === req.params.id);
    if (!rawApp) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    if (
      rawApp.user_id !== req.user!.id &&
      req.user!.role !== 'ADMIN' &&
      req.user!.role !== 'PLATFORM_ADMIN'
    ) {
      res.status(403).json({ error: 'Access denied to another citizen application.' });
      return;
    }

    const app = enrichApplicationWithSla(rawApp);
    const rawScheme = state.schemes.find((s) => s.id === app.scheme_id);
    const scheme = rawScheme ? enrichSchemeRecord(rawScheme) : null;
    const citizenProfile = state.users.find((u) => u.id === req.user!.id);
    const lang = (req.body?.lang === 'te' ? 'te' : citizenProfile?.language_preference || 'en') as LanguageCode;

    const verified_reasons: string[] = [];
    if (app.status !== 'submitted_confirmed') {
      verified_reasons.push(
        `Verified NiyamSetu status is "${app.status}" — application has not been marked as submitted on the official government portal yet.`
      );
    } else {
      verified_reasons.push(
        `Confirmed submitted on ${new Date(app.submitted_at || app.created_at).toLocaleDateString('en-IN')} (${app.elapsed_days} day(s) elapsed vs ${app.expected_processing_days}-day published SLA).`
      );
    }
    if (app.missing_requirements.length > 0) {
      verified_reasons.push(
        `Missing verified prerequisites: ${app.missing_requirements.join('; ')}.`
      );
    }
    if (app.is_overdue) {
      verified_reasons.push(
        `Published processing window (${app.expected_processing_days} days) has passed without a recorded sanction update.`
      );
    }

    const ai = await analyzeApplicationDelayWithAI({
      schemeCode: app.scheme_code,
      schemeName: app.scheme_name,
      verifiedStatus: app.status,
      submissionDate: app.submitted_at || null,
      lastUpdate: app.last_status_update || app.updated_at,
      handlingDepartment: app.handling_department || scheme?.authority || 'Welfare Department',
      expectedProcessingDays: app.expected_processing_days || 45,
      elapsedDays: app.elapsed_days || 0,
      isOverdue: Boolean(app.is_overdue),
      missingRequirements: app.missing_requirements,
      officialContact: scheme?.contact_info || 'Official Departmental Nodal Office',
      grievanceChannel: scheme?.grievance_portal_url || 'https://pgportal.gov.in/',
      lang,
    });

    const result: DelayAnalysisResult = {
      application_id: app.id,
      scheme_code: app.scheme_code,
      scheme_name: app.scheme_name,
      verified_status: app.status,
      submission_date: app.submitted_at || null,
      last_update: app.last_status_update || app.updated_at,
      handling_department: app.handling_department || scheme?.authority || 'Welfare Department',
      expected_processing_days: app.expected_processing_days || 45,
      elapsed_days: app.elapsed_days || 0,
      is_overdue: Boolean(app.is_overdue),
      pending_documents: app.missing_requirements,
      next_steps: ai.next_steps,
      official_contact: scheme?.contact_info || 'See scheme official portal',
      grievance_channel: scheme?.grievance_portal_url || 'https://pgportal.gov.in/',
      verified_reasons,
      possible_explanations: ai.possible_explanations,
      unknown_factors: ai.unknown_factors,
      ai_explanation: ai.ai_explanation,
      analyzed_at: new Date().toISOString(),
      model_used: ai.model_used,
    };

    res.json({ analysis: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delay analysis failed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.post('/applications/prepare', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const schemeId = String(req.body?.schemeId || 'sch-pm-01');
    const state = db.getState();
    const rawScheme = state.schemes.find((s) => s.id === schemeId);
    if (!rawScheme) {
      res.status(404).json({ error: 'Selected scheme not found.' });
      return;
    }
    const scheme = enrichSchemeRecord(rawScheme);
    const form_fields = sanitizeFormFields(req.body?.form_fields);
    const attached_documents = Array.isArray(req.body?.attached_documents)
      ? req.body.attached_documents.map((d: unknown) => String(d).trim().slice(0, 120)).filter(Boolean)
      : [];
    const missing_requirements = Array.isArray(req.body?.missing_requirements)
      ? req.body.missing_requirements.map((m: unknown) => String(m).trim().slice(0, 200)).filter(Boolean)
      : [];
    const ai_mapping_summary = String(req.body?.ai_mapping_summary || '').trim().slice(0, 1000);
    const status: ApplicationDraftRecord['status'] =
      req.body?.status === 'ready_for_portal' && missing_requirements.length === 0
        ? 'ready_for_portal'
        : 'draft';

    const now = new Date().toISOString();
    const draftId = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
    const existingIdx = draftId
      ? state.applications.findIndex((a) => a.id === draftId && a.user_id === req.user!.id)
      : state.applications.findIndex(
          (a) =>
            a.user_id === req.user!.id &&
            a.scheme_id === scheme.id &&
            a.status !== 'submitted_confirmed'
        );

    let record: ApplicationDraftRecord;
    if (existingIdx >= 0) {
      record = {
        ...state.applications[existingIdx],
        form_fields,
        attached_documents,
        missing_requirements,
        ai_mapping_summary,
        status:
          state.applications[existingIdx].status === 'submitted_confirmed'
            ? 'submitted_confirmed'
            : status,
        portal_url: scheme.official_website || 'https://scholarships.gov.in/',
        updated_at: now,
      };
      state.applications[existingIdx] = record;
    } else {
      record = {
        id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        user_id: req.user!.id,
        scheme_id: scheme.id,
        scheme_code: scheme.code,
        scheme_name: scheme.name,
        status,
        form_fields,
        attached_documents,
        missing_requirements,
        ai_mapping_summary,
        portal_url: scheme.official_website || 'https://scholarships.gov.in/',
        user_confirmed_submission: false,
        created_at: now,
        updated_at: now,
        confirmed_at: null,
      };
      state.applications.unshift(record);
    }

    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: `Application ${record.status} saved`,
      objectType: 'application',
      objectId: record.id,
      sourceReference: scheme.code,
      details: `${scheme.name} draft updated (${attached_documents.length} doc(s) attached).`,
    });
    db.save();
    res.status(201).json({ application: record });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to prepare application draft.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.patch('/applications/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const state = db.getState();
    const idx = state.applications.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Application draft not found.' });
      return;
    }
    if (
      state.applications[idx].user_id !== req.user!.id &&
      req.user!.role !== 'PLATFORM_ADMIN'
    ) {
      res.status(403).json({ error: 'Access denied to another user application.' });
      return;
    }

    const existing = state.applications[idx];
    const now = new Date().toISOString();

    if (req.body?.form_fields) {
      existing.form_fields = sanitizeFormFields(req.body.form_fields);
    }
    if (Array.isArray(req.body?.attached_documents)) {
      existing.attached_documents = req.body.attached_documents.map((d: unknown) =>
        String(d).trim().slice(0, 120)
      );
    }
    if (Array.isArray(req.body?.missing_requirements)) {
      existing.missing_requirements = req.body.missing_requirements.map((m: unknown) =>
        String(m).trim().slice(0, 200)
      );
    }
    if (req.body?.confirmPortalSubmission === true) {
      const refNum =
        typeof req.body?.portal_reference_number === 'string'
          ? req.body.portal_reference_number.trim().slice(0, 80)
          : '';
      existing.status = 'submitted_confirmed';
      existing.user_confirmed_submission = true;
      existing.confirmed_at = now;
      if (refNum) {
        existing.portal_reference_number = refNum;
      }
      appendAuditLog({
        actorId: req.user!.id,
        actorName: req.user!.name,
        actorRole: req.user!.role,
        action: 'Citizen confirmed official portal submission',
        objectType: 'application',
        objectId: existing.id,
        sourceReference: existing.scheme_code,
        details: refNum
          ? `User confirmed submission with portal reference: ${refNum}`
          : 'User confirmed official portal submission (no reference number entered).',
      });
    } else if (req.body?.status === 'ready_for_portal' || req.body?.status === 'draft') {
      existing.status = req.body.status;
    }

    existing.updated_at = now;
    db.save();
    res.json({ application: existing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update application.';
    res.status(400).json({ error: msg });
  }
});

apiRouter.delete('/applications/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const idx = state.applications.findIndex((a) => a.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Application draft not found.' });
    return;
  }
  if (
    state.applications[idx].user_id !== req.user!.id &&
    req.user!.role !== 'PLATFORM_ADMIN'
  ) {
    res.status(403).json({ error: 'You can only delete your own application drafts.' });
    return;
  }
  state.applications.splice(idx, 1);
  db.save();
  res.json({ deleted: true });
});

apiRouter.delete('/formsathi/reports/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const idx = state.readiness_reports.findIndex((r) => r.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  if (
    state.readiness_reports[idx].user_id !== req.user!.id &&
    req.user!.role !== 'PLATFORM_ADMIN'
  ) {
    res.status(403).json({ error: 'You can only delete your own readiness reports.' });
    return;
  }
  state.readiness_reports.splice(idx, 1);
  db.save();
  res.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// 8. SCHEME ELIGIBILITY FINDER & WHAT-IF SIMULATOR (DETERMINISTIC CODE)
// ---------------------------------------------------------------------------
apiRouter.post('/eligibility/evaluate', (req, res) => {
  const rawIncome = req.body?.family_income;
  const rawMarks = req.body?.marks_percent;
  const family_income =
    rawIncome === '' || rawIncome === null || rawIncome === undefined ? null : Number(rawIncome);
  const marks_percent =
    rawMarks === '' || rawMarks === null || rawMarks === undefined ? null : Number(rawMarks);

  const results = evaluateAllSchemesEligibility({
    family_income: Number.isNaN(family_income) ? null : family_income,
    marks_percent: Number.isNaN(marks_percent) ? null : marks_percent,
  });
  res.json({ results });
});

apiRouter.post('/whatif/simulate', (req, res) => {
  const schemeId = String(req.body?.schemeId || 'sch-pm-01');
  const rawIncome = req.body?.family_income;
  const rawMarks = req.body?.marks_percent;
  const family_income =
    rawIncome === '' || rawIncome === null || rawIncome === undefined ? null : Number(rawIncome);
  const marks_percent =
    rawMarks === '' || rawMarks === null || rawMarks === undefined ? null : Number(rawMarks);

  const simulation = runWhatIfSimulation({
    schemeId,
    family_income: Number.isNaN(family_income) ? null : family_income,
    marks_percent: Number.isNaN(marks_percent) ? null : marks_percent,
  });
  res.json({ simulation });
});

apiRouter.get('/eligibility/vault-summary', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const user = state.users.find((u) => u.id === req.user!.id);
  const memorizedDocs = state.user_documents.filter((d) => d.user_id === req.user!.id);

  const baseline = buildAllSchemesPredefinedAnalysis({
    userProfile: user || { name: req.user!.name },
    memorizedDocs,
  });

  const eligible_count = baseline.scheme_tasks.filter(
    (s) => s.eligibility_status === 'likely_eligible'
  ).length;
  const possible_count = baseline.scheme_tasks.filter(
    (s) => s.eligibility_status === 'possibly_eligible'
  ).length;

  const plan: AllSchemesAiPlanResult = {
    generated_at: new Date().toISOString(),
    model_used: 'Deterministic Rules Engine + Vault',
    profile_summary: `${user?.name || req.user!.name} · ${user?.district || 'District unset'}, ${
      user?.state || 'State unset'
    } · Income ${
      baseline.effective_income !== null ? `₹${baseline.effective_income.toLocaleString('en-IN')}` : 'Unset'
    } · Marks ${baseline.effective_marks !== null ? `${baseline.effective_marks}%` : 'Unset'}`,
    memorized_docs_count: memorizedDocs.length,
    total_schemes_evaluated: baseline.scheme_tasks.length,
    eligible_count,
    possible_count,
    not_eligible_count: baseline.scheme_tasks.length - eligible_count - possible_count,
    executive_strategy: `Evaluated all ${baseline.scheme_tasks.length} schemes using your saved personal profile and ${memorizedDocs.length} memorized document(s). ${eligible_count} scheme(s) currently meet deterministic eligibility criteria. Click "Run AI Deep All-16 Plan" for Gemini 4 Hydrogen cross-scheme optimization.`,
    cross_scheme_advanced_tasks: [
      {
        priority: 'high',
        title: 'Reuse Memorized Vault Certificates Across Eligible Schemes',
        action: `Your ${memorizedDocs.length} memorized document(s) automatically satisfy common KYC/income/marks checks across multiple schemes without re-uploading.`,
        impacted_schemes: baseline.scheme_tasks
          .filter((s) => s.eligibility_status === 'likely_eligible')
          .slice(0, 6)
          .map((s) => s.scheme_code),
      },
      {
        priority: 'medium',
        title: 'Complete Missing Scheme-Specific Certificates',
        action:
          'Upload specialized proofs (e.g., Enrolment, UDID, Caste, Sports, or Research Synopsis) to unlock remaining eligible or newly introduced schemes.',
        impacted_schemes: baseline.scheme_tasks
          .filter((s) => s.missing_docs.length > 0)
          .slice(0, 6)
          .map((s) => s.scheme_code),
      },
    ],
    scheme_plans: baseline.scheme_tasks,
  };

  res.json({ plan });
});

apiRouter.post('/eligibility/ai-plan', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = db.getState();
    const user = state.users.find((u) => u.id === req.user!.id);
    const lang = (req.body?.lang === 'te' ? 'te' : user?.language_preference || 'en') as LanguageCode;
    const memorizedDocs = state.user_documents.filter((d) => d.user_id === req.user!.id);

    const baseline = buildAllSchemesPredefinedAnalysis({
      userProfile: user || { name: req.user!.name },
      memorizedDocs,
    });

    const aiEnhancement = await generateAllSchemesAdvancedPlan({
      lang,
      userProfile: {
        name: user?.name || req.user!.name,
        address: user?.address,
        district: user?.district,
        state: user?.state,
        category: user?.category,
        education_level: user?.education_level,
        family_income: baseline.effective_income,
        marks_percent: baseline.effective_marks,
      },
      memorizedDocs,
      baselineSchemes: baseline.scheme_tasks,
    });

    const aiByCode = new Map(
      aiEnhancement.scheme_advanced_tasks.map((item) => [
        item.scheme_code.trim().toUpperCase(),
        item.advanced_tasks,
      ])
    );

    const mergedSchemes = baseline.scheme_tasks.map((s) => {
      const aiTasks = aiByCode.get(s.scheme_code.trim().toUpperCase());
      return {
        ...s,
        advanced_tasks:
          aiTasks && aiTasks.length > 0 ? aiTasks : s.advanced_tasks,
      };
    });

    const eligible_count = mergedSchemes.filter(
      (s) => s.eligibility_status === 'likely_eligible'
    ).length;
    const possible_count = mergedSchemes.filter(
      (s) => s.eligibility_status === 'possibly_eligible'
    ).length;

    const plan: AllSchemesAiPlanResult = {
      generated_at: new Date().toISOString(),
      model_used: 'gemini-4-hydrogen + Deterministic Rules Engine',
      profile_summary: `${user?.name || req.user!.name} · ${user?.district || 'District unset'}, ${
        user?.state || 'State unset'
      } · Income ${
        baseline.effective_income !== null ? `₹${baseline.effective_income.toLocaleString('en-IN')}` : 'Unset'
      } · Marks ${baseline.effective_marks !== null ? `${baseline.effective_marks}%` : 'Unset'}`,
      memorized_docs_count: memorizedDocs.length,
      total_schemes_evaluated: mergedSchemes.length,
      eligible_count,
      possible_count,
      not_eligible_count: mergedSchemes.length - eligible_count - possible_count,
      executive_strategy: aiEnhancement.executive_strategy,
      cross_scheme_advanced_tasks: aiEnhancement.cross_scheme_advanced_tasks.map((t) => ({
        priority: t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium',
        title: t.title,
        action: t.action,
        impacted_schemes: Array.isArray(t.impacted_schemes) ? t.impacted_schemes : [],
      })),
      scheme_plans: mergedSchemes,
    };

    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'AI All-16-Scheme Eligibility & Task Plan generated',
      objectType: 'eligibility_plan',
      objectId: `plan-${Date.now().toString(36)}`,
      sourceReference: 'gemini-4-hydrogen + 16 Schemes',
      details: `${eligible_count} eligible across ${mergedSchemes.length} schemes using ${memorizedDocs.length} memorized doc(s).`,
    });
    db.save();

    res.json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI eligibility planning failed.';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// 8B. DEVELOPER SCHEMA, AST & API TELEMETRY CONSOLE
// ---------------------------------------------------------------------------
apiRouter.get(
  '/developer/overview',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN', 'DEVELOPER']),
  (_req, res) => {
    res.json(buildDeveloperOverview());
  }
);

// ---------------------------------------------------------------------------
// 9. DEADLINES, ALERTS & GRIEVANCE / RTI ASSISTANT
// ---------------------------------------------------------------------------
apiRouter.get('/deadlines', (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const role = req.user?.role || 'STUDENT';
  const visible =
    role === 'STUDENT'
      ? state.deadlines.filter((d) => d.owner_role === 'STUDENT')
      : state.deadlines;
  res.json({ deadlines: visible });
});

apiRouter.patch('/deadlines/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const dl = state.deadlines.find((d) => d.id === req.params.id);
  if (!dl) {
    res.status(404).json({ error: 'Deadline task not found.' });
    return;
  }
  if (dl.owner_role !== req.user!.role && req.user!.role === 'STUDENT') {
    res.status(403).json({ error: 'Cannot modify another role task.' });
    return;
  }
  if (req.body?.status === 'completed' || req.body?.status === 'pending') {
    dl.status = req.body.status;
  }
  db.save();
  res.json({ deadline: dl });
});

apiRouter.get('/alerts', (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const role = req.user?.role || 'STUDENT';
  const visible = state.alerts.filter(
    (a) => a.target_role === 'ALL' || a.target_role === role || role === 'PLATFORM_ADMIN'
  );
  res.json({ alerts: visible });
});

apiRouter.patch('/alerts/:id/read', requireAuth, (req, res) => {
  const state = db.getState();
  const alert = state.alerts.find((a) => a.id === req.params.id);
  if (!alert) {
    res.status(404).json({ error: 'Alert not found.' });
    return;
  }
  alert.read = true;
  db.save();
  res.json({ alert });
});

apiRouter.post('/grievance/draft', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const mode = req.body?.mode === 'RTI' ? 'RTI' : 'GRIEVANCE';
    const subject = String(req.body?.subject || '').trim();
    const details = String(req.body?.details || '').trim();
    const lang = normalizeVoiceLang(req.body?.lang);

    if (!subject || !details) {
      res.status(400).json({ error: 'Subject and situation details are required.' });
      return;
    }

    const state = db.getState();
    const approvedRules = state.rules.filter((r) => r.status === 'active');
    const docTitlesById = Object.fromEntries(
      state.documents.map((d) => [d.id, d.doc_number])
    );

    const draft = await draftGrievanceOrRtiWithAI({
      mode,
      subject,
      applicantName: req.user!.name,
      details,
      lang,
      approvedRules,
      docTitlesById,
    });

    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: `${mode} draft generated`,
      objectType: 'grievance_draft',
      objectId: `grv-${Date.now().toString(36)}`,
      sourceReference: draft.cited_clauses.join('; ') || 'Active scheme rules',
      details: subject,
    });
    db.save();

    res.json({
      ...draft,
      disclaimer:
        'This draft is a starting template for your review. It is not legal advice. Verify details before submitting to the authority.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate draft.';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// 10. AUDIT DASHBOARD, OFFICIAL SOURCE MONITOR & DOCUMENT SOURCE CHECK
// ---------------------------------------------------------------------------
apiRouter.get(
  '/audit',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (_req, res) => {
    const state = db.getState();
    res.json({ audit_log: state.audit_log });
  }
);

apiRouter.get('/sources', (_req, res) => {
  const state = db.getState();
  res.json({ sources: state.sources });
});

apiRouter.post(
  '/sources',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 140);
    const department = String(req.body?.department || '').trim().slice(0, 140);
    const url = String(req.body?.url || '').trim().slice(0, 300);
    const check_frequency = String(req.body?.check_frequency || 'Daily').trim().slice(0, 40);

    if (!name || !department || !url) {
      res.status(400).json({ error: 'Source name, department, and official URL are required.' });
      return;
    }

    const state = db.getState();
    const newSource = {
      id: `src-${Date.now().toString(36)}`,
      name,
      department,
      url,
      check_frequency,
      last_checked: new Date().toISOString(),
      last_status: 'verified' as const,
      active: true,
    };
    state.sources.unshift(newSource);
    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'Official source added',
      objectType: 'source',
      objectId: newSource.id,
      sourceReference: url,
      details: `Added ${name} (${department}).`,
    });
    db.save();
    res.status(201).json({ source: newSource });
  }
);

apiRouter.patch(
  '/sources/:id',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const src = state.sources.find((s) => s.id === req.params.id);
    if (!src) {
      res.status(404).json({ error: 'Source not found.' });
      return;
    }
    const allowedStatus = new Set(['verified', 'new_document_found', 'unchanged', 'outdated']);
    if (typeof req.body?.last_status === 'string' && allowedStatus.has(req.body.last_status)) {
      src.last_status = req.body.last_status as typeof src.last_status;
    }
    if (typeof req.body?.active === 'boolean') {
      src.active = req.body.active;
    }
    if (typeof req.body?.url === 'string' && req.body.url.trim()) {
      src.url = req.body.url.trim().slice(0, 300);
    }
    src.last_checked = new Date().toISOString();
    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'Official source status updated',
      objectType: 'source',
      objectId: src.id,
      sourceReference: src.url,
      details: `Status set to ${src.last_status} (active=${src.active}).`,
    });
    db.save();
    res.json({ source: src });
  }
);

apiRouter.post(
  '/sources/:id/scan',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const src = state.sources.find((s) => s.id === req.params.id);
    if (!src) {
      res.status(404).json({ error: 'Source not found.' });
      return;
    }
    src.last_checked = new Date().toISOString();
    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'Monitored source scanned',
      objectType: 'source',
      objectId: src.id,
      sourceReference: src.url,
      details: `Checked ${src.name}; status: ${src.last_status}.`,
    });
    db.save();
    res.json({ source: src });
  }
);

// ---------------------------------------------------------------------------
// 10B. GOVERNMENT MONITORING & USER/ROLE ADMINISTRATION
// ---------------------------------------------------------------------------
apiRouter.get(
  '/gov/monitoring',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (_req, res) => {
    const state = db.getState();
    const drafts = state.applications.filter((a) => a.status === 'draft').length;
    const ready_for_portal = state.applications.filter((a) => a.status === 'ready_for_portal').length;
    const submitted_confirmed = state.applications.filter(
      (a) => a.status === 'submitted_confirmed'
    ).length;

    const missingCounts = new Map<string, number>();
    state.readiness_reports.forEach((rr) => {
      rr.missing.forEach((m) => {
        const clean = m.item.replace(/^Missing:\s*/i, '').trim();
        missingCounts.set(clean, (missingCounts.get(clean) || 0) + 1);
      });
    });
    state.applications.forEach((app) => {
      app.missing_requirements.forEach((m) => {
        const clean = m.replace(/^Missing required portal entry:\s*/i, '').trim();
        missingCounts.set(clean, (missingCounts.get(clean) || 0) + 1);
      });
    });

    const missing_document_bottlenecks = Array.from(missingCounts.entries())
      .map(([document_name, missing_count]) => ({ document_name, missing_count }))
      .sort((a, b) => b.missing_count - a.missing_count)
      .slice(0, 10);

    const scheme_activity = state.schemes.map((s) => ({
      scheme_id: s.id,
      scheme_code: s.code,
      scheme_name: s.name,
      drafts_count: state.applications.filter(
        (a) => a.scheme_id === s.id && a.status !== 'submitted_confirmed'
      ).length,
      confirmed_count: state.applications.filter(
        (a) => a.scheme_id === s.id && a.status === 'submitted_confirmed'
      ).length,
      readiness_checks_count: state.readiness_reports.filter((r) => r.scheme_id === s.id).length,
    }));

    const { scheme_usage, rule_usefulness } = computeSchemeAndRuleAnalytics();

    const orgTypes: OrganizationType[] = ['hospital', 'bank', 'college', 'other'];
    const by_type = orgTypes.map((ot) => {
      const list = state.organization_tasks.filter((t) => t.org_type === ot);
      return {
        org_type: ot,
        total: list.length,
        pending: list.filter((t) => t.status === 'pending').length,
        verified: list.filter((t) => t.status === 'verified').length,
        flagged: list.filter((t) => t.status === 'flagged').length,
      };
    });

    const recent_emergency_lookups = state.audit_log
      .filter((a) => a.object_type === 'emergency_lookup')
      .slice(0, 12)
      .map((a) => ({
        id: a.id,
        timestamp: a.timestamp,
        actor_name: a.actor_name,
        details: a.details,
        source_reference: a.source_reference,
      }));

    const regionalMap = new Map<
      string,
      { state: string; district: string; citizens: number; applications: number; complaints: number }
    >();
    const addRegion = (stRaw?: string, distRaw?: string, key?: 'citizens' | 'applications' | 'complaints') => {
      const st = (stRaw || 'Telangana').trim() || 'Telangana';
      const dist = (distRaw || 'Hyderabad').trim() || 'Hyderabad';
      const mapKey = `${st}::${dist}`;
      const existing = regionalMap.get(mapKey) || {
        state: st,
        district: dist,
        citizens: 0,
        applications: 0,
        complaints: 0,
      };
      if (key) existing[key] += 1;
      regionalMap.set(mapKey, existing);
    };
    const userById = new Map(state.users.map((u) => [u.id, u]));
    state.users.filter((u) => u.role === 'STUDENT').forEach((u) => addRegion(u.state, u.district, 'citizens'));
    state.applications.forEach((a) => {
      const owner = userById.get(a.user_id);
      addRegion(owner?.state, owner?.district, 'applications');
    });
    state.complaints.forEach((c) => {
      const owner = userById.get(c.user_id);
      addRegion(owner?.state, owner?.district, 'complaints');
    });

    const catCountMap = new Map<string, number>();
    const cmpOrgMap = new Map<OrganizationType | 'government', number>();
    state.complaints.forEach((c) => {
      catCountMap.set(c.category, (catCountMap.get(c.category) || 0) + 1);
      cmpOrgMap.set(c.org_type, (cmpOrgMap.get(c.org_type) || 0) + 1);
    });
    const delayFlaggedAppsCount = state.applications
      .map(enrichApplicationWithSla)
      .filter((a) => a.is_overdue).length;

    const payload: GovMonitoringPayload = {
      totals: {
        drafts,
        ready_for_portal,
        submitted_confirmed,
        readiness_checks: state.readiness_reports.length,
        registered_citizens: state.users.filter((u) => u.role === 'STUDENT').length,
      },
      missing_document_bottlenecks,
      scheme_activity,
      recent_applications: state.applications.slice(0, 20).map((a) => ({
        id: a.id,
        scheme_code: a.scheme_code,
        scheme_name: a.scheme_name,
        status: a.status,
        missing_count: a.missing_requirements.length,
        updated_at: a.updated_at,
      })),
      scheme_usage,
      rule_usefulness,
      org_summary: {
        total_tasks: state.organization_tasks.length,
        pending_tasks: state.organization_tasks.filter((t) => t.status === 'pending').length,
        verified_tasks: state.organization_tasks.filter((t) => t.status === 'verified').length,
        flagged_tasks: state.organization_tasks.filter((t) => t.status === 'flagged').length,
        gov_inspected_count: state.organization_tasks.filter((t) => t.gov_inspected).length,
        emergency_lookups_count: state.audit_log.filter(
          (a) => a.object_type === 'emergency_lookup'
        ).length,
        by_type,
      },
      recent_emergency_lookups,
      complaints_summary: {
        total: state.complaints.length,
        open: state.complaints.filter((c) => c.status !== 'resolved').length,
        resolved: state.complaints.filter((c) => c.status === 'resolved').length,
        by_category: Array.from(catCountMap.entries()).map(([category, count]) => ({
          category,
          count,
        })),
        by_org_type: Array.from(cmpOrgMap.entries()).map(([org_type, count]) => ({
          org_type,
          count,
        })),
      },
      regional_demand: Array.from(regionalMap.values()).sort(
        (a, b) => b.citizens + b.applications - (a.citizens + a.applications)
      ),
      feedback_intelligence: {
        unanswered_faq_reports: state.unanswered_faq_reports.length,
        delay_flagged_apps_count: delayFlaggedAppsCount,
        top_unanswered_questions: state.unanswered_faq_reports.slice(0, 10),
      },
    };
    res.json(payload);
  }
);

// ---------------------------------------------------------------------------
// 10C. EMERGENCY RESPONDER LOOKUP & ORGANIZATION WORKSPACE (HOSPITAL/BANK/COLLEGE/OTHER)
// ---------------------------------------------------------------------------
function computeAgeYears(dob?: string): number | null {
  if (!dob) return null;
  const parsed = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diff = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
}

apiRouter.get(
  '/gov/emergency-candidates',
  requireAuth,
  requireRole(['ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN']),
  (_req, res) => {
    const state = db.getState();
    const candidates = state.users
      .filter((u) => u.role === 'STUDENT' && u.emergency_profile)
      .map((u) => ({
        id: u.id,
        name: u.name,
        biometric_id: u.emergency_profile?.biometric_id || '',
        district: u.district || 'India',
        photo_data_url: u.emergency_profile?.photo_data_url || '',
      }));
    res.json({ candidates });
  }
);

apiRouter.post(
  '/gov/emergency-lookup',
  requireAuth,
  requireRole(['ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const mode: 'biometric' | 'image' =
        req.body?.mode === 'image' ? 'image' : 'biometric';
      const biometricToken = String(req.body?.biometric_token || '').trim();
      const imageBase64 = String(req.body?.imageBase64 || '').trim();
      const mimeType = String(req.body?.mimeType || 'image/jpeg').trim();
      const fileName = String(req.body?.fileName || '').trim();
      const citizenHint = String(req.body?.citizen_hint || '').trim();

      const state = db.getState();
      const enrolledCitizens = state.users.filter(
        (u) => u.role === 'STUDENT' && u.emergency_profile
      );

      let matchedUser: (typeof enrolledCitizens)[number] | null = null;
      let confidence = 0;
      let matchReason = '';

      if (mode === 'biometric') {
        if (!biometricToken) {
          res.status(400).json({ error: 'Enter or scan a biometric emergency pass token.' });
          return;
        }
        const tokLow = biometricToken.toLowerCase();
        matchedUser =
          enrolledCitizens.find(
            (u) =>
              u.emergency_profile?.biometric_id?.toLowerCase() === tokLow ||
              u.id.toLowerCase() === tokLow ||
              u.name.toLowerCase() === tokLow
          ) || null;
        if (matchedUser) {
          confidence = 0.99;
          matchReason = `Exact biometric passkey match (${matchedUser.emergency_profile?.biometric_id}).`;
        } else {
          matchReason = `No enrolled emergency biometric profile matches "${biometricToken}".`;
        }
      } else {
        if (!imageBase64 && !citizenHint) {
          res.status(400).json({
            error: 'Upload a patient photo/image or provide an emergency identifier hint.',
          });
          return;
        }

        // First check direct data URL byte match against registered SVG/photos
        if (imageBase64) {
          matchedUser =
            enrolledCitizens.find((u) => {
              const registered = u.emergency_profile?.photo_data_url || '';
              if (!registered) return false;
              const commaIdx = registered.indexOf(',');
              const payload = commaIdx >= 0 ? registered.slice(commaIdx + 1) : '';
              return (
                payload === imageBase64 ||
                decodeURIComponent(payload) === Buffer.from(imageBase64, 'base64').toString('utf8')
              );
            }) || null;
        }

        if (matchedUser) {
          confidence = 0.98;
          matchReason = `Exact registered emergency photo signature matched for ${matchedUser.name}.`;
        } else {
          const aiMatch = await matchEmergencyCitizenPhotoWithAI({
            imageBase64,
            mimeType,
            fileName,
            citizenHint,
            candidates: enrolledCitizens.map((u) => ({
              id: u.id,
              name: u.name,
              district: u.district || '',
              blood_group: u.emergency_profile?.blood_group || 'UNKNOWN',
              biometric_id: u.emergency_profile?.biometric_id || '',
              photo_data_url: u.emergency_profile?.photo_data_url,
            })),
          });
          if (aiMatch.matched_citizen_id) {
            matchedUser =
              enrolledCitizens.find((u) => u.id === aiMatch.matched_citizen_id) || null;
          }
          confidence = aiMatch.confidence;
          matchReason = aiMatch.reason;
        }
      }

      const lookupId = `emr-${Date.now().toString(36)}`;
      const accessedAt = new Date().toISOString();

      appendAuditLog({
        actorId: req.user!.id,
        actorName: req.user!.name,
        actorRole: req.user!.role,
        action: matchedUser
          ? `Emergency medical profile accessed via ${mode}`
          : `Emergency lookup attempted via ${mode} (no match)`,
        objectType: 'emergency_lookup',
        objectId: matchedUser ? matchedUser.id : lookupId,
        sourceReference:
          mode === 'biometric'
            ? biometricToken
            : fileName || citizenHint || 'Hospital Photo Scan',
        details: matchedUser
          ? `Returned strictly critical emergency medical info for ${matchedUser.name} (${matchedUser.emergency_profile?.blood_group || 'UNKNOWN'}) — private academic/bank records withheld.`
          : matchReason,
      });
      db.save();

      const ep = matchedUser?.emergency_profile;
      const result: EmergencyLookupResult = {
        lookup_id: lookupId,
        matched: Boolean(matchedUser && ep),
        match_method: mode,
        confidence,
        match_reason: matchReason,
        accessed_at: accessedAt,
        responder_name: req.user!.name,
        citizen_summary:
          matchedUser && ep
            ? {
                id: matchedUser.id,
                name: matchedUser.name,
                age_years: computeAgeYears(matchedUser.date_of_birth),
                date_of_birth: matchedUser.date_of_birth || 'Unknown',
                district: matchedUser.district || 'Unknown',
                state: matchedUser.state || 'India',
                blood_group: ep.blood_group || 'UNKNOWN',
                allergies: ep.allergies || 'None recorded',
                chronic_conditions: ep.chronic_conditions || 'None recorded',
                medications: ep.medications || 'None recorded',
                medical_warnings: ep.medical_warnings || 'No warnings recorded',
                emergency_contact_name: ep.emergency_contact_name || 'Not listed',
                emergency_contact_phone: ep.emergency_contact_phone || 'Not listed',
                emergency_contact_relation: ep.emergency_contact_relation || 'Guardian',
                biometric_id: ep.biometric_id,
                biometric_enrolled: ep.biometric_enrolled,
                photo_data_url: ep.photo_data_url,
                organ_donor: Boolean(ep.organ_donor),
              }
            : null,
      };

      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Emergency lookup failed.';
      res.status(500).json({ error: msg });
    }
  }
);

apiRouter.get(
  '/gov/organizations',
  requireAuth,
  requireRole(['ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const isMainGov = req.user!.role === 'ADMIN' || req.user!.role === 'PLATFORM_ADMIN';
    const requestedType = String(req.query.org_type || '').trim() as OrganizationType | '';
    // Strictly isolate partner organization users to ONLY their assigned organization_type
    const effectiveType: OrganizationType | '' = isMainGov
      ? requestedType
      : req.user!.organization_type || 'hospital';

    const tasks = effectiveType
      ? state.organization_tasks.filter((t) => t.org_type === effectiveType)
      : state.organization_tasks;

    const complaints = effectiveType
      ? state.complaints.filter((c) => c.org_type === effectiveType)
      : state.complaints;

    const appointments = effectiveType
      ? state.appointments.filter((a) => a.org_type === effectiveType)
      : state.appointments;

    const showHospitalLookups = !effectiveType || effectiveType === 'hospital' || isMainGov;
    const recent_emergency_lookups = showHospitalLookups
      ? state.audit_log
          .filter((a) => a.object_type === 'emergency_lookup')
          .slice(0, 12)
          .map((a) => ({
            id: a.id,
            timestamp: a.timestamp,
            actor_name: a.actor_name,
            details: a.details,
            source_reference: a.source_reference,
          }))
      : [];

    const sectorForAnalytics: OrganizationType = (effectiveType || 'hospital') as OrganizationType;
    const sectorApps = state.applications.filter((a) =>
      sectorForAnalytics === 'hospital'
        ? ['MED-10', 'SKM-09'].includes(a.scheme_code)
        : sectorForAnalytics === 'bank'
          ? ['PM-01', 'PRG-03', 'CSS-05', 'MIN-12'].includes(a.scheme_code)
          : sectorForAnalytics === 'college'
            ? ['RTF-06', 'STE-02', 'CSS-05', 'RES-14', 'PM-01'].includes(a.scheme_code)
            : ['RTF-06', 'HST-07', 'PM-01', 'AGR-11'].includes(a.scheme_code)
    );

    const cmpByCategory = new Map<string, number>();
    complaints.forEach((c) => cmpByCategory.set(c.category, (cmpByCategory.get(c.category) || 0) + 1));

    const org_analytics = {
      sector: sectorForAnalytics,
      is_demo_metrics: true,
      tasks_verified: tasks.filter((t) => t.status === 'verified').length,
      tasks_pending: tasks.filter((t) => t.status === 'pending').length,
      tasks_flagged: tasks.filter((t) => t.status === 'flagged').length,
      complaints_open: complaints.filter((c) => c.status !== 'resolved').length,
      complaints_resolved: complaints.filter((c) => c.status === 'resolved').length,
      most_accessed_schemes:
        sectorForAnalytics === 'hospital'
          ? [
              { label: 'Medical Allied Stipend', code: 'MED-10', count: 48 + sectorApps.length },
              { label: 'AICTE Saksham UDID', code: 'SKM-09', count: 31 },
              { label: 'Emergency QR / Trauma', code: 'EMR-QR', count: 19 + recent_emergency_lookups.length },
            ]
          : sectorForAnalytics === 'bank'
            ? [
                { label: 'Post-Matric DBT Check', code: 'PM-01', count: 84 + sectorApps.length },
                { label: 'AICTE Pragati DBT', code: 'PRG-03', count: 42 },
                { label: 'NPCI Aadhaar Seeding', code: 'NPCI', count: 67 },
              ]
            : sectorForAnalytics === 'college'
              ? [
                  { label: 'Tuition Fee Reimbursement', code: 'RTF-06', count: 96 + sectorApps.length },
                  { label: 'Technical Stipend', code: 'STE-02', count: 53 },
                  { label: 'Central Sector Renewal', code: 'CSS-05', count: 41 },
                ]
              : [
                  { label: 'Income / Caste Barcode', code: 'MRO-REV', count: 112 + sectorApps.length },
                  { label: 'Hostel Mess Muster', code: 'HST-07', count: 47 },
                  { label: 'Farmer Scholarship Cert', code: 'AGR-11', count: 35 },
                ],
      complaint_categories: Array.from(cmpByCategory.entries()).map(([category, count]) => ({
        category,
        count,
      })),
      monthly_trend: [
        { label: 'Aug', requests: 28, resolved: 25 },
        { label: 'Sep', requests: 41, resolved: 36 },
        { label: 'Oct', requests: 54, resolved: 48 },
        { label: 'Nov', requests: 39 + tasks.length, resolved: 31 + tasks.filter((t) => t.status === 'verified').length },
      ],
      common_difficulties:
        sectorForAnalytics === 'hospital'
          ? [
              'UDID disability percentage certificate renewal delays (> 30 days)',
              'Patients arriving with UNKNOWN blood group needing lab cross-match',
              'Emergency contact phone numbers outdated in citizen vault',
            ]
          : sectorForAnalytics === 'bank'
            ? [
                'IFSC code mismatch following regional bank branch mergers',
                'NPCI Aadhaar mapper inactive despite active KYC account',
                'Joint minor-parent account DBT credit rejection',
              ]
            : sectorForAnalytics === 'college'
              ? [
                  'Digital Bonafide endorsement delays during peak semester admissions',
                  '75% biometric attendance shortfall flags before portal lock',
                  'Hall ticket roll number mismatch across ePass & NSP drafts',
                ]
              : [
                  'Expired FY Revenue Income Certificates lacking new MeeSeva barcode',
                  'Permanent address / district mismatch against Aadhaar domicile proof',
                  'Hostel warden counter-signature pending for HST-07 claims',
                ],
    };

    res.json({
      effective_sector: effectiveType || 'all',
      tasks,
      appointments,
      complaints,
      org_analytics,
      recent_emergency_lookups,
      enrolled_emergency_count: state.users.filter(
        (u) => u.role === 'STUDENT' && u.emergency_profile
      ).length,
    });
  }
);

apiRouter.post(
  '/gov/organizations/tasks',
  requireAuth,
  requireRole(['ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const isMainGov = req.user!.role === 'ADMIN' || req.user!.role === 'PLATFORM_ADMIN';
    const rawType = String(req.body?.org_type || '').trim() as OrganizationType;
    const org_type: OrganizationType = isMainGov
      ? rawType === 'bank' || rawType === 'college' || rawType === 'other'
        ? rawType
        : 'hospital'
      : req.user!.organization_type || 'hospital';

    const citizen_name = String(req.body?.citizen_name || '').trim().slice(0, 120);
    const citizen_email = String(req.body?.citizen_email || 'citizen@niyamsetu.demo').trim().slice(0, 120);
    const subject = String(req.body?.subject || '').trim().slice(0, 200);
    const scheme_code = String(req.body?.scheme_code || 'PM-01').trim().toUpperCase().slice(0, 24);
    const reference_code =
      String(req.body?.reference_code || '').trim().slice(0, 60) ||
      `ORG-${org_type.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const notes = String(req.body?.notes || '').trim().slice(0, 400);
    const status = req.body?.status === 'verified' || req.body?.status === 'flagged' ? req.body.status : 'pending';

    if (!citizen_name || !subject) {
      res.status(400).json({ error: 'Citizen name and verification subject are required.' });
      return;
    }

    const orgName =
      req.user!.organization_name ||
      (org_type === 'hospital'
        ? 'Partner District Hospital'
        : org_type === 'bank'
          ? 'Partner Lead Bank DBT Desk'
          : org_type === 'college'
            ? 'Partner College Nodal Cell'
            : 'Partner MeeSeva / CSC Center');

    const newTask = {
      id: `org-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      org_type,
      org_name: orgName,
      citizen_id: `cit-${Date.now().toString(36)}`,
      citizen_name,
      citizen_email,
      subject,
      scheme_code,
      reference_code,
      status: status as 'pending' | 'verified' | 'flagged',
      notes: notes || `Logged at ${orgName} verification desk.`,
      updated_at: new Date().toISOString(),
      verified_by: status !== 'pending' ? req.user!.name : undefined,
    };

    state.organization_tasks.unshift(newTask);
    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: `Organization (${org_type}) logged new verification record`,
      objectType: 'organization_task',
      objectId: newTask.id,
      sourceReference: `${scheme_code} · ${reference_code}`,
      details: `${orgName}: ${subject} for ${citizen_name} (${status}).`,
    });
    db.save();
    res.status(201).json({ task: newTask });
  }
);

apiRouter.post(
  '/gov/organizations/tasks/:id/verify',
  requireAuth,
  requireRole(['ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const task = state.organization_tasks.find((t) => t.id === req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Organization verification task not found.' });
      return;
    }
    const status = req.body?.status === 'flagged' ? 'flagged' : 'verified';
    const notes = String(req.body?.notes || '').trim().slice(0, 400);
    task.status = status;
    if (notes) task.notes = notes;
    task.verified_by = req.user!.name;
    task.updated_at = new Date().toISOString();

    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: `Organization (${task.org_type}) marked task ${status}`,
      objectType: 'organization_task',
      objectId: task.id,
      sourceReference: `${task.scheme_code} · ${task.reference_code}`,
      details: `${task.org_name}: ${task.subject} (${status}).`,
    });
    db.save();
    res.json({ task });
  }
);

apiRouter.post(
  '/gov/organizations/tasks/:id/inspect',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const task = state.organization_tasks.find((t) => t.id === req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Organization verification task not found.' });
      return;
    }
    const note = String(req.body?.note || '').trim().slice(0, 400);
    task.gov_inspected = true;
    task.gov_inspected_by = req.user!.name;
    task.gov_inspection_note =
      note || 'Inspected and verified by Main Government Oversight Administrator.';
    task.gov_inspected_at = new Date().toISOString();

    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'Main Government inspected organization record',
      objectType: 'organization_inspection',
      objectId: task.id,
      sourceReference: `${task.org_type.toUpperCase()} · ${task.reference_code}`,
      details: `${req.user!.name} inspected ${task.org_name} (${task.citizen_name}): ${task.gov_inspection_note}`,
    });
    db.save();
    res.json({ task });
  }
);

apiRouter.get(
  '/gov/users',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  (_req, res) => {
    const state = db.getState();
    const users = state.users.map(({ password_hash: _, ...u }) => u);
    res.json({ users });
  }
);

apiRouter.patch(
  '/gov/users/:id/role',
  requireAuth,
  requireRole(['PLATFORM_ADMIN']),
  (req: AuthenticatedRequest, res) => {
    const state = db.getState();
    const target = state.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const role = String(req.body?.role || '') as UserRole;
    if (
      role !== 'STUDENT' &&
      role !== 'ORGANIZATION' &&
      role !== 'ADMIN' &&
      role !== 'PLATFORM_ADMIN'
    ) {
      res
        .status(400)
        .json({ error: 'Role must be STUDENT, ORGANIZATION, ADMIN, or PLATFORM_ADMIN.' });
      return;
    }
    const prevRole = target.role;
    target.role = role;
    if (typeof req.body?.department === 'string') {
      target.department = req.body.department.trim().slice(0, 120);
    }
    target.updated_at = new Date().toISOString();
    appendAuditLog({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'User portal role & department updated',
      objectType: 'user_account',
      objectId: target.id,
      sourceReference: 'Government Administration',
      details: `${target.name} changed from ${prevRole} to ${role}${
        target.department ? ` (${target.department})` : ''
      }.`,
    });
    db.save();
    const { password_hash: _, ...profile } = target;
    res.json({ user: profile });
  }
);

apiRouter.post('/authenticity/check', (req, res) => {
  const docNumber = String(req.body?.docNumber || '').trim().toLowerCase();
  const authority = String(req.body?.authority || '').trim().toLowerCase();
  if (!docNumber) {
    res.status(400).json({ error: 'Enter a document or notification number to check.' });
    return;
  }
  const state = db.getState();
  const matched = state.documents.find(
    (d) =>
      d.doc_number.toLowerCase() === docNumber ||
      d.title.toLowerCase().includes(docNumber)
  );

  if (!matched) {
    res.json({
      result: 'not_found',
      summary:
        'Not found in the official sources currently monitored by this system. This does not prove the document is fake—please verify directly on the issuing department portal.',
      matched_document: null,
    });
    return;
  }

  const supersededBy = state.documents.find(
    (d) => d.amends_document_id === matched.id && d.verification_status === 'verified'
  );
  const authorityMismatch =
    authority && !matched.authority.toLowerCase().includes(authority);

  if (supersededBy) {
    res.json({
      result: 'may_be_outdated',
      summary: `Matches ${matched.doc_number}, but a newer verified amendment (${supersededBy.doc_number}) is active. Some clauses may be outdated.`,
      matched_document: matched,
      newer_document: supersededBy,
    });
    return;
  }

  res.json({
    result: authorityMismatch ? 'metadata_mismatch' : 'matches_official_source',
    summary: authorityMismatch
      ? `Document number matches ${matched.doc_number}, but the entered authority differs from "${matched.authority}". Verify source metadata carefully.`
      : `Matches "${matched.title}" (${matched.doc_number}) in the monitored registry (${matched.verification_status}). Note: automated matching cannot prove physical authenticity.`,
    matched_document: matched,
  });
});

apiRouter.post('/demo/reset', (req: AuthenticatedRequest, res) => {
  const newState = db.resetToDemoSeed();
  appendAuditLog({
    actorId: req.user?.id || 'demo-operator',
    actorName: req.user?.name || 'Demo Operator',
    actorRole: req.user?.role || 'ADMIN',
    action: 'Demo dataset reset to initial state',
    objectType: 'system',
    objectId: 'seed-v1',
    sourceReference: 'Sample Notifications SN-2025/01 & SN-2026/07',
    details: 'Restored sample notifications, 3 draft changes, and clean audit trail.',
  });
  db.save();
  res.json({ reset: true, rules_count: newState.rules.length });
});

// ---------------------------------------------------------------------------
// 11. MAPS CONFIG, GOOGLE AUTH SYNC, MULTI-TURN CHAT, GROUNDING & TRANSCRIBE
// ---------------------------------------------------------------------------
apiRouter.get('/maps/config', (_req, res) => {
  let apiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_PLATFORM_API_KEY ||
    process.env.MAPS_API_KEY ||
    '';
  if (!apiKey) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
        apiKey =
          parsed.VITE_GOOGLE_MAPS_API_KEY ||
          parsed.GOOGLE_MAPS_API_KEY ||
          parsed.GOOGLE_MAPS_PLATFORM_API_KEY ||
          parsed.MAPS_API_KEY ||
          '';
      }
    } catch {
      // ignore fallback read errors
    }
  }
  res.json({ apiKey });
});

apiRouter.post('/auth/google-sync', async (req, res) => {
  try {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) {
      res.status(400).json({ error: 'Firebase ID token is required.' });
      return;
    }

    const fbConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(fbConfigPath)) {
      res.status(503).json({ error: 'Firebase configuration is unavailable on the server.' });
      return;
    }

    const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf-8')) as { apiKey?: string };
    if (!fbConfig.apiKey) {
      res.status(503).json({ error: 'Firebase API key missing.' });
      return;
    }

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        fbConfig.apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupRes.ok) {
      res.status(401).json({ error: 'Could not verify Google Sign-In session.' });
      return;
    }

    const lookupJson = (await lookupRes.json()) as {
      users?: Array<{
        localId: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
      }>;
    };

    const fbUser = lookupJson.users?.[0];
    if (!fbUser || !fbUser.email || !fbUser.emailVerified) {
      res.status(401).json({ error: 'Verified Google email is required.' });
      return;
    }

    const email = fbUser.email.toLowerCase();
    const displayName = fbUser.displayName || email.split('@')[0];
    const resolvedRole: UserRole =
      email === 'snehithvarma140@gmail.com' || email === 'snehithvarma1940@gmail.com'
        ? 'PLATFORM_ADMIN'
        : 'STUDENT';

    const state = db.getState();
    let appUser = state.users.find((u) => u.email.toLowerCase() === email);
    if (!appUser) {
      appUser = {
        id: fbUser.localId,
        name: displayName,
        email,
        role: resolvedRole,
        language_preference: 'en',
        created_at: new Date().toISOString(),
        password_hash: hashPassword(`fb-${fbUser.localId}-${Date.now()}`),
      };
      state.users.push(appUser);
      db.save();
    }

    const { password_hash: _, ...profile } = appUser;
    const token = signSessionToken(profile);
    res.json({ token, user: profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google session sync failed.';
    res.status(500).json({ error: message });
  }
});

apiRouter.post('/jansetu/chat', async (req: AuthenticatedRequest, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const lang = normalizeVoiceLang(req.body?.lang);
    const modelTier =
      req.body?.modelTier === 'gemini-3.1-flash-lite'
        ? 'gemini-3.1-flash-lite'
        : 'gemini-4-hydrogen';
    const thinkingLevel =
      req.body?.thinkingLevel === 'XHIGH' ||
      req.body?.thinkingLevel === 'HIGH' ||
      req.body?.thinkingLevel === 'MEDIUM'
        ? req.body.thinkingLevel
        : 'LOW';
    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .slice(-12)
          .map((h: { role?: string; text?: string }) => ({
            role: h?.role === 'model' ? ('model' as const) : ('user' as const),
            text: String(h?.text || ''),
          }))
      : [];

    if (!message) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const state = db.getState();
    const activeSummary = state.rules
      .filter((r) => r.status === 'active')
      .map((r) => `[${r.id}] (${r.scheme_id}) ${r.label}: ${r.condition_text} (${buildCitation(r)})`)
      .join('\n');

    const schemesSummary = state.schemes
      .map(
        (s) =>
          `- ${s.code} (${s.name}): ${s.benefit_summary}${s.is_new ? ' [NEW PLAN]' : ''} | Authority: ${s.authority}`
      )
      .join('\n');

    let userProfileContext: string | undefined;
    if (req.user) {
      const fullUser = state.users.find((u) => u.id === req.user!.id);
      const userDocs = state.user_documents.filter((d) => d.user_id === req.user!.id);
      if (fullUser) {
        userProfileContext = `Signed-in User: ${fullUser.name} | State: ${fullUser.state || 'Unset'} | Category: ${fullUser.category || 'Unset'} | Education: ${fullUser.education_level || 'Unset'} | Income: ${fullUser.family_income != null ? `₹${fullUser.family_income}` : 'Unset'} | Marks: ${fullUser.marks_percent != null ? `${fullUser.marks_percent}%` : 'Unset'} | Vault Docs (${userDocs.length}): ${userDocs.map((d) => `${d.doc_type}${d.doc_number ? ` (#${d.doc_number})` : ''}`).join(', ') || 'None'}`;
      }
    }

    const result = await chatWithJanSetuMultiTurn({
      history,
      message,
      modelTier,
      thinkingLevel,
      lang,
      activeRulesContext: activeSummary,
      schemesSummary,
      userProfileContext,
    });

    appendAuditLog({
      actorId: req.user?.id || 'guest-citizen',
      actorName: req.user?.name || 'Citizen Visitor',
      actorRole: req.user?.role || 'STUDENT',
      action: 'Multi-turn JanSetu Gemini chatbot turn',
      objectType: 'query',
      objectId: `chat-${Date.now().toString(36)}`,
      sourceReference: result.modelUsed,
      details: message.slice(0, 140),
    });
    db.save();

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chat turn failed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.post('/jansetu/search-grounded', async (req: AuthenticatedRequest, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    const lang = normalizeVoiceLang(req.body?.lang);
    if (!query) {
      res.status(400).json({ error: 'Search query is required.' });
      return;
    }

    const result = await searchGroundedAnswer({ query, lang });
    appendAuditLog({
      actorId: req.user?.id || 'guest-citizen',
      actorName: req.user?.name || 'Citizen Visitor',
      actorRole: req.user?.role || 'STUDENT',
      action: 'Google Search grounded lookup',
      objectType: 'query',
      objectId: `gsearch-${Date.now().toString(36)}`,
      sourceReference: `${result.webSources.length} web citation(s)`,
      details: query.slice(0, 140),
    });
    db.save();

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search grounding failed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.post('/jansetu/maps-grounded', async (req: AuthenticatedRequest, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    const lang = (req.body?.lang === 'te' ? 'te' : 'en') as LanguageCode;
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const latLng =
      !Number.isNaN(lat) && !Number.isNaN(lng) && req.body?.lat !== undefined
        ? { latitude: lat, longitude: lng }
        : undefined;

    if (!query) {
      res.status(400).json({ error: 'Location or center query is required.' });
      return;
    }

    const result = await mapsGroundedAnswer({ query, latLng, lang });
    appendAuditLog({
      actorId: req.user?.id || 'guest-citizen',
      actorName: req.user?.name || 'Citizen Visitor',
      actorRole: req.user?.role || 'STUDENT',
      action: 'Google Maps grounded lookup',
      objectType: 'query',
      objectId: `gmaps-${Date.now().toString(36)}`,
      sourceReference: `${result.mapSources.length} Maps place(s)`,
      details: query.slice(0, 140),
    });
    db.save();

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Maps grounding failed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.post('/audio/transcribe', async (req, res) => {
  try {
    const base64Audio = String(req.body?.base64Audio || '').trim();
    const mimeType = String(req.body?.mimeType || 'audio/webm').trim();
    const lang = normalizeVoiceLang(req.body?.lang);

    if (!base64Audio) {
      res.status(400).json({ error: 'Recorded audio data is required.' });
      return;
    }

    const result = await transcribeAudioWithGemini({ base64Audio, mimeType, lang });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Audio transcription failed.';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// 12. SUPABASE PLUGIN ROUTES (RELATIONAL SYNC, FTS & ELIGIBILITY RPC)
// ---------------------------------------------------------------------------
apiRouter.post(
  '/supabase/sync',
  requireAuth,
  requireRole(['ADMIN', 'PLATFORM_ADMIN']),
  async (_req, res) => {
    try {
      if (!isSupabaseConfigured()) {
        res.status(503).json({
          configured: false,
          error:
            'Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are not configured in runtime secrets.',
        });
        return;
      }
      const result = await syncStateToSupabase(db.getState());
      res.json({ configured: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Supabase sync failed.';
      res.status(500).json({ error: msg });
    }
  }
);

apiRouter.get('/supabase/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (isSupabaseConfigured()) {
      const result = await searchRulesInSupabase(q);
      res.json(result);
      return;
    }
    const localMatches = retrieveApprovedRulesForQuery(q);
    res.json({ usedSupabase: false, rules: localMatches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Rule search failed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.post('/supabase/eligibility-rpc', async (req, res) => {
  try {
    const rawIncome = req.body?.family_income;
    const rawMarks = req.body?.marks_percent;
    const income =
      rawIncome === '' || rawIncome === null || rawIncome === undefined ? null : Number(rawIncome);
    const marks =
      rawMarks === '' || rawMarks === null || rawMarks === undefined ? null : Number(rawMarks);

    if (isSupabaseConfigured()) {
      const rpcRes = await evaluateEligibilityViaSupabaseRpc(
        Number.isNaN(income) ? null : income,
        Number.isNaN(marks) ? null : marks
      );
      res.json(rpcRes);
      return;
    }

    const fallback = evaluateAllSchemesEligibility({
      family_income: Number.isNaN(income) ? null : income,
      marks_percent: Number.isNaN(marks) ? null : marks,
    });
    res.json({ usedSupabase: false, rows: fallback });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Eligibility RPC evaluation failed.';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// 13. PERSONALIZED INTEREST FEED, GOV CHANGE ALERTS, SERVICE NAVIGATOR, COMPLAINTS & FAQS
// ---------------------------------------------------------------------------
const NEWS_FEED_CACHE = new Map<string, { expiresAt: number; payload: NewsFeedPayload }>();

function buildOfficialGovNotifications(userId?: string): NewsFeedItem[] {
  const state = db.getState();
  const items: NewsFeedItem[] = [];

  state.alerts
    .filter((a) => a.target_role === 'ALL' || a.target_role === 'STUDENT')
    .slice(0, 3)
    .forEach((a) => {
      items.push({
        id: `gov-al-${a.id}`,
        title: `Rule Revision Notice (${a.scheme_id.toUpperCase()})`,
        summary: a.message,
        category: 'New Government Rules and Policy Changes',
        source_name: 'NiyamSetu Policy Ripple',
        department: 'Government Circular Oversight',
        source_url: 'https://scholarships.gov.in/',
        published_at: a.created_at,
        is_gov_notification: true,
        badge_type: 'rule_change',
      });
    });

  state.schemes
    .filter((s) => s.is_new)
    .slice(0, 3)
    .forEach((s) => {
      const enriched = enrichSchemeRecord(s);
      items.push({
        id: `gov-sch-${s.id}`,
        title: `New Scheme Benefit: ${s.code} — ${s.name}`,
        summary: `${s.benefit_summary}. Administered by ${s.authority}. Closing date: ${enriched.deadline_date || '2026-12-31'}.`,
        category: 'Government Schemes and New Benefits',
        source_name: enriched.source_notification || s.authority,
        department: s.authority,
        source_url: enriched.official_website || 'https://scholarships.gov.in/',
        published_at: s.introduced_date ? `${s.introduced_date}T08:00:00.000Z` : new Date().toISOString(),
        is_gov_notification: true,
        badge_type: 'new_scheme',
        deadline_date: enriched.deadline_date,
      });
    });

  state.documents
    .filter((d) => d.version >= 2 && d.verification_status === 'verified')
    .slice(0, 3)
    .forEach((d) => {
      items.push({
        id: `gov-doc-${d.id}`,
        title: `Amended Circular: ${d.doc_number} — ${d.title}`,
        summary: d.subject,
        category: 'New Government Rules and Policy Changes',
        source_name: d.authority,
        department: d.authority,
        source_url: d.source_url,
        published_at: `${d.effective_date}T08:00:00.000Z`,
        is_gov_notification: true,
        badge_type: 'rule_change',
      });
    });

  const sectorOverrides: Array<{ code: string; category: string; badge: NewsFeedItem['badge_type'] }> = [
    { code: 'MED-10', category: 'Healthcare and Public Health Updates', badge: 'update' },
    { code: 'SKM-09', category: 'Healthcare and Public Health Updates', badge: 'update' },
    { code: 'AGR-11', category: 'Agriculture and Farmer Updates', badge: 'new_scheme' },
    { code: 'SKL-08', category: 'Jobs, Recruitment and Employment', badge: 'update' },
    { code: 'PM-01', category: 'Education, Scholarships and Exams', badge: 'update' },
    { code: 'RES-14', category: 'Technology, AI and Innovation', badge: 'new_scheme' },
    { code: 'TRB-13', category: 'State and District News', badge: 'update' },
  ];

  sectorOverrides.forEach(({ code, category, badge }) => {
    const sch = state.schemes.find((s) => s.code === code);
    if (!sch) return;
    const enriched = enrichSchemeRecord(sch);
    if (items.some((x) => x.id === `gov-sec-${sch.id}`)) return;
    items.push({
      id: `gov-sec-${sch.id}`,
      title: `${sch.code}: ${sch.name}`,
      summary: `${sch.benefit_summary}. Verified requirements & online steps available in NiyamSetu.`,
      category,
      source_name: enriched.source_notification || sch.authority,
      department: sch.authority,
      source_url: enriched.official_website || 'https://scholarships.gov.in/',
      published_at: sch.introduced_date
        ? `${sch.introduced_date}T09:00:00.000Z`
        : new Date().toISOString(),
      is_gov_notification: true,
      badge_type: badge,
      deadline_date: enriched.deadline_date,
    });
  });

  state.deadlines
    .filter((dl) => dl.status !== 'completed')
    .slice(0, 4)
    .forEach((dl) => {
      const sch = state.schemes.find((s) => s.id === dl.scheme_id);
      const enriched = sch ? enrichSchemeRecord(sch) : null;
      items.push({
        id: `gov-dl-${dl.id}`,
        title: `Deadline: ${dl.title}`,
        summary: `${sch ? `${sch.code} (${sch.name}) — ` : ''}Official cutoff date: ${dl.due_date}. Verify documents early in FormSathi AI.`,
        category: 'Application Deadlines and Important Dates',
        source_name: sch?.authority || 'Official Scholarship Portal',
        department: sch?.authority || 'Nodal Welfare Department',
        source_url: enriched?.official_website || 'https://scholarships.gov.in/',
        published_at: `${dl.due_date}T08:00:00.000Z`,
        is_gov_notification: true,
        badge_type: 'deadline',
        deadline_date: dl.due_date,
      });
    });

  void userId;
  return items.slice(0, 14);
}

apiRouter.get('/news-feed', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const state = db.getState();
    const user = state.users.find((u) => u.id === req.user!.id);
    const lang = (user?.language_preference === 'te' ? 'te' : 'en') as LanguageCode;
    const interests: CitizenInterestTopic[] =
      Array.isArray(user?.interests) && user.interests.length > 0
        ? user.interests
        : ['Government schemes and notifications', 'Education, scholarships and employment'];
    const cacheKey = `${req.user!.id}:${lang}:${interests.join('|')}:${user?.state || ''}:${user?.district || ''}`;
    const force = req.query.refresh === '1';
    const cached = NEWS_FEED_CACHE.get(cacheKey);
    if (!force && cached && cached.expiresAt > Date.now()) {
      res.json(cached.payload);
      return;
    }

    const searchRes = await fetchInterestBasedNewsWithSearch({
      interests,
      state: user?.state,
      district: user?.district,
      lang,
    });

    const payload: NewsFeedPayload = {
      generated_at: new Date().toISOString(),
      interests,
      gov_notifications: buildOfficialGovNotifications(req.user!.id),
      interest_updates: searchRes.items,
      market_quotes: searchRes.market_quotes,
      live_market_available: searchRes.live_market_available,
      market_notice: searchRes.market_notice,
      model_used: searchRes.model_used,
    };

    NEWS_FEED_CACHE.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, payload });
    res.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to load news feed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.get('/public/news-feed', async (req, res) => {
  try {
    const lang = (req.query.lang === 'te' ? 'te' : 'en') as LanguageCode;
    const rawInterests = String(req.query.interests || '').trim();
    const parsedInterests = rawInterests
      ? (rawInterests
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10) as CitizenInterestTopic[])
      : [];
    const interests: CitizenInterestTopic[] =
      parsedInterests.length > 0
        ? parsedInterests
        : ['Government schemes and notifications', 'Education, scholarships and employment'];
    const stateName = String(req.query.state || '').trim().slice(0, 80);
    const districtName = String(req.query.district || '').trim().slice(0, 80);
    const cacheKey = `public:${lang}:${interests.join('|')}:${stateName}:${districtName}`;
    const force = req.query.refresh === '1';
    const cached = NEWS_FEED_CACHE.get(cacheKey);
    if (!force && cached && cached.expiresAt > Date.now()) {
      res.json(cached.payload);
      return;
    }

    const searchRes = await fetchInterestBasedNewsWithSearch({
      interests,
      state: stateName || undefined,
      district: districtName || undefined,
      lang,
    });

    const payload: NewsFeedPayload = {
      generated_at: new Date().toISOString(),
      interests,
      gov_notifications: buildOfficialGovNotifications('public'),
      interest_updates: searchRes.items,
      market_quotes: searchRes.market_quotes,
      live_market_available: searchRes.live_market_available,
      market_notice: searchRes.market_notice,
      model_used: searchRes.model_used,
    };

    NEWS_FEED_CACHE.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, payload });
    res.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to load public news feed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.get('/citizen/change-alerts', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const userApps = state.applications.filter((a) => a.user_id === req.user!.id);
  const appSchemeIds = new Set(userApps.map((a) => a.scheme_id));
  const schemesById = new Map(state.schemes.map((s) => [s.id, s]));

  const revisedRules = state.rules.filter((r) => r.status === 'active' && r.version >= 2);
  const changeAlerts: GovChangeAlert[] = [];

  revisedRules.forEach((r) => {
    const sch = schemesById.get(r.scheme_id);
    if (!sch) return;
    const inActiveApp = appSchemeIds.has(r.scheme_id);
    if (inActiveApp || changeAlerts.length < 4) {
      changeAlerts.push({
        id: `chg-${r.id}`,
        scheme_id: r.scheme_id,
        scheme_code: sch.code,
        scheme_name: sch.name,
        rule_key: r.rule_key,
        summary: `${r.label} updated (${formatRuleDisplay(r)}): ${r.condition_text}`,
        effective_date: r.valid_from,
        reason: inActiveApp ? 'active_application' : 'interest_match',
      });
    }
  });

  res.json({ change_alerts: changeAlerts.slice(0, 6) });
});

apiRouter.post('/navigator/resolve', async (req: AuthenticatedRequest, res) => {
  try {
    const problem = String(req.body?.problem || '').trim().slice(0, 600);
    const lang = (req.body?.lang === 'te' ? 'te' : 'en') as LanguageCode;
    if (!problem) {
      res.status(400).json({ error: 'Please describe the service or problem you need help with.' });
      return;
    }

    const state = db.getState();
    const schemesSummary = state.schemes
      .map((s) => `${s.code}: ${s.name} (${s.authority}) — ${s.benefit_summary}`)
      .join('\n');
    const rulesContext = state.rules
      .filter((r) => r.status === 'active')
      .map((r) => `${r.scheme_id} | ${r.label}: ${r.condition_text}`)
      .join('\n');

    const result = await resolveCitizenServiceNavigatorWithAI({
      problem,
      schemesSummary,
      rulesContext,
      lang,
    });

    appendAuditLog({
      actorId: req.user?.id || 'guest-citizen',
      actorName: req.user?.name || 'Citizen Visitor',
      actorRole: req.user?.role || 'STUDENT',
      action: 'Citizen Service Navigator lookup',
      objectType: 'query',
      objectId: `nav-${Date.now().toString(36)}`,
      sourceReference: result.department,
      details: problem.slice(0, 140),
    });
    db.save();

    res.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Service navigation failed.';
    res.status(500).json({ error: msg });
  }
});

// Complaints & Grievances CRUD
apiRouter.get('/complaints', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  if (req.user!.role === 'ADMIN' || req.user!.role === 'PLATFORM_ADMIN') {
    const orgFilter = String(req.query.org_type || '').trim();
    const list = orgFilter
      ? state.complaints.filter((c) => c.org_type === orgFilter)
      : state.complaints;
    res.json({ complaints: list });
    return;
  }
  if (req.user!.role === 'ORGANIZATION') {
    const sector = req.user!.organization_type || 'hospital';
    res.json({ complaints: state.complaints.filter((c) => c.org_type === sector) });
    return;
  }
  res.json({ complaints: state.complaints.filter((c) => c.user_id === req.user!.id) });
});

apiRouter.post('/complaints', requireAuth, (req: AuthenticatedRequest, res) => {
  const department = String(req.body?.department || '').trim().slice(0, 160);
  const subject = String(req.body?.subject || '').trim().slice(0, 200);
  const description = String(req.body?.description || '').trim().slice(0, 2000);
  const category = String(req.body?.category || 'Application Delay').trim() as ComplaintCategory;
  const orgTypeRaw = String(req.body?.org_type || 'government').trim();
  const org_type: ComplaintRecord['org_type'] =
    orgTypeRaw === 'hospital' ||
    orgTypeRaw === 'bank' ||
    orgTypeRaw === 'college' ||
    orgTypeRaw === 'other'
      ? orgTypeRaw
      : 'government';
  const submission_channel: ComplaintRecord['submission_channel'] =
    req.body?.submission_channel === 'external_manual' ? 'external_manual' : 'niyamsetu_tracked';

  if (!department || !subject || !description) {
    res.status(400).json({ error: 'Department, subject, and issue description are required.' });
    return;
  }

  const state = db.getState();
  const now = new Date().toISOString();
  const externalRef = String(req.body?.reference_number || '').trim().slice(0, 80);
  const reference_number =
    submission_channel === 'external_manual'
      ? externalRef || `EXT-SELF-${Date.now().toString(36).toUpperCase().slice(-6)}`
      : `NSM-CMP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const attachments = rawAttachments.slice(0, 5).map((a: { name?: string; size_bytes?: number; mime_type?: string }) => ({
    name: String(a?.name || 'supporting-doc').trim().slice(0, 120),
    size_bytes: Math.max(0, Number(a?.size_bytes) || 0),
    mime_type: String(a?.mime_type || 'application/pdf').trim().slice(0, 80),
  }));

  const newComplaint: ComplaintRecord = {
    id: `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    user_id: req.user!.id,
    citizen_name: req.user!.name,
    department,
    org_type,
    scheme_id: typeof req.body?.scheme_id === 'string' ? req.body.scheme_id.trim().slice(0, 64) : undefined,
    application_id:
      typeof req.body?.application_id === 'string' ? req.body.application_id.trim().slice(0, 64) : undefined,
    category,
    subject,
    description,
    attachments,
    submission_channel,
    reference_number,
    status: 'submitted',
    updates: [
      {
        timestamp: now,
        actor: `${req.user!.name} (Citizen)`,
        message:
          submission_channel === 'niyamsetu_tracked'
            ? `Submitted through NiyamSetu Grievance Desk to ${department}.`
            : `Externally filed complaint logged manually with reference ${reference_number}.`,
      },
    ],
    reminder_date:
      typeof req.body?.reminder_date === 'string' ? req.body.reminder_date.trim().slice(0, 24) : undefined,
    created_at: now,
    updated_at: now,
  };

  state.complaints.unshift(newComplaint);
  appendAuditLog({
    actorId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: `Citizen complaint logged (${submission_channel})`,
    objectType: 'complaint',
    objectId: newComplaint.id,
    sourceReference: reference_number,
    details: `${department} — ${subject}`,
  });
  db.save();

  res.status(201).json({ complaint: newComplaint });
});

apiRouter.patch('/complaints/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const cmp = state.complaints.find((c) => c.id === req.params.id);
  if (!cmp) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }

  const isMainGov = req.user!.role === 'ADMIN' || req.user!.role === 'PLATFORM_ADMIN';
  const isAssignedOrg =
    req.user!.role === 'ORGANIZATION' && cmp.org_type === (req.user!.organization_type || 'other');
  const isOwner = cmp.user_id === req.user!.id;

  if (!isOwner && !isAssignedOrg && !isMainGov) {
    res.status(403).json({ error: 'Access denied to this complaint.' });
    return;
  }

  const now = new Date().toISOString();
  if ((isAssignedOrg || isMainGov) && typeof req.body?.status === 'string') {
    const allowed: Set<ComplaintStatus> = new Set([
      'submitted',
      'under_review',
      'in_progress',
      'resolved',
      'escalated',
    ]);
    if (allowed.has(req.body.status as ComplaintStatus)) {
      cmp.status = req.body.status as ComplaintStatus;
    }
  }
  if ((isAssignedOrg || isMainGov) && typeof req.body?.resolution_note === 'string') {
    cmp.resolution_note = req.body.resolution_note.trim().slice(0, 600);
  }
  if (typeof req.body?.reminder_date === 'string') {
    cmp.reminder_date = req.body.reminder_date.trim().slice(0, 24);
  }
  if (typeof req.body?.note === 'string' && req.body.note.trim()) {
    cmp.updates.push({
      timestamp: now,
      actor: `${req.user!.name} (${isMainGov ? 'Gov Officer' : isAssignedOrg ? 'Partner Desk' : 'Citizen'})`,
      message: req.body.note.trim().slice(0, 500),
    });
  }
  cmp.updated_at = now;

  appendAuditLog({
    actorId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: `Complaint ${cmp.reference_number} updated (${cmp.status})`,
    objectType: 'complaint',
    objectId: cmp.id,
    sourceReference: cmp.reference_number,
    details: cmp.resolution_note || req.body?.note || `Status set to ${cmp.status}`,
  });
  db.save();

  res.json({ complaint: cmp });
});

// Redesign FAQ Center Endpoints
apiRouter.get('/faqs', (_req, res) => {
  const state = db.getState();
  res.json({
    faqs: state.faqs,
    unanswered_count: state.unanswered_faq_reports.length,
  });
});

apiRouter.post('/faqs/:id/view', (req, res) => {
  const state = db.getState();
  const faq = state.faqs.find((f) => f.id === req.params.id);
  if (!faq) {
    res.status(404).json({ error: 'FAQ not found.' });
    return;
  }
  faq.views += 1;
  db.save();
  res.json({ faq });
});

apiRouter.post('/faqs/:id/vote', (req, res) => {
  const state = db.getState();
  const faq = state.faqs.find((f) => f.id === req.params.id);
  if (!faq) {
    res.status(404).json({ error: 'FAQ not found.' });
    return;
  }
  if (req.body?.helpful === false) {
    faq.not_helpful_count += 1;
  } else {
    faq.helpful_count += 1;
  }
  db.save();
  res.json({ faq });
});

apiRouter.post('/faqs/unanswered', (req: AuthenticatedRequest, res) => {
  const question = String(req.body?.question || '').trim().slice(0, 300);
  const category = (String(req.body?.category || 'Government schemes').trim() ||
    'Government schemes') as FaqCategory;
  if (!question) {
    res.status(400).json({ error: 'Please enter the question you need answered.' });
    return;
  }
  const state = db.getState();
  const report = {
    id: `ufaq-${Date.now().toString(36)}`,
    question,
    category,
    user_id: req.user?.id,
    created_at: new Date().toISOString(),
  };
  state.unanswered_faq_reports.unshift(report);
  appendAuditLog({
    actorId: req.user?.id || 'guest-citizen',
    actorName: req.user?.name || 'Citizen Visitor',
    actorRole: req.user?.role || 'STUDENT',
    action: 'Citizen reported unanswered FAQ',
    objectType: 'faq_feedback',
    objectId: report.id,
    sourceReference: category,
    details: question,
  });
  db.save();
  res.status(201).json({ report });
});

apiRouter.post('/audio/tts', async (req: AuthenticatedRequest, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const lang = normalizeVoiceLang(req.body?.lang);
    if (!text) {
      res.status(400).json({ error: 'Text to read aloud is required.' });
      return;
    }

    const result = await synthesizeSpeechWithGemini({ text, lang });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Audio speech generation failed.';
    res.status(500).json({ error: msg });
  }
});

apiRouter.post('/public/news-speak', async (req, res) => {
  try {
    const lang = normalizeVoiceLang(req.body?.lang);
    const categoryLabel = String(req.body?.categoryLabel || 'All Updates').trim();
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = rawItems.slice(0, 6).map((it: Record<string, unknown>) => ({
      title: String(it?.title || '').trim(),
      summary: String(it?.summary || '').trim(),
      category: String(it?.category || 'General Update').trim(),
      source_name: String(it?.source_name || 'Verified Source').trim(),
      is_gov_notification: Boolean(it?.is_gov_notification),
    })).filter((it: { title: string; summary: string }) => it.title || it.summary);

    const marketQuotes = Array.isArray(req.body?.market_quotes)
      ? req.body.market_quotes.slice(0, 4)
      : undefined;

    const spokenText = await buildSpokenNewsBriefingText({
      items,
      marketQuotes,
      categoryLabel,
      lang,
    });

    const tts = await synthesizeSpeechWithGemini({ text: spokenText, lang });
    res.json({
      spokenText,
      lang,
      ...tts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'News audio briefing failed.';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// CITIZEN <-> EXISTING ORGANIZATIONS OFFICER APPOINTMENTS
// ---------------------------------------------------------------------------
function mapOfficerRoleToExistingOrg(role: OfficerRoleCategory): {
  org_type: OrganizationType;
  org_name: string;
} {
  if (role === 'Government Doctor / Medical Officer' || role === 'Private Doctor / Clinic Specialist') {
    return { org_type: 'hospital', org_name: 'Hospitals & Emergency' };
  }
  if (role === 'Bank Manager / DBT Officer') {
    return { org_type: 'bank', org_name: 'Banks & DBT Desks' };
  }
  if (role === 'College Principal / Nodal Officer') {
    return { org_type: 'college', org_name: 'Colleges & Universities' };
  }
  return { org_type: 'other', org_name: 'MeeSeva / CSC & Hostels' };
}

const VALID_OFFICER_ROLES = new Set<OfficerRoleCategory>([
  'Police Officer / SHO',
  'Government Doctor / Medical Officer',
  'Private Doctor / Clinic Specialist',
  'Bank Manager / DBT Officer',
  'IAS / District Collector / RDO',
  'Revenue / Tahsildar / MeeSeva Officer',
  'College Principal / Nodal Officer',
  'Municipal / Public Utility Officer',
]);

apiRouter.get('/appointments', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const isOfficer = req.user!.role === 'ADMIN' || req.user!.role === 'PLATFORM_ADMIN';
  const isOrg = req.user!.role === 'ORGANIZATION';
  let list = state.appointments;
  if (isOrg) {
    const orgType = req.user!.organization_type || 'hospital';
    list = list.filter((a) => a.org_type === orgType);
  } else if (!isOfficer) {
    list = list.filter((a) => a.user_id === req.user!.id);
  }
  res.json({
    appointments: [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  });
});

apiRouter.post('/appointments', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const profileUser = state.users.find((u) => u.id === req.user!.id);
  const sector_type: AppointmentSectorType =
    req.body?.sector_type === 'private' ? 'private' : 'government';
  const rawRole = String(req.body?.officer_role || '').trim() as OfficerRoleCategory;
  const officer_role: OfficerRoleCategory = VALID_OFFICER_ROLES.has(rawRole)
    ? rawRole
    : 'Revenue / Tahsildar / MeeSeva Officer';
  const office_or_officer_name = String(req.body?.office_or_officer_name || '').trim().slice(0, 180);
  const stateName = String(req.body?.state || profileUser?.state || 'Telangana')
    .trim()
    .slice(0, 80);
  const district = String(req.body?.district || profileUser?.district || 'Hyderabad')
    .trim()
    .slice(0, 80);
  const place_locality = String(req.body?.place_locality || '').trim().slice(0, 160);
  const reason = String(req.body?.reason || '').trim().slice(0, 180);
  const issue_details = String(req.body?.issue_details || '').trim().slice(0, 1000);
  const preferred_date = String(req.body?.preferred_date || '').trim().slice(0, 24);
  const preferred_time = String(req.body?.preferred_time || '10:00 AM – 11:30 AM')
    .trim()
    .slice(0, 48);
  const citizen_phone = String(req.body?.citizen_phone || profileUser?.phone || '')
    .trim()
    .slice(0, 32);
  const urgency =
    req.body?.urgency === 'urgent' || req.body?.urgency === 'priority'
      ? req.body.urgency
      : 'routine';
  const related_reference = String(req.body?.related_reference || '').trim().slice(0, 80);

  if (!place_locality || !reason || !preferred_date) {
    res.status(400).json({
      error: 'Place/locality, appointment reason, and preferred date are required.',
    });
    return;
  }

  const mapped = mapOfficerRoleToExistingOrg(officer_role);
  const now = new Date().toISOString();
  const reference_code = `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const appointment: OfficerAppointmentRecord = {
    id: `apt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    reference_code,
    user_id: req.user!.id,
    citizen_name: req.user!.name,
    citizen_email: req.user!.email,
    citizen_phone: citizen_phone || 'Not provided',
    sector_type,
    officer_role,
    org_type: mapped.org_type,
    org_name: mapped.org_name,
    office_or_officer_name:
      office_or_officer_name || `${officer_role} (${district} Desk)`,
    state: stateName,
    district,
    place_locality,
    reason,
    issue_details: issue_details || reason,
    preferred_date,
    preferred_time,
    urgency,
    ...(related_reference ? { related_reference } : {}),
    status: 'requested',
    created_at: now,
    updated_at: now,
  };

  state.appointments.unshift(appointment);
  appendAuditLog({
    actorId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: `Booked ${sector_type} officer appointment (${officer_role})`,
    objectType: 'organization_task',
    objectId: appointment.id,
    sourceReference: reference_code,
    details: `Routed to ${mapped.org_name} (${mapped.org_type}) at ${place_locality}, ${district}: ${reason}`,
  });
  db.save();
  res.status(201).json({ appointment });
});

apiRouter.patch('/appointments/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = db.getState();
  const appointment = state.appointments.find((a) => a.id === req.params.id);
  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }

  const isOfficer = req.user!.role === 'ADMIN' || req.user!.role === 'PLATFORM_ADMIN';
  const isOrg = req.user!.role === 'ORGANIZATION';
  const isOwner = appointment.user_id === req.user!.id;

  if (isOrg && appointment.org_type !== (req.user!.organization_type || 'hospital')) {
    res.status(403).json({ error: 'Forbidden: appointment belongs to a different organization.' });
    return;
  }
  if (!isOfficer && !isOrg && !isOwner) {
    res.status(403).json({ error: 'Forbidden: cannot modify another citizen appointment.' });
    return;
  }

  const requestedStatus = String(req.body?.status || '').trim() as AppointmentStatus;
  const allowedStatuses = new Set<AppointmentStatus>([
    'requested',
    'confirmed',
    'rescheduled',
    'completed',
    'cancelled',
  ]);

  if (!isOfficer && !isOrg) {
    // Citizen owner can cancel their own appointment
    if (requestedStatus === 'cancelled') {
      appointment.status = 'cancelled';
    } else {
      res.status(403).json({ error: 'Citizens can only cancel their own appointments.' });
      return;
    }
  } else {
    if (allowedStatuses.has(requestedStatus)) {
      appointment.status = requestedStatus;
    }
    if (typeof req.body?.assigned_officer_name === 'string') {
      appointment.assigned_officer_name = req.body.assigned_officer_name.trim().slice(0, 120);
    }
    if (typeof req.body?.officer_notes === 'string') {
      appointment.officer_notes = req.body.officer_notes.trim().slice(0, 400);
    }
    if (typeof req.body?.preferred_date === 'string' && req.body.preferred_date.trim()) {
      appointment.preferred_date = req.body.preferred_date.trim().slice(0, 24);
    }
    if (typeof req.body?.preferred_time === 'string' && req.body.preferred_time.trim()) {
      appointment.preferred_time = req.body.preferred_time.trim().slice(0, 48);
    }
  }

  appointment.updated_at = new Date().toISOString();
  appendAuditLog({
    actorId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: `Updated appointment ${appointment.reference_code} to ${appointment.status}`,
    objectType: 'organization_task',
    objectId: appointment.id,
    sourceReference: appointment.reference_code,
    details: appointment.officer_notes || `Status set to ${appointment.status}`,
  });
  db.save();
  res.json({ appointment });
});

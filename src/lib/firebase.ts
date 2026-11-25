import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  LanguageCode,
  MemorizedDocument,
  RuleRecord,
  SchemeRecord,
  UserProfile,
  UserRole,
} from '../types/niyamsetu';

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export interface SavedBookmark {
  id: string;
  ownerId: string;
  schemeId: string;
  title: string;
  note: string;
  status: 'saved' | 'in_progress' | 'ready';
}

export interface FirestoreSchemeCatalogItem {
  id: string;
  code: string;
  name: string;
  authority: string;
  benefitSummary: string;
  activeRulesCount: number;
  active: boolean;
}

export interface FirestoreReadinessSummary {
  id: string;
  ownerId: string;
  schemeId: string;
  applicantLabel: string;
  completedCount: number;
  missingCount: number;
  uncertainCount: number;
  status: 'ready' | 'needs_action';
}

export async function signInWithGooglePopup(lang: LanguageCode): Promise<{
  firebaseUser: FirebaseUser;
  idToken: string;
} | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let cred;
  try {
    cred = await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    const msg = err instanceof Error ? err.message : String(err || '');

    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      msg.includes('popup-closed-by-user') ||
      msg.includes('cancelled-popup-request')
    ) {
      // User closed the sign-in window or another popup replaced it — not an error.
      return null;
    }
    if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
      throw new Error(
        'Sign-in popup was blocked by your browser. Please allow pop-ups for this site or use Email Sign In.'
      );
    }
    if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
      throw new Error(
        'Google Sign-In popup is restricted on this preview domain. Please use Email Sign In or Role Access.'
      );
    }
    if (code === 'auth/network-request-failed') {
      throw new Error(
        'Network error connecting to Google Sign-In. Check your connection and try again.'
      );
    }
    throw err;
  }

  const fbUser = cred.user;
  const idToken = await fbUser.getIdToken();

  const userDocPath = `users/${fbUser.uid}`;
  try {
    const userRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userRef);
    const lowerEmail = (fbUser.email || '').toLowerCase();
    const defaultRole: UserRole =
      (lowerEmail === 'snehithvarma140@gmail.com' || lowerEmail === 'snehithvarma1940@gmail.com') &&
      fbUser.emailVerified
        ? 'PLATFORM_ADMIN'
        : 'STUDENT';

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: fbUser.uid,
        email: (fbUser.email || '').slice(0, 200),
        displayName: (fbUser.displayName || 'Citizen User').slice(0, 120),
        languagePreference: lang,
        role: defaultRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: (fbUser.displayName || 'Citizen User').slice(0, 120),
        languagePreference: lang,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userDocPath);
  }

  return { firebaseUser: fbUser, idToken };
}

export async function signOutFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function saveUserEligibilityInputs(
  uid: string,
  income: number,
  marks: number
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const savedIncome = Math.max(0, Math.min(100000000, income));
    const savedMarks = Math.max(0, Math.min(100, marks));
    if (!snap.exists()) {
      const fbUser = auth.currentUser;
      const lowerEmail = (fbUser?.email || 'citizen@niyamsetu.in').toLowerCase();
      const defaultRole: UserRole =
        (lowerEmail === 'snehithvarma140@gmail.com' || lowerEmail === 'snehithvarma1940@gmail.com') &&
        fbUser?.emailVerified
          ? 'PLATFORM_ADMIN'
          : 'STUDENT';
      await setDoc(userRef, {
        uid,
        email: (fbUser?.email || 'citizen@niyamsetu.in').slice(0, 200),
        displayName: (fbUser?.displayName || 'Citizen User').slice(0, 120),
        languagePreference: 'en',
        role: defaultRole,
        savedIncome,
        savedMarks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        savedIncome,
        savedMarks,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveUserFullProfile(
  uid: string,
  profile: Partial<UserProfile>
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (profile.name && profile.name.trim()) {
      payload.displayName = profile.name.trim().slice(0, 120);
    }
    if (profile.language_preference === 'en' || profile.language_preference === 'te') {
      payload.languagePreference = profile.language_preference;
    }
    if (typeof profile.phone === 'string') {
      payload.phone = profile.phone.trim().slice(0, 32);
    }
    if (typeof profile.address === 'string') {
      payload.address = profile.address.trim().slice(0, 300);
    }
    if (typeof profile.district === 'string') {
      payload.district = profile.district.trim().slice(0, 80);
    }
    if (typeof profile.state === 'string') {
      payload.state = profile.state.trim().slice(0, 80);
    }
    if (typeof profile.pincode === 'string') {
      payload.pincode = profile.pincode.trim().slice(0, 16);
    }
    if (typeof profile.category === 'string') {
      payload.category = profile.category.trim().slice(0, 64);
    }
    if (typeof profile.education_level === 'string') {
      payload.educationLevel = profile.education_level.trim().slice(0, 120);
    }
    if (typeof profile.family_income === 'number' && !Number.isNaN(profile.family_income)) {
      payload.savedIncome = Math.max(0, Math.min(100000000, profile.family_income));
    }
    if (typeof profile.marks_percent === 'number' && !Number.isNaN(profile.marks_percent)) {
      payload.savedMarks = Math.max(0, Math.min(100, profile.marks_percent));
    }
    if (typeof profile.date_of_birth === 'string') {
      payload.dateOfBirth = profile.date_of_birth.trim().slice(0, 24);
    }
    if (typeof profile.gender === 'string') {
      payload.gender = profile.gender.trim().slice(0, 32);
    }
    if (typeof profile.guardian_name === 'string') {
      payload.guardianName = profile.guardian_name.trim().slice(0, 120);
    }
    if (typeof profile.institution_name === 'string') {
      payload.institutionName = profile.institution_name.trim().slice(0, 180);
    }
    if (typeof profile.roll_number === 'string') {
      payload.rollNumber = profile.roll_number.trim().slice(0, 64);
    }
    if (typeof profile.disability_percent === 'number' && !Number.isNaN(profile.disability_percent)) {
      payload.disabilityPercent = Math.max(0, Math.min(100, profile.disability_percent));
    }
    if (typeof profile.bank_name === 'string') {
      payload.bankName = profile.bank_name.trim().slice(0, 120);
    }
    if (typeof profile.bank_ifsc === 'string') {
      payload.bankIfsc = profile.bank_ifsc.trim().toUpperCase().slice(0, 20);
    }
    if (typeof profile.bank_account_last4 === 'string') {
      payload.bankAccountLast4 = profile.bank_account_last4.trim().slice(0, 8);
    }
    if (typeof profile.income_cert_number === 'string') {
      payload.incomeCertNumber = profile.income_cert_number.trim().slice(0, 80);
    }
    if (typeof profile.caste_cert_number === 'string') {
      payload.casteCertNumber = profile.caste_cert_number.trim().slice(0, 80);
    }
    if (profile.emergency_profile) {
      const ep = profile.emergency_profile;
      payload.bloodGroup = ep.blood_group || 'UNKNOWN';
      payload.emergencyAllergies = (ep.allergies || '').trim().slice(0, 300);
      payload.emergencyConditions = (ep.chronic_conditions || '').trim().slice(0, 300);
      payload.emergencyMedications = (ep.medications || '').trim().slice(0, 300);
      payload.emergencyWarnings = (ep.medical_warnings || '').trim().slice(0, 300);
      payload.emergencyContactName = (ep.emergency_contact_name || '').trim().slice(0, 120);
      payload.emergencyContactPhone = (ep.emergency_contact_phone || '').trim().slice(0, 32);
      payload.emergencyContactRelation = (ep.emergency_contact_relation || '').trim().slice(0, 64);
      if (ep.biometric_id) {
        payload.biometricId = ep.biometric_id.trim().slice(0, 128);
      }
    }
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const fbUser = auth.currentUser;
      const lowerEmail = (profile.email || fbUser?.email || 'citizen@niyamsetu.in').toLowerCase();
      const defaultRole: UserRole =
        (lowerEmail === 'snehithvarma140@gmail.com' || lowerEmail === 'snehithvarma1940@gmail.com') &&
        fbUser?.emailVerified
          ? 'PLATFORM_ADMIN'
          : 'STUDENT';
      await setDoc(userRef, {
        uid,
        email: (profile.email || fbUser?.email || 'citizen@niyamsetu.in').slice(0, 200),
        displayName: String(payload.displayName || fbUser?.displayName || 'Citizen User').slice(0, 120),
        languagePreference: payload.languagePreference === 'te' ? 'te' : 'en',
        role: defaultRole,
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeUserDocuments(
  uid: string,
  onData: (items: MemorizedDocument[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'user_documents';
  const q = query(collection(db, collectionPath), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: MemorizedDocument[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          user_id: String(data.ownerId || ''),
          doc_type: String(data.docType || 'Supporting Document'),
          title: String(data.title || 'Saved Document'),
          scheme_id: String(data.schemeId || 'ALL'),
          doc_number: String(data.docNumber || ''),
          extracted_name: String(data.extractedName || ''),
          extracted_income:
            typeof data.extractedIncome === 'number' ? data.extractedIncome : null,
          extracted_marks:
            typeof data.extractedMarks === 'number' ? data.extractedMarks : null,
          extracted_address: String(data.extractedAddress || ''),
          notes: String(data.notes || ''),
          source_activity:
            data.sourceActivity === 'vault_upload' ||
            data.sourceActivity === 'formsathi_extract' ||
            data.sourceActivity === 'eligibility_sync'
              ? data.sourceActivity
              : 'vault_manual',
          created_at:
            data.createdAt && typeof data.createdAt.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : new Date().toISOString(),
          updated_at:
            data.updatedAt && typeof data.updatedAt.toDate === 'function'
              ? data.updatedAt.toDate().toISOString()
              : new Date().toISOString(),
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveMemorizedDocumentToFirestore(params: {
  id: string;
  ownerId: string;
  docType: string;
  title: string;
  schemeId: string;
  docNumber?: string;
  extractedName?: string;
  extractedIncome?: number | null;
  extractedMarks?: number | null;
  extractedAddress?: string;
  notes?: string;
  sourceActivity: MemorizedDocument['source_activity'];
}): Promise<void> {
  const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const path = `user_documents/${safeId}`;
  try {
    const ref = doc(db, 'user_documents', safeId);
    const snap = await getDoc(ref);
    const optionalFields: Record<string, unknown> = {};
    if (params.docNumber && params.docNumber.trim()) {
      optionalFields.docNumber = params.docNumber.trim().slice(0, 80);
    }
    if (params.extractedName && params.extractedName.trim()) {
      optionalFields.extractedName = params.extractedName.trim().slice(0, 120);
    }
    if (typeof params.extractedIncome === 'number' && !Number.isNaN(params.extractedIncome)) {
      optionalFields.extractedIncome = Math.max(0, Math.min(100000000, params.extractedIncome));
    }
    if (typeof params.extractedMarks === 'number' && !Number.isNaN(params.extractedMarks)) {
      optionalFields.extractedMarks = Math.max(0, Math.min(100, params.extractedMarks));
    }
    if (params.extractedAddress && params.extractedAddress.trim()) {
      optionalFields.extractedAddress = params.extractedAddress.trim().slice(0, 300);
    }
    if (params.notes && params.notes.trim()) {
      optionalFields.notes = params.notes.trim().slice(0, 1000);
    }

    if (!snap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ownerId: params.ownerId,
        docType: params.docType.trim().slice(0, 120),
        title: params.title.trim().slice(0, 180),
        schemeId: (params.schemeId || 'ALL').slice(0, 64),
        sourceActivity: params.sourceActivity,
        ...optionalFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        docType: params.docType.trim().slice(0, 120),
        title: params.title.trim().slice(0, 180),
        schemeId: (params.schemeId || 'ALL').slice(0, 64),
        ...optionalFields,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMemorizedDocumentFromFirestore(id: string): Promise<void> {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const path = `user_documents/${safeId}`;
  try {
    await deleteDoc(doc(db, 'user_documents', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeUserBookmarks(
  uid: string,
  onData: (items: SavedBookmark[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'saved_bookmarks';
  const q = query(collection(db, collectionPath), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedBookmark[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          ownerId: String(data.ownerId || ''),
          schemeId: String(data.schemeId || ''),
          title: String(data.title || ''),
          note: String(data.note || ''),
          status:
            data.status === 'ready' || data.status === 'in_progress'
              ? data.status
              : 'saved',
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createOrUpdateBookmark(params: {
  id: string;
  ownerId: string;
  schemeId: string;
  title: string;
  note: string;
}): Promise<void> {
  const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const path = `saved_bookmarks/${safeId}`;
  try {
    const ref = doc(db, 'saved_bookmarks', safeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ownerId: params.ownerId,
        schemeId: params.schemeId.slice(0, 64),
        title: params.title.slice(0, 160),
        note: params.note.slice(0, 1000),
        status: 'saved',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: params.title.slice(0, 160),
        note: params.note.slice(0, 1000),
        status: 'in_progress',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeBookmark(id: string): Promise<void> {
  const path = `saved_bookmarks/${id}`;
  try {
    await deleteDoc(doc(db, 'saved_bookmarks', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncSchemesCatalogToFirestore(
  schemes: SchemeRecord[],
  rules: RuleRecord[]
): Promise<number> {
  let synced = 0;
  for (const s of schemes) {
    const safeId = s.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const path = `schemes_catalog/${safeId}`;
    const activeRulesCount = rules.filter((r) => r.scheme_id === s.id && r.status === 'active').length;
    try {
      const ref = doc(db, 'schemes_catalog', safeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          id: safeId,
          code: s.code.slice(0, 24),
          name: s.name.slice(0, 200),
          authority: s.authority.slice(0, 200),
          benefitSummary: s.benefit_summary.slice(0, 300),
          activeRulesCount,
          active: Boolean(s.active),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          code: s.code.slice(0, 24),
          name: s.name.slice(0, 200),
          authority: s.authority.slice(0, 200),
          benefitSummary: s.benefit_summary.slice(0, 300),
          activeRulesCount,
          active: Boolean(s.active),
          updatedAt: serverTimestamp(),
        });
      }
      synced++;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
  return synced;
}

export function subscribePublicSchemesCatalog(
  onData: (items: FirestoreSchemeCatalogItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'schemes_catalog';
  const q = query(collection(db, collectionPath), where('active', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreSchemeCatalogItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          code: String(data.code || ''),
          name: String(data.name || ''),
          authority: String(data.authority || ''),
          benefitSummary: String(data.benefitSummary || ''),
          activeRulesCount: Number(data.activeRulesCount || 0),
          active: Boolean(data.active),
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveReadinessCheckToFirestore(params: {
  id: string;
  ownerId: string;
  schemeId: string;
  applicantLabel: string;
  completedCount: number;
  missingCount: number;
  uncertainCount: number;
}): Promise<void> {
  const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const path = `readiness_checks/${safeId}`;
  const status: 'ready' | 'needs_action' =
    params.missingCount === 0 && params.uncertainCount === 0 ? 'ready' : 'needs_action';
  try {
    await setDoc(doc(db, 'readiness_checks', safeId), {
      id: safeId,
      ownerId: params.ownerId,
      schemeId: params.schemeId.slice(0, 64),
      applicantLabel: params.applicantLabel.slice(0, 120),
      completedCount: params.completedCount,
      missingCount: params.missingCount,
      uncertainCount: params.uncertainCount,
      status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

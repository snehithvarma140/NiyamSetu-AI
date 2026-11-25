# NiyamSetu AI — Complete Production Deployment Audit

**Audit Basis:** Full source-code, configuration, database schema, security rules, and runtime inspection of `/app/applet` (Node.js `v22.23.5`, React 19 + Vite 8 + TypeScript 7, Express 4 + `ws`).  
**Constraint Notice:** All findings below reflect verified code/files in the repository; no secrets are printed, and external cloud dashboard state (Vercel, Render, Supabase project, Firebase Console authorized domains, GCP Billing) is explicitly marked where external verification/configuration is required.

---

## 1. Repository & Build Configuration (`package.json` & `vite.config.ts`)

- **Frontend Stack:** React `19.0.1`, Vite `8.3.0`, `@tailwindcss/vite` `4.3.3`, `@vis.gl/react-google-maps` `1.10.2`, `firebase` `13.4.0`, `@supabase/supabase-js` `2.119.2`, `three` `0.187.0`, `motion` `12.23.24`, `lucide-react` `0.546.0`.
- **Backend Stack:** Express `4.21.2`, `ws` `8.23.0`, `@google/genai` `3.6.1`, `dotenv` `17.2.3`, `tsx` `4.21.0` (in `devDependencies`).
- **Build & Start Scripts (`package.json`):**
  - `"dev": "tsx server.ts"` — runs Express + Vite dev middleware for AI Studio / local dev.
  - `"start": "node server.ts"` — runs directly on Node `v22.23.5` (verified via `node --check server.ts` and `NODE_ENV=production PORT=3105 node server.ts` startup test) using Node 22 native TypeScript type-stripping. Requires `"engines": { "node": ">=22.18.0" }` on Render so strip-types is active by default without `--experimental-strip-types`.
  - `"build": "vite build"` — builds the React SPA into `dist/` and copies `src/assets/` into `dist/src/assets/` via the `copy-unbundled-src-assets` Vite plugin.
  - `"lint": "tsc --noEmit"`.
- **Existing Deployment Config Found:** None (`vercel.json` and `render.yaml` do not exist prior to remediation).

---

## 2. Frontend Architecture & Vercel Separation Audit

- **API Calls (`src/services/api.ts`):**
  - **Gap Found:** `apiRequest` previously hardcoded `fetch('/api' + path)`. On a decoupled Vercel (`https://...vercel.app`) + Render (`https://...onrender.com`) deployment, relative `/api/...` calls hit Vercel instead of Render and return `404` or `index.html`.
  - **Remediation Required:** Introduce central `VITE_API_BASE_URL` helper with trailing-slash normalization, defaulting to `''` (same-origin) when unset so AI Studio preview continues working seamlessly.
- **WebSocket Voice Calls (`src/components/voice/LiveVoiceAdvisor.tsx`):**
  - **Gap Found:** Hardcoded `${protocol}//${window.location.host}/live?lang=...`. On Vercel + Render, `window.location.host` points to Vercel, which does not host the `/live` WebSocket bridge.
  - **Remediation Required:** Derive `ws://` / `wss://` URL from `VITE_WS_BASE_URL` or `VITE_API_BASE_URL`, falling back to `window.location.host` in same-origin dev/preview.
- **SPA Routing (`vercel.json`):**
  - **Gap Found:** No `vercel.json` rewrite existed; refreshes or deep links on client paths risk 404 on static Vercel hosting.
  - **Remediation Required:** Add `vercel.json` with SPA rewrite `/(.*) -> /index.html` and baseline security headers.
- **Client Modules Audited:**
  - Citizen Portal: `StudentHome`, `SchemesHubPage`, `ReadinessHubPage`, `FormSathiPage`, `EligibilityFinderPage`, `WhatIfSimulatorPage`, `ProfileVaultPage`, `HelpCentersMapPage`, `JanSetuPage`, `ServicesHelpPage`, `OfficerAppointmentsPage`, `GrievanceRtiPage`, `DeadlinesAlertsPage`, `ProceduresPage`.
  - Government Oversight Portal: `AdminDashboard`, `GovernanceLifecycleHubPage`, `RuleWeaverPage`, `HumanReviewQueuePage`, `PolicyRipplePage`, `GovMonitoringPage`, `AuditTransparencyPage`, `GovAdminSecurityPage`, `DeveloperDashboard`.
  - Organization Partner Portal: `OrganizationWorkspacePage` (`hospital`, `bank`, `college`, `other`).
  - No `window.alert` or Next.js dependencies are present.

---

## 3. Backend Server & CORS Audit (`server.ts` & `server/routes/api.ts`)

- **HTTP + WebSocket Server (`server.ts`):**
  - Binds `0.0.0.0` on `Number(process.env.PORT || 3000)` — compatible with Render's dynamic `PORT`.
  - **Gap Found (CORS):** Zero CORS headers existed in `server.ts` or `apiRouter`. Cross-origin requests from Vercel (`Authorization: Bearer ...`, `Content-Type: application/json`, `OPTIONS` preflight) would fail in production browsers.
  - **Gap Found (Production Static Fallback):** When `NODE_ENV === 'production'`, `server.ts` unconditionally mounted `express.static('dist')` and `app.get('*', ... sendFile('dist/index.html'))`. On a backend-only Render deployment without a built `dist/` folder, requests to `/` would error instead of returning a clean API JSON response.
  - **Gap Found (Proxy & Error Handling):** Missing `app.set('trust proxy', 1)` (needed behind Render's TLS reverse proxy for accurate client IP / rate limiting) and missing global Express error-handling middleware (stack trace suppression in production).
  - **Gap Found (Health Check):** `GET /api/health` returned only `{ status: 'ok', service: '...' }` without safe readiness metadata (persistence mode, Supabase/Gemini/Maps configuration booleans, demo-auth flag).

---

## 4. Database & Data Persistence Audit

Three persistence layers exist in the repository:

1. **Authoritative Backend Store (`server/engine/store.ts`) — File-Backed In-Memory Store (`data/niyamsetu-state.json`):**
   - **Current Behavior:** Every API read/write uses `db.getState()` and `db.save()`, writing synchronously to `path.resolve(process.cwd(), 'data', 'niyamsetu-state.json')`. When missing or version-mismatched (`CURRENT_SEED_VERSION = 6`), initializes rich seed data (`schemes`, `rules`, `users`, `user_documents`, `applications`, `organization_tasks`, `appointments`, `complaints`, `faqs`, `audit_log`, `sources`).
   - **Production Risk on Render:** Render Web Services use an ephemeral filesystem on free/standard instances unless a **Render Persistent Disk** is attached. Additionally, `DATA_DIR` was hardcoded to `process.cwd()/data` instead of respecting `NIYAMSETU_DATA_DIR` / `DATA_DIR` / `RENDER_DISK_PATH`.
2. **Supabase Plugin (`server/engine/supabasePlugin.ts` & `supabase/migrations/001_niyamsetu_schema.sql`):**
   - **Current Behavior:** Optional write-only background sync (`queueSupabaseSync()` inside `db.save()`) plus optional search (`GET /api/supabase/search`) and eligibility RPC (`POST /api/supabase/eligibility-rpc`), and private bucket storage upload (`niyamsetu-documents`).
   - **Gaps Found:**
     1. Backend never **loaded** persisted state back from Supabase on startup — so even with Supabase configured, a Render restart would lose newly registered users, uploaded documents, complaints, appointments, and rule approvals!
     2. Schema mismatches between `001_niyamsetu_schema.sql` and `store.ts` types:
        - `user_profiles.role` check constraint omitted `'ORGANIZATION'` and `'DEVELOPER'`.
        - `monitored_sources`, `rule_links`, `procedure_steps`, `required_documents`, `readiness_reports`, `deadlines`, `alerts`, `schemes`, and `review_queue` columns differed from runtime `store.ts` properties (e.g., `monitored_sources.department`, `check_frequency`, `active`, `last_status` values).
        - Several runtime tables (`user_documents`, `applications`, `organization_tasks`, `appointments`, `complaints`, `faqs`, `unanswered_faq_reports`) were not in `001_niyamsetu_schema.sql`.
     3. Frontend `src/lib/supabase.ts` checks `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (empty in `.env.example`, disabled unless configured).
   - **Authoritative Persistence Decision:** Keep the existing `DataStore` + Supabase + Firebase architecture (do NOT switch databases). Make persistence production-durable by:
     - Supporting `NIYAMSETU_DATA_DIR` / `DATA_DIR` / `RENDER_DISK_PATH` for Render Persistent Disk mounts, AND
     - Adding additive migration `supabase/migrations/002_niyamsetu_production_persistence.sql` with a durable `public.app_state_snapshots` table (plus fixing `user_profiles.role` constraint), and hydrating from Supabase snapshot at server startup (`await db.init()`) whenever `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are configured.
3. **Firebase Auth & Cloud Firestore (`src/lib/firebase.ts`, `firebase-applet-config.json`, `firestore.rules`):**
   - **Current Behavior:** Client initializes Firebase Auth (Google Sign-In popup) and Firestore (`ai-studio-remixremixremixn-e428d79b-ebf2-40cb-a286-340282e8ec0a` in project `perfect-quarter-067s8`). `firestore.rules` enforces strict owner isolation, field allowlists, timestamp immutability, and verified-email checks (`npx eslint firestore.rules` passes with zero errors).
   - **Backend Verification:** `POST /api/auth/google-sync` verifies Google `idToken` against Google Identity Toolkit REST API using `firebase-applet-config.json` `apiKey` (or env override needed).
   - **Production Gap:** `src/lib/firebase.ts` reads `firebase-applet-config.json` directly without supporting `VITE_FIREBASE_*` env overrides, and executes `void testConnection()` unconditionally at module load. Also, the deployed Vercel domain (`*.vercel.app` and custom domain) **must** be added to **Firebase Console → Authentication → Settings → Authorized domains** for Google Sign-In to work in production.

---

## 5. Authentication, Authorization & Security Audit

1. **Unauthenticated Demo Bypass (`POST /api/auth/demo-signin`):**
   - Previously unconditionally issued `STUDENT`, `ORGANIZATION`, or `ADMIN` JWTs without any password — **unsafe for public production**. Must be gated behind `ENABLE_DEMO_AUTH=true` (allowed automatically only in non-production dev/preview) and disabled in `NODE_ENV=production` unless explicitly opted in for a staging demo.
   - Frontend `LoginPage.tsx` and `AuthModal.tsx` exposed one-click `Role Access` buttons and `(demo: NiyamDemo2026!)` password hint unconditionally. Must follow `VITE_ENABLE_DEMO_AUTH` (default off in production builds, enabled in `DEV`).
2. **Unprotected State Reset (`POST /api/demo/reset`):**
   - Previously had **no `requireAuth` and no role check** — any unauthenticated request on the internet could wipe live state back to seed data! Must be gated behind `ENABLE_DEMO_AUTH` AND `requireAuth` + `requireRole(['ADMIN', 'PLATFORM_ADMIN'])`.
3. **Session Signing Secret (`server/auth.ts`):**
   - Uses HMAC-SHA256 signed bearer tokens (`12h` expiry) and `crypto.scryptSync` + `crypto.timingSafeEqual` for passwords.
   - **Gap:** If `SESSION_SECRET` is omitted on Render, a random ephemeral secret is generated per boot, invalidating all user sessions across restarts/scaling, and `SESSION_SECRET` was missing from `.env.example`.
4. **RBAC Organization Sector Enforcement (`server/routes/api.ts`):**
   - `POST /api/gov/organizations/tasks/:id/verify` checked `requireRole(['ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN'])` but did **not** verify `task.org_type === req.user.organization_type` for `ORGANIZATION` accounts (unlike `PATCH /appointments/:id` and `PATCH /complaints/:id`). Fixed required.
5. **Public Endpoint Rate Limiting & Validation:**
   - Public AI/search/TTS endpoints (`/api/jansetu/ask`, `/chat`, `/search-grounded`, `/maps-grounded`, `/audio/transcribe`, `/audio/tts`, `/public/news-speak`, `/public/news-feed`, `/navigator/resolve`) had no rate limiting. Adding lightweight per-IP sliding-window rate limiting prevents Gemini quota exhaustion on public Render deployments.
6. **Official Portal & Password Hygiene (`FormSathiPage.tsx` & `server/routes/api.ts`):**
   - `FORBIDDEN_FORM_KEY_PATTERN` blocks `password|passcode|otp|pin|cvv|mpin|secret` fields on draft save.
   - `FormSathiPage.tsx` explicitly prohibits bypassing official CAPTCHA/OTP and requires explicit user confirmation (`confirmPortalSubmission: true`) before recording submission status.
7. **Hardcoded Admin Emails & Demo Data Labels:**
   - `snehithvarma140@gmail.com` and `snehithvarma1940@gmail.com` are designated `PLATFORM_ADMIN` in `firestore.rules`, `src/lib/firebase.ts`, and `server/routes/api.ts` (backend will also support `PLATFORM_ADMIN_EMAILS` env var cleanly).
   - Seeded demo users (`@niyamsetu.demo`), `.sample.gov.in` contact strings in `schemeMetadata.ts` / `extraSeedData.ts`, and synthetic `org_analytics` baseline counts (`is_demo_metrics: true`) exist and should remain clearly labeled as operational/demo baseline metrics where displayed.

---

## 6. Gemini AI, Google Maps & Live Voice Audit

- **Gemini AI (`server/engine/aiService.ts`):**
  - Uses `@google/genai` strictly server-side (`GEMINI_API_KEY` never sent to frontend).
  - Models used: `gemini-4-hydrogen`, `gemini-3.1-flash-lite`, `gemini-3.5-transcribe`, `gemini-3.8-flash-lite-tts`, `gemini-3.8-live`.
  - Several functions (`mapApplicationFormWithAI`, `analyzeApplicationDelayWithAI`, `resolveCitizenServiceNavigatorWithAI`, `fetchInterestBasedNewsWithSearch`, `synthesizeSpeechWithGemini`) include graceful deterministic/browser-speech fallbacks when Gemini fails or `GEMINI_API_KEY` is missing; others (`extractRulesFromDocument`, `extractApplicationDocumentFields`, `transcribeAudioWithGemini`, `mapsGroundedAnswer`, `generateAllSchemesAdvancedPlan`) return descriptive `500`/`503` JSON errors.
- **Google Maps (`HelpCentersMapPage.tsx` & `GET /api/maps/config`):**
  - Uses `@vis.gl/react-google-maps` (`APIProvider`, `GoogleMap`, `AdvancedMarker`, `InfoWindow`, `useMapsLibrary('places')`) + Places API (New) `Place.searchByText` + Gemini Maps Grounding (`/api/jansetu/maps-grounded`).
  - Loads key from `VITE_GOOGLE_MAPS_API_KEY` at build time OR `GET /api/maps/config` at runtime.
  - **Production Gaps:**
    1. Missing `useApiLoadingStatus()` diagnostics UI if Google Maps JS fails to load due to HTTP referrer restrictions on the published Vercel domain (`AUTH_FAILURE` / `FAILED`).
    2. `fetchMapsConfig` logged errors only to console instead of surfacing a user-friendly error message.
    3. Geolocation errors (`PERMISSION_DENIED`, `TIMEOUT`, non-HTTPS origin) can be communicated more clearly.
    4. Deployed Vercel domain (`https://<app>.vercel.app/*` and custom domain) must be authorized in Google Cloud Console API key HTTP referrer restrictions.
- **Live Voice WebSocket (`/live` in `server.ts` & `LiveVoiceAdvisor.tsx`):**
  - Bidirectional audio (`audio/pcm;rate=16000` input -> `gemini-3.8-live` -> 24kHz PCM output + input/output transcriptions).
  - Needs central WS URL builder for decoupled Vercel -> Render `wss://` connections, WebSocket origin validation on backend (using same CORS allowlist), and explicit browser audio/mic capability checks on client.

---

## 7. File Upload & Storage Audit

- Citizen document upload (`/api/formsathi/extract-file`, `/api/gov/sources` ingestion): validates allowed extensions/MIME types (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.txt`) and `5 MB` client/server size limit (`express.json({ limit: '15mb' })`).
- **Storage Architecture:**
  - Citizen memorized documents store extracted metadata (no raw binary blobs persisted on local disk).
  - Official circular ingestion optionally uploads raw binaries to private Supabase Storage bucket `niyamsetu-documents` via `uploadDocumentToSupabaseStorage` when Supabase is configured, generating 1-hour signed URLs; otherwise falls back cleanly to extracted text metadata in `document_pages`.

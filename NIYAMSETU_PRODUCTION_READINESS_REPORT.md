# NiyamSetu AI — Production Readiness Report

**Audit & Preparation Date:** 2026-11-25  
**Target Deployment Split:** GitHub (Source Control) → **Vercel** (Vite React Frontend) + **Render** (Node.js 22 Express + WebSocket Backend)  
**Allowed Status Labels Used:** `IMPLEMENTED AND TESTED` | `IMPLEMENTED BUT NOT TESTED` | `PARTIALLY IMPLEMENTED` | `NOT IMPLEMENTED` | `CONFIGURATION REQUIRED` | `BLOCKED`

---

## 1. Executive Summary

The existing **NiyamSetu AI** codebase has been audited and hardened for split production deployment across **Vercel** (frontend SPA) and **Render** (backend API + `/live` WebSocket server) without rewriting the framework or removing existing Citizen, Organization, Government Admin, Developer, AI, Voice, or Google Maps modules.

- **Local Code, TypeScript, Build, Security Rules & Production-Mode Server Verification:** Passed (`compile_applet`, `lint_applet` / `tsc --noEmit`, `npx eslint firestore.rules`, and isolated `NODE_ENV=production` HTTP/CORS/RBAC/WebSocket smoke tests).
- **External Cloud Provisioning & Live Credentials:** `CONFIGURATION REQUIRED` — deploying to GitHub, creating the Vercel and Render projects, executing Supabase SQL migrations `001` & `002`, configuring secret keys (`SESSION_SECRET`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), and updating Firebase Authorized Domains / Google Maps HTTP referrers must be performed by the project owner in external consoles.

---

## 2. Architecture Overview

- **Frontend (Vercel — `dist/`):** React 19 + Vite 8 + TypeScript + Tailwind CSS SPA (`vercel.json` SPA rewrites & security headers). Centralizes HTTP requests via `VITE_API_BASE_URL` (`src/services/api.ts`) and WebSocket streams via `VITE_WS_BASE_URL` or derived `wss://` origin.
- **Backend (Render — `node server.ts`):** Node.js `>=22.18.0` native TypeScript runtime running Express 4 REST `/api/*` endpoints and `ws` `/live` bidirectional Gemini Live audio proxy (`render.yaml`). Supports `trust proxy`, configurable CORS (`CORS_ALLOWED_ORIGINS`), JSON 404/error handlers, and dual-mode static serving (API-only JSON root when `dist/index.html` is absent on Render; single-origin static fallback when `dist/` is built locally).
- **Database & Persistence Layer (Preserved Authoritative Architecture):**
  - Authoritative Backend `DataStore` (`server/engine/store.ts`) + `supabasePlugin.ts` (`app_state_snapshots` JSONB snapshot + relational table sync via `001_niyamsetu_schema.sql` & `002_niyamsetu_production_persistence.sql`) + optional Render Persistent Disk (`NIYAMSETU_DATA_DIR=/var/data`).
  - Firebase Authentication + Firestore (`src/lib/firebase.ts`, `firestore.rules`) for Google Sign-In, citizen personal profiles, memorized vault metadata, bookmarks, and readiness checks.
- **AI, Voice & Location:** Server-side `@google/genai` (JanSetu Q&A, FormSathi extraction, RuleWeaver ingestion, News Desk, TTS/STT, Maps Grounding, Live Audio WS), Google Maps Platform (`@vis.gl/react-google-maps` + Places API New).

---

## 3. Complete Feature Matrix

| Module / Capability | Portal / Location | Status | Notes |
| --- | --- | --- | --- |
| Split Frontend API & WS Routing (`VITE_API_BASE_URL`, `VITE_WS_BASE_URL`) | `src/services/api.ts` | `IMPLEMENTED AND TESTED` | Tested via Vite production build + `tsc --noEmit`; live cross-origin browser verification requires deployed Render + Vercel URLs (`CONFIGURATION REQUIRED`). |
| Production CORS & WebSocket `/live` Origin Guard | `server.ts` | `IMPLEMENTED AND TESTED` | Tested against `NODE_ENV=production`: allowed origin returns `204` + `Access-Control-Allow-Origin`; unauthorized origins receive `403` on HTTP preflight & WS upgrade. |
| Production Health Endpoint (`/api/health`) | `server/routes/api.ts` | `IMPLEMENTED AND TESTED` | Returns non-sensitive readiness flags (`persistence_mode`, `demo_auth_enabled`, `session_secret_configured`, `gemini_configured`, `maps_configured`). |
| Citizen Portal Auth (Email Register / Sign-In / `/api/auth/me`) | `server/routes/api.ts`, `LoginPage.tsx`, `AuthModal.tsx` | `IMPLEMENTED AND TESTED` | Tested end-to-end (`201` register, `200` `/api/auth/me`, `200` `/api/profile`) with `ENABLE_DEMO_AUTH=false`. |
| Google Sign-In + Cloud Sync (`/api/auth/google-sync`) | `src/lib/firebase.ts`, `server/routes/api.ts` | `IMPLEMENTED BUT NOT TESTED` | Verified build/types; live Firebase popup on Vercel requires adding Vercel domain to Firebase Authorized Domains (`CONFIGURATION REQUIRED`). |
| Demo Login & Reset Production Gating (`ENABLE_DEMO_AUTH`) | `server/routes/api.ts`, `LoginPage.tsx`, `AuthModal.tsx`, `AppShell.tsx` | `IMPLEMENTED AND TESTED` | Confirmed `/api/auth/demo-signin` returns `403` and `/api/demo/reset` returns `401`/`403` when `ENABLE_DEMO_AUTH=false`; UI demo cards hidden unless enabled. |
| Server-Side RBAC & Org Sector Verification | `server/routes/api.ts` | `IMPLEMENTED AND TESTED` | Citizen request to `/api/gov/users` returned `403`; org verification task checks `task.org_type === req.user.organization_type`. |
| Schemes Hub, Deterministic Eligibility, What-If Simulator | `SchemesHubPage.tsx`, `EligibilityFinderPage.tsx`, `WhatIfSimulatorPage.tsx` | `IMPLEMENTED BUT NOT TESTED` | Deterministic math in `rulesEngine.ts`; compiled cleanly in Vite build. |
| FormSathi & Readiness Hub & Profile Vault & Emergency QR | `FormSathiPage.tsx`, `ReadinessHubPage.tsx`, `ProfileVaultPage.tsx`, `EmergencyQrPass.tsx` | `PARTIALLY IMPLEMENTED` | Works end-to-end against backend `DataStore` + Firestore; uploaded citizen documents persist across Render restarts only after configuring Supabase snapshot or `NIYAMSETU_DATA_DIR` (`CONFIGURATION REQUIRED`). |
| Organization Workspace (Hospital / Bank / College / MeeSeva) | `OrganizationWorkspacePage.tsx` | `IMPLEMENTED BUT NOT TESTED` | Sector-scoped API + emergency lookup + baseline/live analytics metrics badge. |
| Gov Admin Oversight (RuleWeaver, Review Queue, Policy Ripple, Audit, Security) | `src/pages/admin/*`, `DeveloperDashboard.tsx` | `IMPLEMENTED BUT NOT TESTED` | Auth-guarded by `ADMIN`/`PLATFORM_ADMIN` and `DEVELOPER` RBAC middleware. |
| Google Maps Platform & Places API (New) & Gemini Maps Grounding | `HelpCentersMapPage.tsx`, `/api/maps/config`, `/api/jansetu/maps-grounded` | `CONFIGURATION REQUIRED` | Code includes `APILoadingStatus` diagnostics, geolocation HTTPS checks, and error states; requires `VITE_GOOGLE_MAPS_API_KEY` + Vercel HTTP referrer restriction in Google Cloud Console. |
| Gemini AI Features (JanSetu Q&A, OCR/FormSathi, News Feed, TTS, STT, Live Voice WS) | `server/engine/aiService.ts`, `LiveVoiceAdvisor.tsx`, `server.ts` | `CONFIGURATION REQUIRED` | Code verified and WS rejects invalid origins / handles missing key cleanly; live AI responses require `GEMINI_API_KEY` on Render. |
| Supabase Persistent State Hydration & Relational Sync | `server/engine/store.ts`, `server/engine/supabasePlugin.ts`, `supabase/migrations/002_*` | `CONFIGURATION REQUIRED` | Migration `002` written and TypeScript compiled cleanly; requires running migrations `001` & `002` in Supabase and setting `SUPABASE_*` env vars on Render. |

---

## 4. Frontend Audit & Vercel Readiness

- **Status:** `IMPLEMENTED AND TESTED` (Local Production Build & Lint) / `CONFIGURATION REQUIRED` (Vercel Dashboard Env Vars)
- **Key Changes Completed:**
  - `vercel.json` configured with Vite framework, `dist` output directory, SPA fallback rewrite `/(.*) -> /index.html`, and baseline security headers.
  - `src/services/api.ts` routes all `/api/*` calls via `VITE_API_BASE_URL` and WebSocket connections via `VITE_WS_BASE_URL` (auto-deriving `wss://` from `VITE_API_BASE_URL`), with clear network/CORS error messages.
  - `src/lib/firebase.ts` supports optional `VITE_FIREBASE_*` overrides while preserving fallback to `firebase-applet-config.json`, and provides actionable `auth/unauthorized-domain` guidance.
  - `LoginPage.tsx`, `AuthModal.tsx`, and `AppShell.tsx` hide one-click demo role cards, demo password hints, and Reset Demo buttons when `VITE_ENABLE_DEMO_AUTH` is `false` (default in production builds).
  - `LiveVoiceAdvisor.tsx` uses `getWebSocketUrl()` and validates secure browser `MediaDevices`/`AudioContext`/`WebSocket` support before starting streaming.
  - `HelpCentersMapPage.tsx` uses `useApiLoadingStatus()` (`APILoadingStatus.AUTH_FAILURE`/`FAILED`), clear HTTPS geolocation error handling, and `/api/maps/config` error surfacing.

---

## 5. Backend Audit & Render Readiness

- **Status:** `IMPLEMENTED AND TESTED` (Local Production Startup & Smoke Suite) / `CONFIGURATION REQUIRED` (Render Deployment & Env Vars)
- **Key Changes Completed:**
  - `package.json` specifies `"engines": { "node": ">=22.18.0" }` and `"start": "node server.ts"`.
  - `render.yaml` defines the Node Web Service (`npm install`, `npm start`, `healthCheckPath: /api/health`, `ENABLE_DEMO_AUTH="false"`, generated `SESSION_SECRET`, `/var/data` disk guidance).
  - `server.ts` calls `await db.hydrateFromRemote()` before listening, enables `app.set('trust proxy', 1)`, enforces HTTP CORS and WebSocket `verifyClient` against `CORS_ALLOWED_ORIGINS`, handles `/api/*` 404 JSON responses cleanly, and falls back to API JSON metadata on `GET /` when `dist/index.html` is absent.

---

## 6. Database & Persistence Readiness

- **Status:** `PARTIALLY IMPLEMENTED` / `CONFIGURATION REQUIRED`
- **Authoritative Architecture:** Preserved existing `DataStore` (`server/engine/store.ts`) + Supabase PostgreSQL plugin (`server/engine/supabasePlugin.ts`) + Firebase Auth/Firestore (`firestore.rules`). No second database provider was introduced.
- **Render Ephemeral Storage Mitigation:**
  - Added `NIYAMSETU_DATA_DIR` / `RENDER_DISK_PATH` configurable storage directory in `store.ts`.
  - Added `supabase/migrations/002_niyamsetu_production_persistence.sql` creating RLS-locked `public.app_state_snapshots` and fixing `user_profiles.role` check constraints.
  - Added startup `db.hydrateFromRemote()` and background `saveAppStateSnapshotToSupabase()` so state survives Render container restarts once Supabase credentials and SQL migrations are applied.
- **External Setup Needed:** Execute `001_niyamsetu_schema.sql` then `002_niyamsetu_production_persistence.sql` in Supabase SQL Editor and supply `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on Render (and/or attach a Render Persistent Disk at `/var/data` with `NIYAMSETU_DATA_DIR=/var/data`).

---

## 7. AI, Voice WebSocket, Google Maps & File Upload Readiness

- **Google Gemini AI:** `CONFIGURATION REQUIRED` — All Gemini calls remain strictly server-side (`server/engine/aiService.ts`) using `GEMINI_API_KEY`. Public unauthenticated AI/TTS/news endpoints are protected by sliding-window rate limiting (`publicAiRateLimit`).
- **Live Voice WebSocket (`/live`):** `IMPLEMENTED AND TESTED` (origin verification & handshake) / `CONFIGURATION REQUIRED` (`GEMINI_API_KEY` on Render). Frontend connects over `wss://` when deployed on HTTPS Vercel.
- **Google Maps Platform:** `CONFIGURATION REQUIRED` — `HelpCentersMapPage.tsx` handles `VITE_GOOGLE_MAPS_API_KEY`, fallback `/api/maps/config`, `APILoadingStatus` errors, and GPS permission errors. Requires billing + `Maps JavaScript API` + `Places API (New)` + HTTP referrer restriction for the deployed Vercel domain.
- **File Uploads:** `PARTIALLY IMPLEMENTED` — Uploaded citizen/gov files persist in `NIYAMSETU_DATA_DIR` (if Render Disk is attached) or Supabase Storage (`niyamsetu-documents` bucket if created). On free-tier Render without a disk or Supabase Storage bucket, local binary file uploads will not survive redeploys.

---

## 8. Auth, RBAC, Security & Demo-Data Hardening Status

- **HMAC Session Tokens (`server/auth.ts`):** `IMPLEMENTED AND TESTED` — Uses `SESSION_SECRET` (warns loudly in production if missing or <16 chars).
- **Demo Access Hardening:** `IMPLEMENTED AND TESTED` — `POST /api/auth/demo-signin` returns `403` when `ENABLE_DEMO_AUTH=false` in production; `POST /api/demo/reset` requires both `ENABLE_DEMO_AUTH=true` and `ADMIN`/`PLATFORM_ADMIN` role.
- **RBAC Enforcement:** `IMPLEMENTED AND TESTED` — Verified citizen token cannot access `/api/gov/users` (`403`) or `/api/demo/reset` (`403`); organization verification tasks enforce `task.org_type === req.user.organization_type`.
- **Rate Limiting:** `IMPLEMENTED BUT NOT TESTED` (under heavy load) — In-memory IP sliding-window limiters added to `/api/auth/*` (`authRateLimit`) and public Gemini/news/TTS/navigator routes (`publicAiRateLimit`).
- **Firestore Rules:** `IMPLEMENTED AND TESTED` — `npx eslint firestore.rules` passed with exit code `0`.

---

## 9. Production Environment Variables Summary

See `/PRODUCTION_ENVIRONMENT_VARIABLES.md` and `/.env.example` for the complete list:
- **Vercel (`VITE_*` public only):** `VITE_API_BASE_URL`, `VITE_ENABLE_DEMO_AUTH=false`, `VITE_GOOGLE_MAPS_API_KEY`, optional `VITE_WS_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FIREBASE_*`.
- **Render (private server-side):** `NODE_ENV=production`, `SESSION_SECRET`, `ENABLE_DEMO_AUTH=false`, `GEMINI_API_KEY`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `NIYAMSETU_DATA_DIR`, `FIREBASE_WEB_API_KEY`, `PLATFORM_ADMIN_EMAILS`, `GOOGLE_MAPS_API_KEY`.

---

## 10. Build, Lint, Rules & Runtime Verification Results

| Check | Command / Tool | Result | Notes |
| --- | --- | --- | --- |
| Vite Production Bundle | `compile_applet` (`npm run build`) | `IMPLEMENTED AND TESTED` | Built cleanly to `dist/` (`vite build` exit 0). |
| TypeScript Strict Check | `lint_applet` (`npm run lint` / `tsc --noEmit`) | `IMPLEMENTED AND TESTED` | Exited 0 with zero TypeScript errors. |
| Firestore Rules Validation | `npx eslint firestore.rules` | `IMPLEMENTED AND TESTED` | Exited 0 with zero warnings/errors. |
| Production Server Boot + Auth/CORS/RBAC/WS Smoke Test | `NODE_ENV=production PORT=3105 ENABLE_DEMO_AUTH=false node server.ts` | `IMPLEMENTED AND TESTED` | Verified `/api/health` (`200`), CORS allowed (`204`) & rejected (`403`), API 404 (`404`), demo-signin blocked (`403`), demo-reset blocked (`401`/`403`), register (`201`), `/api/auth/me` (`200`), `/api/profile` (`200`), `/api/gov/users` citizen RBAC block (`403`), WS `/live` origin block (`403`) & allowed handshake. |

---

## 11. Pre-Deployment Checklist

1. Push clean repository to GitHub (confirm `.env` and `data/*.json` are gitignored).
2. In **Supabase SQL Editor**, run `supabase/migrations/001_niyamsetu_schema.sql` then `supabase/migrations/002_niyamsetu_production_persistence.sql` (and optionally create private storage bucket `niyamsetu-documents`).
3. Create **Render Web Service** (via `render.yaml` or manual Node setup), set all required Render secrets, and copy the resulting `https://<render-service>.onrender.com` URL.
4. Create **Vercel Project** from GitHub (`Vite`, output `dist`), set `VITE_API_BASE_URL`, `VITE_ENABLE_DEMO_AUTH=false`, and `VITE_GOOGLE_MAPS_API_KEY`, then deploy to obtain `https://<vercel-domain>.vercel.app`.
5. Update Render `CORS_ALLOWED_ORIGINS` and `FRONTEND_URL` to exact `https://<vercel-domain>.vercel.app` (no trailing slash) and trigger a Render redeploy/config sync.
6. Add `<vercel-domain>.vercel.app` to **Firebase Console → Authentication → Settings → Authorized domains**.
7. Add `https://<vercel-domain>.vercel.app/*` to **Google Cloud Console → Maps API Key → HTTP referrers** with `Maps JavaScript API` and `Places API (New)` enabled and billing active.

---

## 12. Post-Deployment Smoke-Test Checklist

1. `GET https://<render-service>.onrender.com/api/health` returns `200` with `"demo_auth_enabled": false`, `"session_secret_configured": true`, `"gemini_configured": true`.
2. Opening `https://<vercel-domain>.vercel.app` shows Email Sign In / New Citizen / Google Sign-In (no one-click Demo Role cards).
3. Registering and signing in creates a persistent session and survives a Render restart when Supabase/Disk persistence is active.
4. Opening **Help Centers Map** loads tiles, Places search results, GPS location (HTTPS), and AI Location Advisor without console errors.
5. Opening **Live Voice Advisor** connects over `wss://<render-service>.onrender.com/live` or cleanly answers via Ask & Listen TTS.

---

## 13. Known Limitations, Risks & External Dependencies

- **Render Free-Tier Cold Starts:** Render free web services sleep after 15 minutes of inactivity (~30–50s wake latency on first request or WebSocket connect).
- **Render Ephemeral Filesystem:** Without Supabase `app_state_snapshots` or a paid Render Persistent Disk (`NIYAMSETU_DATA_DIR`), JSON state and local binary uploads reset on container redeploy.
- **In-Memory Rate Limiter:** `authRateLimit` and `publicAiRateLimit` reset if the single Render instance restarts and do not share counters across multiple horizontal instances.
- **External Console Actions Required:** Vercel, Render, Supabase, Firebase Authorized Domains, and Google Cloud Maps referrer/billing setup cannot be executed automatically from this workspace.

---

## 14. Remediation Summary of Files Added / Updated

- **Added:** `NIYAMSETU_PRODUCTION_DEPLOYMENT_AUDIT.md`, `NIYAMSETU_PRODUCTION_READINESS_REPORT.md`, `VERCEL_DEPLOYMENT_GUIDE.md`, `RENDER_DEPLOYMENT_GUIDE.md`, `PRODUCTION_ENVIRONMENT_VARIABLES.md`, `vercel.json`, `render.yaml`, `supabase/migrations/002_niyamsetu_production_persistence.sql`.
- **Updated:** `.env.example`, `package.json`, `server.ts`, `server/auth.ts`, `server/routes/api.ts`, `server/engine/store.ts`, `server/engine/supabasePlugin.ts`, `src/services/api.ts`, `src/lib/firebase.ts`, `src/components/voice/LiveVoiceAdvisor.tsx`, `src/pages/student/HelpCentersMapPage.tsx`, `src/pages/LoginPage.tsx`, `src/components/ui/AuthModal.tsx`, `src/components/layout/AppShell.tsx`.

---

## 15. Final Production Verdict

**Verdict: READY FOR DEPLOYMENT PENDING EXTERNAL ENVIRONMENT CONFIGURATION**

All codebase engineering, split Vercel/Render routing, CORS/WebSocket origin security, demo-mode hardening, persistence hydration support, build compilation (`vite build`), TypeScript checks (`tsc --noEmit`), Firestore rule linting, and local production-mode runtime smoke tests have passed cleanly. Remaining steps (`CONFIGURATION REQUIRED`) are solely creating the external GitHub/Render/Vercel/Supabase services, applying SQL migrations `001` & `002`, populating secrets, and authorizing the deployed Vercel domain in Firebase Auth and Google Cloud Console.

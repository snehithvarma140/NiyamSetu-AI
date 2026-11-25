# NiyamSetu AI — Phase 1 Architecture & Module Reconciliation Report

**Tagline**: *"Understand the rules. Find your benefits. Complete your applications."*

---

## 1. Existing Working Implementations (Inspected in Workspace)

### A. Backend & Rules Intelligence (`server.ts`, `server/auth.ts`, `server/routes/api.ts`, `server/engine/*`)
- **Express + Vite Unified Runtime (`server.ts`)**: Serves REST APIs (`/api/*`), WebSocket bridge (`/live`) for Gemini Live Voice (`gemini-3.8-live`), and Vite SPA middleware on port `3000`.
- **RBAC & Auth (`server/auth.ts`)**: HMAC-signed session tokens, `scrypt` password hashing with timing-safe verification, Firebase Google Sign-In token verification (`/api/auth/google-sync`), self-registration locked to `STUDENT` role, and route guards (`requireAuth`, `requireRole`).
- **Unified Store (`server/engine/store.ts` + `extraSeedData.ts`)**: JSON-persisted state (`data/niyamsetu-state.json`, `CURRENT_SEED_VERSION = 5`) containing **16 schemes** (`PM-01` through `SPR-16`), 21+ notifications/documents with page-level text, 80+ structured rules, rule links, procedure steps, required documents, deadlines, alerts, review queue, monitored sources, and audit log.
- **Deterministic Rules Engine (`server/engine/rulesEngine.ts`)**:
  - `evaluateAllSchemesEligibility`: Deterministic threshold checks across all 16 active schemes.
  - `runWhatIfSimulation`: Baseline (`v1`) vs Amendment (`v2`) side-by-side outcome comparison.
  - `runFormSathiReadinessCheck`: Document checklist + income/marks threshold + cross-document name consistency check.
  - `reviewRuleDecision` & `applyImpactReportItem`: Human approval workflow + Policy Ripple propagation to procedures, required docs, deadlines, and alerts.
  - `buildAllSchemesPredefinedAnalysis`: Cross-references user profile & memorized Vault documents across all 16 schemes.
- **Gemini AI Service (`server/engine/aiService.ts`)**: Server-side `@google/genai` integration (`gemini-4-hydrogen` with automatic transient-demand fallback to `gemini-3.1-flash-lite`) powering RuleWeaver clause extraction, bilingual EN/Telugu JanSetu Q&A and Multi-turn Chat, Search Grounding, Maps Grounding, FormSathi document field extraction, Grievance/RTI drafting, Audio Transcription (`gemini-3.5-transcribe`), and All-16-Scheme task planning.

### B. Firebase & Optional Supabase Modules
- **Google Firebase (`src/lib/firebase.ts`, `firebase-blueprint.json`, `firestore.rules`)**: Provisioned Firestore database + Google Auth popup + hardened owner-isolated Firestore rules (`users`, `user_documents`, `saved_bookmarks`, `readiness_checks`, `schemes_catalog`, `admins`).
- **Supabase Scaffolding (`supabase/migrations/001_niyamsetu_schema.sql`, `server/engine/supabasePlugin.ts`, `src/lib/supabase.ts`)**: Relational PostgreSQL schema, FTS search helper, `match_schemes_for_citizen` RPC wrapper, Storage upload helper, and Realtime subscription hook (activated only when Supabase env credentials are configured; live DB migrations are NOT executed without explicit user approval).

### C. Frontend Workspace (`src/pages/*`, `src/components/*`)
- **Authentication & Spatial UI (`LoginPage.tsx`, `AuthHero3DScene.tsx`, `AuthModal.tsx`)**: Clean bilingual EN/Telugu login with Student/Citizen vs Government Policy Officer role cards, Google Sign-In, email/password login, registration, and 3D Three.js hero visualization.
- **Citizen Modules**:
  - `StudentHome.tsx` (Citizen Dashboard with 16-scheme evaluation, New Gov Plans section, AI Deep Plan trigger, alerts, bookmarks).
  - `ProfileVaultPage.tsx` (19-field Personal Dossier + Memorized Document Vault with file extraction & CRUD).
  - `SchemesHubPage.tsx` (`EligibilityFinderPage`, `WhatIfSimulatorPage`, `ProceduresPage` with 2 visual process flow diagrams and non-checklist step-by-step document blocks).
  - `ReadinessHubPage.tsx` (`FormSathiPage`, `DeadlinesAlertsPage`).
  - `JanSetuPage.tsx` (Q&A, Multi-turn Chatbot, Google Search Grounding, `LiveVoiceAdvisor`, `GrievanceRtiPage`).
  - `HelpCentersMapPage.tsx` (`@vis.gl/react-google-maps`, Places API New, Gemini Maps Grounding).
- **Government Modules**:
  - `AdminDashboard.tsx`, `GovernanceLifecycleHubPage.tsx` (`RuleWeaverPage`, `HumanReviewQueuePage`, `PolicyRipplePage` with 3D dependency graph), `AuditTransparencyPage.tsx`.
  - `DeveloperDashboard.tsx` (currently separated under `DEVELOPER` / `PLATFORM_ADMIN` group in `AppShell.tsx`).

---

## 2. Gaps, Overlaps & Missing Capabilities vs Target Product Vision

| Target Vision Requirement | Current State in Workspace | Identified Gap / Action Required |
|---|---|---|
| **Two Strictly Separated Portals** (Citizen Portal vs Government Portal) | `AppShell.tsx` mixes 4 nav groups (`public`, `citizen`, `governance`, `developer`) and `LandingOverview.tsx` embeds officer links. | Separate cleanly into **Citizen Portal** and **Government Portal**. Fold Developer/System schema & DB status cleanly into Government **Administration & Security**; block non-admin access strictly. |
| **Citizen Dashboard** (State/District context, New Schemes with opening/deadline/source, New vs Revised rules, Real Application Overview) | `StudentHome.tsx` has 16-scheme plans & New Plans, but lacks real Application Draft/Submitted tracking cards, State/District live switcher, opening/closing dates & official sources on New Schemes, and clear New vs Revised Rule distinction. | Add persistent Application Records (`applications` state + `/api/applications`), State/District context selector, New vs Revised Rule feed, and strict "real records only" overview. |
| **Schemes & Rules Explorer** (Full filters, Old-vs-New comparison, Official Source viewer, Full Scheme Detail View + `"Check My Eligibility & Apply"`) | `SchemesHubPage` groups Eligibility, What-If, and Procedures, but lacks multi-facet filters (State, District, Department, Beneficiary Category, Application Status, Deadline), Rules & Notifications browser, and a dedicated **Scheme Detail View** with official portal URL, contact info, opening/closing dates, and last verified date. | Enrich `SchemeRecord` metadata across all 16 schemes, add multi-facet Explorer filters + Rules/Notifications tab + full Scheme Detail Drawer/View + `"Check My Eligibility & Apply"` handoff into Application Assistant. |
| **Application Assistant (FormSathi AI)** (7-stage scheme-specific workflow, dynamic field collection, file validation, AI form mapping, guided portal handoff, Draft vs Confirmed tracking) | `FormSathiPage` performs readiness check against sample doc checkboxes + file extraction, but lacks scheme-specific 8-question procedure breakdown, dynamic required-info form (without sensitive passwords/OTPs/PINs), size/type/expiry validation, AI Form Mapping preview, Guided Portal workflow, and persistent Draft vs Confirmed Application records. | Upgrade `FormSathiPage` into the full 7-stage **Application Assistant** backed by `/api/applications` and `/api/formsathi/map-form`. |
| **Document Guide & Document Intelligence** (Mandatory vs Additional vs Optional vs N/A, what/why/where/validity/formats/alternatives, preliminary expiry/missing warnings) | Split between `ProfileVaultPage` and `ProceduresPage` sidebars without issuing-department validity periods, accepted formats/sizes, official alternatives, or document expiry warnings. | Add a dedicated **Document Guide & Intelligence** view integrated cleanly alongside the **Document Vault** (`ProfileVaultPage`) with per-scheme doc taxonomy, alternatives, and expiry/completeness alerts. |
| **Services, Deadlines & Nearby Help** (Deadlines + Renewal reminders + Google Maps verified vs listing distinction + Comparison/Tracking/FAQ without duplicates) | `DeadlinesAlertsPage` sits in `ReadinessHubPage`, while `HelpCentersMapPage` stands alone. Missing scheme comparison matrix, application status tracker, document renewal reminders, FAQ, and explicit verified-center vs Maps-listing distinction. | Consolidate into a clean **Services, Deadlines & Nearby Help** module (keeping `HelpCentersMapPage` intact and compliant with Google Maps ToS) and remove duplicate navigation items. |
| **Accessible JanSetu AI Chatbot** across Citizen Portal | `JanSetuPage` exists as a dedicated route, not accessible from any Citizen screen as a quick drawer. | Add a clean floating/header **JanSetu AI Assistant Drawer** across the Citizen Portal synced with `JanSetuPage`, strictly labeling Verified Circular Rules vs General AI Guidance vs Unconfirmed items. |
| **Government Portal Completeness** (Official Source CRUD/outdated checks, Human Review correction requests, Real App & Service Monitoring, Admin & Security panel) | Missing Official Source Add/Edit/Outdated controls, explicit "Request Corrections" reviewer state, real Application Draft/Volume monitoring, and User/Role/Department/AI/DB Admin UI. | Extend `RuleWeaverPage`, `HumanReviewQueuePage`, `AuditTransparencyPage`, and `AdminDashboard` with Official Source Management, Correction Request workflow, Application & Service Monitoring, and Administration & Security (incorporating schema/DB health). |

---

## 3. Non-Destructive Reconciliation & Execution Plan
- **Database Safety**: All backend enhancements extend the active Express + JSON store (`server/engine/store.ts`) with additive optional fields (`applications`, enriched `SchemeRecord` metadata, `document_guides`, `review_corrections`). Live database migrations (`supabase/migrations/*`) are **not executed** without explicit user approval.
- **Preservation Guarantee**: Existing 16 schemes, 3D WebGL components, Gemini AI integrations, Google Maps Places/Grounding, Firebase Auth/Firestore sync, and bilingual EN/Telugu UI remain intact and functional throughout every phase.

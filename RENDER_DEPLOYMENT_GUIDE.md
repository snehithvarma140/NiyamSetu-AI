# NiyamSetu AI — Render Backend Deployment Guide

This guide covers deploying the **Node.js (>=22.18.0) + Express 4 + WebSocket (`/live`)** backend of NiyamSetu AI on **Render** (`render.yaml` is already included at repository root).

---

## 1. Render Service Configuration

You can deploy via **Render Blueprint** (`render.yaml`) or create a **Web Service** manually from your GitHub repository:

- **Environment / Runtime:** `Node` (`>=22.18.0` via `package.json` `engines.node`)
- **Region:** Closest to your Indian user base & Supabase region (e.g., `Singapore`)
- **Build Command:** `npm install`
- **Start Command:** `npm start` (executes `node server.ts` using Node 22 native TypeScript stripping; no `tsx` dev server needed in prod)
- **Health Check Path:** `/api/health`

> **Why `npm start` runs `node server.ts` directly:** Node.js `>=22.18.0` executes TypeScript syntax directly in production, and when `dist/index.html` is absent on a backend-only Render service, `server.ts` exposes the REST `/api/*` API, `/live` WebSocket server, and a clean JSON status response on `GET /`.

---

## 2. Database & Persistent Storage Strategy (Critical for Render)

Render's default container filesystem is **ephemeral** — any files written to `./data/niyamsetu-state.json` on the default disk are wiped on redeploy or instance restart. NiyamSetu AI supports two production persistence options (which also work together):

### Option A (Recommended): Supabase PostgreSQL (`app_state_snapshots` + Relational Sync)
1. In **Supabase Dashboard → SQL Editor**, execute the migrations in order:
   1. `supabase/migrations/001_niyamsetu_schema.sql`
   2. `supabase/migrations/002_niyamsetu_production_persistence.sql`
2. Migration `002` aligns the `user_profiles.role` constraint (`STUDENT`, `ORGANIZATION`, `ADMIN`, `PLATFORM_ADMIN`, `DEVELOPER`) and creates RLS-locked `public.app_state_snapshots` so full application state survives Render restarts and redeploys.
3. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in Render.

### Option B: Render Persistent Disk
1. Attach a Render Disk mounted at `/var/data` (available on paid Render plans).
2. Set `NIYAMSETU_DATA_DIR=/var/data` in Render environment variables.
3. `server/engine/store.ts` automatically stores `niyamsetu-state.json` and uploaded files inside `/var/data`.

---

## 3. Required Render Environment Variables

Add these under **Render Service → Environment**:

| Variable | Example / Generation | Required | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | **Yes** | Enables production error sanitization, `trust proxy`, and CORS enforcement. |
| `SESSION_SECRET` | Random 32+ char hex/base64 string | **Yes** | Signs HMAC session tokens cleanly across restarts (`openssl rand -hex 32`). |
| `ENABLE_DEMO_AUTH` | `false` | **Yes** | Blocks `/api/auth/demo-signin` (`403`) and `/api/demo/reset` (`403`) in production. |
| `GEMINI_API_KEY` | `<your-google-gemini-api-key>` | **Yes** | Enables JanSetu Q&A, FormSathi extraction, Maps Grounding, Voice `/live`, TTS/STT. |
| `CORS_ALLOWED_ORIGINS` | `https://<your-vercel-domain>.vercel.app` | **Yes** | Comma-separated allowed frontend origins for HTTP CORS & WebSocket `/live`. |
| `FRONTEND_URL` | `https://<your-vercel-domain>.vercel.app` | Recommended | Included in CORS allowlist and callback metadata. |
| `APP_URL` | `https://<your-render-service>.onrender.com` | Recommended | Render service public URL. |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Recommended | Required for Supabase PostgreSQL persistence across restarts. |
| `SUPABASE_ANON_KEY` | `<supabase-anon-key>` | Recommended | Supabase project anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | `<supabase-service-role-key>` | Recommended | **Private backend key only.** Enables snapshot & relational table sync. |
| `NIYAMSETU_DATA_DIR` | `/var/data` | Optional | Required only if using a Render Persistent Disk. |
| `FIREBASE_WEB_API_KEY` | `<firebase-web-api-key>` | Optional | Overrides `firebase-applet-config.json` in `/api/auth/google-sync`. |
| `PLATFORM_ADMIN_EMAILS` | `admin@example.com` | Optional | Comma-separated verified emails granted `PLATFORM_ADMIN` on Google login. |
| `GOOGLE_MAPS_API_KEY` | `<your-maps-key>` | Optional | Fallback served by `GET /api/maps/config` if Vercel lacks `VITE_GOOGLE_MAPS_API_KEY`. |
| `CORS_ALLOW_VERCEL_PREVIEWS` | `false` | Optional | Keep `false` unless you intentionally deploy Vercel preview PR branches. |

---

## 4. Operational Notes & Free-Tier Caveats
- **WebSockets (`/live`):** Supported natively on Render HTTPS (`wss://<service>.onrender.com/live`). Note that Render enforces `verifyClient` origin checks against `CORS_ALLOWED_ORIGINS`.
- **Cold Starts (Render Free Tier):** Free instances spin down after 15 minutes of inactivity and take ~30–50 seconds to wake up on the first request. Use a Starter+ plan for zero-downtime citizen responsiveness.
- **Health Verification:** Check `https://<your-render-service>.onrender.com/api/health` after deploy. Verify:
  - `"status": "ok"`
  - `"demo_auth_enabled": false`
  - `"session_secret_configured": true`
  - `"gemini_configured": true`
  - `"persistence_mode"` matches `"supabase+local-disk"` or `"local-disk"` with a persistent path.

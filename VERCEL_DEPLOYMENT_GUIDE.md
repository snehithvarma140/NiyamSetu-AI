# NiyamSetu AI — Vercel Frontend Deployment Guide

This guide covers deploying the **React 19 + Vite 8 + TypeScript** frontend of NiyamSetu AI on **Vercel** while connecting securely to the **Render** Express + WebSocket backend.

---

## 1. Repository & Project Settings in Vercel

1. Push the repository to GitHub (excluding `.env`, `node_modules/`, `dist/`, and local `data/`).
2. In **Vercel Dashboard → Add New → Project**, import the GitHub repository.
3. Configure the build settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `.` (repository root)
   - **Install Command:** `npm install`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Node.js Version:** `22.x` (matches `"engines": { "node": ">=22.18.0" }` in `package.json`)

The included `vercel.json` handles client-side SPA routing (`/(.*) -> /index.html`) and sets security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

---

## 2. Required Vercel Environment Variables

Add these under **Vercel Project → Settings → Environment Variables** (Production & Preview):

| Variable | Value / Example | Required | Notes |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com` | **Yes** | No trailing slash. Routes all `apiRequest()` calls to Render. |
| `VITE_ENABLE_DEMO_AUTH` | `false` | **Yes** | Hides one-click Demo Role cards and Reset Demo UI in production. |
| `VITE_GOOGLE_MAPS_API_KEY` | `<your-browser-restricted-maps-key>` | **Yes (for Maps)** | Enables Help Centers Map & Places API (New). |
| `VITE_WS_BASE_URL` | `wss://<your-render-service>.onrender.com` | Optional | Automatically derived from `VITE_API_BASE_URL` if omitted. |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Optional | Enables frontend Supabase Realtime subscriptions (`postgres_changes`). |
| `VITE_SUPABASE_ANON_KEY` | `<supabase-anon-public-key>` | Optional | Public anon key only. **Never put `SUPABASE_SERVICE_ROLE_KEY` in Vercel.** |
| `VITE_FIREBASE_API_KEY` | `<firebase-web-api-key>` | Optional | Overrides `firebase-applet-config.json` if rotating Firebase projects. |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` | Optional | Override if needed. |
| `VITE_FIREBASE_PROJECT_ID` | `<firebase-project-id>` | Optional | Override if needed. |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<firebase-storage-bucket>` | Optional | Override if needed. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `<sender-id>` | Optional | Override if needed. |
| `VITE_FIREBASE_APP_ID` | `<firebase-app-id>` | Optional | Override if needed. |
| `VITE_FIREBASE_DATABASE_ID` | `<firestore-db-id>` | Optional | Override if needed. |

> **Important:** After changing any `VITE_*` variable in Vercel, trigger a fresh **Redeploy** because Vite inlines `import.meta.env.VITE_*` values at build time.

---

## 3. Domain Authorization Checklists (External Consoles)

### A. Google Cloud Console — Google Maps Platform
In **Google Cloud Console → Google Maps Platform → APIs & Services → Credentials → [Your Browser Maps Key]**:
1. **Enabled APIs & Billing:** Verify **Maps JavaScript API** and **Places API (New)** are enabled and an active billing account is attached.
2. **Application Restrictions → Websites (HTTP referrers):** Add:
   - `https://<your-vercel-domain>.vercel.app/*`
   - `https://<your-custom-domain>/*` (if using a custom domain)
   - Keep `https://*.googleusercontent.com/*` or your AI Studio preview origins if you still test in preview.
3. **API Restrictions:** Restrict key to `Maps JavaScript API` and `Places API (New)` (plus `Geocoding API` if enabled).

### B. Firebase Console — Authentication Authorized Domains
In **Firebase Console → Authentication → Settings → Authorized domains**:
- Add `<your-vercel-domain>.vercel.app`
- Add `<your-custom-domain>` (if applicable)
Without this step, "Continue with Google" will fail with `auth/unauthorized-domain`.

### C. Render Backend CORS Sync
Copy your exact Vercel HTTPS origin (`https://<your-vercel-domain>.vercel.app`, no trailing slash) into Render's `CORS_ALLOWED_ORIGINS` and `FRONTEND_URL` environment variables so both REST (`fetch`) and Live Voice WebSocket (`/live`) accept requests from Vercel.

---

## 4. Verification After Deploy
1. Open `https://<your-vercel-domain>.vercel.app` and confirm `Role Access` demo cards are **not** shown.
2. Open browser DevTools → Network and confirm API requests target `https://<your-render-service>.onrender.com/api/...` with `200` status and zero CORS errors.
3. Visit **Citizen Help Centers & Service Map** (`HelpCentersMapPage`), verify the interactive Google Map renders, and click **Use My Location** (HTTPS required).
4. Test **Live Voice Advisor** (`LiveVoiceAdvisor`), confirm `wss://<your-render-service>.onrender.com/live` upgrades cleanly or falls back to Ask & Listen TTS.

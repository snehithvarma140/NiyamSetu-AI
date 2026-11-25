# NiyamSetu AI — Production Environment Variables Matrix

This reference separates **Frontend (Vercel)** public environment variables from **Backend (Render)** private secrets.

> **Security Rule:** Anything prefixed with `VITE_` is embedded into compiled browser JavaScript by Vite and is **publicly readable** by anyone inspecting the website bundle. **Never** put `GEMINI_API_KEY`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or private credentials into any `VITE_` variable.

---

## 1. Backend Environment Variables (Render — Private)

| Variable | Sensitivity | Required | Where to Obtain / Generate | Used By |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Public | **Yes** | Set to `production` | `server.ts`, `server/auth.ts`, `server/routes/api.ts` |
| `PORT` | Public | Auto (Render) | Provided by Render (fallback `3000`) | `server.ts` |
| `SESSION_SECRET` | **Critical Secret** | **Yes** | Generate via `openssl rand -hex 32` | `server/auth.ts` (HMAC SHA-256 session tokens) |
| `ENABLE_DEMO_AUTH` | Config | **Yes** | Set to `false` in production | `server/routes/api.ts` (disables demo sign-in/reset) |
| `GEMINI_API_KEY` | **Secret** | **Yes** | Google AI Studio / GCP Gemini API | `server/engine/aiService.ts`, `server.ts` (`/live` WS) |
| `CORS_ALLOWED_ORIGINS` | Public | **Yes** | Your exact Vercel URL (`https://...vercel.app`) | `server.ts` (HTTP CORS + WS origin verification) |
| `FRONTEND_URL` | Public | Recommended | Primary Vercel frontend URL | `server.ts` |
| `APP_URL` | Public | Recommended | Primary Render backend URL | `server.ts` |
| `CORS_ALLOW_VERCEL_PREVIEWS` | Config | Optional | Set `false` (or `true` for PR preview URLs) | `server.ts` |
| `SUPABASE_URL` | Config | Recommended | Supabase Project → Settings → API | `server/engine/supabasePlugin.ts` |
| `SUPABASE_ANON_KEY` | Public Key | Optional | Supabase Project → Settings → API | `server/engine/supabasePlugin.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Critical Secret** | Recommended | Supabase Project → Settings → API (`service_role`) | `server/engine/supabasePlugin.ts` (bypasses RLS server-side) |
| `NIYAMSETU_DATA_DIR` | Config | Optional | Render Persistent Disk mount path (`/var/data`) | `server/engine/store.ts` |
| `FIREBASE_WEB_API_KEY` | Public Key | Optional | Firebase Project Settings (overrides `firebase-applet-config.json`) | `server/routes/api.ts` (`/api/auth/google-sync`) |
| `PLATFORM_ADMIN_EMAILS` | Config | Optional | Comma-separated verified admin emails | `server/routes/api.ts` |
| `GOOGLE_MAPS_API_KEY` | Restricted Key | Optional | Google Cloud Console → Credentials | `server/routes/api.ts` (`/api/maps/config`) |

---

## 2. Frontend Environment Variables (Vercel — Public `VITE_*`)

| Variable | Sensitivity | Required | Where to Obtain / Set | Used By |
| --- | --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Public | **Yes** | Your Render backend URL (`https://...onrender.com`, no trailing `/`) | `src/services/api.ts` |
| `VITE_ENABLE_DEMO_AUTH` | Public | **Yes** | Set to `false` in production | `src/services/api.ts`, `LoginPage.tsx`, `AuthModal.tsx`, `AppShell.tsx` |
| `VITE_GOOGLE_MAPS_API_KEY` | HTTP-Referrer Restricted | **Yes (Maps)** | Google Cloud Console (restricted to Vercel domain) | `src/pages/student/HelpCentersMapPage.tsx` |
| `VITE_WS_BASE_URL` | Public | Optional | `wss://<render-service>.onrender.com` (auto-derived if unset) | `src/services/api.ts`, `LiveVoiceAdvisor.tsx` |
| `VITE_SUPABASE_URL` | Public | Optional | Supabase Project → Settings → API | `src/lib/supabase.ts` |
| `VITE_SUPABASE_ANON_KEY` | Public Anon Key | Optional | Supabase Project → Settings → API (`anon public`) | `src/lib/supabase.ts` |
| `VITE_FIREBASE_API_KEY` | Public Config | Optional | Firebase Web App config (falls back to `firebase-applet-config.json`) | `src/lib/firebase.ts` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Public Config | Optional | Firebase Web App config | `src/lib/firebase.ts` |
| `VITE_FIREBASE_PROJECT_ID` | Public Config | Optional | Firebase Web App config | `src/lib/firebase.ts` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Public Config | Optional | Firebase Web App config | `src/lib/firebase.ts` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Public Config | Optional | Firebase Web App config | `src/lib/firebase.ts` |
| `VITE_FIREBASE_APP_ID` | Public Config | Optional | Firebase Web App config | `src/lib/firebase.ts` |
| `VITE_FIREBASE_DATABASE_ID` | Public Config | Optional | Firestore database ID | `src/lib/firebase.ts` |

---

## 3. Critical Secret Hygiene Checklist
- Verify `.gitignore` excludes `.env`, `.env.local`, `.env.production`, `data/*.json`, and `dist/`.
- Rotate `SESSION_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` immediately if they were ever shared outside Render.
- Keep **Maps JavaScript API** & **Places API (New)** key restricted by **HTTP Referrer** to your Vercel domain(s) and AI Studio preview domain(s).

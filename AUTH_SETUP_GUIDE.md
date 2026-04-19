# AURA — Auth + Database Setup Guide

## What Was Built
A **production-grade** auth + activity tracking system on top of your existing AURA codebase.

---

## 🗄️ Step 1 — Run the SQL Migration (IMPORTANT — Do This First)

1. Open **Supabase Dashboard** → https://supabase.com/dashboard
2. Select your AURA project
3. Go to **SQL Editor** → click **New Query**
4. Open the file:
   ```
   frontend/supabase/migrations/20260420000000_activity_and_admin.sql
   ```
5. Paste the full SQL contents into the editor
6. Click **Run** ✅

This creates/updates:
- `user_profiles` — extended with `role`, `aqi_threshold`, `last_seen_at`
- `user_activity_logs` — all user events (batched, RLS-protected)
- `user_sessions` — session tracking
- `admin_activity_summary` — view for admin dashboard
- Updated trigger: auto-creates profiles on signup

---

## 👑 Step 2 — Make Yourself an Admin

After running the migration, run this in the SQL Editor:

```sql
UPDATE public.user_profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com');
```

Replace `YOUR_EMAIL@example.com` with your real email. Then visit `/admin`.

---

## 🔐 Step 3 — Enable OAuth Providers (Google / GitHub)

In Supabase Dashboard:
1. Go to **Authentication** → **Providers**
2. Enable **Google**:
   - Get credentials from https://console.cloud.google.com
   - Add `https://your-project.supabase.co/auth/v1/callback` as redirect URI
3. Enable **GitHub**:
   - Create OAuth App at https://github.com/settings/applications/new
   - Callback URL: `https://your-project.supabase.co/auth/v1/callback`

---

## 📧 Step 4 — Configure Email Auth (Already Working)

In Supabase Dashboard → **Authentication** → **Settings**:
- **Site URL**: `http://localhost:3000` (for local) or your production URL
- **Redirect URLs**: `http://localhost:3000/dashboard`
- **Email Confirmations**: Turn OFF for development (faster testing), ON for production

---

## 🏃 Step 5 — Run the App

```bash
cd "AQI FINAL"
bash "🚀 START AURA (Mac).command"
```

Or manually:
```bash
cd "AQI FINAL/frontend"
npm run dev

# In a separate terminal:
cd "AQI FINAL/backend"
./venv/bin/python predict.py
```

---

## 📱 How the System Works

### Authentication Flow
```
User visits /auth
    ↓
Sign In / Sign Up / Google / GitHub
    ↓
Supabase Auth creates session (JWT)
    ↓
Session stored in localStorage (persists across refreshes)
    ↓
App.tsx AuthProvider detects session → loads user profile from user_profiles
    ↓
User → /dashboard (or /registration for new users)
```

### Activity Tracking Flow
```
User action (login / page visit / button click)
    ↓
useActivityTracker hook / activityLogger.log()
    ↓
Event queued in memory (batch of 5 or 2 second timer)
    ↓
Batch INSERT into user_activity_logs (Supabase)
    ↓
Trigger: updates user_profiles.last_seen_at
    ↓
Admin sees events in /admin dashboard
```

### Security (Row Level Security)
| Table | User Access | Admin Access |
|---|---|---|
| `user_profiles` | Own row only | Own row only (use SQL for admin) |
| `user_activity_logs` | Own rows only (read + insert) | All rows |
| `user_sessions` | Own rows only | All rows |

---

## 📁 New Files Created
```
frontend/src/
  lib/
    supabase.ts          ← Enhanced with persistent sessions + TypeScript types
    activityLogger.ts    ← Singleton fire-and-forget event logger (batched)
  hooks/
    useActivityTracker.ts ← React hook: auto page-visit + trackEvent()
  pages/
    Auth.tsx             ← Full auth: OAuth, forgot password, strength meter
    Admin.tsx            ← Admin dashboard: user list + activity feed
    Settings.tsx         ← Fully wired: saves to Supabase
  store/
    authStore.ts         ← Fixed isAdminMock default + profile loading
  App.tsx                ← Page tracking + AdminRoute + profile loading

supabase/migrations/
  20260420000000_activity_and_admin.sql  ← Complete schema upgrade
```

---

## 🧪 Test Checklist

| Feature | How to Test |
|---|---|
| Sign up | Go to /auth → Sign up with new email |
| Sign in | /auth → Use credentials |
| Persistent session | Sign in → Close tab → Reopen → Still logged in |
| Forgot password | /auth → "Forgot password?" → Enter email |
| Google OAuth | /auth → "Continue with Google" (after enabling in Supabase) |
| Admin mock | Email: admin@aura.ai / Password: AuraAdmin2024 |
| Activity tracking | Sign in → Visit pages → Check Supabase `user_activity_logs` table |
| Admin dashboard | /admin (as admin) → See user list + activity feed |
| Settings save | /settings → Change name/city → Click Save |
| Logout | /settings → Sign Out → Redirected to /auth |

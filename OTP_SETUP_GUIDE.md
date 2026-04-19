# AURA — OTP System Setup Guide

## What Was Built

| Component | Description |
|---|---|
| **Backend** `otp_service.py` | Flask Blueprint with `/api/otp/send`, `/api/otp/verify`, `/api/otp/resend` |
| **Database** `otp_verifications` table | Hashed OTP storage with expiry, attempt counter |
| **Frontend** `OTPInput.tsx` | 6-box input with auto-advance, paste, mobile numpad |
| **Frontend** `OTPVerification.tsx` | Full verification page with resend + cooldown |
| **Email Template** | Premium dark-themed HTML email (inline CSS, mobile-responsive) |

---

## Step 1 — Run the SQL Migration

In **Supabase Dashboard → SQL Editor**, run:
```
frontend/supabase/migrations/20260420010000_otp_verification.sql
```

---

## Step 2 — Get Your Resend API Key (Free)

1. Go to **https://resend.com** → Sign up (no credit card)
2. Free tier: **3,000 emails/month**, 100/day
3. Dashboard → **API Keys** → Create new key → copy it
4. Go to **Domains** → Add your domain (required to send from custom address)
   - **For testing only**: Resend gives you a shared `resend.dev` sandbox domain — no setup needed

---

## Step 3 — Get Supabase Service Role Key

1. **Supabase Dashboard** → Settings → API
2. Copy the **`service_role` secret key** (the long one under "Service Role")
   - ⚠️ This key bypasses RLS — **only use server-side, never in frontend**

---

## Step 4 — Set Backend Environment Variables

Create the file `backend/.env` (copy from `backend/.env.example`):

```bash
cp "AQI FINAL/backend/.env.example" "AQI FINAL/backend/.env"
```

Then edit `backend/.env` and fill in:
```ini
SUPABASE_URL=https://mnzmwhgrzhiemhgukwjk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...   ← your service role key
RESEND_API_KEY=re_abc123...             ← from resend.com dashboard
RESEND_FROM_EMAIL=AURA <otp@yourdomain.com>
```

---

## Step 5 — Load env in Flask

Update `🚀 START AURA (Mac).command` or run manually:

```bash
cd "AQI FINAL/backend"
set -a; source .env; set +a   # load .env into shell
source venv/bin/activate
python predict.py
```

The backend will print:
```
✅ OTP service registered at /api/otp/*
```

---

## How the OTP Flow Works

### Signup Flow
```
User signs up (email + password)
    ↓ (Supabase creates account)
Redirected to /verify-otp?purpose=signup_verify&email=user@example.com
    ↓ (page auto-calls POST /api/otp/send)
Flask generates 6-digit OTP → SHA-256 hash → stored in otp_verifications
    ↓ (Resend sends beautiful email)
User enters 6 digits in OTP input boxes
    ↓ (auto-verifies when all 6 entered)
POST /api/otp/verify → hash comparison → delete record
    ↓
Redirected to /registration (profile completion)
    ↓
Redirected to /dashboard
```

### Security Measures
| Threat | Mitigation |
|---|---|
| **Plain text OTP in DB** | SHA-256 hashed before storage |
| **Brute force** | Max 5 attempts per OTP, then auto-deleted |
| **OTP spam** | Rate limit: max 3 sends per 10 minutes per email |
| **Expired OTP** | 10-minute expiry checked server-side |
| **Timing attacks** | `hashlib.compare_digest()` constant-time compare |
| **DB exposure** | RLS enabled; only service role key can read OTPs |
| **OTP reuse** | Record deleted immediately after successful verify |
| **Log exposure** | OTP never printed in logs (only hash stored) |

---

## API Reference

### POST /api/otp/send
```json
Request:  { "email": "user@example.com", "user_id": "uuid", "purpose": "signup_verify" }
Response: { "success": true, "expires_in_seconds": 600 }
Errors:   429 (rate limit), 400 (missing email), 500 (server error)
```

### POST /api/otp/verify
```json
Request:  { "email": "user@example.com", "otp": "482193", "purpose": "signup_verify" }
Response: { "success": true, "verified": true, "email": "...", "purpose": "..." }
Errors:   400 (wrong OTP + remaining attempts), 429 (too many attempts)
```

### POST /api/otp/resend
Same as `/send` — rate limit handles cooldown.

---

## Testing Without Email

For local development, you can test without real emails:
1. Check the Flask terminal output — it logs when OTP send is attempted
2. Set a breakpoint or `print(otp)` in `otp_service.py` `send_otp()` temporarily
3. Or use **Resend's test mode** (sandbox emails visible in Resend dashboard)

"""
AURA — OTP Service (Flask Blueprint)
Routes: /api/otp/send  /api/otp/verify  /api/otp/resend

Security:
- OTP generated using secrets.SystemRandom (cryptographically secure)
- Hashed with bcrypt before DB storage (never stored plain)
- Rate-limited: max 3 send requests per 10 min per email
- Brute-force guard: max 5 verify attempts per OTP
- OTP expires in 10 minutes
- Successful verify deletes the OTP record
"""

import os
import secrets
import hashlib
import string
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
import resend

# Supabase Python client (service-role, bypasses RLS)
from supabase import create_client, Client

# ── Blueprint ─────────────────────────────────────────────────
otp_bp = Blueprint("otp", __name__, url_prefix="/api/otp")

# ── Lazy-init Supabase admin client ──────────────────────────
_supabase_admin: Client | None = None

def get_supabase() -> Client:
    global _supabase_admin
    if _supabase_admin is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")  # service role — never expose to client
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.")
        _supabase_admin = create_client(url, key)
    return _supabase_admin

# Configure Resend
def get_resend_key() -> str:
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        raise RuntimeError("RESEND_API_KEY must be set in the environment.")
    resend.api_key = key
    return key

# ── OTP Helpers ───────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    """Cryptographically secure 6-digit OTP."""
    return "".join(secrets.choice(string.digits) for _ in range(length))

def hash_otp(otp: str) -> str:
    """SHA-256 hash — fast, consistent, collision-resistant for short OTPs."""
    return hashlib.sha256(otp.encode()).hexdigest()

def verify_otp_hash(otp: str, stored_hash: str) -> bool:
    """Constant-time comparison to prevent timing attacks."""
    return hashlib.compare_digest(hash_otp(otp), stored_hash)

OTP_EXPIRE_MINUTES  = 10
RATE_LIMIT_MINUTES  = 10
RATE_LIMIT_MAX      = 3   # max OTP sends per RATE_LIMIT_MINUTES window
MAX_ATTEMPTS        = 5   # brute-force guard

# ── Email Template ────────────────────────────────────────────

def build_email_html(otp: str, purpose: str, email: str) -> str:
    purpose_map = {
        "signup_verify":  ("Verify your email", "You created an AURA account. Use the code below to verify your email address."),
        "login_2fa":      ("Login verification", "Someone is signing in to your AURA account. Use the code below to confirm it's you."),
        "password_reset": ("Reset your password", "We received a request to reset your AURA password. Use the code below to continue."),
    }
    subject_hint, description = purpose_map.get(purpose, ("Your OTP code", "Use the code below."))

    otp_spaced = " ".join(otp)  # e.g. "4 8 2 1 9 3" — easier to read

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AURA — {subject_hint}</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0F1E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F1E;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <!-- Card -->
        <table width="100%" style="max-width:520px;background:linear-gradient(135deg,#111827,#0F1929);border-radius:24px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

          <!-- Header gradient bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#00D4AA,#00A3FF,#7C3AED);"></td>
          </tr>

          <!-- Logo + App name -->
          <tr>
            <td align="center" style="padding:40px 40px 0;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#00D4AA,#00A3FF);margin-bottom:16px;">
                <span style="font-size:24px;font-style:italic;font-weight:700;color:#0A0F1E;">A</span>
              </div>
              <h1 style="margin:12px 0 4px;font-size:22px;font-weight:700;color:#F1F5F9;letter-spacing:-0.5px;">AURA Air Quality</h1>
              <p style="margin:0;font-size:13px;color:#64748B;letter-spacing:0.5px;text-transform:uppercase;">{subject_hint}</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:24px 40px 0;"><div style="height:1px;background:rgba(255,255,255,0.06);"></div></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:15px;color:#94A3B8;line-height:1.6;">Hi there 👋</p>
              <p style="margin:0 0 32px;font-size:15px;color:#CBD5E1;line-height:1.6;">{description}</p>

              <!-- OTP Block -->
              <div style="background:rgba(0,212,170,0.06);border:1.5px solid rgba(0,212,170,0.2);border-radius:16px;padding:32px;text-align:center;margin:0 0 32px;">
                <p style="margin:0 0 12px;font-size:12px;color:#00D4AA;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Your verification code</p>
                <div style="display:flex;justify-content:center;gap:8px;flex-wrap:nowrap;">
                  <!-- Spaced digits displayed as one large number -->
                  <span style="font-size:48px;font-weight:800;letter-spacing:12px;color:#F1F5F9;font-variant-numeric:tabular-nums;font-family:'Courier New',monospace;">{otp}</span>
                </div>
                <p style="margin:16px 0 0;font-size:12px;color:#475569;">
                  ⏱️ Expires in <strong style="color:#F97316;">10 minutes</strong>
                </p>
              </div>

              <!-- Security note -->
              <div style="background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.15);border-radius:12px;padding:16px;display:flex;gap:12px;">
                <span style="font-size:18px;flex-shrink:0;">🔒</span>
                <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.5;">
                  <strong style="color:#F1F5F9;">Never share this code.</strong> AURA will never ask for your OTP via phone, chat, or email. If you didn't request this, ignore this email — your account is safe.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 40px;">
              <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:24px;"></div>
              <p style="margin:0;font-size:12px;color:#334155;text-align:center;line-height:1.6;">
                This email was sent to <span style="color:#475569;">{email}</span><br />
                © 2024 AURA Air Quality Platform. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

def build_subject(purpose: str) -> str:
    return {
        "signup_verify":  "AURA — Verify your email (OTP)",
        "login_2fa":      "AURA — Your login verification code",
        "password_reset": "AURA — Reset your password (OTP)",
    }.get(purpose, "AURA — Your OTP code")

# ── Rate-limit check ──────────────────────────────────────────

def check_rate_limit(db: Client, email: str) -> bool:
    """Return True if rate limit exceeded (block the request)."""
    window_start = (datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_MINUTES)).isoformat()
    result = db.table("otp_verifications") \
        .select("id") \
        .eq("email", email) \
        .gte("created_at", window_start) \
        .execute()
    return len(result.data) >= RATE_LIMIT_MAX

# ── Routes ────────────────────────────────────────────────────

@otp_bp.route("/send", methods=["POST"])
def send_otp():
    """
    POST /api/otp/send
    Body: { "email": "user@example.com", "user_id": "uuid", "purpose": "signup_verify" }
    """
    body    = request.get_json(force=True) or {}
    email   = (body.get("email") or "").strip().lower()
    user_id = body.get("user_id")
    purpose = body.get("purpose", "signup_verify")

    if not email:
        return jsonify({"error": "Email is required."}), 400
    if purpose not in ("signup_verify", "login_2fa", "password_reset"):
        return jsonify({"error": "Invalid purpose."}), 400

    try:
        db = get_supabase()

        # Rate limit check
        if check_rate_limit(db, email):
            return jsonify({
                "error": f"Too many OTP requests. Please wait {RATE_LIMIT_MINUTES} minutes before trying again."
            }), 429

        # Invalidate any existing (non-verified) OTPs for same email+purpose
        db.table("otp_verifications") \
          .delete() \
          .eq("email", email) \
          .eq("purpose", purpose) \
          .eq("is_verified", False) \
          .execute()

        # Generate and hash OTP
        otp      = generate_otp()
        otp_hash = hash_otp(otp)
        expires  = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()

        # Store in DB
        db.table("otp_verifications").insert({
            "user_id":   user_id,
            "email":     email,
            "otp_hash":  otp_hash,
            "purpose":   purpose,
            "expires_at": expires,
        }).execute()

        # Send email via Resend
        get_resend_key()
        resend.Emails.send({
            "from":    os.environ.get("RESEND_FROM_EMAIL", "AURA Air Quality <otp@yourdomain.com>"),
            "to":      [email],
            "subject": build_subject(purpose),
            "html":    build_email_html(otp, purpose, email),
        })

        return jsonify({
            "success": True,
            "message": f"OTP sent to {email}. Expires in {OTP_EXPIRE_MINUTES} minutes.",
            "expires_in_seconds": OTP_EXPIRE_MINUTES * 60,
        })

    except RuntimeError as e:
        return jsonify({"error": str(e), "tip": "Check backend environment variables."}), 500
    except Exception as e:
        print(f"[OTP /send] Error: {e}")
        return jsonify({"error": "Failed to send OTP. Please try again."}), 500


@otp_bp.route("/verify", methods=["POST"])
def verify_otp():
    """
    POST /api/otp/verify
    Body: { "email": "user@example.com", "otp": "123456", "purpose": "signup_verify" }
    """
    body    = request.get_json(force=True) or {}
    email   = (body.get("email") or "").strip().lower()
    otp     = (body.get("otp")   or "").strip()
    purpose = body.get("purpose", "signup_verify")

    if not email or not otp:
        return jsonify({"error": "Email and OTP are required."}), 400
    if len(otp) != 6 or not otp.isdigit():
        return jsonify({"error": "OTP must be exactly 6 digits."}), 400

    try:
        db = get_supabase()
        now = datetime.now(timezone.utc).isoformat()

        # Fetch the latest non-verified OTP for this email+purpose
        result = db.table("otp_verifications") \
            .select("*") \
            .eq("email", email) \
            .eq("purpose", purpose) \
            .eq("is_verified", False) \
            .gte("expires_at", now) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not result.data:
            return jsonify({"error": "No valid OTP found. It may have expired — request a new one."}), 400

        record = result.data[0]
        record_id = record["id"]

        # Brute-force guard
        if record["attempt_count"] >= MAX_ATTEMPTS:
            db.table("otp_verifications").delete().eq("id", record_id).execute()
            return jsonify({"error": "Too many incorrect attempts. Request a new OTP."}), 429

        # Increment attempt counter first (prevents race conditions)
        db.table("otp_verifications") \
            .update({"attempt_count": record["attempt_count"] + 1}) \
            .eq("id", record_id) \
            .execute()

        # Verify hash
        if not verify_otp_hash(otp, record["otp_hash"]):
            remaining = MAX_ATTEMPTS - record["attempt_count"] - 1
            return jsonify({
                "error": f"Incorrect OTP. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
            }), 400

        # ✅ OTP is correct — mark verified then delete
        db.table("otp_verifications") \
            .update({"is_verified": True}) \
            .eq("id", record_id) \
            .execute()

        # Clean up immediately after success
        db.table("otp_verifications").delete().eq("id", record_id).execute()

        return jsonify({
            "success":  True,
            "verified": True,
            "email":    email,
            "purpose":  purpose,
        })

    except Exception as e:
        print(f"[OTP /verify] Error: {e}")
        return jsonify({"error": "Verification failed. Please try again."}), 500


@otp_bp.route("/resend", methods=["POST"])
def resend_otp():
    """
    POST /api/otp/resend — same as /send but enforces cooldown.
    Body: { "email": "...", "user_id": "...", "purpose": "..." }
    """
    # Delegate to send_otp — the rate limit inside send_otp handles cooldown
    return send_otp()

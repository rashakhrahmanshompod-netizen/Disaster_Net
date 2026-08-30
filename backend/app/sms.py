"""
Twilio SMS Service Module for DisasterNet.

Reads Twilio credentials from environment variables or .env file:
  - TWILIO_ACCOUNT_SID
  - TWILIO_AUTH_TOKEN
  - TWILIO_PHONE_NUMBER

When credentials are absent the module operates in *fallback mode* — every
SMS is logged to the console instead of being dispatched, so the rest of the
application never crashes due to missing Twilio configuration.
"""

import os
import random
import string
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

try:
    from dotenv import load_dotenv
    # Load .env from backend directory or project root
    env_path_backend = Path(__file__).resolve().parents[1] / ".env"
    env_path_root = Path(__file__).resolve().parents[2] / ".env"
    if env_path_backend.exists():
        load_dotenv(dotenv_path=env_path_backend)
    elif env_path_root.exists():
        load_dotenv(dotenv_path=env_path_root)
    else:
        load_dotenv()
except Exception:
    pass

logger = logging.getLogger("disasternet.sms")


def normalize_phone_number(phone: str) -> str:
    """Normalize phone numbers into standard E.164 format for SMS dispatch.

    Examples:
      '01712345678' -> '+8801712345678'
      '8801712345678' -> '+8801712345678'
      '+8801712345678' -> '+8801712345678'
      '+1234567890' -> '+1234567890'
    """
    if not phone:
        return ""
    cleaned = "".join(ch for ch in str(phone).strip() if ch.isdigit() or ch == "+")
    if not cleaned:
        return ""
    if cleaned.startswith("+"):
        return cleaned
    if cleaned.startswith("01") and len(cleaned) == 11:
        return f"+88{cleaned}"
    if cleaned.startswith("8801") and len(cleaned) == 13:
        return f"+{cleaned}"
    return f"+{cleaned}"


def get_twilio_credentials():
    sid = os.getenv("TWILIO_ACCOUNT_SID") or ""
    token = os.getenv("TWILIO_AUTH_TOKEN") or ""
    from_num = os.getenv("TWILIO_PHONE_NUMBER") or ""
    return sid.strip(), token.strip(), from_num.strip()


def is_configured() -> bool:
    """Return True when Twilio credentials are present and valid."""
    sid, token, from_num = get_twilio_credentials()
    return bool(sid and token and from_num)


# ---------------------------------------------------------------------------
# Core SMS dispatch
# ---------------------------------------------------------------------------
def send_sms(to: str, body: str) -> dict:
    """Send a single SMS message via Twilio with automatic fallback to console logging."""
    if not to or not body:
        return {"status": "skipped", "reason": "empty recipient or body"}

    normalized_to = normalize_phone_number(to)
    sid, token, from_number = get_twilio_credentials()

    if sid and token and from_number:
        try:
            from twilio.rest import Client  # type: ignore
            client = Client(sid, token)
            message = client.messages.create(
                body=body,
                from_=from_number,
                to=normalized_to,
            )
            logger.info("SMS successfully sent to %s — Twilio SID: %s", normalized_to, message.sid)
            print(f"\n[Twilio SMS SENT] To: {normalized_to} | SID: {message.sid} | Body: {body}\n")
            return {
                "status": "sent",
                "sid": message.sid,
                "to": normalized_to,
            }
        except Exception as exc:
            logger.error("Twilio send failed for %s: %s", normalized_to, exc)
            print(f"\n[Twilio SMS ERROR] To: {normalized_to} | Error: {exc}\n")
            return {"status": "error", "to": normalized_to, "error": str(exc)}
    else:
        # Fallback: log to console
        logger.info("[SMS FALLBACK] To: %s | Message: %s", normalized_to, body[:200])
        print(f"\n{'='*60}")
        print(f"  [DISASTERNET SMS NOTIFICATION - CONSOLE FALLBACK]")
        print(f"  To:      {normalized_to}")
        print(f"  Message: {body}")
        print(f"  Time:    {datetime.utcnow().isoformat()} UTC")
        print(f"  Note:    Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to send real SMS.")
        print(f"{'='*60}\n")
        return {
            "status": "logged",
            "to": normalized_to,
            "note": "Twilio not configured — message logged to console",
        }


def send_bulk_sms(recipients: List[str], body: str) -> List[dict]:
    """Send the same SMS body to multiple phone numbers."""
    results = []
    seen = set()
    for phone in recipients:
        if phone:
            normalized = normalize_phone_number(phone)
            if normalized and normalized not in seen:
                seen.add(normalized)
                results.append(send_sms(normalized, body))
    return results


# ---------------------------------------------------------------------------
# OTP helpers
# ---------------------------------------------------------------------------
def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP of the given length."""
    return "".join(random.choices(string.digits, k=length))


def send_otp_sms(to: str) -> dict:
    """Generate and send an OTP code via SMS."""
    normalized_to = normalize_phone_number(to)
    otp = generate_otp()
    body = (
        f"Your DisasterNet verification code is: {otp}\n"
        f"This code expires in 5 minutes. Do not share it with anyone."
    )
    result = send_sms(normalized_to, body)
    result["otp"] = otp
    result["expires_at"] = (datetime.utcnow() + timedelta(minutes=5)).isoformat()
    return result

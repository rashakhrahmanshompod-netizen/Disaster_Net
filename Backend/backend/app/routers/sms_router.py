"""
SMS Router — OTP verification, configuration status, and test endpoints.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db
from app.sms import is_configured, send_otp_sms, send_sms, normalize_phone_number

router = APIRouter(prefix="/api/sms", tags=["SMS (Twilio)"])


# ---------------------------------------------------------------------------
# Configuration status
# ---------------------------------------------------------------------------
@router.get("/config")
def sms_configuration_status():
    """Check whether Twilio SMS credentials are configured."""
    configured = is_configured()
    return {
        "configured": configured,
        "provider": "Twilio",
        "note": (
            "SMS is active and will be delivered via Twilio SMS API."
            if configured
            else "Twilio credentials not set in .env — SMS notifications are logged to the backend console."
        ),
    }


# ---------------------------------------------------------------------------
# OTP via SMS
# ---------------------------------------------------------------------------
@router.post("/send-otp")
def send_sms_otp(
    payload: schemas.SMSOTPSend,
    db: Session = Depends(get_db),
):
    """Send a 6-digit OTP to the provided phone number via SMS."""
    raw_phone = payload.phone.strip()
    if not raw_phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    phone = normalize_phone_number(raw_phone)

    # Remove any existing OTP for this phone first
    db.query(models.SMSOTPStore).filter(
        (models.SMSOTPStore.phone == phone) | (models.SMSOTPStore.phone == raw_phone)
    ).delete()
    db.commit()

    result = send_otp_sms(phone)
    otp_code = result.get("otp")

    # Store the OTP in the database
    otp_record = models.SMSOTPStore(
        phone=phone,
        otp=otp_code,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=5),
    )
    db.add(otp_record)
    db.commit()

    response = {
        "message": f"Verification OTP sent to {phone}",
        "phone": phone,
        "sms_status": result.get("status"),
        "expires_in_seconds": 300,
        "twilio_configured": is_configured(),
    }
    # If in demo/fallback mode without real Twilio credentials, provide the demo OTP for easy testing
    if not is_configured():
        response["demo_otp"] = otp_code
        response["note"] = "Twilio credentials not set: OTP code logged to backend console"

    return response


@router.post("/verify-otp")
def verify_sms_otp(
    payload: schemas.SMSOTPVerify,
    db: Session = Depends(get_db),
):
    """Verify an OTP code sent via SMS."""
    raw_phone = payload.phone.strip()
    otp = payload.otp.strip()

    if not raw_phone or not otp:
        raise HTTPException(status_code=400, detail="Phone number and OTP code are required")

    phone = normalize_phone_number(raw_phone)

    record = (
        db.query(models.SMSOTPStore)
        .filter(
            (models.SMSOTPStore.phone == phone) | (models.SMSOTPStore.phone == raw_phone),
            models.SMSOTPStore.otp == otp,
        )
        .first()
    )

    if not record:
        raise HTTPException(status_code=400, detail="Invalid verification OTP code")

    if record.expires_at < datetime.utcnow():
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new code.")

    # OTP verified — clean up
    db.delete(record)
    db.commit()

    return {
        "verified": True,
        "phone": phone,
        "message": f"Phone number {phone} verified successfully!",
    }


# ---------------------------------------------------------------------------
# Admin test endpoint
# ---------------------------------------------------------------------------
@router.post("/send-test")
def send_test_sms(
    payload: schemas.SMSTestSend,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test SMS (admin/government only)."""
    if current_user.role not in {"admin", "government"}:
        raise HTTPException(
            status_code=403, detail="Only admin or government users can send test SMS"
        )

    result = send_sms(payload.phone.strip(), payload.message.strip())
    return {
        "message": "Test SMS dispatched",
        "result": result,
    }

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_government
from app.sms import send_bulk_sms

router = APIRouter(prefix="/api/disasters", tags=["Module 1: Disaster Management"])


def _broadcast_sms_to_all_users(db: Session, message: str) -> None:
    """Send an SMS notification to every registered user who has a phone number."""
    users = db.query(models.User).filter(models.User.phone.isnot(None), models.User.phone != "").all()
    phones = [u.phone for u in users if u.phone]
    if phones:
        send_bulk_sms(phones, message)

# --- Disaster Events ---
@router.get("/", response_model=List[schemas.DisasterResponse])
def get_all_disasters(db: Session = Depends(get_db)):
    """Public/Authenticated endpoint to view all disaster events."""
    return db.query(models.DisasterEvent).order_by(models.DisasterEvent.created_at.desc()).all()


@router.post("/declare", response_model=schemas.DisasterResponse)
def declare_disaster_event(
    disaster_in: schemas.DisasterCreate,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db)
):
    """Government authorities declare a new disaster event."""
    new_disaster = models.DisasterEvent(
        title=disaster_in.title,
        disaster_type=disaster_in.disaster_type,
        severity=disaster_in.severity,
        affected_districts=disaster_in.affected_districts,
        expected_duration=disaster_in.expected_duration,
        lat=disaster_in.lat,
        lng=disaster_in.lng,
        declared_by=current_user.full_name,
        status="Active"
    )
    db.add(new_disaster)

    # A declared disaster is also an official emergency notice. Persist the
    # notice in the same transaction so the Emergency Alerts feed and top
    # broadcast banner are backed by the database, not temporary UI state.
    severity_to_alert_level = {
        "Low": "Information",
        "Medium": "Warning",
        "High": "Severe",
        "Critical": "Evacuation",
    }
    declaration_alert = models.EmergencyAlert(
        title=disaster_in.title,
        message=(
            f"{disaster_in.disaster_type} disaster declared for "
            f"{disaster_in.affected_districts}. Severity: {disaster_in.severity}. "
            f"Expected duration: {disaster_in.expected_duration}."
        ),
        alert_level=severity_to_alert_level.get(disaster_in.severity, "Warning"),
        affected_area=disaster_in.affected_districts,
        published_by=current_user.full_name,
    )
    db.add(declaration_alert)

    db.commit()
    db.refresh(new_disaster)

    # --- SMS: Broadcast disaster declaration to all registered users ---
    sms_body = (
        f"[DisasterNet ALERT] {disaster_in.disaster_type} disaster declared: "
        f"{disaster_in.title}. Affected: {disaster_in.affected_districts}. "
        f"Severity: {disaster_in.severity}. Duration: {disaster_in.expected_duration}."
    )
    _broadcast_sms_to_all_users(db, sms_body)

    return new_disaster


@router.patch("/{disaster_id}/status")
def update_disaster_status(
    disaster_id: int,
    status_val: str,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db)
):
    """Update disaster lifecycle status (Active -> Contained -> Resolved)."""
    allowed_statuses = {"Active", "Contained", "Resolved"}
    if status_val not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(allowed_statuses))}"
        )

    disaster = db.query(models.DisasterEvent).filter(models.DisasterEvent.id == disaster_id).first()
    if not disaster:
        raise HTTPException(status_code=404, detail="Disaster event not found")

    disaster.status = status_val
    db.commit()
    return {"message": f"Disaster status updated to {status_val}"}


# --- Emergency Alerts ---
@router.get("/alerts", response_model=List[schemas.EmergencyAlertResponse])
def get_emergency_alerts(db: Session = Depends(get_db)):
    """Fetch active emergency alerts and evacuation notices."""
    return db.query(models.EmergencyAlert).order_by(models.EmergencyAlert.created_at.desc()).all()


@router.post("/alerts", response_model=schemas.EmergencyAlertResponse)
def publish_emergency_alert(
    alert_in: schemas.EmergencyAlertCreate,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db)
):
    """Government authority publishes emergency alert / evacuation notice."""
    new_alert = models.EmergencyAlert(
        title=alert_in.title,
        message=alert_in.message,
        alert_level=alert_in.alert_level,
        affected_area=alert_in.affected_area,
        published_by=current_user.full_name
    )
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)

    # --- SMS: Broadcast emergency alert to all registered users ---
    sms_body = (
        f"[DisasterNet {alert_in.alert_level.upper()}] {alert_in.title}: "
        f"{alert_in.message} | Area: {alert_in.affected_area}"
    )
    _broadcast_sms_to_all_users(db, sms_body)

    return new_alert

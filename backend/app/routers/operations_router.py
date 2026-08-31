import os
import uuid
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import qrcode
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import (
    get_current_user,
    require_beneficiary,
    require_donor,
    require_government,
    require_organization,
    require_volunteer,
)
from app.database import get_db
from app.bkash import BkashAPIError, BkashConfigurationError, bkash_client, sanitize_bkash_response
from app.sms import send_sms, send_bulk_sms

router = APIRouter(tags=["Volunteer, Campaign & Public Service Operations"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MISSION_STATUSES = {"Assigned", "Accepted", "In Progress", "Completed", "Unable to Complete"}
COMPLAINT_STATUSES = {"Submitted", "Under Review", "Resolved", "Rejected"}
ASSISTANCE_STATUSES = {"Pending", "Approved", "In Progress", "Fulfilled", "Rejected"}
SOS_STATUSES = {"Active", "Responding", "Resolved"}


def _ensure_bkash_credentials(user: models.User, db: Session):
    """Lazily generate per-user bKash simulation OTP/PIN for users created before the columns existed."""
    changed = False
    if not user.bkash_sim_otp:
        user.bkash_sim_otp = models._random_otp()
        changed = True
    if not user.bkash_sim_pin:
        user.bkash_sim_pin = models._random_pin()
        changed = True
    if changed:
        db.commit()
        db.refresh(user)


def _safe_file_name(file_name: str, prefix: str) -> str:
    suffix = Path(file_name or "upload.bin").suffix.lower()[:10]
    return f"{prefix}_{uuid.uuid4().hex}{suffix}"


def _get_or_create_volunteer_profile(db: Session, user: models.User):
    profile = db.query(models.VolunteerProfile).filter(models.VolunteerProfile.user_id == user.id).first()
    if not profile:
        profile = models.VolunteerProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _volunteer_payload(profile: models.VolunteerProfile, db: Session):
    user = db.query(models.User).filter(models.User.id == profile.user_id).first()
    data = schemas.VolunteerProfileResponse.model_validate(profile).model_dump()
    data.update({
        "full_name": user.full_name if user else None,
        "email": user.email if user else None,
        "phone": user.phone if user else None,
    })
    return data


def _get_or_create_beneficiary_profile(db: Session, user: models.User):
    profile = db.query(models.BeneficiaryProfile).filter(models.BeneficiaryProfile.user_id == user.id).first()
    if not profile:
        qr_code = f"BEN-{user.id:06d}-{uuid.uuid4().hex[:10].upper()}"
        profile = models.BeneficiaryProfile(user_id=user.id, qr_code=qr_code)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _get_or_create_organization_verification(db: Session, user: models.User):
    verification = db.query(models.OrganizationVerification).filter(
        models.OrganizationVerification.organization_user_id == user.id
    ).first()
    if not verification:
        verification = models.OrganizationVerification(organization_user_id=user.id)
        db.add(verification)
        db.commit()
        db.refresh(verification)
    return verification


def _organization_verification_payload(verification: models.OrganizationVerification, user: models.User):
    return {
        "id": verification.id,
        "organization_user_id": user.id,
        "organization_name": user.organization_name,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "verification_status": verification.verification_status,
        "verified_by": verification.verified_by,
        "reviewed_at": verification.reviewed_at,
        "created_at": verification.created_at,
    }


def _ensure_verified_organization(user: models.User, db: Session):
    if user.role == "admin":
        return
    verification = _get_or_create_organization_verification(db, user)
    if verification.verification_status != "Verified":
        raise HTTPException(
            status_code=403,
            detail="Government verification is required before this NGO can perform this operation",
        )


def _require_org_or_government(user: models.User = Depends(get_current_user)):
    if user.role not in {"organization", "government", "admin"}:
        raise HTTPException(status_code=403, detail="Organization or government privileges required")
    return user


# ---------------------------------------------------------------------------
# Volunteer profile, verification and assignments
# ---------------------------------------------------------------------------
@router.get("/api/volunteers/profile", response_model=schemas.VolunteerProfileResponse)
def get_volunteer_profile(
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    return _volunteer_payload(_get_or_create_volunteer_profile(db, current_user), db)
 

@router.put("/api/volunteers/profile", response_model=schemas.VolunteerProfileResponse)
def update_volunteer_profile(
    profile_in: schemas.VolunteerProfileUpdate,
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    profile = _get_or_create_volunteer_profile(db, current_user)
    previous_nid = profile.nid_number
    for key, value in profile_in.model_dump().items():
        setattr(profile, key, value)
    # Changing the identity number after verification requires a fresh review.
    if profile.verification_status == "Verified" and profile_in.nid_number != previous_nid:
        profile.verification_status = "Pending"
        profile.verified_by = None
    db.commit()
    db.refresh(profile)
    return _volunteer_payload(profile, db)


@router.post("/api/volunteers/identity", response_model=schemas.VolunteerProfileResponse)
async def upload_volunteer_identity(
    identity_file: UploadFile = File(...),
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg", "image/png", "application/pdf"}
    if identity_file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Identity file must be JPG, PNG or PDF")
    content = await identity_file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Identity file must be 5 MB or smaller")

    profile = _get_or_create_volunteer_profile(db, current_user)
    name = _safe_file_name(identity_file.filename, f"identity_{current_user.id}")
    (UPLOAD_DIR / name).write_bytes(content)
    profile.identity_document = name
    profile.verification_status = "Pending"
    profile.verified_by = None
    db.commit()
    db.refresh(profile)
    return _volunteer_payload(profile, db)


@router.get("/api/field-files/{file_name}")
def get_uploaded_field_file(
    file_name: str,
    current_user: models.User = Depends(get_current_user),
):
    # Filename is generated by the server; basename prevents path traversal.
    safe_name = os.path.basename(file_name)
    path = UPLOAD_DIR / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Uploaded file not found")
    return FileResponse(path)


@router.get("/api/organization/verification", response_model=schemas.OrganizationVerificationResponse)
def get_organization_verification_status(
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    verification = _get_or_create_organization_verification(db, current_user)
    return _organization_verification_payload(verification, current_user)


@router.get("/api/organization/volunteers")
def list_volunteers_for_organization(
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    _ensure_verified_organization(current_user, db)
    profiles = db.query(models.VolunteerProfile).filter(
        models.VolunteerProfile.verification_status == "Verified"
    ).order_by(models.VolunteerProfile.updated_at.desc()).all()
    return [_volunteer_payload(profile, db) for profile in profiles]


@router.get("/api/government/volunteers", response_model=list[schemas.VolunteerProfileResponse])
def list_volunteers_for_government(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    # Start from registered volunteer accounts so every new/legacy volunteer
    # is visible to the government authority.  Older databases may contain
    # volunteer users created before VolunteerProfile was introduced.
    volunteers = db.query(models.User).filter(
        models.User.role == "volunteer"
    ).order_by(models.User.created_at.desc()).all()

    result = []
    for volunteer in volunteers:
        profile = _get_or_create_volunteer_profile(db, volunteer)
        result.append(_volunteer_payload(profile, db))
    return result


@router.patch("/api/government/volunteers/{volunteer_user_id}/verify", response_model=schemas.VolunteerProfileResponse)
def verify_volunteer_by_government(
    volunteer_user_id: int,
    approved: bool = True,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    profile = db.query(models.VolunteerProfile).filter(models.VolunteerProfile.user_id == volunteer_user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Volunteer profile not found")
    if approved and not profile.identity_document:
        raise HTTPException(status_code=400, detail="Identity verification document has not been uploaded")
    profile.verification_status = "Verified" if approved else "Rejected"
    profile.verified_by = current_user.full_name
    db.commit()
    db.refresh(profile)
    return _volunteer_payload(profile, db)


@router.get("/api/government/organizations", response_model=list[schemas.OrganizationVerificationResponse])
def list_organizations_for_government(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    organizations = db.query(models.User).filter(models.User.role == "organization").order_by(models.User.created_at.desc()).all()
    result = []
    for organization in organizations:
        verification = _get_or_create_organization_verification(db, organization)
        result.append(_organization_verification_payload(verification, organization))
    return result


@router.get("/api/government/verification-queue")
def get_government_verification_queue(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    """Return every registered volunteer and NGO for government review.

    This endpoint intentionally returns a plain payload rather than relying on
    separate response-model validation, so older project databases are also
    handled safely after SQLAlchemy creates any missing verification rows.
    """
    volunteer_users = db.query(models.User).filter(
        models.User.role == "volunteer"
    ).order_by(models.User.created_at.desc()).all()
    organization_users = db.query(models.User).filter(
        models.User.role == "organization"
    ).order_by(models.User.created_at.desc()).all()

    volunteers = []
    for volunteer in volunteer_users:
        profile = _get_or_create_volunteer_profile(db, volunteer)
        volunteers.append(_volunteer_payload(profile, db))

    organizations = []
    for organization in organization_users:
        verification = _get_or_create_organization_verification(db, organization)
        organizations.append(_organization_verification_payload(verification, organization))

    return {"volunteers": volunteers, "organizations": organizations}


@router.patch("/api/government/organizations/{organization_user_id}/verify", response_model=schemas.OrganizationVerificationResponse)
def verify_organization_by_government(
    organization_user_id: int,
    approved: bool = True,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    organization = db.query(models.User).filter(
        models.User.id == organization_user_id,
        models.User.role == "organization",
    ).first()
    if not organization:
        raise HTTPException(status_code=404, detail="NGO account not found")
    verification = _get_or_create_organization_verification(db, organization)
    verification.verification_status = "Verified" if approved else "Rejected"
    verification.verified_by = current_user.full_name
    verification.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(verification)
    return _organization_verification_payload(verification, organization)


@router.post("/api/organization/missions", response_model=schemas.MissionResponse)
def assign_volunteer_mission(
    mission_in: schemas.MissionCreate,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    _ensure_verified_organization(current_user, db)
    volunteer = db.query(models.User).filter(
        models.User.id == mission_in.assigned_volunteer_id,
        models.User.role == "volunteer",
    ).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer account not found")
    profile = db.query(models.VolunteerProfile).filter(models.VolunteerProfile.user_id == volunteer.id).first()
    if not profile or profile.verification_status != "Verified":
        raise HTTPException(status_code=400, detail="Only verified volunteers can receive missions")
    if profile.availability.lower() != "available":
        raise HTTPException(status_code=400, detail="Selected volunteer is not currently available")

    mission = models.VolunteerMission(
        **mission_in.model_dump(),
        assigned_by_user_id=current_user.id,
        assigned_by_name=current_user.organization_name or current_user.full_name,
        status="Assigned",
    )
    db.add(mission)
    db.commit()
    db.refresh(mission)

    # --- SMS: Notify the assigned volunteer ---
    if volunteer.phone:
        sms_body = (
            f"[DisasterNet MISSION] You have been assigned a new mission: "
            f"{mission_in.title}. Location: {mission_in.location}. "
            f"Type: {mission_in.mission_type}. "
            f"Assigned by: {current_user.organization_name or current_user.full_name}. "
            f"Log in to accept."
        )
        send_sms(volunteer.phone, sms_body)

    return mission


@router.get("/api/organization/missions", response_model=list[schemas.MissionResponse])
def list_organization_missions(
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    return db.query(models.VolunteerMission).filter(
        models.VolunteerMission.assigned_by_user_id == current_user.id
    ).order_by(models.VolunteerMission.created_at.desc()).all()


@router.get("/api/volunteers/missions", response_model=list[schemas.MissionResponse])
def list_my_missions(
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    return db.query(models.VolunteerMission).filter(
        models.VolunteerMission.assigned_volunteer_id == current_user.id
    ).order_by(models.VolunteerMission.created_at.desc()).all()


@router.post("/api/volunteers/missions/{mission_id}/accept", response_model=schemas.MissionResponse)
def accept_mission(
    mission_id: int,
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    mission = db.query(models.VolunteerMission).filter(
        models.VolunteerMission.id == mission_id,
        models.VolunteerMission.assigned_volunteer_id == current_user.id,
    ).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Assigned mission not found")
    if mission.status != "Assigned":
        raise HTTPException(status_code=400, detail="Only newly assigned missions can be accepted")
    mission.status = "Accepted"
    mission.accepted_at = datetime.utcnow()
    db.commit()
    db.refresh(mission)
    return mission


@router.patch("/api/volunteers/missions/{mission_id}/status", response_model=schemas.MissionResponse)
def update_mission_status(
    mission_id: int,
    update: schemas.MissionStatusUpdate,
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    if update.status not in MISSION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid mission status")
    mission = db.query(models.VolunteerMission).filter(
        models.VolunteerMission.id == mission_id,
        models.VolunteerMission.assigned_volunteer_id == current_user.id,
    ).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Assigned mission not found")
    if mission.status == "Assigned" and update.status != "Accepted":
        raise HTTPException(status_code=400, detail="Accept the mission before changing its progress")
    mission.status = update.status
    if update.status == "Accepted" and not mission.accepted_at:
        mission.accepted_at = datetime.utcnow()
    if update.status == "Completed":
        mission.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(mission)
    return mission


@router.post("/api/volunteers/reports", response_model=schemas.FieldReportResponse)
async def submit_field_report(
    summary: str = Form(...),
    report_type: str = Form("Field"),
    mission_id: Optional[int] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    rescued_people: int = Form(0),
    photo: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    if mission_id is not None:
        mission = db.query(models.VolunteerMission).filter(
            models.VolunteerMission.id == mission_id,
            models.VolunteerMission.assigned_volunteer_id == current_user.id,
        ).first()
        if not mission:
            raise HTTPException(status_code=404, detail="Mission not found for this volunteer")
    photo_name = None
    if photo and photo.filename:
        if photo.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(status_code=400, detail="Report photo must be JPG, PNG or WEBP")
        content = await photo.read()
        if len(content) > 8 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Report photo must be 8 MB or smaller")
        photo_name = _safe_file_name(photo.filename, f"report_{current_user.id}")
        (UPLOAD_DIR / photo_name).write_bytes(content)

    report = models.FieldReport(
        volunteer_user_id=current_user.id,
        mission_id=mission_id,
        report_type=report_type,
        latitude=latitude,
        longitude=longitude,
        photo_file=photo_name,
        summary=summary,
        rescued_people=max(0, rescued_people),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/api/volunteers/reports", response_model=list[schemas.FieldReportResponse])
def list_my_reports(
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    return db.query(models.FieldReport).filter(
        models.FieldReport.volunteer_user_id == current_user.id
    ).order_by(models.FieldReport.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Citizen / beneficiary assistance and QR distribution
# ---------------------------------------------------------------------------
@router.get("/api/beneficiary/profile", response_model=schemas.BeneficiaryProfileResponse)
def get_beneficiary_profile(
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    return _get_or_create_beneficiary_profile(db, current_user)


@router.put("/api/beneficiary/profile", response_model=schemas.BeneficiaryProfileResponse)
def update_beneficiary_profile(
    profile_in: schemas.BeneficiaryProfileUpdate,
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    profile = _get_or_create_beneficiary_profile(db, current_user)
    for key, value in profile_in.model_dump().items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/api/public/qr/{qr_code}.png")
def beneficiary_qr_image(qr_code: str, db: Session = Depends(get_db)):
    profile = db.query(models.BeneficiaryProfile).filter(models.BeneficiaryProfile.qr_code == qr_code).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Beneficiary QR code not found")
    image = qrcode.make(qr_code)
    output = BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return StreamingResponse(output, media_type="image/png")


@router.post("/api/beneficiary/requests", response_model=schemas.AssistanceRequestResponse)
def create_assistance_request(
    request_in: schemas.AssistanceRequestCreate,
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    request = models.AssistanceRequest(
        beneficiary_user_id=current_user.id,
        **request_in.model_dump(),
        status="Pending",
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/api/beneficiary/requests", response_model=list[schemas.AssistanceRequestResponse])
def list_assistance_requests(
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    return db.query(models.AssistanceRequest).filter(
        models.AssistanceRequest.beneficiary_user_id == current_user.id
    ).order_by(models.AssistanceRequest.created_at.desc()).all()


@router.get("/api/operations/assistance-requests", response_model=list[schemas.AssistanceRequestResponse])
def list_all_assistance_requests(
    current_user: models.User = Depends(_require_org_or_government),
    db: Session = Depends(get_db),
):
    return db.query(models.AssistanceRequest).order_by(models.AssistanceRequest.created_at.desc()).all()


@router.patch("/api/operations/assistance-requests/{request_id}/status", response_model=schemas.AssistanceRequestResponse)
def update_assistance_request_status(
    request_id: int,
    status_value: str,
    current_user: models.User = Depends(_require_org_or_government),
    db: Session = Depends(get_db),
):
    if status_value not in ASSISTANCE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid assistance request status")
    request = db.query(models.AssistanceRequest).filter(models.AssistanceRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Assistance request not found")
    request.status = status_value
    db.commit()
    db.refresh(request)
    return request


@router.post("/api/beneficiary/sos", response_model=schemas.SOSResponse)
def submit_sos(
    sos_in: schemas.SOSCreate,
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    sos = models.SOSRequest(beneficiary_user_id=current_user.id, **sos_in.model_dump(), status="Active")
    db.add(sos)
    db.commit()
    db.refresh(sos)

    # --- SMS: Notify all government users about the SOS ---
    govt_users = db.query(models.User).filter(
        models.User.role == "government",
        models.User.phone.isnot(None),
        models.User.phone != "",
    ).all()
    if govt_users:
        sms_body = (
            f"[DisasterNet SOS] Emergency SOS from {current_user.full_name}: "
            f"{sos_in.message}. Location: {sos_in.location}."
        )
        send_bulk_sms([u.phone for u in govt_users], sms_body)

    return sos


@router.get("/api/beneficiary/sos", response_model=list[schemas.SOSResponse])
def list_my_sos(
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    return db.query(models.SOSRequest).filter(
        models.SOSRequest.beneficiary_user_id == current_user.id
    ).order_by(models.SOSRequest.created_at.desc()).all()


@router.get("/api/government/sos", response_model=list[schemas.SOSResponse])
def list_all_sos(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    return db.query(models.SOSRequest).order_by(models.SOSRequest.created_at.desc()).all()


@router.patch("/api/government/sos/{sos_id}/status", response_model=schemas.SOSResponse)
def update_sos_status(
    sos_id: int,
    status_value: str,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    if status_value not in SOS_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid SOS status")
    sos = db.query(models.SOSRequest).filter(models.SOSRequest.id == sos_id).first()
    if not sos:
        raise HTTPException(status_code=404, detail="SOS request not found")
    sos.status = status_value
    db.commit()
    db.refresh(sos)

    # --- SMS: Notify the beneficiary about SOS status change ---
    beneficiary = db.query(models.User).filter(models.User.id == sos.beneficiary_user_id).first()
    if beneficiary and beneficiary.phone:
        sms_body = (
            f"[DisasterNet SOS UPDATE] Your SOS request status has been updated "
            f"to: {status_value}. Stay safe. Contact authorities if you need "
            f"further assistance."
        )
        send_sms(beneficiary.phone, sms_body)

    return sos


@router.post("/api/volunteers/distributions", response_model=schemas.AidDistributionResponse)
def record_aid_distribution(
    distribution_in: schemas.AidDistributionCreate,
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    volunteer_profile = db.query(models.VolunteerProfile).filter(
        models.VolunteerProfile.user_id == current_user.id
    ).first()
    if not volunteer_profile or volunteer_profile.verification_status != "Verified":
        raise HTTPException(status_code=403, detail="Volunteer identity verification is required before recording aid")

    profile = db.query(models.BeneficiaryProfile).filter(
        models.BeneficiaryProfile.qr_code == distribution_in.beneficiary_qr.strip()
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Beneficiary QR code is invalid")

    if distribution_in.mission_id is not None:
        mission = db.query(models.VolunteerMission).filter(
            models.VolunteerMission.id == distribution_in.mission_id,
            models.VolunteerMission.assigned_volunteer_id == current_user.id,
        ).first()
        if not mission:
            raise HTTPException(status_code=404, detail="Mission is not assigned to this volunteer")

    duplicate_query = db.query(models.AidDistribution).filter(
        models.AidDistribution.beneficiary_user_id == profile.user_id,
        models.AidDistribution.aid_type == distribution_in.aid_type,
    )
    if distribution_in.mission_id is None:
        duplicate_query = duplicate_query.filter(models.AidDistribution.mission_id.is_(None))
    else:
        duplicate_query = duplicate_query.filter(models.AidDistribution.mission_id == distribution_in.mission_id)
    duplicate = duplicate_query.first()
    if duplicate:
        alert = models.FraudAlert(
            alert_type="Duplicate Beneficiary Distribution",
            severity="High",
            description=(
                f"Duplicate aid attempt blocked for beneficiary {profile.qr_code}, "
                f"aid type {distribution_in.aid_type}."
            ),
            related_reference=f"beneficiary:{profile.user_id}",
        )
        db.add(alert)
        db.commit()
        raise HTTPException(status_code=409, detail="Duplicate assistance blocked for this beneficiary and mission")

    distribution = models.AidDistribution(
        beneficiary_user_id=profile.user_id,
        volunteer_user_id=current_user.id,
        **distribution_in.model_dump(),
    )
    db.add(distribution)
    db.commit()
    db.refresh(distribution)
    return distribution


@router.get("/api/volunteers/distributions", response_model=list[schemas.AidDistributionResponse])
def list_volunteer_distributions(
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    return db.query(models.AidDistribution).filter(
        models.AidDistribution.volunteer_user_id == current_user.id
    ).order_by(models.AidDistribution.distributed_at.desc()).all()


@router.get("/api/beneficiary/distributions", response_model=list[schemas.AidDistributionResponse])
def list_beneficiary_distributions(
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    return db.query(models.AidDistribution).filter(
        models.AidDistribution.beneficiary_user_id == current_user.id
    ).order_by(models.AidDistribution.distributed_at.desc()).all()


@router.post("/api/beneficiary/distributions/{distribution_id}/confirm", response_model=schemas.AidDistributionResponse)
def confirm_received_assistance(
    distribution_id: int,
    current_user: models.User = Depends(require_beneficiary),
    db: Session = Depends(get_db),
):
    distribution = db.query(models.AidDistribution).filter(
        models.AidDistribution.id == distribution_id,
        models.AidDistribution.beneficiary_user_id == current_user.id,
    ).first()
    if not distribution:
        raise HTTPException(status_code=404, detail="Aid distribution not found")
    distribution.confirmed_by_beneficiary = 1
    distribution.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(distribution)
    return distribution


# ---------------------------------------------------------------------------
# Donor fund QR utilization by verified volunteers
# ---------------------------------------------------------------------------
def _donation_utilized_total(db: Session, donation_id: int) -> float:
    return float(db.query(func.coalesce(func.sum(models.DonationUtilization.amount), 0.0)).filter(
        models.DonationUtilization.donation_id == donation_id
    ).scalar() or 0.0)


def _available_donation_amount(db: Session, donation: models.Donation) -> float:
    refunded = _completed_refund_total(db, donation.id)
    utilized = _donation_utilized_total(db, donation.id)
    return max(0.0, float(donation.amount) - refunded - utilized)


@router.get("/api/public/donation-qr/{tracking_id}.png")
def donor_tracking_qr_image(tracking_id: str, db: Session = Depends(get_db)):
    donation = db.query(models.Donation).filter(models.Donation.tracking_id == tracking_id).first()
    if not donation or donation.payment_status not in {"Completed", "Partially Refunded"}:
        raise HTTPException(status_code=404, detail="Donation tracking ID not found")
    image = qrcode.make(donation.tracking_id)
    output = BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return StreamingResponse(output, media_type="image/png")


@router.get("/api/volunteers/donor-utilizations/preview/{tracking_id}")
def preview_donor_funds(
    tracking_id: str,
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    donation = db.query(models.Donation).filter(models.Donation.tracking_id == tracking_id.strip()).first()
    if not donation or donation.payment_status not in {"Completed", "Partially Refunded"}:
        raise HTTPException(status_code=404, detail="Valid completed donation QR / tracking ID not found")
    campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
    utilized = _donation_utilized_total(db, donation.id)
    refunded = _completed_refund_total(db, donation.id)
    return {
        "tracking_id": donation.tracking_id,
        "donor_name": donation.donor_name,
        "campaign_id": donation.campaign_id,
        "campaign_title": campaign.title if campaign else f"Campaign #{donation.campaign_id}",
        "original_amount": donation.amount,
        "refunded_amount": refunded,
        "utilized_amount": utilized,
        "available_amount": max(0.0, donation.amount - refunded - utilized),
    }


@router.post("/api/volunteers/donor-utilizations", response_model=schemas.DonationUtilizationResponse)
def record_donor_fund_utilization(
    utilization_in: schemas.DonationUtilizationCreate,
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    volunteer_profile = db.query(models.VolunteerProfile).filter(
        models.VolunteerProfile.user_id == current_user.id
    ).first()
    if not volunteer_profile or volunteer_profile.verification_status != "Verified":
        raise HTTPException(status_code=403, detail="Volunteer identity verification is required before recording distributions")

    donation = db.query(models.Donation).filter(
        models.Donation.tracking_id == utilization_in.donor_tracking_id.strip()
    ).first()
    if not donation or donation.payment_status not in {"Completed", "Partially Refunded"}:
        raise HTTPException(status_code=404, detail="Valid completed donation QR / tracking ID not found")

    campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Donation campaign not found")

    mission = None
    if utilization_in.mission_id is not None:
        mission = db.query(models.VolunteerMission).filter(
            models.VolunteerMission.id == utilization_in.mission_id,
            models.VolunteerMission.assigned_volunteer_id == current_user.id,
        ).first()
        if not mission:
            raise HTTPException(status_code=404, detail="Mission is not assigned to this volunteer")
        if mission.status == "Assigned":
            raise HTTPException(status_code=400, detail="Accept the mission before recording fund utilization")

    available = _available_donation_amount(db, donation)
    amount = float(utilization_in.amount)
    if amount > available + 0.005:
        db.add(models.FraudAlert(
            alert_type="Donation Over-Utilization Attempt",
            severity="High",
            description=(
                f"Volunteer {current_user.full_name} attempted to utilize BDT {amount:,.2f} "
                f"from donation {donation.tracking_id} with only BDT {available:,.2f} available."
            ),
            related_reference=donation.tracking_id,
        ))
        db.commit()
        raise HTTPException(status_code=409, detail=f"Only BDT {available:.2f} remains available from this donor QR")

    if campaign.utilized_amount + amount > campaign.collected_amount + 0.005:
        raise HTTPException(status_code=400, detail="Campaign utilization cannot exceed collected campaign funds")

    record = models.DonationUtilization(
        donation_id=donation.id,
        tracking_id=donation.tracking_id,
        donor_user_id=donation.donor_user_id,
        donor_name=donation.donor_name,
        volunteer_user_id=current_user.id,
        volunteer_name=current_user.full_name,
        campaign_id=campaign.id,
        campaign_title=campaign.title,
        mission_id=mission.id if mission else None,
        mission_title=mission.title if mission else None,
        amount=amount,
        notes=utilization_in.notes,
    )
    campaign.utilized_amount += amount
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/api/volunteers/donor-utilizations", response_model=list[schemas.DonationUtilizationResponse])
def list_donor_fund_utilizations(
    current_user: models.User = Depends(require_volunteer),
    db: Session = Depends(get_db),
):
    return db.query(models.DonationUtilization).filter(
        models.DonationUtilization.volunteer_user_id == current_user.id
    ).order_by(models.DonationUtilization.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Campaigns, bKash-style donations and transparency
# ---------------------------------------------------------------------------
@router.get("/api/public/campaigns", response_model=list[schemas.CampaignResponse])
def list_active_campaigns(db: Session = Depends(get_db)):
    return db.query(models.Campaign).filter(
        models.Campaign.status == "Active"
    ).order_by(models.Campaign.created_at.desc()).all()


@router.post("/api/organization/campaigns", response_model=schemas.CampaignResponse)
def create_campaign(
    campaign_in: schemas.CampaignCreate,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    _ensure_verified_organization(current_user, db)
    campaign = models.Campaign(
        organization_user_id=current_user.id,
        organization_name=current_user.organization_name or current_user.full_name,
        **campaign_in.model_dump(),
        status="Active",
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.get("/api/organization/campaigns", response_model=list[schemas.CampaignResponse])
def list_organization_campaigns(
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    return db.query(models.Campaign).filter(
        models.Campaign.organization_user_id == current_user.id
    ).order_by(models.Campaign.created_at.desc()).all()


@router.post("/api/organization/campaigns/{campaign_id}/allocations", response_model=schemas.CampaignAllocationResponse)
def allocate_campaign_funds(
    campaign_id: int,
    allocation_in: schemas.CampaignAllocationCreate,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db),
):
    _ensure_verified_organization(current_user, db)
    campaign = db.query(models.Campaign).filter(
        models.Campaign.id == campaign_id,
        models.Campaign.organization_user_id == current_user.id,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.utilized_amount + allocation_in.amount > campaign.collected_amount:
        raise HTTPException(status_code=400, detail="Allocation cannot exceed collected campaign funds")
    allocation = models.CampaignAllocation(campaign_id=campaign.id, **allocation_in.model_dump())
    campaign.utilized_amount += allocation_in.amount
    db.add(allocation)
    db.commit()
    db.refresh(allocation)
    return allocation


def _record_donation_fraud_alerts(db: Session, donation: models.Donation) -> None:
    if donation.amount >= 100000:
        db.add(models.FraudAlert(
            alert_type="Unusual Donation Amount",
            severity="Medium",
            description=f"Large donation of BDT {donation.amount:,.2f} requires review.",
            related_reference=donation.tracking_id,
        ))

    recent_count = db.query(models.Donation).filter(
        models.Donation.donor_user_id == donation.donor_user_id,
        models.Donation.created_at >= datetime.utcnow() - timedelta(minutes=10),
        models.Donation.payment_status.in_(["Completed", "Partially Refunded", "Refunded"]),
    ).count()
    if recent_count >= 4:
        db.add(models.FraudAlert(
            alert_type="Rapid Donation Pattern",
            severity="Medium",
            description=f"Multiple completed donations were submitted by donor account #{donation.donor_user_id} within 10 minutes.",
            related_reference=f"donor:{donation.donor_user_id}",
        ))


def _completed_refund_total(db: Session, donation_id: int) -> float:
    return float(db.query(func.coalesce(func.sum(models.BkashRefund.amount), 0.0)).filter(
        models.BkashRefund.donation_id == donation_id,
        models.BkashRefund.status == "Completed",
    ).scalar() or 0.0)


def _donation_history_payload(db: Session, donation: models.Donation):
    payment = db.query(models.BkashPayment).filter(models.BkashPayment.donation_id == donation.id).first()
    refunded_amount = _completed_refund_total(db, donation.id)
    utilized_amount = _donation_utilized_total(db, donation.id)
    net_amount = max(0.0, float(donation.amount) - refunded_amount)
    data = schemas.DonationResponse.model_validate(donation).model_dump()
    data.update({
        "bkash_payment_id": payment.payment_id if payment else None,
        "refunded_amount": refunded_amount,
        "net_amount": net_amount,
        "utilized_amount": utilized_amount,
        "available_amount": max(0.0, net_amount - utilized_amount),
    })
    return data


def _apply_completed_bkash_payment(
    db: Session,
    donation: models.Donation,
    payment: models.BkashPayment,
    response: dict,
) -> None:
    if response.get("transactionStatus") != "Completed":
        return
    trx_id = response.get("trxID") or response.get("trxId")
    if not trx_id:
        raise BkashAPIError("bKash confirmed the payment but did not return a transaction ID")

    first_completion = donation.bkash_transaction_id.startswith("PENDING-")
    if first_completion:
        campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        campaign.collected_amount += donation.amount
        _record_donation_fraud_alerts(db, donation)

    msisdn = response.get("customerMsisdn")
    if isinstance(msisdn, str) and len(msisdn) >= 7:
        donation.bkash_account_masked = f"{msisdn[:3]}****{msisdn[-4:]}"
    donation.bkash_transaction_id = trx_id
    donation.payment_status = "Completed"
    payment.transaction_status = "Completed"
    payment.status_code = response.get("statusCode")
    payment.status_message = response.get("statusMessage")
    payment.last_synced_at = datetime.utcnow()


def _sync_refunds(db: Session, donation: models.Donation, payment: models.BkashPayment) -> None:
    if payment.payment_id and payment.payment_id.startswith("SIM-PAY-"):
        return
    refunds = db.query(models.BkashRefund).filter(models.BkashRefund.donation_id == donation.id).all()
    if not refunds or not payment.payment_id or donation.bkash_transaction_id.startswith("PENDING-"):
        return
    try:
        status_data = bkash_client.refund_status(
            payment_id=payment.payment_id,
            trx_id=donation.bkash_transaction_id,
        )
    except (BkashAPIError, BkashConfigurationError):
        return

    by_trx = {
        item.get("refundTrxId"): item
        for item in status_data.get("refundTransactions", [])
        if item.get("refundTrxId")
    }
    campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
    for refund in refunds:
        item = by_trx.get(refund.refund_trx_id)
        if not item:
            continue
        old_status = refund.status
        refund.status = item.get("refundTransactionStatus") or refund.status
        refund.response_data = sanitize_bkash_response(item)
        if old_status != "Completed" and refund.status == "Completed" and campaign:
            campaign.collected_amount = max(0.0, campaign.collected_amount - refund.amount)

    refunded_amount = _completed_refund_total(db, donation.id)
    if refunded_amount >= donation.amount - 0.005:
        donation.payment_status = "Refunded"
    elif refunded_amount > 0:
        donation.payment_status = "Partially Refunded"


@router.get("/api/bkash/config")
def bkash_configuration_status(
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    # Never expose merchant credentials to the frontend. Local simulation is
    # intentionally available for classroom/demo use when real credentials are absent.
    _ensure_bkash_credentials(current_user, db)
    status = bkash_client.configuration_status()
    status.update({
        "simulation_available": not status["configured"],
        "simulation_active": not status["configured"],
    })
    return status


def _simulation_payment_for_donor(payment_id: str, current_user: models.User, db: Session):
    payment = db.query(models.BkashPayment).filter(models.BkashPayment.payment_id == payment_id).first()
    if not payment or not payment.payment_id or not payment.payment_id.startswith("SIM-PAY-"):
        raise HTTPException(status_code=404, detail="Payment not found")
    donation = db.query(models.Donation).filter(
        models.Donation.id == payment.donation_id,
        models.Donation.donor_user_id == current_user.id,
    ).first()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
    return payment, donation


@router.post("/api/bkash/simulation/create")
def create_bkash_simulation_payment(
    donation_in: schemas.DonationCreate,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    _ensure_bkash_credentials(current_user, db)
    if bkash_client.configured:
        raise HTTPException(status_code=400, detail="This payment route is unavailable while bKash merchant credentials are configured")
    campaign = db.query(models.Campaign).filter(
        models.Campaign.id == donation_in.campaign_id,
        models.Campaign.status == "Active",
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Active campaign not found")

    tracking_id = f"DNT-{uuid.uuid4().hex[:12].upper()}"
    payment_id = f"SIM-PAY-{uuid.uuid4().hex[:14].upper()}"
    invoice = f"SIM-DN-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    number = donation_in.bkash_number

    donation = models.Donation(
        campaign_id=campaign.id,
        donor_user_id=current_user.id,
        donor_name=current_user.organization_name or current_user.full_name,
        amount=donation_in.amount,
        bkash_account_masked=f"{number[:3]}****{number[-4:]}",
        tracking_id=tracking_id,
        bkash_transaction_id=f"PENDING-{tracking_id}",
        payment_status="OTP Pending",
    )
    db.add(donation)
    db.flush()

    payment = models.BkashPayment(
        donation_id=donation.id,
        payment_id=payment_id,
        merchant_invoice_number=invoice,
        payer_reference=tracking_id,
        bkash_url="LOCAL-SANDBOX-SIMULATION",
        transaction_status="OTP Pending",
        status_code="SIM-0000",
        status_message="Local bKash demo payment - awaiting OTP",
        create_response=sanitize_bkash_response({
            "mode": "LOCAL_SANDBOX_SIMULATION",
            "paymentID": payment_id,
            "transactionStatus": "OTP Pending",
            "payerReference": number,
            "amount": f"{donation_in.amount:.2f}",
            "currency": "BDT",
        }),
        last_synced_at=datetime.utcnow(),
    )
    db.add(payment)
    db.commit()
    db.refresh(donation)

    # Print bKash credentials to console (like SMS fallback)
    print(f"\n{'='*60}")
    print(f"  [DISASTERNET bKASH PAYMENT - CONSOLE NOTIFICATION]")
    print(f"  Donor:      {current_user.full_name} ({current_user.email})")
    print(f"  Payment ID: {payment_id}")
    print(f"  Amount:     {donation_in.amount:.2f} BDT")
    print(f"  OTP Code:   {current_user.bkash_sim_otp}")
    print(f"  PIN Code:   {current_user.bkash_sim_pin}")
    print(f"  Time:       {datetime.utcnow().isoformat()} UTC")
    print(f"{'='*60}\n")

    return {
        "donation_id": donation.id,
        "tracking_id": tracking_id,
        "payment_id": payment_id,
        "payment_status": donation.payment_status,
        "simulation": True,
    }


@router.post("/api/bkash/simulation/{payment_id}/otp")
def verify_bkash_simulation_otp(
    payment_id: str,
    otp_in: schemas.BkashSimulationOTP,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    _ensure_bkash_credentials(current_user, db)
    payment, donation = _simulation_payment_for_donor(payment_id, current_user, db)
    if donation.payment_status in {"Completed", "Partially Refunded", "Refunded"}:
        raise HTTPException(status_code=400, detail="This payment is already completed")
    if otp_in.otp != current_user.bkash_sim_otp:
        raise HTTPException(status_code=400, detail="Incorrect OTP")
    payment.transaction_status = "PIN Pending"
    payment.status_message = "OTP verified - awaiting PIN"
    payment.last_synced_at = datetime.utcnow()
    donation.payment_status = "PIN Pending"
    db.commit()
    return {"payment_id": payment_id, "payment_status": donation.payment_status, "otp_verified": True}


@router.post("/api/bkash/simulation/{payment_id}/confirm")
def confirm_bkash_simulation_payment(
    payment_id: str,
    pin_in: schemas.BkashSimulationPIN,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    _ensure_bkash_credentials(current_user, db)
    payment, donation = _simulation_payment_for_donor(payment_id, current_user, db)
    if payment.transaction_status != "PIN Pending":
        raise HTTPException(status_code=400, detail="Verify the OTP before entering the PIN")
    if pin_in.pin != current_user.bkash_sim_pin:
        raise HTTPException(status_code=400, detail="Incorrect PIN")

    trx_id = f"BKT-{uuid.uuid4().hex[:14].upper()}"
    result = {
        "statusCode": "0000",
        "statusMessage": "Payment completed",
        "paymentID": payment_id,
        "trxID": trx_id,
        "transactionStatus": "Completed",
        "amount": f"{donation.amount:.2f}",
        "currency": "BDT",
        "paymentMode": "LOCAL_SANDBOX_SIMULATION",
    }
    payment.execute_response = sanitize_bkash_response(result)
    _apply_completed_bkash_payment(db, donation, payment, result)
    payment.status_message = "bKash payment completed"
    db.commit()
    db.refresh(donation)
    return {
        "donation_id": donation.id,
        "tracking_id": donation.tracking_id,
        "payment_id": payment_id,
        "transaction_id": donation.bkash_transaction_id,
        "payment_status": donation.payment_status,
        "simulation": True,
    }


@router.post("/api/bkash/payments/create", response_model=schemas.BkashPaymentStartResponse)
def create_bkash_donation_payment(
    payment_in: schemas.BkashPaymentCreate,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    campaign = db.query(models.Campaign).filter(
        models.Campaign.id == payment_in.campaign_id,
        models.Campaign.status == "Active",
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Active campaign not found")

    tracking_id = f"DNT-{uuid.uuid4().hex[:12].upper()}"
    invoice = f"DN-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8].upper()}"
    payer_reference = tracking_id

    donation = models.Donation(
        campaign_id=campaign.id,
        donor_user_id=current_user.id,
        donor_name=current_user.organization_name or current_user.full_name,
        amount=payment_in.amount,
        bkash_account_masked="bKash Hosted",
        tracking_id=tracking_id,
        bkash_transaction_id=f"PENDING-{tracking_id}",
        payment_status="Initiated",
    )
    db.add(donation)
    db.flush()

    payment = models.BkashPayment(
        donation_id=donation.id,
        merchant_invoice_number=invoice,
        payer_reference=payer_reference,
        transaction_status="Initiated",
    )
    db.add(payment)
    db.commit()
    db.refresh(donation)
    db.refresh(payment)

    callback_url = os.getenv(
        "BKASH_CALLBACK_URL",
        "http://127.0.0.1:8000/api/bkash/callback",
    )
    try:
        result = bkash_client.create_payment(
            amount=payment_in.amount,
            payer_reference=payer_reference,
            callback_url=callback_url,
            merchant_invoice_number=invoice,
        )
    except (BkashAPIError, BkashConfigurationError) as exc:
        donation.payment_status = "Failed"
        payment.transaction_status = "Failed"
        payment.status_message = str(exc)
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment.payment_id = result.get("paymentID")
    payment.bkash_url = result.get("bkashURL")
    payment.transaction_status = result.get("transactionStatus") or "Initiated"
    payment.status_code = result.get("statusCode")
    payment.status_message = result.get("statusMessage")
    payment.create_response = sanitize_bkash_response(result)
    payment.last_synced_at = datetime.utcnow()
    donation.payment_status = payment.transaction_status
    db.commit()

    return {
        "donation_id": donation.id,
        "tracking_id": donation.tracking_id,
        "payment_id": payment.payment_id,
        "bkash_url": payment.bkash_url,
        "payment_status": donation.payment_status,
    }


@router.get("/api/bkash/callback")
def bkash_payment_callback(
    paymentID: str,
    status: str = "failure",
    signature: Optional[str] = None,
    db: Session = Depends(get_db),
):
    payment = db.query(models.BkashPayment).filter(models.BkashPayment.payment_id == paymentID).first()
    frontend_url = os.getenv("BKASH_FRONTEND_URL", "http://localhost:5173").rstrip("/")
    if not payment:
        query = urlencode({"bkash": "error", "message": "Payment record not found"})
        return RedirectResponse(f"{frontend_url}/?{query}")

    donation = db.query(models.Donation).filter(models.Donation.id == payment.donation_id).first()
    if not donation:
        query = urlencode({"bkash": "error", "message": "Donation record not found"})
        return RedirectResponse(f"{frontend_url}/?{query}")

    callback_status = (status or "failure").lower()
    if callback_status == "success":
        result = None
        try:
            result = bkash_client.execute_payment(paymentID)
            payment.execute_response = sanitize_bkash_response(result)
        except (BkashAPIError, BkashConfigurationError):
            # bKash recommends querying the payment when Execute Payment does
            # not return a conclusive result.
            try:
                result = bkash_client.query_payment(paymentID)
                payment.query_response = sanitize_bkash_response(result)
            except (BkashAPIError, BkashConfigurationError) as exc:
                payment.status_message = str(exc)
                payment.last_synced_at = datetime.utcnow()
                db.commit()
                query = urlencode({"bkash": "pending", "tracking_id": donation.tracking_id})
                return RedirectResponse(f"{frontend_url}/?{query}")

        if result and result.get("transactionStatus") == "Completed":
            _apply_completed_bkash_payment(db, donation, payment, result)
            db.commit()
            query = urlencode({"bkash": "success", "tracking_id": donation.tracking_id})
            return RedirectResponse(f"{frontend_url}/?{query}")

        donation.payment_status = result.get("transactionStatus", "Initiated") if result else "Initiated"
        payment.transaction_status = donation.payment_status
        payment.last_synced_at = datetime.utcnow()
        db.commit()
        query = urlencode({"bkash": "pending", "tracking_id": donation.tracking_id})
        return RedirectResponse(f"{frontend_url}/?{query}")

    donation.payment_status = "Cancelled" if callback_status in {"cancel", "cancelled"} else "Failed"
    payment.transaction_status = donation.payment_status
    payment.status_message = f"bKash callback status: {callback_status}"
    payment.last_synced_at = datetime.utcnow()
    db.commit()
    query = urlencode({"bkash": callback_status, "tracking_id": donation.tracking_id})
    return RedirectResponse(f"{frontend_url}/?{query}")


@router.post("/api/donations/{donation_id}/sync", response_model=schemas.DonationHistoryResponse)
def sync_donation_with_bkash(
    donation_id: int,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    donation = db.query(models.Donation).filter(
        models.Donation.id == donation_id,
        models.Donation.donor_user_id == current_user.id,
    ).first()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
    payment = db.query(models.BkashPayment).filter(models.BkashPayment.donation_id == donation.id).first()
    if not payment or not payment.payment_id:
        raise HTTPException(status_code=400, detail="This donation does not have a bKash API payment record")

    if payment.payment_id.startswith("SIM-PAY-"):
        payment.last_synced_at = datetime.utcnow()
        payment.query_response = sanitize_bkash_response({
            "paymentID": payment.payment_id,
            "transactionStatus": donation.payment_status,
            "statusMessage": "Local demo payment status synchronized",
        })
        db.commit()
        db.refresh(donation)
        return _donation_history_payload(db, donation)

    try:
        result = bkash_client.query_payment(payment.payment_id)
    except (BkashAPIError, BkashConfigurationError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment.query_response = sanitize_bkash_response(result)
    payment.transaction_status = result.get("transactionStatus") or payment.transaction_status
    payment.status_code = result.get("statusCode")
    payment.status_message = result.get("statusMessage")
    payment.last_synced_at = datetime.utcnow()
    if result.get("transactionStatus") == "Completed":
        _apply_completed_bkash_payment(db, donation, payment, result)
    elif donation.payment_status not in {"Completed", "Partially Refunded", "Refunded"}:
        donation.payment_status = result.get("transactionStatus") or donation.payment_status

    _sync_refunds(db, donation, payment)
    db.commit()
    db.refresh(donation)
    return _donation_history_payload(db, donation)


@router.post("/api/donations/{donation_id}/refund", response_model=schemas.DonationRefundResponse)
def refund_donation(
    donation_id: int,
    refund_in: schemas.DonationRefundCreate,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    donation = db.query(models.Donation).filter(
        models.Donation.id == donation_id,
        models.Donation.donor_user_id == current_user.id,
    ).first()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
    if donation.payment_status not in {"Completed", "Partially Refunded"}:
        raise HTTPException(status_code=400, detail="Only completed bKash donations can be refunded")

    payment = db.query(models.BkashPayment).filter(models.BkashPayment.donation_id == donation.id).first()
    if not payment or not payment.payment_id or donation.bkash_transaction_id.startswith("PENDING-"):
        raise HTTPException(status_code=400, detail="This donation predates the bKash API integration and cannot be refunded automatically")

    refund_count = db.query(models.BkashRefund).filter(
        models.BkashRefund.donation_id == donation.id,
        models.BkashRefund.status != "Failed",
    ).count()
    if refund_count >= 10:
        raise HTTPException(status_code=400, detail="bKash allows a maximum of 10 refund transactions for one payment")

    already_refunded = _completed_refund_total(db, donation.id)
    already_utilized = _donation_utilized_total(db, donation.id)
    remaining = max(0.0, donation.amount - already_refunded - already_utilized)
    refund_amount = float(refund_in.amount) if refund_in.amount is not None else remaining
    if refund_amount <= 0 or refund_amount > remaining + 0.005:
        raise HTTPException(status_code=400, detail=f"Refund amount cannot exceed the unutilized balance of BDT {remaining:.2f}")

    campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
    if campaign and refund_amount > max(0.0, campaign.collected_amount - campaign.utilized_amount) + 0.005:
        raise HTTPException(status_code=400, detail="This amount has already been allocated by the campaign and cannot be refunded automatically")

    if payment.payment_id.startswith("SIM-PAY-"):
        refund_trx_id = f"BKR-{uuid.uuid4().hex[:14].upper()}"
        refund = models.BkashRefund(
            donation_id=donation.id,
            payment_id=payment.payment_id,
            original_trx_id=donation.bkash_transaction_id,
            refund_trx_id=refund_trx_id,
            amount=refund_amount,
            status="Completed",
            reason=refund_in.reason,
            sku=donation.tracking_id,
            response_data=sanitize_bkash_response({
                "refundTrxId": refund_trx_id,
                "refundTransactionStatus": "Completed",
                "paymentMode": "LOCAL_SANDBOX_SIMULATION",
                "refundAmount": f"{refund_amount:.2f}",
            }),
        )
        db.add(refund)
        if campaign:
            campaign.collected_amount = max(0.0, campaign.collected_amount - refund_amount)
        new_refunded_total = already_refunded + refund_amount
        donation.payment_status = "Refunded" if new_refunded_total >= donation.amount - 0.005 else "Partially Refunded"
        payment.status_message = "Refund completed"
        payment.last_synced_at = datetime.utcnow()
        db.commit()
        db.refresh(refund)
        return refund

    refund = models.BkashRefund(
        donation_id=donation.id,
        payment_id=payment.payment_id,
        original_trx_id=donation.bkash_transaction_id,
        amount=refund_amount,
        status="Initiated",
        reason=refund_in.reason,
        sku=donation.tracking_id,
    )
    db.add(refund)
    db.commit()
    db.refresh(refund)

    try:
        result = bkash_client.refund_payment(
            payment_id=payment.payment_id,
            trx_id=donation.bkash_transaction_id,
            amount=refund_amount,
            sku=donation.tracking_id,
            reason=refund_in.reason,
        )
    except (BkashAPIError, BkashConfigurationError) as exc:
        refund.status = "Failed"
        refund.response_data = sanitize_bkash_response({"errorMessage": str(exc)})
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    refund.refund_trx_id = result.get("refundTrxId")
    refund.status = result.get("refundTransactionStatus") or "Failed"
    refund.response_data = sanitize_bkash_response(result)
    if refund.status == "Completed":
        if campaign:
            campaign.collected_amount = max(0.0, campaign.collected_amount - refund.amount)
        new_refunded_total = already_refunded + refund.amount
        donation.payment_status = "Refunded" if new_refunded_total >= donation.amount - 0.005 else "Partially Refunded"
    db.commit()
    db.refresh(refund)
    return refund


# Deprecated local simulation endpoint retained only so older clients receive a
# clear instruction instead of silently recording a fake completed payment.
@router.post("/api/donations", status_code=410)
def deprecated_local_donation_endpoint(
    donation_in: schemas.DonationCreate,
    current_user: models.User = Depends(require_donor),
):
    raise HTTPException(
        status_code=410,
        detail="Direct donation simulation is disabled. Use /api/bkash/payments/create for secure bKash checkout.",
    )


@router.get("/api/donations/history", response_model=list[schemas.DonationHistoryResponse])
def donation_history(
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    donations = db.query(models.Donation).filter(
        models.Donation.donor_user_id == current_user.id
    ).order_by(models.Donation.created_at.desc()).all()
    return [_donation_history_payload(db, donation) for donation in donations]


@router.get("/api/donations/{donation_id}/receipt")
def download_donation_receipt(
    donation_id: int,
    current_user: models.User = Depends(require_donor),
    db: Session = Depends(get_db),
):
    donation = db.query(models.Donation).filter(
        models.Donation.id == donation_id,
        models.Donation.donor_user_id == current_user.id,
    ).first()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation receipt not found")
    campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
    payment = db.query(models.BkashPayment).filter(models.BkashPayment.donation_id == donation.id).first()
    refunded_amount = _completed_refund_total(db, donation.id)
    utilized_amount = _donation_utilized_total(db, donation.id)
    receipt = (
        "DisasterNet Donation Receipt\n"
        "==============================\n"
        f"Tracking ID: {donation.tracking_id}\n"
        f"Payment Mode: bKash Payment\n"
        f"bKash Payment ID: {'Local checkout' if payment and payment.payment_id and payment.payment_id.startswith('SIM-PAY-') else (payment.payment_id if payment and payment.payment_id else '-')}\n"
        f"bKash Transaction ID: {donation.bkash_transaction_id}\n"
        f"Donor: {donation.donor_name}\n"
        f"Campaign: {campaign.title if campaign else donation.campaign_id}\n"
        f"Organization: {campaign.organization_name if campaign else '-'}\n"
        f"Original Amount: BDT {donation.amount:,.2f}\n"
        f"Refunded Amount: BDT {refunded_amount:,.2f}\n"
        f"Net Contribution: BDT {max(0.0, donation.amount - refunded_amount):,.2f}\n"
        f"Utilized for Relief: BDT {utilized_amount:,.2f}\n"
        f"Available for Utilization: BDT {max(0.0, donation.amount - refunded_amount - utilized_amount):,.2f}\n"
        f"bKash Account: {donation.bkash_account_masked}\n"
        f"Payment Status: {donation.payment_status}\n"
        f"Date: {donation.created_at.isoformat()} UTC\n"
    )
    headers = {"Content-Disposition": f'attachment; filename="receipt_{donation.tracking_id}.txt"'}
    return PlainTextResponse(receipt, headers=headers)


@router.get("/api/public/transparency")
def public_transparency(db: Session = Depends(get_db)):
    campaigns = db.query(models.Campaign).order_by(models.Campaign.created_at.desc()).all()
    campaign_rows = []
    for campaign in campaigns:
        allocations = db.query(models.CampaignAllocation).filter(
            models.CampaignAllocation.campaign_id == campaign.id
        ).order_by(models.CampaignAllocation.created_at.desc()).all()
        donation_count = db.query(models.Donation).filter(
            models.Donation.campaign_id == campaign.id,
            models.Donation.payment_status.in_(["Completed", "Partially Refunded"]),
        ).count()
        campaign_rows.append({
            "id": campaign.id,
            "title": campaign.title,
            "organization_name": campaign.organization_name,
            "description": campaign.description,
            "target_amount": campaign.target_amount,
            "collected_amount": campaign.collected_amount,
            "utilized_amount": campaign.utilized_amount,
            "remaining_amount": max(0.0, campaign.collected_amount - campaign.utilized_amount),
            "status": campaign.status,
            "donation_count": donation_count,
            "allocations": [schemas.CampaignAllocationResponse.model_validate(a).model_dump() for a in allocations],
        })

    donor_distributions = db.query(models.DonationUtilization).order_by(
        models.DonationUtilization.created_at.desc()
    ).limit(200).all()

    return {
        "summary": {
            "campaigns": len(campaigns),
            "total_donations_bdt": db.query(func.coalesce(func.sum(models.Campaign.collected_amount), 0.0)).scalar() or 0.0,
            "funds_utilized_bdt": db.query(func.coalesce(func.sum(models.Campaign.utilized_amount), 0.0)).scalar() or 0.0,
            "aid_distributions": db.query(models.AidDistribution).count(),
            "donor_fund_distributions": db.query(models.DonationUtilization).count(),
            "completed_missions": db.query(models.VolunteerMission).filter(models.VolunteerMission.status == "Completed").count(),
            "people_rescued": db.query(func.coalesce(func.sum(models.FieldReport.rescued_people), 0)).scalar() or 0,
        },
        "campaigns": campaign_rows,
        "completed_distributions": [
            {
                "id": item.id,
                "tracking_id": item.tracking_id,
                "donor_name": item.donor_name,
                "amount": item.amount,
                "campaign_title": item.campaign_title,
                "mission_title": item.mission_title,
                "volunteer_name": item.volunteer_name,
                "created_at": item.created_at,
            }
            for item in donor_distributions
        ],
    }


# ---------------------------------------------------------------------------
# Complaint, feedback, government analytics and fraud review
# ---------------------------------------------------------------------------
@router.post("/api/service/complaints", response_model=schemas.ComplaintResponse)
def submit_complaint_feedback(
    complaint_in: schemas.ComplaintCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"donor", "beneficiary"}:
        raise HTTPException(status_code=403, detail="Complaints and feedback are available to citizens, donors and beneficiaries")
    if complaint_in.submission_type not in {"Complaint", "Feedback"}:
        raise HTTPException(status_code=400, detail="Submission type must be Complaint or Feedback")
    item = models.ComplaintFeedback(
        user_id=current_user.id,
        submitted_by=current_user.full_name,
        user_role=current_user.role,
        **complaint_in.model_dump(),
        status="Submitted",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/api/service/complaints/mine", response_model=list[schemas.ComplaintResponse])
def list_my_complaints(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.ComplaintFeedback).filter(
        models.ComplaintFeedback.user_id == current_user.id
    ).order_by(models.ComplaintFeedback.created_at.desc()).all()


@router.get("/api/government/complaints", response_model=list[schemas.ComplaintResponse])
def list_all_complaints(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    return db.query(models.ComplaintFeedback).order_by(models.ComplaintFeedback.created_at.desc()).all()


@router.patch("/api/government/complaints/{complaint_id}", response_model=schemas.ComplaintResponse)
def review_complaint(
    complaint_id: int,
    review: schemas.ComplaintReview,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    if review.status not in COMPLAINT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid complaint status")
    item = db.query(models.ComplaintFeedback).filter(models.ComplaintFeedback.id == complaint_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Complaint or feedback item not found")
    item.status = review.status
    item.official_response = review.official_response
    item.reviewed_by = current_user.full_name
    db.commit()
    db.refresh(item)
    return item


@router.get("/api/government/fraud-alerts", response_model=list[schemas.FraudAlertResponse])
def list_fraud_alerts(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    return db.query(models.FraudAlert).order_by(models.FraudAlert.created_at.desc()).all()


@router.patch("/api/government/fraud-alerts/{alert_id}", response_model=schemas.FraudAlertResponse)
def review_fraud_alert(
    alert_id: int,
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    alert = db.query(models.FraudAlert).filter(models.FraudAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Fraud alert not found")
    alert.status = "Reviewed"
    db.commit()
    db.refresh(alert)
    return alert


@router.get("/api/government/analytics")
def government_analytics(
    current_user: models.User = Depends(require_government),
    db: Session = Depends(get_db),
):
    organizations = db.query(models.User).filter(models.User.role == "organization").all()
    ngo_performance = []
    for organization in organizations:
        campaign_count = db.query(models.Campaign).filter(models.Campaign.organization_user_id == organization.id).count()
        mission_count = db.query(models.VolunteerMission).filter(models.VolunteerMission.assigned_by_user_id == organization.id).count()
        completed_missions = db.query(models.VolunteerMission).filter(
            models.VolunteerMission.assigned_by_user_id == organization.id,
            models.VolunteerMission.status == "Completed",
        ).count()
        ngo_performance.append({
            "organization": organization.organization_name or organization.full_name,
            "campaigns": campaign_count,
            "missions": mission_count,
            "completed_missions": completed_missions,
        })

    donation_rows = db.query(models.Donation).filter(
        models.Donation.payment_status.in_(["Completed", "Partially Refunded", "Refunded"])
    ).order_by(models.Donation.created_at.desc()).all()
    donation_summary = []
    for donation in donation_rows:
        campaign = db.query(models.Campaign).filter(models.Campaign.id == donation.campaign_id).first()
        refunded = _completed_refund_total(db, donation.id)
        utilized = _donation_utilized_total(db, donation.id)
        net_amount = max(0.0, float(donation.amount) - refunded)
        donation_summary.append({
            "id": donation.id,
            "donor_name": donation.donor_name,
            "tracking_id": donation.tracking_id,
            "campaign_title": campaign.title if campaign else f"Campaign #{donation.campaign_id}",
            "organization_name": campaign.organization_name if campaign else "-",
            "amount": donation.amount,
            "refunded_amount": refunded,
            "net_amount": net_amount,
            "utilized_amount": utilized,
            "available_amount": max(0.0, net_amount - utilized),
            "payment_status": donation.payment_status,
            "created_at": donation.created_at,
        })

    total_inventory = db.query(func.coalesce(func.sum(models.InventoryItem.quantity), 0.0)).scalar() or 0.0
    return {
        "disasters": {
            "total": db.query(models.DisasterEvent).count(),
            "active": db.query(models.DisasterEvent).filter(models.DisasterEvent.status == "Active").count(),
        },
        "field_operations": {
            "registered_volunteers": db.query(models.User).filter(models.User.role == "volunteer").count(),
            "verified_volunteers": db.query(models.VolunteerProfile).filter(models.VolunteerProfile.verification_status == "Verified").count(),
            "missions": db.query(models.VolunteerMission).count(),
            "completed_missions": db.query(models.VolunteerMission).filter(models.VolunteerMission.status == "Completed").count(),
            "field_reports": db.query(models.FieldReport).count(),
            "aid_distributions": db.query(models.AidDistribution).count(),
        },
        "organizations": {
            "registered": db.query(models.User).filter(models.User.role == "organization").count(),
            "verified": db.query(models.OrganizationVerification).filter(models.OrganizationVerification.verification_status == "Verified").count(),
        },
        "donations": {
            "campaigns": db.query(models.Campaign).count(),
            "transactions": db.query(models.Donation).filter(
                models.Donation.payment_status.in_(["Completed", "Partially Refunded", "Refunded"])
            ).count(),
            "total_bdt": db.query(func.coalesce(func.sum(models.Campaign.collected_amount), 0.0)).scalar() or 0.0,
            "utilized_bdt": db.query(func.coalesce(func.sum(models.Campaign.utilized_amount), 0.0)).scalar() or 0.0,
        },
        "donation_summary": donation_summary,
        "resource_utilization": {
            "inventory_quantity": total_inventory,
            "resource_requests": db.query(models.ResourceRequest).count(),
            "fulfilled_requests": db.query(models.ResourceRequest).filter(models.ResourceRequest.status == "Delivered").count(),
        },
        "public_service": {
            "beneficiaries": db.query(models.User).filter(models.User.role == "beneficiary").count(),
            "assistance_requests": db.query(models.AssistanceRequest).count(),
            "active_sos": db.query(models.SOSRequest).filter(models.SOSRequest.status != "Resolved").count(),
            "open_complaints": db.query(models.ComplaintFeedback).filter(models.ComplaintFeedback.status != "Resolved").count(),
            "open_fraud_alerts": db.query(models.FraudAlert).filter(models.FraudAlert.status == "Open").count(),
        },
        "ngo_performance": ngo_performance,
    }

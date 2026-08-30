from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas
from app.auth import require_hospital

router = APIRouter(prefix="/api/hospital", tags=["Emergency Resource Request: Hospitals"])

MEDICAL_REQUEST_CATEGORIES = {"Medicine", "Medical Equipment"}
CAPACITY_STATUSES = {"Available", "Limited", "Critical", "Full"}


def _hospital_name(user: models.User) -> str:
    return user.organization_name or user.full_name


def _get_or_create_status(db: Session, user: models.User) -> models.HospitalStatus:
    status = db.query(models.HospitalStatus).filter(models.HospitalStatus.user_id == user.id).first()
    if status:
        return status

    status = models.HospitalStatus(user_id=user.id, hospital_name=_hospital_name(user))
    db.add(status)
    db.commit()
    db.refresh(status)
    return status


@router.get("/status", response_model=schemas.HospitalStatusResponse)
def get_hospital_status(
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    """Return the hospital's current patient and emergency-capacity status."""
    return _get_or_create_status(db, current_user)


@router.patch("/patient-statistics", response_model=schemas.HospitalStatusResponse)
def update_patient_statistics(
    stats: schemas.HospitalPatientStatisticsUpdate,
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    """Hospital updates current, critical and newly arrived emergency patient totals."""
    if stats.critical_patients > stats.current_patients:
        raise HTTPException(status_code=400, detail="Critical patients cannot exceed current patients")

    status = _get_or_create_status(db, current_user)
    status.current_patients = stats.current_patients
    status.critical_patients = stats.critical_patients
    status.new_emergency_patients = stats.new_emergency_patients
    db.commit()
    db.refresh(status)
    return status


@router.patch("/capacity", response_model=schemas.HospitalStatusResponse)
def report_emergency_capacity(
    capacity: schemas.HospitalCapacityUpdate,
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    """Hospital reports beds, staff, ambulances and overall emergency capacity."""
    if capacity.emergency_capacity_status not in CAPACITY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid capacity status. Must be one of: {', '.join(sorted(CAPACITY_STATUSES))}",
        )

    status = _get_or_create_status(db, current_user)
    status.total_beds = capacity.total_beds
    status.occupied_beds = capacity.occupied_beds
    status.emergency_beds = capacity.emergency_beds
    status.staff_on_duty = capacity.staff_on_duty
    status.ambulances_available = capacity.ambulances_available
    status.emergency_capacity_status = capacity.emergency_capacity_status
    db.commit()
    db.refresh(status)
    return status


@router.post("/requests", response_model=schemas.ResourceRequestResponse)
def request_emergency_medical_resources(
    request_in: schemas.ResourceRequestCreate,
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    """Request emergency medicine or medical equipment for this hospital."""
    if request_in.item_category not in MEDICAL_REQUEST_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail="Hospitals can request resources using the Medicine or Medical Equipment category",
        )

    request = models.ResourceRequest(
        requester_name=_hospital_name(current_user),
        requester_email=current_user.email,
        requester_role="hospital",
        item_category=request_in.item_category,
        item_name=request_in.item_name,
        quantity=request_in.quantity,
        unit=request_in.unit,
        priority=request_in.priority,
        status="Pending",
        destination_address=request_in.destination_address,
        destination_lat=request_in.destination_lat,
        destination_lng=request_in.destination_lng,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/incoming-supplies", response_model=List[schemas.ResourceRequestResponse])
def track_incoming_medical_supplies(
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    """Track all medical supply requests submitted by the signed-in hospital."""
    return (
        db.query(models.ResourceRequest)
        .filter(
            models.ResourceRequest.requester_email == current_user.email,
            models.ResourceRequest.requester_role == "hospital",
        )
        .order_by(models.ResourceRequest.created_at.desc())
        .all()
    )


@router.post("/expenditures", response_model=schemas.HospitalExpenditureResponse)
def submit_expenditure_report(
    report: schemas.HospitalExpenditureCreate,
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    """Submit an emergency-response expenditure report."""
    expenditure = models.HospitalExpenditure(
        user_id=current_user.id,
        hospital_name=_hospital_name(current_user),
        category=report.category,
        amount=report.amount,
        description=report.description,
        report_period=report.report_period,
    )
    db.add(expenditure)
    db.commit()
    db.refresh(expenditure)
    return expenditure


@router.get("/expenditures", response_model=List[schemas.HospitalExpenditureResponse])
def list_expenditure_reports(
    current_user: models.User = Depends(require_hospital),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.HospitalExpenditure)
        .filter(models.HospitalExpenditure.user_id == current_user.id)
        .order_by(models.HospitalExpenditure.created_at.desc())
        .all()
    )

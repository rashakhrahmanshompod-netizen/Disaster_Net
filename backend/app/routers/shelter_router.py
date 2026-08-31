from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas
from app.auth import require_shelter

router = APIRouter(prefix="/api/shelter", tags=["Emergency Resource Request: Disaster Shelters"])

SHORTAGE_SEVERITIES = {"Low", "Medium", "High", "Critical"}
OCCUPANCY_STATUSES = {"Available", "Limited", "Full", "Over Capacity", "Closed"}


def _shelter_name(user: models.User) -> str:
    return user.organization_name or user.full_name


def _get_or_create_status(db: Session, user: models.User) -> models.ShelterStatus:
    status = db.query(models.ShelterStatus).filter(models.ShelterStatus.user_id == user.id).first()
    if status:
        return status

    status = models.ShelterStatus(user_id=user.id, shelter_name=_shelter_name(user))
    db.add(status)
    db.commit()
    db.refresh(status)
    return status


def _auto_occupancy_status(total_capacity: int, current_occupancy: int) -> str:
    if total_capacity <= 0:
        return "Available"
    if current_occupancy > total_capacity:
        return "Over Capacity"
    if current_occupancy == total_capacity:
        return "Full"
    if current_occupancy >= int(total_capacity * 0.8):
        return "Limited"
    return "Available"


def _resource_response(resource: models.ShelterResource):
    data = schemas.ShelterResourceResponse.model_validate(resource).model_dump()
    data["is_low_stock"] = resource.quantity <= resource.minimum_threshold
    return data


@router.get("/status", response_model=schemas.ShelterStatusResponse)
def get_shelter_status(
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    return _get_or_create_status(db, current_user)


@router.patch("/capacity", response_model=schemas.ShelterStatusResponse)
def update_shelter_capacity(
    update: schemas.ShelterCapacityUpdate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    status = _get_or_create_status(db, current_user)
    status.total_capacity = update.total_capacity
    if status.occupancy_status != "Closed":
        status.occupancy_status = _auto_occupancy_status(status.total_capacity, status.current_occupancy)
    db.commit()
    db.refresh(status)
    return status


@router.patch("/occupancy", response_model=schemas.ShelterStatusResponse)
def update_occupancy_status(
    update: schemas.ShelterOccupancyUpdate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    if update.occupancy_status and update.occupancy_status not in OCCUPANCY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid occupancy status. Must be one of: {', '.join(sorted(OCCUPANCY_STATUSES))}",
        )

    status = _get_or_create_status(db, current_user)
    status.current_occupancy = update.current_occupancy
    status.occupancy_status = update.occupancy_status or _auto_occupancy_status(
        status.total_capacity, status.current_occupancy
    )
    db.commit()
    db.refresh(status)
    return status


@router.get("/resources", response_model=List[schemas.ShelterResourceResponse])
def list_available_resources(
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    resources = (
        db.query(models.ShelterResource)
        .filter(models.ShelterResource.user_id == current_user.id)
        .order_by(models.ShelterResource.updated_at.desc())
        .all()
    )
    return [_resource_response(resource) for resource in resources]


@router.post("/resources", response_model=schemas.ShelterResourceResponse)
def add_available_resource(
    resource_in: schemas.ShelterResourceCreate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    resource = models.ShelterResource(
        user_id=current_user.id,
        shelter_name=_shelter_name(current_user),
        item_name=resource_in.item_name,
        category=resource_in.category,
        quantity=resource_in.quantity,
        unit=resource_in.unit,
        minimum_threshold=resource_in.minimum_threshold,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return _resource_response(resource)


@router.patch("/resources/{resource_id}", response_model=schemas.ShelterResourceResponse)
def update_available_resource(
    resource_id: int,
    update: schemas.ShelterResourceUpdate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    resource = (
        db.query(models.ShelterResource)
        .filter(
            models.ShelterResource.id == resource_id,
            models.ShelterResource.user_id == current_user.id,
        )
        .first()
    )
    if not resource:
        raise HTTPException(status_code=404, detail="Shelter resource not found")

    if update.quantity is not None:
        resource.quantity = update.quantity
    if update.minimum_threshold is not None:
        resource.minimum_threshold = update.minimum_threshold
    db.commit()
    db.refresh(resource)
    return _resource_response(resource)


@router.post("/requests", response_model=schemas.ResourceRequestResponse)
def request_emergency_supplies(
    request_in: schemas.ResourceRequestCreate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    request = models.ResourceRequest(
        requester_name=_shelter_name(current_user),
        requester_email=current_user.email,
        requester_role="shelter",
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


@router.get("/requests", response_model=List[schemas.ResourceRequestResponse])
def list_shelter_requests(
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.ResourceRequest)
        .filter(
            models.ResourceRequest.requester_email == current_user.email,
            models.ResourceRequest.requester_role == "shelter",
        )
        .order_by(models.ResourceRequest.created_at.desc())
        .all()
    )


@router.post("/shortages", response_model=schemas.ShelterShortageResponse)
def report_shortage(
    shortage_in: schemas.ShelterShortageCreate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    if shortage_in.severity not in SHORTAGE_SEVERITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid shortage severity. Must be one of: {', '.join(sorted(SHORTAGE_SEVERITIES))}",
        )

    shortage = models.ShelterShortage(
        user_id=current_user.id,
        shelter_name=_shelter_name(current_user),
        item_name=shortage_in.item_name,
        required_quantity=shortage_in.required_quantity,
        available_quantity=shortage_in.available_quantity,
        unit=shortage_in.unit,
        severity=shortage_in.severity,
        notes=shortage_in.notes,
        status="Open",
    )
    db.add(shortage)
    db.commit()
    db.refresh(shortage)
    return shortage


@router.get("/shortages", response_model=List[schemas.ShelterShortageResponse])
def list_shortages(
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.ShelterShortage)
        .filter(models.ShelterShortage.user_id == current_user.id)
        .order_by(models.ShelterShortage.created_at.desc())
        .all()
    )


@router.post("/distributions", response_model=schemas.ShelterDistributionResponse)
def record_distributed_resource(
    distribution_in: schemas.ShelterDistributionCreate,
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    resource = (
        db.query(models.ShelterResource)
        .filter(
            models.ShelterResource.id == distribution_in.resource_id,
            models.ShelterResource.user_id == current_user.id,
        )
        .first()
    )
    if not resource:
        raise HTTPException(status_code=404, detail="Shelter resource not found")
    if resource.quantity < distribution_in.quantity:
        raise HTTPException(status_code=400, detail="Not enough shelter resource stock for this distribution")

    resource.quantity -= distribution_in.quantity
    distribution = models.ShelterDistribution(
        user_id=current_user.id,
        shelter_name=_shelter_name(current_user),
        resource_id=resource.id,
        item_name=resource.item_name,
        quantity=distribution_in.quantity,
        unit=resource.unit,
        recipient_group=distribution_in.recipient_group,
        notes=distribution_in.notes,
    )
    db.add(distribution)
    db.commit()
    db.refresh(distribution)
    return distribution


@router.get("/distributions", response_model=List[schemas.ShelterDistributionResponse])
def list_distributed_resources(
    current_user: models.User = Depends(require_shelter),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.ShelterDistribution)
        .filter(models.ShelterDistribution.user_id == current_user.id)
        .order_by(models.ShelterDistribution.distributed_at.desc())
        .all()
    )

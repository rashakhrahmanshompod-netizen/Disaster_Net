import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_organization
from app.sms import send_bulk_sms

router = APIRouter(prefix="/api/inventory", tags=["Module 2: Resource & Logistics Coordination"])


def _notify_low_stock_sms(db: Session, item: models.InventoryItem) -> None:
    """Send an SMS alert to admin and organization users when inventory is low."""
    admins_and_orgs = db.query(models.User).filter(
        models.User.role.in_(["admin", "organization"]),
        models.User.phone.isnot(None),
        models.User.phone != "",
    ).all()
    phones = [u.phone for u in admins_and_orgs if u.phone]
    if phones:
        sms_body = (
            f"[DisasterNet LOW STOCK] {item.item_name} ({item.category}) at "
            f"{item.warehouse_location} is below threshold: "
            f"{item.quantity} {item.unit} remaining (minimum: {item.minimum_threshold} {item.unit}). "
            f"Organization: {item.organization_name}."
        )
        send_bulk_sms(phones, sms_body)

# --- Helper: Haversine distance formula simulation for Route Optimization ---
def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


# --- Inventory Management ---
@router.get("/items", response_model=List[schemas.InventoryItemResponse])
def get_all_inventory_items(db: Session = Depends(get_db)):
    """Fetch warehouse inventory items with low stock calculations."""
    items = db.query(models.InventoryItem).order_by(models.InventoryItem.updated_at.desc()).all()
    results = []
    for item in items:
        item_dict = schemas.InventoryItemResponse.model_validate(item).model_dump()
        item_dict["is_low_stock"] = item.quantity <= item.minimum_threshold
        results.append(item_dict)
    return results


@router.post("/items", response_model=schemas.InventoryItemResponse)
def create_inventory_item(
    item_in: schemas.InventoryItemCreate,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db)
):
    """Organization adds standard inventory item to warehouse."""
    org_name = current_user.organization_name or current_user.full_name
    db_item = models.InventoryItem(
        organization_name=org_name,
        item_name=item_in.item_name,
        category=item_in.category,
        quantity=item_in.quantity,
        unit=item_in.unit,
        minimum_threshold=item_in.minimum_threshold,
        warehouse_location=item_in.warehouse_location,
        warehouse_lat=item_in.warehouse_lat,
        warehouse_lng=item_in.warehouse_lng
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)

    res = schemas.InventoryItemResponse.model_validate(db_item).model_dump()
    res["is_low_stock"] = db_item.quantity <= db_item.minimum_threshold

    # --- SMS: Alert admins if new item is already below threshold ---
    if res["is_low_stock"]:
        _notify_low_stock_sms(db, db_item)

    return res


@router.patch("/items/{item_id}", response_model=schemas.InventoryItemResponse)
def update_inventory_quantity(
    item_id: int,
    item_update: schemas.InventoryItemUpdate,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db)
):
    """Update inventory quantity and threshold values."""
    db_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    # Organizations may only modify inventory owned by their own organization.
    # Admin users retain global inventory control.
    current_org = current_user.organization_name or current_user.full_name
    if current_user.role != "admin" and db_item.organization_name != current_org:
        raise HTTPException(
            status_code=403,
            detail="You can only update inventory owned by your organization"
        )

    if item_update.quantity is not None:
        db_item.quantity = item_update.quantity
    if item_update.minimum_threshold is not None:
        db_item.minimum_threshold = item_update.minimum_threshold
    if item_update.warehouse_location is not None:
        db_item.warehouse_location = item_update.warehouse_location

    db.commit()
    db.refresh(db_item)

    res = schemas.InventoryItemResponse.model_validate(db_item).model_dump()
    res["is_low_stock"] = db_item.quantity <= db_item.minimum_threshold

    # --- SMS: Alert admins when stock drops below threshold ---
    if res["is_low_stock"]:
        _notify_low_stock_sms(db, db_item)

    return res


@router.get("/low-stock-alerts")
def get_low_stock_alerts(db: Session = Depends(get_db)):
    """Fetch low stock alerts across all warehouses."""
    items = db.query(models.InventoryItem).filter(models.InventoryItem.quantity <= models.InventoryItem.minimum_threshold).all()
    return items


# --- Emergency Resource Requests & Route Optimization ---
@router.get("/requests", response_model=List[schemas.ResourceRequestResponse])
def get_resource_requests(db: Session = Depends(get_db)):
    """Fetch all emergency resource requests."""
    return db.query(models.ResourceRequest).order_by(models.ResourceRequest.created_at.desc()).all()


@router.post("/requests", response_model=schemas.ResourceRequestResponse)
def submit_resource_request(
    request_in: schemas.ResourceRequestCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Users (Hospital, Shelter, Donor, Beneficiary) submit emergency resource requests."""
    new_request = models.ResourceRequest(
        requester_name=current_user.full_name,
        requester_email=current_user.email,
        requester_role=current_user.role,
        item_category=request_in.item_category,
        item_name=request_in.item_name,
        quantity=request_in.quantity,
        unit=request_in.unit,
        priority=request_in.priority,
        destination_address=request_in.destination_address,
        destination_lat=request_in.destination_lat,
        destination_lng=request_in.destination_lng,
        status="Pending"
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request


@router.post("/requests/{request_id}/optimize-dispatch", response_model=schemas.ResourceRequestResponse)
def optimize_and_dispatch_request(
    request_id: int,
    optimization: Optional[schemas.DispatchOptimizationInput] = None,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db)
):
    """
    Intelligent Route & Logistics Optimization module:
    Finds nearest warehouse containing requested category, calculates shortest route & ETA, and dispatches vehicle.
    """
    req = db.query(models.ResourceRequest).filter(models.ResourceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Resource request not found")

    warehouse_query = db.query(models.InventoryItem).filter(
        models.InventoryItem.category == req.item_category,
        models.InventoryItem.quantity >= req.quantity
    )

    # An organization should dispatch from its own stock. Admins can coordinate
    # across all warehouses.
    if current_user.role != "admin":
        current_org = current_user.organization_name or current_user.full_name
        warehouse_query = warehouse_query.filter(models.InventoryItem.organization_name == current_org)

    warehouses = warehouse_query.all()

    if not warehouses:
        # Fallback to any warehouse in category
        fallback_query = db.query(models.InventoryItem).filter(models.InventoryItem.category == req.item_category)
        if current_user.role != "admin":
            fallback_query = fallback_query.filter(models.InventoryItem.organization_name == current_org)
        warehouses = fallback_query.all()

    if not warehouses:
        req.status = "Approved"
        req.assigned_warehouse = "Central Emergency Hub (Dhaka)"
        req.assigned_vehicle = "Disaster Relief Convoy #104"
        req.estimated_distance_km = 18.5
        req.estimated_arrival_minutes = 35
        db.commit()
        db.refresh(req)
        return req

    # If the frontend supplied a Google Distance Matrix result, validate that
    # warehouse against the same ownership/category rules before using it.
    # The previous Haversine optimizer remains as a fallback when Google Maps
    # is unavailable or no API key is configured.
    best_warehouse = None
    min_distance = float('inf')
    google_eta_minutes = None

    if optimization is not None:
        allowed_ids = {warehouse.id for warehouse in warehouses}
        if optimization.warehouse_id not in allowed_ids:
            raise HTTPException(
                status_code=400,
                detail="Selected warehouse is not eligible for this request"
            )
        best_warehouse = next(warehouse for warehouse in warehouses if warehouse.id == optimization.warehouse_id)
        min_distance = round(optimization.distance_meters / 1000.0, 2)
        google_eta_minutes = max(1, int(math.ceil(optimization.duration_seconds / 60.0)))
    else:
        for wh in warehouses:
            dist = calculate_haversine_distance(wh.warehouse_lat, wh.warehouse_lng, req.destination_lat, req.destination_lng)
            if dist < min_distance:
                min_distance = dist
                best_warehouse = wh

    # Assign details, save the selected route metrics, and dispatch a vehicle.
    req.status = "In-Transit"
    req.assigned_warehouse = f"{best_warehouse.organization_name} ({best_warehouse.warehouse_location})"
    req.assigned_vehicle = f"Emergency Express Unit #{req.id * 7 + 101}"
    req.estimated_distance_km = min_distance
    req.estimated_arrival_minutes = google_eta_minutes if google_eta_minutes is not None else max(10, int((min_distance / 40.0) * 60))

    # Deduct quantity from warehouse inventory
    if best_warehouse.quantity >= req.quantity:
        best_warehouse.quantity -= req.quantity

    db.commit()
    db.refresh(req)
    return req


@router.patch("/requests/{request_id}/status")
def update_request_status(
    request_id: int,
    status_val: str,
    current_user: models.User = Depends(require_organization),
    db: Session = Depends(get_db)
):
    """Update status of a resource request (Pending, Approved, In-Transit, Delivered, Rejected)."""
    allowed_statuses = {"Pending", "Approved", "In-Transit", "Delivered", "Rejected"}
    if status_val not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(allowed_statuses))}"
        )

    req = db.query(models.ResourceRequest).filter(models.ResourceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Resource request not found")

    req.status = status_val
    db.commit()
    return {"message": f"Resource request #{request_id} updated to {status_val}"}

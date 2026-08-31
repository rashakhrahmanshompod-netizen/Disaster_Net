from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])

@router.get("/users", response_model=List[schemas.UserWithPasswordResponse])
def get_all_users_database(
    admin_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Exclusive endpoint for Admin to inspect all user accounts and raw/hashed database records.
    """
    users = db.query(models.User).order_by(models.User.id.asc()).all()
    return users


@router.delete("/users/{user_id}")
def delete_user_by_admin(
    user_id: int,
    admin_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Exclusive endpoint for Admin to delete any account from the database.
    """
    user_to_delete = db.query(models.User).filter(models.User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User account not found")

    if user_to_delete.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account via user management")

    db.delete(user_to_delete)
    db.commit()
    return {"message": f"Account {user_to_delete.email} successfully deleted by Admin"}


@router.get("/database-stats")
def get_database_statistics(
    admin_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Provides full database analytics for the Admin panel.
    """
    total_users = db.query(models.User).count()
    admins_count = db.query(models.User).filter(models.User.role == "admin").count()
    gov_count = db.query(models.User).filter(models.User.role == "government").count()
    org_count = db.query(models.User).filter(models.User.role == "organization").count()
    hospital_count = db.query(models.User).filter(models.User.role == "hospital").count()
    shelter_count = db.query(models.User).filter(models.User.role == "shelter").count()
    volunteer_count = db.query(models.User).filter(models.User.role == "volunteer").count()
    donor_count = db.query(models.User).filter(models.User.role == "donor").count()
    beneficiary_count = db.query(models.User).filter(models.User.role == "beneficiary").count()

    total_disasters = db.query(models.DisasterEvent).count()
    active_disasters = db.query(models.DisasterEvent).filter(models.DisasterEvent.status == "Active").count()
    total_inventory_items = db.query(models.InventoryItem).count()
    total_resource_requests = db.query(models.ResourceRequest).count()
    total_alerts = db.query(models.EmergencyAlert).count()

    return {
        "user_statistics": {
            "total_users": total_users,
            "admin": admins_count,
            "government": gov_count,
            "organization": org_count,
            "hospital": hospital_count,
            "shelter": shelter_count,
            "volunteer": volunteer_count,
            "donor": donor_count,
            "beneficiary": beneficiary_count
        },
        "disaster_statistics": {
            "total": total_disasters,
            "active": active_disasters
        },
        "resource_statistics": {
            "total_inventory_items": total_inventory_items,
            "total_resource_requests": total_resource_requests,
            "total_alerts": total_alerts
        }
    }

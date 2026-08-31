from fastapi import APIRouter, Depends, HTTPException, status
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models, schemas
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.sms import send_sms, normalize_phone_number

router = APIRouter(prefix="/api/auth", tags=["Auth"])

REGISTERABLE_ROLES = ["organization", "government", "hospital", "shelter", "volunteer", "donor", "beneficiary"]

@router.post("/register", response_model=schemas.Token)
def register_user(user_in: schemas.UserRegister, db: Session = Depends(get_db)):
    if user_in.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin accounts cannot be created through registration."
        )

    if user_in.role not in REGISTERABLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(REGISTERABLE_ROLES)}"
        )

    # Check if user already exists
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists."
        )

    normalized_phone = normalize_phone_number(user_in.phone) if user_in.phone else None

    db_user = models.User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        organization_name=user_in.organization_name if user_in.role in ["organization", "hospital", "shelter", "donor"] else None,
        phone=normalized_phone
    )
    db.add(db_user)
    db.flush()

    # Role-specific operational / verification records are created at registration.
    if db_user.role == "organization":
        db.add(models.OrganizationVerification(organization_user_id=db_user.id))
    elif db_user.role == "hospital":
        db.add(models.HospitalStatus(
            user_id=db_user.id,
            hospital_name=db_user.organization_name or db_user.full_name
        ))
    elif db_user.role == "shelter":
        db.add(models.ShelterStatus(
            user_id=db_user.id,
            shelter_name=db_user.organization_name or db_user.full_name
        ))
    elif db_user.role == "volunteer":
        db.add(models.VolunteerProfile(user_id=db_user.id))
    elif db_user.role == "beneficiary":
        db.add(models.BeneficiaryProfile(
            user_id=db_user.id,
            qr_code=f"BEN-{db_user.id:06d}-{uuid.uuid4().hex[:10].upper()}"
        ))

    db.commit()
    db.refresh(db_user)

    # Send welcome SMS if phone number is provided
    if db_user.phone:
        send_sms(
            db_user.phone,
            f"[DisasterNet] Welcome {db_user.full_name}! Your {db_user.role.replace('_', ' ').title()} account has been registered successfully on DisasterNet."
        )

    token = create_access_token({"sub": db_user.id, "role": db_user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": db_user
    }


@router.post("/login", response_model=schemas.Token)
def login_user(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    identifier = credentials.email.strip().lower()
    # Keep the original email login, while also allowing the registered full
    # name.  This prevents an account created as e.g. "donor" from appearing
    # lost when the user enters that registered name on the sign-in page.
    user = db.query(models.User).filter(func.lower(models.User.email) == identifier).first()
    if not user:
        name_matches = db.query(models.User).filter(func.lower(models.User.full_name) == identifier).all()
        if len(name_matches) == 1:
            user = name_matches[0]
        elif len(name_matches) > 1:
            raise HTTPException(
                status_code=400,
                detail="More than one account uses this name. Please sign in with the registered email address."
            )

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/name or password."
        )

    token = create_access_token({"sub": user.id, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=schemas.UserResponse)
def get_my_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.delete("/me")
def delete_my_profile(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.delete(current_user)
    db.commit()
    return {"message": "User account deleted successfully"}

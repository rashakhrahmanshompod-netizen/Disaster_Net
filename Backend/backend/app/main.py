from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.database import Base, engine
from app.routers import auth_router, admin_router, disaster_router, inventory_router, hospital_router, shelter_router, operations_router, sms_router
from app.seed import seed_database

# Create DB tables
Base.metadata.create_all(bind=engine)

# Lightweight migration: add per-user bKash simulation columns if missing
with engine.connect() as conn:
    columns = [col["name"] for col in inspect(engine).get_columns("users")]
    if "bkash_sim_otp" not in columns:
        conn.execute(text("ALTER TABLE users ADD COLUMN bkash_sim_otp VARCHAR"))
        conn.commit()
    if "bkash_sim_pin" not in columns:
        conn.execute(text("ALTER TABLE users ADD COLUMN bkash_sim_pin VARCHAR"))
        conn.commit()

# Auto seed demo data
seed_database()

app = FastAPI(
    title="DisasterNet API",
    description="Backend API for DisasterNet - Intelligent Disaster Response, Field Operations, Donations and Public Service Coordination",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # Authentication uses an Authorization bearer token, not browser cookies.
    # Credentials must remain disabled when allowing all development origins.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(disaster_router.router)
app.include_router(inventory_router.router)
app.include_router(hospital_router.router)
app.include_router(shelter_router.router)
app.include_router(operations_router.router)
app.include_router(sms_router.router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": "DisasterNet — Intelligent Disaster Response and Resource Coordination System",
        "capabilities": ["Emergency Response", "Resource Logistics", "Volunteer Field Operations", "Campaign Transparency", "Public Service Management"],
        "documentation": "/docs"
    }

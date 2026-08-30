from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app import models
from app.auth import hash_password

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    # Check if seed users already exist
    if db.query(models.User).filter(models.User.email == "admin@disasternet.gov.bd").first():
        db.close()
        return

    print("Seeding DisasterNet database with demo data...")

    # 1. Seed Users (4 roles)
    demo_users = [
        models.User(
            email="admin@disasternet.gov.bd",
            hashed_password=hash_password("admin123"),
            full_name="Super Administrator",
            role="admin",
            organization_name="DisasterNet HQ",
            phone="+8801700000001"
        ),
        models.User(
            email="govt@disasternet.gov.bd",
            hashed_password=hash_password("govt123"),
            full_name="Director General (DDM Bangladesh)",
            role="government",
            organization_name="Department of Disaster Management",
            phone="+8801700000002"
        ),
        models.User(
            email="ngo@redcrescent.org.bd",
            hashed_password=hash_password("ngo123"),
            full_name="Bangladesh Red Crescent Society",
            role="organization",
            organization_name="BD Red Crescent Society",
            phone="+8801700000003"
        ),
        models.User(
            email="citizen@gmail.com",
            hashed_password=hash_password("citizen123"),
            full_name="Rafiqul Islam (Donor / Citizen)",
            role="donor",
            organization_name=None,
            phone="+8801811223344"
        ),
    ]
    db.add_all(demo_users)
    db.commit()

    # 2. Seed Disaster Events (Module 1)
    demo_disasters = [
        models.DisasterEvent(
            title="Flash Floods in Sylhet & Sunamganj",
            disaster_type="Flood",
            severity="Critical",
            affected_districts="Sylhet, Sunamganj, Netrokona, Habiganj",
            expected_duration="14 Days",
            status="Active",
            declared_by="Director General (DDM Bangladesh)",
            lat=24.8949,
            lng=91.8687
        ),
        models.DisasterEvent(
            title="Cyclone Remal Coastal Surge",
            disaster_type="Cyclone",
            severity="High",
            affected_districts="Khulna, Bagerhat, Satkhira, Patuakhali",
            expected_duration="7 Days",
            status="Active",
            declared_by="Director General (DDM Bangladesh)",
            lat=22.8456,
            lng=89.5403
        ),
        models.DisasterEvent(
            title="Severe Heatwave Warning in Rajshahi",
            disaster_type="Severe Heatwave",
            severity="Medium",
            affected_districts="Rajshahi, Chapainawabganj, Pabna",
            expected_duration="5 Days",
            status="Contained",
            declared_by="Director General (DDM Bangladesh)",
            lat=24.3636,
            lng=88.6241
        ),
    ]
    db.add_all(demo_disasters)
    db.commit()

    # 3. Seed Emergency Alerts (Module 1)
    demo_alerts = [
        models.EmergencyAlert(
            title="EVACUATION ALERT: Sylhet Sadar & Sunamganj Low-Lying Areas",
            message="River levels at Kanaighat and Sunamganj points are 1.2m above danger level. Citizens are urgently requested to move to high-altitude disaster shelters immediately.",
            alert_level="Evacuation",
            affected_area="Sylhet & Sunamganj Districts",
            published_by="Director General (DDM Bangladesh)"
        ),
        models.EmergencyAlert(
            title="Severe Weather Warning: Coastal Gale & Storm Surge",
            message="Wind speeds reaching up to 90 km/h in Bay of Bengal. Fishing boats instructed to return to coastline immediately.",
            alert_level="Severe",
            affected_area="Southern Coastal Belt",
            published_by="Director General (DDM Bangladesh)"
        ),
    ]
    db.add_all(demo_alerts)
    db.commit()

    # 4. Seed Warehouse Inventories (Module 2)
    demo_inventories = [
        models.InventoryItem(
            organization_name="BD Red Crescent Society",
            item_name="Oral Rehydration Salt (ORS) Packs",
            category="Medicine",
            quantity=15000.0,
            unit="boxes",
            minimum_threshold=2000.0,
            warehouse_location="Sylhet Central Warehouse",
            warehouse_lat=24.8949,
            warehouse_lng=91.8687
        ),
        models.InventoryItem(
            organization_name="BD Red Crescent Society",
            item_name="Purified Water Drums (20L)",
            category="Water",
            quantity=350.0,
            unit="liters",
            minimum_threshold=500.0,  # LOW STOCK
            warehouse_location="Sylhet Central Warehouse",
            warehouse_lat=24.8949,
            warehouse_lng=91.8687
        ),
        models.InventoryItem(
            organization_name="BD Red Crescent Society",
            item_name="Dry Rations & Rice Bags (10kg)",
            category="Food",
            quantity=4200.0,
            unit="kits",
            minimum_threshold=1000.0,
            warehouse_location="Khulna Relief Depot",
            warehouse_lat=22.8456,
            warehouse_lng=89.5403
        ),
        models.InventoryItem(
            organization_name="DisasterNet HQ",
            item_name="Thermal Waterproof Blankets",
            category="Blankets",
            quantity=180.0,
            unit="units",
            minimum_threshold=300.0,  # LOW STOCK
            warehouse_location="Dhaka Emergency Logistics Center",
            warehouse_lat=23.8103,
            warehouse_lng=90.4125
        ),
        models.InventoryItem(
            organization_name="DisasterNet HQ",
            item_name="Heavy-Duty Diesel Generators 50kW",
            category="Generators",
            quantity=12.0,
            unit="units",
            minimum_threshold=5.0,
            warehouse_location="Dhaka Emergency Logistics Center",
            warehouse_lat=23.8103,
            warehouse_lng=90.4125
        ),
    ]
    db.add_all(demo_inventories)
    db.commit()

    # 5. Seed Emergency Resource Requests (Module 2)
    demo_requests = [
        models.ResourceRequest(
            requester_name="Sunamganj Emergency Shelter #4",
            requester_email="shelter4.sunamganj@gov.bd",
            requester_role="government",
            item_category="Water",
            item_name="Purified Drinking Water Drums",
            quantity=200.0,
            unit="liters",
            priority="Critical",
            status="In-Transit",
            destination_address="Sunamganj Sadar Shelter, Sunamganj",
            destination_lat=25.0658,
            destination_lng=91.3950,
            assigned_warehouse="BD Red Crescent Society (Sylhet Central Warehouse)",
            assigned_vehicle="Relief Truck Unit #102",
            estimated_distance_km=42.3,
            estimated_arrival_minutes=55
        ),
        models.ResourceRequest(
            requester_name="Sylhet M.A.G. Osmani Medical College Hospital",
            requester_email="osmani.hospital@sylhet.gov.bd",
            requester_role="donor",
            item_category="Medicine",
            item_name="Water Purification Tablets & Cholera Vaccine Kits",
            quantity=500.0,
            unit="boxes",
            priority="High",
            status="Pending",
            destination_address="Medical Road, Sylhet 3100",
            destination_lat=24.9000,
            destination_lng=91.8600
        ),
    ]
    db.add_all(demo_requests)
    db.commit()

    db.close()
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_database()

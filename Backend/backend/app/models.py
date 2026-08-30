from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import random


def _random_otp():
    return str(random.randint(100000, 999999))


def _random_pin():
    return str(random.randint(10000, 99999))


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "admin", "organization", "government", "hospital", "shelter"
    organization_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    bkash_sim_otp = Column(String, nullable=True, default=_random_otp)
    bkash_sim_pin = Column(String, nullable=True, default=_random_pin)


class OrganizationVerification(Base):
    __tablename__ = "organization_verifications"

    id = Column(Integer, primary_key=True, index=True)
    organization_user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    verification_status = Column(String, nullable=False, default="Pending")
    verified_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DisasterEvent(Base):
    __tablename__ = "disaster_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    disaster_type = Column(String, nullable=False)  # Flood, Cyclone, Earthquake, Landslide, Severe Heatwave
    severity = Column(String, nullable=False)  # Low, Medium, High, Critical
    affected_districts = Column(String, nullable=False)
    expected_duration = Column(String, nullable=False)
    status = Column(String, default="Active")  # Active, Contained, Resolved
    declared_by = Column(String, nullable=False)
    lat = Column(Float, nullable=False, default=23.8103)
    lng = Column(Float, nullable=False, default=90.4125)
    created_at = Column(DateTime, default=datetime.utcnow)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    organization_name = Column(String, nullable=False)
    item_name = Column(String, nullable=False)
    category = Column(String, nullable=False)  # Food, Water, Medicine, Blankets, Generators, Shelter Gear
    quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String, nullable=False)  # kg, liters, units, boxes, kits
    minimum_threshold = Column(Float, nullable=False, default=50.0)
    warehouse_location = Column(String, nullable=False)
    warehouse_lat = Column(Float, nullable=False, default=23.8103)
    warehouse_lng = Column(Float, nullable=False, default=90.4125)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ResourceRequest(Base):
    __tablename__ = "resource_requests"

    id = Column(Integer, primary_key=True, index=True)
    requester_name = Column(String, nullable=False)
    requester_email = Column(String, nullable=False)
    requester_role = Column(String, nullable=False)
    item_category = Column(String, nullable=False)
    item_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    priority = Column(String, default="Medium")  # Low, Medium, High, Critical
    status = Column(String, default="Pending")  # Pending, Approved, In-Transit, Delivered, Rejected
    destination_address = Column(String, nullable=False)
    destination_lat = Column(Float, default=23.8103)
    destination_lng = Column(Float, default=90.4125)
    assigned_warehouse = Column(String, nullable=True)
    assigned_vehicle = Column(String, nullable=True)
    estimated_distance_km = Column(Float, nullable=True)
    estimated_arrival_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmergencyAlert(Base):
    __tablename__ = "emergency_alerts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    alert_level = Column(String, nullable=False)  # Warning, Severe, Evacuation, Information
    affected_area = Column(String, nullable=False)
    published_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# --- Emergency Resource Request: Hospital role ---
class HospitalStatus(Base):
    __tablename__ = "hospital_statuses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    hospital_name = Column(String, nullable=False)
    current_patients = Column(Integer, nullable=False, default=0)
    critical_patients = Column(Integer, nullable=False, default=0)
    new_emergency_patients = Column(Integer, nullable=False, default=0)
    total_beds = Column(Integer, nullable=False, default=0)
    occupied_beds = Column(Integer, nullable=False, default=0)
    emergency_beds = Column(Integer, nullable=False, default=0)
    staff_on_duty = Column(Integer, nullable=False, default=0)
    ambulances_available = Column(Integer, nullable=False, default=0)
    emergency_capacity_status = Column(String, nullable=False, default="Available")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HospitalExpenditure(Base):
    __tablename__ = "hospital_expenditures"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hospital_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=False)
    report_period = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# --- Emergency Resource Request: Disaster Shelter role ---
class ShelterStatus(Base):
    __tablename__ = "shelter_statuses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    shelter_name = Column(String, nullable=False)
    total_capacity = Column(Integer, nullable=False, default=0)
    current_occupancy = Column(Integer, nullable=False, default=0)
    occupancy_status = Column(String, nullable=False, default="Available")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShelterResource(Base):
    __tablename__ = "shelter_resources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    shelter_name = Column(String, nullable=False)
    item_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String, nullable=False)
    minimum_threshold = Column(Float, nullable=False, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShelterShortage(Base):
    __tablename__ = "shelter_shortages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    shelter_name = Column(String, nullable=False)
    item_name = Column(String, nullable=False)
    required_quantity = Column(Float, nullable=False)
    available_quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String, nullable=False)
    severity = Column(String, nullable=False, default="High")
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="Open")
    created_at = Column(DateTime, default=datetime.utcnow)


class ShelterDistribution(Base):
    __tablename__ = "shelter_distributions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    shelter_name = Column(String, nullable=False)
    resource_id = Column(Integer, ForeignKey("shelter_resources.id"), nullable=True)
    item_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    recipient_group = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    distributed_at = Column(DateTime, default=datetime.utcnow)

# --- Volunteer & Field Operations ---
class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    nid_number = Column(String, nullable=True)
    profession = Column(String, nullable=True)
    skills = Column(Text, nullable=False, default="")
    availability = Column(String, nullable=False, default="Available")
    district = Column(String, nullable=True)
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)
    identity_document = Column(String, nullable=True)
    verification_status = Column(String, nullable=False, default="Pending")
    verified_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VolunteerMission(Base):
    __tablename__ = "volunteer_missions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    mission_type = Column(String, nullable=False)
    disaster_id = Column(Integer, ForeignKey("disaster_events.id"), nullable=True)
    location = Column(String, nullable=False)
    required_skills = Column(Text, nullable=True)
    description = Column(Text, nullable=False)
    assigned_volunteer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_by_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Assigned")
    created_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class FieldReport(Base):
    __tablename__ = "field_reports"

    id = Column(Integer, primary_key=True, index=True)
    volunteer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    mission_id = Column(Integer, ForeignKey("volunteer_missions.id"), nullable=True)
    report_type = Column(String, nullable=False, default="Field")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    photo_file = Column(String, nullable=True)
    summary = Column(Text, nullable=False)
    rescued_people = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# --- Citizen / Beneficiary Assistance ---
class BeneficiaryProfile(Base):
    __tablename__ = "beneficiary_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    qr_code = Column(String, unique=True, nullable=False, index=True)
    family_size = Column(Integer, nullable=False, default=1)
    district = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    vulnerability_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AssistanceRequest(Base):
    __tablename__ = "assistance_requests"

    id = Column(Integer, primary_key=True, index=True)
    beneficiary_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    disaster_id = Column(Integer, ForeignKey("disaster_events.id"), nullable=True)
    request_type = Column(String, nullable=False)
    details = Column(Text, nullable=False)
    family_size = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default="Pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SOSRequest(Base):
    __tablename__ = "sos_requests"

    id = Column(Integer, primary_key=True, index=True)
    beneficiary_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    location = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="Active")
    created_at = Column(DateTime, default=datetime.utcnow)


class AidDistribution(Base):
    __tablename__ = "aid_distributions"

    id = Column(Integer, primary_key=True, index=True)
    beneficiary_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    beneficiary_qr = Column(String, nullable=False, index=True)
    volunteer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    mission_id = Column(Integer, ForeignKey("volunteer_missions.id"), nullable=True)
    aid_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    confirmed_by_beneficiary = Column(Integer, nullable=False, default=0)
    distributed_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)


# --- Campaigns, Donations, Transparency & Public Service ---
class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    organization_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    organization_name = Column(String, nullable=False)
    disaster_id = Column(Integer, ForeignKey("disaster_events.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    target_amount = Column(Float, nullable=False)
    collected_amount = Column(Float, nullable=False, default=0.0)
    utilized_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="Active")
    created_at = Column(DateTime, default=datetime.utcnow)
    end_date = Column(String, nullable=True)


class CampaignAllocation(Base):
    __tablename__ = "campaign_allocations"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Donation(Base):
    __tablename__ = "donations"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    donor_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    donor_name = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    bkash_account_masked = Column(String, nullable=False)
    tracking_id = Column(String, unique=True, nullable=False, index=True)
    bkash_transaction_id = Column(String, unique=True, nullable=False, index=True)
    payment_status = Column(String, nullable=False, default="Completed")
    created_at = Column(DateTime, default=datetime.utcnow)


class DonationUtilization(Base):
    __tablename__ = "donation_utilizations"

    id = Column(Integer, primary_key=True, index=True)
    donation_id = Column(Integer, ForeignKey("donations.id"), nullable=False, index=True)
    tracking_id = Column(String, nullable=False, index=True)
    donor_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    donor_name = Column(String, nullable=False)
    volunteer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    volunteer_name = Column(String, nullable=False)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    campaign_title = Column(String, nullable=False)
    mission_id = Column(Integer, ForeignKey("volunteer_missions.id"), nullable=True, index=True)
    mission_title = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BkashPayment(Base):
    __tablename__ = "bkash_payments"

    id = Column(Integer, primary_key=True, index=True)
    donation_id = Column(Integer, ForeignKey("donations.id"), unique=True, nullable=False, index=True)
    payment_id = Column(String, unique=True, nullable=True, index=True)
    merchant_invoice_number = Column(String, unique=True, nullable=False, index=True)
    payer_reference = Column(String, nullable=False)
    bkash_url = Column(Text, nullable=True)
    transaction_status = Column(String, nullable=False, default="Initiated")
    status_code = Column(String, nullable=True)
    status_message = Column(Text, nullable=True)
    create_response = Column(Text, nullable=True)
    execute_response = Column(Text, nullable=True)
    query_response = Column(Text, nullable=True)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BkashRefund(Base):
    __tablename__ = "bkash_refunds"

    id = Column(Integer, primary_key=True, index=True)
    donation_id = Column(Integer, ForeignKey("donations.id"), nullable=False, index=True)
    payment_id = Column(String, nullable=False, index=True)
    original_trx_id = Column(String, nullable=False, index=True)
    refund_trx_id = Column(String, unique=True, nullable=True, index=True)
    amount = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="Initiated")
    reason = Column(Text, nullable=False)
    sku = Column(String, nullable=False)
    response_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ComplaintFeedback(Base):
    __tablename__ = "complaints_feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    submitted_by = Column(String, nullable=False)
    user_role = Column(String, nullable=False)
    submission_type = Column(String, nullable=False, default="Complaint")
    category = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="Submitted")
    official_response = Column(Text, nullable=True)
    reviewed_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FraudAlert(Base):
    __tablename__ = "fraud_alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, nullable=False)
    severity = Column(String, nullable=False, default="Medium")
    description = Column(Text, nullable=False)
    related_reference = Column(String, nullable=True)
    status = Column(String, nullable=False, default="Open")
    created_at = Column(DateTime, default=datetime.utcnow)


class SMSOTPStore(Base):
    __tablename__ = "sms_otp_store"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, nullable=False, index=True)
    otp = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

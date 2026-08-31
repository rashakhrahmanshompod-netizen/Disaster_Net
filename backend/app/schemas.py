from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime

# --- Auth & User Schemas ---
class UserRegister(BaseModel):
    email: str
    password: str
    full_name: str
    role: str  # admin, organization, government, hospital, shelter, volunteer, donor, beneficiary
    organization_name: Optional[str] = None
    phone: Optional[str] = None

    @field_validator('email')
    @classmethod
    def email_must_have_at(cls, v):
        if '@' not in v:
            raise ValueError('Invalid email address')
        return v.lower().strip()

    @field_validator('password')
    @classmethod
    def password_minimum_length(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator('email')
    @classmethod
    def email_lower(cls, v):
        return v.lower().strip()

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    organization_name: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class UserWithPasswordResponse(UserResponse):
    hashed_password: str

class OrganizationVerificationResponse(BaseModel):
    id: int
    organization_user_id: int
    organization_name: Optional[str] = None
    full_name: str
    email: str
    phone: Optional[str] = None
    verification_status: str
    verified_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# --- Disaster Schemas ---
class DisasterCreate(BaseModel):
    title: str
    disaster_type: str
    severity: str
    affected_districts: str
    expected_duration: str
    lat: Optional[float] = 23.8103
    lng: Optional[float] = 90.4125

class DisasterResponse(DisasterCreate):
    id: int
    status: str
    declared_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Inventory Schemas ---
class InventoryItemCreate(BaseModel):
    item_name: str
    category: str
    quantity: float = Field(ge=0)
    unit: str
    minimum_threshold: float = Field(ge=0)
    warehouse_location: str
    warehouse_lat: Optional[float] = 23.8103
    warehouse_lng: Optional[float] = 90.4125

class InventoryItemUpdate(BaseModel):
    quantity: Optional[float] = Field(default=None, ge=0)
    minimum_threshold: Optional[float] = Field(default=None, ge=0)
    warehouse_location: Optional[str] = None

class InventoryItemResponse(InventoryItemCreate):
    id: int
    organization_name: str
    updated_at: datetime
    is_low_stock: bool = False

    model_config = {"from_attributes": True}


# --- Resource Request Schemas ---
class ResourceRequestCreate(BaseModel):
    item_category: str
    item_name: str
    quantity: float = Field(gt=0)
    unit: str
    priority: str
    destination_address: str
    destination_lat: Optional[float] = 23.8103
    destination_lng: Optional[float] = 90.4125

class DispatchOptimizationInput(BaseModel):
    warehouse_id: int
    distance_meters: float = Field(gt=0)
    duration_seconds: float = Field(gt=0)
    provider: str = "Google Distance Matrix API"


class ResourceRequestResponse(ResourceRequestCreate):
    id: int
    requester_name: str
    requester_email: str
    requester_role: str
    status: str
    assigned_warehouse: Optional[str] = None
    assigned_vehicle: Optional[str] = None
    estimated_distance_km: Optional[float] = None
    estimated_arrival_minutes: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Emergency Alert Schemas ---
class EmergencyAlertCreate(BaseModel):
    title: str
    message: str
    alert_level: str
    affected_area: str

class EmergencyAlertResponse(EmergencyAlertCreate):
    id: int
    published_by: str
    created_at: datetime

    model_config = {"from_attributes": True}

# --- Hospital Role Schemas ---
class HospitalPatientStatisticsUpdate(BaseModel):
    current_patients: int = Field(ge=0)
    critical_patients: int = Field(ge=0)
    new_emergency_patients: int = Field(ge=0)


class HospitalCapacityUpdate(BaseModel):
    total_beds: int = Field(ge=0)
    occupied_beds: int = Field(ge=0)
    emergency_beds: int = Field(ge=0)
    staff_on_duty: int = Field(ge=0)
    ambulances_available: int = Field(ge=0)
    emergency_capacity_status: str = "Available"


class HospitalStatusResponse(BaseModel):
    id: int
    user_id: int
    hospital_name: str
    current_patients: int
    critical_patients: int
    new_emergency_patients: int
    total_beds: int
    occupied_beds: int
    emergency_beds: int
    staff_on_duty: int
    ambulances_available: int
    emergency_capacity_status: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class HospitalExpenditureCreate(BaseModel):
    category: str
    amount: float = Field(gt=0)
    description: str
    report_period: Optional[str] = None


class HospitalExpenditureResponse(HospitalExpenditureCreate):
    id: int
    user_id: int
    hospital_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Disaster Shelter Role Schemas ---
class ShelterCapacityUpdate(BaseModel):
    total_capacity: int = Field(ge=0)


class ShelterOccupancyUpdate(BaseModel):
    current_occupancy: int = Field(ge=0)
    occupancy_status: Optional[str] = None


class ShelterStatusResponse(BaseModel):
    id: int
    user_id: int
    shelter_name: str
    total_capacity: int
    current_occupancy: int
    occupancy_status: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShelterResourceCreate(BaseModel):
    item_name: str
    category: str
    quantity: float = Field(ge=0)
    unit: str
    minimum_threshold: float = Field(default=0, ge=0)


class ShelterResourceUpdate(BaseModel):
    quantity: Optional[float] = Field(default=None, ge=0)
    minimum_threshold: Optional[float] = Field(default=None, ge=0)


class ShelterResourceResponse(ShelterResourceCreate):
    id: int
    user_id: int
    shelter_name: str
    updated_at: datetime
    is_low_stock: bool = False

    model_config = {"from_attributes": True}


class ShelterShortageCreate(BaseModel):
    item_name: str
    required_quantity: float = Field(gt=0)
    available_quantity: float = Field(default=0, ge=0)
    unit: str
    severity: str = "High"
    notes: Optional[str] = None


class ShelterShortageResponse(ShelterShortageCreate):
    id: int
    user_id: int
    shelter_name: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ShelterDistributionCreate(BaseModel):
    resource_id: int
    quantity: float = Field(gt=0)
    recipient_group: str
    notes: Optional[str] = None


class ShelterDistributionResponse(BaseModel):
    id: int
    user_id: int
    shelter_name: str
    resource_id: Optional[int] = None
    item_name: str
    quantity: float
    unit: str
    recipient_group: str
    notes: Optional[str] = None
    distributed_at: datetime

    model_config = {"from_attributes": True}

# --- Volunteer & Field Operations Schemas ---
class VolunteerProfileUpdate(BaseModel):
    nid_number: Optional[str] = None
    profession: Optional[str] = None
    skills: str = ""
    availability: str = "Available"
    district: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class VolunteerProfileResponse(VolunteerProfileUpdate):
    id: int
    user_id: int
    identity_document: Optional[str] = None
    verification_status: str
    verified_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    model_config = {"from_attributes": True}


class MissionCreate(BaseModel):
    title: str
    mission_type: str
    disaster_id: Optional[int] = None
    location: str
    required_skills: Optional[str] = None
    description: str
    assigned_volunteer_id: int


class MissionStatusUpdate(BaseModel):
    status: str


class MissionResponse(BaseModel):
    id: int
    title: str
    mission_type: str
    disaster_id: Optional[int] = None
    location: str
    required_skills: Optional[str] = None
    description: str
    assigned_volunteer_id: int
    assigned_by_user_id: int
    assigned_by_name: str
    status: str
    created_at: datetime
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AidDistributionCreate(BaseModel):
    beneficiary_qr: str
    mission_id: Optional[int] = None
    aid_type: str
    quantity: float = Field(gt=0)
    unit: str
    notes: Optional[str] = None


class AidDistributionResponse(BaseModel):
    id: int
    beneficiary_user_id: int
    beneficiary_qr: str
    volunteer_user_id: int
    mission_id: Optional[int] = None
    aid_type: str
    quantity: float
    unit: str
    notes: Optional[str] = None
    confirmed_by_beneficiary: int
    distributed_at: datetime
    confirmed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FieldReportResponse(BaseModel):
    id: int
    volunteer_user_id: int
    mission_id: Optional[int] = None
    report_type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_file: Optional[str] = None
    summary: str
    rescued_people: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Beneficiary Schemas ---
class BeneficiaryProfileUpdate(BaseModel):
    family_size: int = Field(default=1, ge=1)
    district: Optional[str] = None
    address: Optional[str] = None
    vulnerability_notes: Optional[str] = None


class BeneficiaryProfileResponse(BeneficiaryProfileUpdate):
    id: int
    user_id: int
    qr_code: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssistanceRequestCreate(BaseModel):
    disaster_id: Optional[int] = None
    request_type: str
    details: str
    family_size: int = Field(default=1, ge=1)


class AssistanceRequestResponse(AssistanceRequestCreate):
    id: int
    beneficiary_user_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SOSCreate(BaseModel):
    message: str
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class SOSResponse(SOSCreate):
    id: int
    beneficiary_user_id: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Campaign, Donation, Transparency & Complaint Schemas ---
class CampaignCreate(BaseModel):
    disaster_id: Optional[int] = None
    title: str
    description: str
    target_amount: float = Field(gt=0)
    end_date: Optional[str] = None


class CampaignResponse(CampaignCreate):
    id: int
    organization_user_id: int
    organization_name: str
    collected_amount: float
    utilized_amount: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CampaignAllocationCreate(BaseModel):
    category: str
    amount: float = Field(gt=0)
    description: str


class CampaignAllocationResponse(CampaignAllocationCreate):
    id: int
    campaign_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DonationCreate(BaseModel):
    campaign_id: int
    amount: float = Field(gt=0)
    bkash_number: str

    @field_validator('bkash_number')
    @classmethod
    def validate_bkash_number(cls, v):
        number = ''.join(ch for ch in v if ch.isdigit())
        if len(number) != 11 or not number.startswith('01'):
            raise ValueError('Enter a valid 11-digit Bangladesh mobile number')
        return number


class DonationResponse(BaseModel):
    id: int
    campaign_id: int
    donor_user_id: int
    donor_name: str
    amount: float
    bkash_account_masked: str
    tracking_id: str
    bkash_transaction_id: str
    payment_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BkashPaymentCreate(BaseModel):
    campaign_id: int
    amount: float = Field(gt=0)


class BkashPaymentStartResponse(BaseModel):
    donation_id: int
    tracking_id: str
    payment_id: str
    bkash_url: str
    payment_status: str


class BkashSimulationOTP(BaseModel):
    otp: str

    @field_validator('otp')
    @classmethod
    def validate_otp(cls, v):
        value = ''.join(ch for ch in str(v) if ch.isdigit())
        if len(value) != 6:
            raise ValueError('Enter the 6-digit demo OTP')
        return value


class BkashSimulationPIN(BaseModel):
    pin: str

    @field_validator('pin')
    @classmethod
    def validate_pin(cls, v):
        value = ''.join(ch for ch in str(v) if ch.isdigit())
        if len(value) != 5:
            raise ValueError('Enter the 5-digit demo PIN')
        return value


class DonationHistoryResponse(DonationResponse):
    bkash_payment_id: Optional[str] = None
    refunded_amount: float = 0.0
    net_amount: float = 0.0
    utilized_amount: float = 0.0
    available_amount: float = 0.0


class DonationUtilizationCreate(BaseModel):
    donor_tracking_id: str
    mission_id: Optional[int] = None
    amount: float = Field(gt=0)
    notes: Optional[str] = None

    @field_validator('donor_tracking_id')
    @classmethod
    def tracking_required(cls, v):
        value = v.strip()
        if not value:
            raise ValueError('Donor QR / tracking ID is required')
        return value


class DonationUtilizationResponse(BaseModel):
    id: int
    donation_id: int
    tracking_id: str
    donor_user_id: int
    donor_name: str
    volunteer_user_id: int
    volunteer_name: str
    campaign_id: int
    campaign_title: str
    mission_id: Optional[int] = None
    mission_title: Optional[str] = None
    amount: float
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DonationRefundCreate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    reason: str = "Donor requested refund"

    @field_validator('reason')
    @classmethod
    def validate_reason(cls, v):
        value = v.strip()
        if not value:
            raise ValueError('Refund reason is required')
        if len(value) > 255:
            raise ValueError('Refund reason must be 255 characters or fewer')
        return value


class DonationRefundResponse(BaseModel):
    id: int
    donation_id: int
    refund_trx_id: Optional[str] = None
    amount: float
    status: str
    reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ComplaintCreate(BaseModel):
    submission_type: str = "Complaint"
    category: str
    subject: str
    description: str


class ComplaintReview(BaseModel):
    status: str
    official_response: Optional[str] = None


class ComplaintResponse(ComplaintCreate):
    id: int
    user_id: int
    submitted_by: str
    user_role: str
    status: str
    official_response: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FraudAlertResponse(BaseModel):
    id: int
    alert_type: str
    severity: str
    description: str
    related_reference: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- SMS (Twilio) Schemas ---
class SMSOTPSend(BaseModel):
    phone: str

    @field_validator('phone')
    @classmethod
    def phone_not_empty(cls, v):
        value = v.strip()
        if not value:
            raise ValueError('Phone number is required')
        return value


class SMSOTPVerify(BaseModel):
    phone: str
    otp: str

    @field_validator('otp')
    @classmethod
    def otp_format(cls, v):
        value = ''.join(ch for ch in str(v) if ch.isdigit())
        if len(value) != 6:
            raise ValueError('Enter the 6-digit OTP code')
        return value


class SMSTestSend(BaseModel):
    phone: str
    message: str

    @field_validator('phone')
    @classmethod
    def phone_required(cls, v):
        value = v.strip()
        if not value:
            raise ValueError('Phone number is required')
        return value

    @field_validator('message')
    @classmethod
    def message_required(cls, v):
        value = v.strip()
        if not value:
            raise ValueError('Message body is required')
        return value

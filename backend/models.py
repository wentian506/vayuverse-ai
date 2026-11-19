import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from .database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    auth_provider = Column(String(32), nullable=False, default="email")
    role = Column(String(48), nullable=False, default="individual")
    account_status = Column(String(32), nullable=False, default="active")
    onboarding_completed = Column(Boolean, nullable=False, default=False)
    reset_token_hash = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_login_at = Column(DateTime(timezone=True), nullable=True)


class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    full_name = Column(String(160), nullable=False)
    avatar_url = Column(Text, nullable=True)
    city = Column(String(120), nullable=False, default="Ludhiana")
    state = Column(String(120), nullable=False, default="Punjab")
    country = Column(String(80), nullable=False, default="India")
    coarse_lat = Column(Float, nullable=False, default=30.9010)
    coarse_lon = Column(Float, nullable=False, default=75.8573)
    preferred_language = Column(String(8), nullable=False, default="en")
    bio = Column(String(500), nullable=True, default="")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class UserPreference(Base):
    __tablename__ = "user_preferences"
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    aqi_alert_threshold = Column(Integer, nullable=False, default=150)
    notify_aqi_alerts = Column(Boolean, nullable=False, default=True)
    notify_forecast_spikes = Column(Boolean, nullable=False, default=True)
    notify_community_updates = Column(Boolean, nullable=False, default=True)
    notify_campus_alerts = Column(Boolean, nullable=False, default=False)
    notify_routine_reminders = Column(Boolean, nullable=False, default=True)
    coarse_location_only = Column(Boolean, nullable=False, default=True)
    routine_profiling_enabled = Column(Boolean, nullable=False, default=True)
    low_bandwidth_mode = Column(Boolean, nullable=False, default=False)
    reduced_motion = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class RoutineProfile(Base):
    __tablename__ = "routine_profiles"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    commute_start = Column(String(16), default="08:30")
    commute_end = Column(String(16), default="18:00")
    primary_transport = Column(String(48), default="ac_car")
    exercise_window = Column(String(32), default="06:30")
    has_indoor_purifier = Column(Boolean, default=True)
    schedule_blocks_json = Column(Text, default="[]")
    ventilation_checklist_json = Column(Text, default="[]")
    indoor_survey_json = Column(Text, default="{}")
    updated_at = Column(DateTime(timezone=True), default=utcnow)


class SavedLocation(Base):
    __tablename__ = "locations"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label = Column(String(120), nullable=False)
    city = Column(String(120), nullable=False)
    state = Column(String(120), nullable=True)
    country = Column(String(80), default="India")
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Household(Base):
    __tablename__ = "households"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    owner_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name = Column(String(140), nullable=False)
    city = Column(String(120), nullable=False)
    checklist_json = Column(Text, default="[]")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class HouseholdMember(Base):
    __tablename__ = "household_members"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    household_id = Column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    name = Column(String(120), nullable=False)
    relation = Column(String(64), nullable=False)
    age_group = Column(String(32), nullable=False)
    routine_window = Column(String(120), default="08:00 - 14:00")
    care_preference = Column(String(280), default="")
    aqi_threshold = Column(Integer, default=150)
    notify_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Institution(Base):
    __tablename__ = "institutions"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    institution_type = Column(String(64), default="University Campus")
    city = Column(String(120), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    is_demo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class CampusZone(Base):
    __tablename__ = "campus_zones"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    institution_id = Column(String(36), ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    zone_name = Column(String(140), nullable=False)
    zone_type = Column(String(64), nullable=False)
    capacity = Column(Integer, default=60)
    lat_offset = Column(Float, default=0.0)
    lon_offset = Column(Float, default=0.0)
    sensor_status = Column(String(32), default="online")
    pm25 = Column(Float, nullable=True)
    co2_ppm = Column(Integer, nullable=True)
    temp_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    ventilation_state = Column(String(64), default="HEPA Filtration Active")
    provenance = Column(String(32), default="MEASURED")
    is_demo = Column(Boolean, default=True)
    recorded_at = Column(DateTime(timezone=True), default=utcnow)


class CampusAdvisory(Base):
    __tablename__ = "campus_advisories"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    institution_id = Column(String(36), ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    author_name = Column(String(140), nullable=False)
    audience = Column(String(64), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    action_type = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class MonitoringStation(Base):
    __tablename__ = "monitoring_stations"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    station_code = Column(String(64), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    operator = Column(String(140), nullable=False)
    city = Column(String(120), nullable=False, index=True)
    state = Column(String(120), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    station_tier = Column(String(32), default="official_reference")
    pollutants_csv = Column(String(160), default="PM2.5,PM10,NO2,SO2,CO,O3")
    validation_status = Column(String(32), default="verified")


class SensorDevice(Base):
    __tablename__ = "sensor_devices"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    owner_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    device_code = Column(String(80), unique=True, nullable=False)
    display_name = Column(String(160), nullable=False)
    deployment_scope = Column(String(32), nullable=False, index=True)  # home_room | community
    room_type = Column(String(64), nullable=True)
    city = Column(String(120), nullable=False, index=True)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    trust_score = Column(Integer, default=88)
    validation_status = Column(String(32), default="calibrated")  # calibrated | needs_calibration | anomaly_flagged | manual_only
    anomaly_flag = Column(Boolean, default=False)
    filter_device_name = Column(String(120), nullable=True)
    filter_life_pct = Column(Integer, nullable=True)
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    sensor_id = Column(String(36), ForeignKey("sensor_devices.id", ondelete="CASCADE"), index=True)
    recorded_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    pm25 = Column(Float, nullable=True)
    pm10 = Column(Float, nullable=True)
    co2_ppm = Column(Integer, nullable=True)
    temp_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    entry_method = Column(String(32), default="manual")
    provenance = Column(String(32), default="USER REPORTED")
    notes = Column(String(280), default="")


class ModelVersion(Base):
    __tablename__ = "model_versions"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    model_code = Column(String(80), unique=True, nullable=False)
    provider = Column(String(140), nullable=False)
    version = Column(String(64), nullable=False)
    spatial_resolution_km = Column(Float, nullable=False)
    max_horizon_hours = Column(Integer, nullable=False)
    uncertainty_profile = Column(Text, nullable=False)
    limitations = Column(Text, nullable=False)
    active = Column(Boolean, default=True)


class RouteScenario(Base):
    __tablename__ = "route_scenarios"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scenario_type = Column(String(32), nullable=False)  # future_me | route_comparison
    title = Column(String(180), nullable=False)
    city = Column(String(120), nullable=False)
    input_json = Column(Text, nullable=False)
    result_json = Column(Text, nullable=False)
    exposure_delta_pct = Column(Float, nullable=True)
    emissions_delta_g = Column(Float, nullable=True)
    provenance = Column(String(32), default="ESTIMATED")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    module = Column(String(64), nullable=False)
    prompt_or_trigger = Column(Text, nullable=False)
    summary = Column(Text, nullable=False)
    inputs_json = Column(Text, default="{}")
    sources_json = Column(Text, default="[]")
    provenance = Column(String(32), default="AI SUMMARY")
    model_used = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class IncidentReport(Base):
    __tablename__ = "incident_reports"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    reporter_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reporter_alias = Column(String(80), default="Community Member")
    category = Column(String(64), nullable=False)
    severity = Column(String(24), default="moderate")
    description = Column(Text, nullable=False)
    city = Column(String(120), nullable=False, index=True)
    area_label = Column(String(160), nullable=False)
    approx_lat = Column(Float, nullable=False)
    approx_lon = Column(Float, nullable=False)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), default="Submitted", index=True)
    duplicate_of_id = Column(String(36), nullable=True)
    moderator_note = Column(Text, nullable=True)
    reviewed_by_name = Column(String(120), nullable=True)
    has_photo = Column(Boolean, default=False)
    provenance = Column(String(32), default="USER REPORTED")
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow)


class EvidenceAttachment(Base):
    __tablename__ = "evidence_attachments"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    incident_id = Column(String(36), ForeignKey("incident_reports.id", ondelete="CASCADE"), index=True)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(80), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    data_uri = Column(Text, nullable=False)
    exif_stripped = Column(Boolean, default=True)
    moderation_state = Column(String(32), default="pending")
    uploaded_at = Column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category = Column(String(48), nullable=False)
    severity = Column(String(24), default="info")
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    action_url = Column(String(200), nullable=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    consent_type = Column(String(64), nullable=False)
    granted = Column(Boolean, nullable=False)
    version = Column(String(24), default="v1.0")
    recorded_at = Column(DateTime(timezone=True), default=utcnow)


class ActionOutcome(Base):
    __tablename__ = "action_outcomes"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    action_category = Column(String(64), nullable=False)
    title = Column(String(200), nullable=False)
    estimated_exposure_saved_pct = Column(Float, default=0.0)
    estimated_co2_saved_g = Column(Float, default=0.0)
    status = Column(String(32), default="completed")
    completed_at = Column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    actor_user_id = Column(String(36), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(96), nullable=False)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(96), nullable=True)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    thread_id = Column(String(64), nullable=False, index=True)
    thread_title = Column(String(160), default="Air Intelligence Session")
    role = Column(String(16), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    sources_json = Column(Text, default="[]")
    reasoning_json = Column(Text, default="{}")
    model_used = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ContactInquiry(Base):
    __tablename__ = "contact_inquiries"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(140), nullable=False)
    email = Column(String(255), nullable=False)
    organization = Column(String(160), default="")
    category = Column(String(64), default="general")
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

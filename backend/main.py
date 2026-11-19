"""
VAYUVERSE AI — Production FastAPI Backend (REST API v1)
Covers authentication, onboarding, live air intelligence, pollution shadow, future me,
route comparison, AI daily replanner, VAYU Home, Family Air Guardian, VAYU Campus,
VAYU Community, Citizen Incident Reporting (with duplicate detection & photo attachments),
AI Response Agent, Alerts & Notifications, Trust & Sources, Reports & Analytics,
User Profile (consent, export, deletion), and Role-Gated Administration.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .ai_service import generate_grounded_response
from .aqi_engine import (
    ACTIVITY_VENTILATION_M3_PER_HR,
    INDIAN_CITIES,
    MASK_FACTOR,
    NAQI_BREAKPOINTS,
    TRANSPORT_FACTORS,
    compare_future_me,
    compare_routes,
    compute_ventilation_windows,
    fetch_live_air_bundle,
    fetch_multi_city_snapshot,
    fetch_pollution_shadow_grid,
    generate_replan_suggestions,
    haversine_km,
    resolve_city,
    resolve_location_async,
    reverse_geocode_live,
    search_cities_live,
)
from .database import Base, DB_BACKEND, SessionLocal, engine, get_db
from .models import (
    ActionOutcome,
    AuditLog,
    CampusAdvisory,
    CampusZone,
    ChatMessage,
    ConsentRecord,
    ContactInquiry,
    EvidenceAttachment,
    Household,
    HouseholdMember,
    IncidentReport,
    Institution,
    ModelVersion,
    MonitoringStation,
    Notification,
    Recommendation,
    RouteScenario,
    RoutineProfile,
    SavedLocation,
    SensorDevice,
    SensorReading,
    User,
    UserPreference,
    UserProfile,
)
from .seed import hash_password, provision_user_defaults, seed_platform_data, verify_password

AUTH_SECRET = os.getenv("AUTH_SECRET", "vayuverse-local-dev-secret-key-2026-32b")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "vayuverse-internal-sync-2026")
JWT_ALGO = "HS256"
TOKEN_EXPIRE_DAYS = 14

VALID_ROLES = {
    "individual",
    "family_caregiver",
    "campus_admin",
    "community_volunteer",
    "community_moderator",
    "civic_team",
    "research_user",
}
ADMIN_ROLES = {"community_moderator", "civic_team", "campus_admin"}
VALID_LANGUAGES = {"en", "hi", "pa"}
VALID_INCIDENT_STATUSES = {
    "Submitted",
    "Acknowledged",
    "Under Review",
    "Resolved",
    "Closed",
    "Unverified",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_platform_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="VAYUVERSE AI API",
    description="Predictive Air Intelligence & Community Response Platform — REST API v1",
    version="1.0.0",
    lifespan=lifespan,
)

raw_origins = ",".join(
    filter(
        None,
        [
            os.getenv("FRONTEND_URL", ""),
            os.getenv("CORS_ORIGINS", "http://localhost:3000"),
        ],
    )
)
origins = list(dict.fromkeys(o.strip().rstrip("/") for o in raw_origins.split(",") if o.strip()))
allow_vercel_previews = os.getenv("ALLOW_VERCEL_PREVIEWS", "true").strip().lower() in {
    "1",
    "true",
    "yes",
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if "*" not in origins else ["*"],
    allow_origin_regex=r"^https://[a-zA-Z0-9-]+\.vercel\.app$" if allow_vercel_previews and "*" not in origins else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth & Serializer Helpers
# ---------------------------------------------------------------------------
def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "onboarding_completed": user.onboarding_completed,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=TOKEN_EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, AUTH_SECRET, algorithm=JWT_ALGO)


def serialize_user(db: Session, user: User) -> Dict[str, Any]:
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        .count()
    )
    return {
        "id": user.id,
        "email": user.email,
        "auth_provider": user.auth_provider,
        "is_demo": user.auth_provider == "demo",
        "google_connected": bool(user.google_sub),
        "has_password": bool(user.password_hash),
        "role": user.role,
        "is_admin": user.role in ADMIN_ROLES,
        "account_status": user.account_status,
        "onboarding_completed": user.onboarding_completed,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "unread_notifications": unread,
        "profile": {
            "full_name": prof.full_name if prof else user.email.split("@")[0],
            "avatar_url": prof.avatar_url if prof else None,
            "city": prof.city if prof else "Ludhiana",
            "state": prof.state if prof else "Punjab",
            "country": prof.country if prof else "India",
            "coarse_lat": prof.coarse_lat if prof else 30.9010,
            "coarse_lon": prof.coarse_lon if prof else 75.8573,
            "preferred_language": prof.preferred_language if prof else "en",
            "bio": prof.bio if prof else "",
        },
        "preferences": {
            "aqi_alert_threshold": prefs.aqi_alert_threshold if prefs else 150,
            "notify_aqi_alerts": prefs.notify_aqi_alerts if prefs else True,
            "notify_forecast_spikes": prefs.notify_forecast_spikes if prefs else True,
            "notify_community_updates": prefs.notify_community_updates if prefs else True,
            "notify_campus_alerts": prefs.notify_campus_alerts if prefs else False,
            "notify_routine_reminders": prefs.notify_routine_reminders if prefs else True,
            "coarse_location_only": prefs.coarse_location_only if prefs else True,
            "routine_profiling_enabled": prefs.routine_profiling_enabled if prefs else True,
            "low_bandwidth_mode": prefs.low_bandwidth_mode if prefs else False,
            "reduced_motion": prefs.reduced_motion if prefs else False,
        },
        "routine": {
            "commute_start": routine.commute_start if routine else "08:30",
            "commute_end": routine.commute_end if routine else "18:30",
            "primary_transport": routine.primary_transport if routine else "ac_car",
            "exercise_window": routine.exercise_window if routine else "06:30",
            "has_indoor_purifier": routine.has_indoor_purifier if routine else False,
        },
    }


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, AUTH_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication session.")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or user.account_status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found or inactive.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authorised moderator, civic team, or campus administrator role required.",
        )
    return user


def log_audit(
    db: Session,
    user: Optional[User],
    action: str,
    target_type: str = "",
    target_id: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=user.id if user else None,
            actor_email=user.email if user else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_json=json.dumps(metadata or {}),
        )
    )


# ---------------------------------------------------------------------------
# Health & Public Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "service": "VAYUVERSE AI FastAPI Backend",
        "version": "1.1.0",
        "database_backend": DB_BACKEND,
        "curated_indian_cities": len(INDIAN_CITIES),
        "global_city_search": True,
        "interactive_map_click": True,
        "ai_llm_configured": bool(
            os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        ),
        "waqi_station_configured": bool(os.getenv("WAQI_API_TOKEN", "").strip()),
        "google_oauth_configured": bool(os.getenv("GOOGLE_CLIENT_ID", "").strip()),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/cities")
def list_cities():
    return {
        "cities": [
            {
                "city": c["city"],
                "state": c["state"],
                "country": c["country"],
                "region": c.get("region", "India"),
                "lat": c["lat"],
                "lon": c["lon"],
                "nearest_station": c["nearest_station"],
                "operator": c["operator"],
                "corridors": c["corridors"],
            }
            for c in INDIAN_CITIES.values()
        ]
    }


@app.get("/api/v1/cities/search")
async def search_cities_endpoint(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=14, ge=1, le=30),
):
    """Live geocoding search across all Indian cities/towns/districts & worldwide locations."""
    results = await search_cities_live(q, limit=limit)
    return {
        "query": q,
        "count": len(results),
        "source": "Open-Meteo Geocoding API + VAYUVERSE India Reference Catalog",
        "results": results,
    }


@app.get("/api/v1/cities/reverse")
async def reverse_city_endpoint(
    lat: float = Query(..., ge=-85.0, le=85.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
):
    """Reverse-geocode any clicked map coordinate or browser GPS coordinate."""
    meta = await reverse_geocode_live(lat, lon)
    return {"location": meta}


@app.get("/api/v1/cities/resolve")
async def resolve_city_endpoint(
    city: str = Query(default="Ludhiana", max_length=120),
    lat: Optional[float] = Query(default=None, ge=-85.0, le=85.0),
    lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
):
    """Resolve full metadata & local corridors for any curated city, searched city, or map pin."""
    meta = await resolve_location_async(city_name=city, lat=lat, lon=lon)
    return {"location": meta}


class ContactPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=140)
    email: EmailStr
    organization: str = Field(default="", max_length=160)
    category: str = Field(default="general", max_length=64)
    message: str = Field(..., min_length=10, max_length=2000)


@app.post("/api/v1/contact")
def submit_contact(payload: ContactPayload, db: Session = Depends(get_db)):
    rec = ContactInquiry(
        name=payload.name.strip(),
        email=payload.email.lower(),
        organization=payload.organization.strip(),
        category=payload.category,
        message=payload.message.strip(),
    )
    db.add(rec)
    db.commit()
    return {"status": "received", "id": rec.id, "message": "Thank you — your message has been recorded by the VAYUVERSE team."}


# ---------------------------------------------------------------------------
# Authentication & Onboarding Endpoints
# ---------------------------------------------------------------------------
class RegisterPayload(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=140)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    city: str = Field(default="Ludhiana", max_length=120)
    consent_accepted: bool = True


class LoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class GoogleOAuthSyncPayload(BaseModel):
    google_sub: str = Field(..., min_length=3, max_length=255)
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=160)
    avatar_url: Optional[str] = None
    email_verified: bool = True


class ForgotPasswordPayload(BaseModel):
    email: EmailStr


class ResetPasswordPayload(BaseModel):
    email: EmailStr
    token: str = Field(..., min_length=6, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


@app.post("/api/v1/auth/register")
def register_user(payload: RegisterPayload, db: Session = Depends(get_db)):
    if not payload.consent_accepted:
        raise HTTPException(status_code=400, detail="Please accept the Privacy Policy and Terms to create an account.")
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        auth_provider="email",
        role="individual",
        onboarding_completed=False,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    provision_user_defaults(db, user, payload.full_name.strip(), city=payload.city)
    db.commit()
    db.refresh(user)
    token = create_access_token(user)
    return {"token": token, "is_new_user": True, "user": serialize_user(db, user)}


@app.post("/api/v1/auth/login")
def login_user(payload: LoginPayload, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash:
        if user and user.google_sub and not user.password_hash:
            raise HTTPException(
                status_code=400,
                detail="This account uses Google Sign-In. Please click 'Continue with Google'.",
            )
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    user.last_login_at = datetime.now(timezone.utc)
    log_audit(db, user, "auth.login", "user", user.id, {"method": "email"})
    db.commit()
    token = create_access_token(user)
    return {"token": token, "is_new_user": not user.onboarding_completed, "user": serialize_user(db, user)}


@app.post("/api/v1/auth/google-sync")
def google_oauth_sync(
    payload: GoogleOAuthSyncPayload,
    x_internal_secret: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called server-to-server by Next.js /api/auth/callback/google after verified Google token exchange."""
    if x_internal_secret != INTERNAL_API_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized internal sync call.")
    if not payload.email_verified:
        raise HTTPException(status_code=400, detail="Google account email is not verified.")

    email = payload.email.lower().strip()
    user = db.query(User).filter(User.google_sub == payload.google_sub).first()
    is_new = False

    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link verified Google identity to existing account
            user.google_sub = payload.google_sub
            if user.auth_provider == "email":
                user.auth_provider = "google+email"
            prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
            if prof and payload.avatar_url and not prof.avatar_url:
                prof.avatar_url = payload.avatar_url
        else:
            is_new = True
            user = User(
                email=email,
                google_sub=payload.google_sub,
                auth_provider="google",
                role="individual",
                onboarding_completed=False,
                last_login_at=datetime.now(timezone.utc),
            )
            db.add(user)
            db.flush()
            provision_user_defaults(
                db,
                user,
                full_name=payload.full_name.strip(),
                avatar_url=payload.avatar_url,
            )

    user.last_login_at = datetime.now(timezone.utc)
    log_audit(db, user, "auth.google_login", "user", user.id, {"is_new": is_new})
    db.commit()
    db.refresh(user)
    token = create_access_token(user)
    return {
        "token": token,
        "is_new_user": is_new or not user.onboarding_completed,
        "user": serialize_user(db, user),
    }


class DemoLoginPayload(BaseModel):
    city: str = Field(default="Ludhiana", max_length=120)
    language: str = Field(default="en", max_length=8)


def _purge_user_workspace(db: Session, target: User) -> None:
    """Remove all per-user records for an account or expired ephemeral demo session."""
    uid = target.id
    db.query(UserProfile).filter(UserProfile.user_id == uid).delete()
    db.query(UserPreference).filter(UserPreference.user_id == uid).delete()
    db.query(RoutineProfile).filter(RoutineProfile.user_id == uid).delete()
    db.query(SavedLocation).filter(SavedLocation.user_id == uid).delete()
    db.query(RouteScenario).filter(RouteScenario.user_id == uid).delete()
    db.query(Notification).filter(Notification.user_id == uid).delete()
    db.query(ConsentRecord).filter(ConsentRecord.user_id == uid).delete()
    db.query(ActionOutcome).filter(ActionOutcome.user_id == uid).delete()
    db.query(ChatMessage).filter(ChatMessage.user_id == uid).delete()
    db.query(Recommendation).filter(Recommendation.user_id == uid).delete()
    for hh in db.query(Household).filter(Household.owner_user_id == uid).all():
        db.query(HouseholdMember).filter(HouseholdMember.household_id == hh.id).delete()
        db.delete(hh)
    for dev in db.query(SensorDevice).filter(SensorDevice.owner_user_id == uid).all():
        db.query(SensorReading).filter(SensorReading.sensor_id == dev.id).delete()
        db.delete(dev)
    db.query(IncidentReport).filter(IncidentReport.reporter_user_id == uid).update(
        {"reporter_user_id": None, "reporter_alias": "Deleted Account"}
    )
    db.delete(target)


@app.post("/api/v1/auth/demo")
def start_demo_session(payload: DemoLoginPayload = DemoLoginPayload(), db: Session = Depends(get_db)):
    """Demo Mode is disabled by default; authentication uses real Email/Password or Google OAuth."""
    if os.getenv("ENABLE_DEMO_MODE", "false").strip().lower() not in {"1", "true", "yes", "on"}:
        raise HTTPException(status_code=403, detail="Demo Mode is disabled. Please sign in or create a free account.")

    now = datetime.now(timezone.utc)
    # Automatically clean up ephemeral demo sessions older than 24 hours
    cutoff = now - timedelta(hours=24)
    stale_demos = db.query(User).filter(User.auth_provider == "demo", User.created_at < cutoff).all()
    for stale in stale_demos:
        _purge_user_workspace(db, stale)

    meta = resolve_city(payload.city)
    lang = payload.language if payload.language in VALID_LANGUAGES else "en"
    demo_tag = secrets.token_hex(4)

    demo_user = User(
        email=f"guest-{demo_tag}@demo.vayuverse.app",
        password_hash=None,
        auth_provider="demo",
        role="individual",  # Strictly ordinary user — administrative endpoints stay blocked
        account_status="active",
        onboarding_completed=True,
        last_login_at=now,
    )
    db.add(demo_user)
    db.flush()

    provision_user_defaults(
        db,
        demo_user,
        full_name="Demo Explorer",
        city=meta["city"],
        language=lang,
    )

    prof = db.query(UserProfile).filter(UserProfile.user_id == demo_user.id).first()
    if prof:
        prof.bio = (
            "Interactive Demo Mode session — exploring live environmental data, 72h forecasts, "
            "scenario tools, and community intelligence in an isolated 24-hour guest workspace."
        )

    # Seed extra comparison locations & sample action/scenario entries so every dashboard view shines
    for extra_city, extra_label in [("New Delhi", "New Delhi — Commute Benchmark"), ("Chandigarh", "Chandigarh — Weekend Visit")]:
        if extra_city.lower() != meta["city"].lower():
            em = resolve_city(extra_city)
            db.add(
                SavedLocation(
                    user_id=demo_user.id,
                    label=extra_label,
                    city=em["city"],
                    state=em["state"],
                    country=em["country"],
                    lat=em["lat"],
                    lon=em["lon"],
                    is_primary=False,
                )
            )

    db.add_all(
        [
            ActionOutcome(
                user_id=demo_user.id,
                action_category="timing_shift",
                title="Demo sample: Shifted outdoor brisk walk to afternoon mixing window (14:00)",
                estimated_exposure_saved_pct=24.0,
                estimated_co2_saved_g=0.0,
            ),
            ActionOutcome(
                user_id=demo_user.id,
                action_category="low_emission_commute",
                title="Demo sample: Switched 8 km errand from solo car to public transit",
                estimated_exposure_saved_pct=14.5,
                estimated_co2_saved_g=920.0,
            ),
            RouteScenario(
                user_id=demo_user.id,
                scenario_type="future_me",
                title=f"Demo comparison: Morning 08:00 vs Afternoon 14:00 ({meta['city']})",
                city=meta["city"],
                input_json=json.dumps({"baseline_hour": 8, "adjusted_hour": 14, "mode": "metro", "is_demo": True}),
                result_json=json.dumps({"exposure_delta_pct": -22.5, "emissions_delta_g": -640.0, "provenance": "ESTIMATED"}),
                exposure_delta_pct=-22.5,
                emissions_delta_g=-640.0,
                provenance="ESTIMATED",
            ),
            Notification(
                user_id=demo_user.id,
                category="reminder",
                severity="info",
                title="Interactive Demo Mode Active",
                body=(
                    f"Welcome inside VAYUVERSE AI! Outdoor AQI and weather for {meta['city']} are fetched live from Open-Meteo, "
                    "while your profile and starter cards run in an isolated temporary demo sandbox. Sign in with Google or email anytime for a permanent account."
                ),
                action_url="/dashboard/trust",
                is_read=False,
            ),
        ]
    )

    log_audit(db, demo_user, "auth.demo_session_started", "user", demo_user.id, {"city": meta["city"], "is_demo": True})
    db.commit()
    db.refresh(demo_user)

    # 24-hour JWT expiry for demo sessions
    exp_ts = int((now + timedelta(hours=24)).timestamp())
    token = jwt.encode(
        {
            "sub": demo_user.id,
            "email": demo_user.email,
            "role": "individual",
            "provider": "demo",
            "is_demo": True,
            "iat": int(now.timestamp()),
            "exp": exp_ts,
        },
        AUTH_SECRET,
        algorithm=JWT_ALGO,
    )
    return {
        "token": token,
        "is_new_user": False,
        "is_demo": True,
        "user": serialize_user(db, demo_user),
    }


@app.post("/api/v1/auth/forgot-password")
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    dev_code = None
    if user:
        raw_token = secrets.token_urlsafe(9)[:12]
        user.reset_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        log_audit(db, user, "auth.password_reset_requested", "user", user.id)
        db.commit()
        # Only return sandbox code if SMTP is not configured
        if not os.getenv("SMTP_HOST"):
            dev_code = raw_token
    return {
        "status": "ok",
        "message": "If an account matches that email, a password reset code has been generated (valid for 30 minutes).",
        "sandbox_reset_code": dev_code,
    }


@app.post("/api/v1/auth/reset-password")
def reset_password(payload: ResetPasswordPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not user.reset_token_hash or not user.reset_token_expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code.")
    exp = user.reset_token_expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > exp:
        raise HTTPException(status_code=400, detail="Reset code expired. Please request a new one.")
    token_hash = hashlib.sha256(payload.token.strip().encode()).hexdigest()
    if not secrets.compare_digest(token_hash, user.reset_token_hash):
        raise HTTPException(status_code=400, detail="Invalid reset code.")
    user.password_hash = hash_password(payload.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    log_audit(db, user, "auth.password_reset_completed", "user", user.id)
    db.commit()
    return {"status": "ok", "message": "Password updated successfully. You may now sign in."}


@app.get("/api/v1/auth/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": serialize_user(db, user)}


class OnboardingPayload(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    avatar_url: Optional[str] = None
    city: str = Field(default="Ludhiana", max_length=120)
    preferred_language: str = Field(default="en")
    role: str = Field(default="individual")
    aqi_alert_threshold: int = Field(default=150, ge=50, le=450)
    notify_aqi_alerts: bool = True
    notify_forecast_spikes: bool = True
    notify_community_updates: bool = True
    commute_start: Optional[str] = "08:30"
    primary_transport: Optional[str] = "ac_car"
    exercise_window: Optional[str] = "06:30"
    has_indoor_purifier: Optional[bool] = False
    skip_routine: bool = False


@app.post("/api/v1/auth/onboarding")
def complete_onboarding(
    payload: OnboardingPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meta = resolve_city(payload.city)
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    if prof:
        prof.full_name = payload.full_name.strip()
        if payload.avatar_url is not None:
            prof.avatar_url = payload.avatar_url
        prof.city = meta["city"]
        prof.state = meta["state"]
        prof.coarse_lat = meta["lat"]
        prof.coarse_lon = meta["lon"]
        prof.preferred_language = payload.preferred_language if payload.preferred_language in VALID_LANGUAGES else "en"
        prof.updated_at = datetime.now(timezone.utc)

    # Allow self-selection of non-moderator roles freely; allow campus/volunteer/research/family/individual
    self_selectable = {"individual", "family_caregiver", "campus_admin", "community_volunteer", "research_user"}
    if payload.role in self_selectable:
        user.role = payload.role

    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if prefs:
        prefs.aqi_alert_threshold = payload.aqi_alert_threshold
        prefs.notify_aqi_alerts = payload.notify_aqi_alerts
        prefs.notify_forecast_spikes = payload.notify_forecast_spikes
        prefs.notify_community_updates = payload.notify_community_updates
        prefs.routine_profiling_enabled = not payload.skip_routine

    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    if routine and not payload.skip_routine:
        routine.commute_start = payload.commute_start or "08:30"
        routine.primary_transport = payload.primary_transport or "ac_car"
        routine.exercise_window = payload.exercise_window or "06:30"
        routine.has_indoor_purifier = bool(payload.has_indoor_purifier)

    # Update primary saved location
    prim = (
        db.query(SavedLocation)
        .filter(SavedLocation.user_id == user.id, SavedLocation.is_primary == True)  # noqa: E712
        .first()
    )
    if prim:
        prim.label = f"{meta['city']} (Primary)"
        prim.city = meta["city"]
        prim.state = meta["state"]
        prim.lat = meta["lat"]
        prim.lon = meta["lon"]

    user.onboarding_completed = True
    user.updated_at = datetime.now(timezone.utc)
    log_audit(db, user, "onboarding.completed", "user", user.id, {"city": meta["city"], "role": user.role})
    db.commit()
    token = create_access_token(user)
    return {"token": token, "user": serialize_user(db, user)}


# ---------------------------------------------------------------------------
# Module 1 & 2: Live Air Intelligence + Pollution Shadow
# ---------------------------------------------------------------------------
@app.get("/api/v1/air/live")
async def get_live_air(
    city: str = Query(default="Ludhiana", max_length=140),
    lat: Optional[float] = Query(default=None, ge=-85.0, le=85.0),
    lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
):
    return await fetch_live_air_bundle(city_name=city, lat=lat, lon=lon)


@app.get("/api/v1/air/point")
async def get_point_air(
    lat: float = Query(..., ge=-85.0, le=85.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    label: Optional[str] = Query(default=None, max_length=140),
):
    """Fetch live air quality, 6 pollutants, weather, 72h forecast & locality for any map click."""
    return await fetch_live_air_bundle(city_name=label or "", lat=lat, lon=lon)


@app.get("/api/v1/air/network")
async def get_air_network(db: Session = Depends(get_db)):
    snapshot = await fetch_multi_city_snapshot()
    stations = db.query(MonitoringStation).all()
    snapshot["reference_stations"] = [
        {
            "id": s.id,
            "code": s.station_code,
            "name": s.name,
            "operator": s.operator,
            "city": s.city,
            "state": s.state,
            "lat": s.lat,
            "lon": s.lon,
            "pollutants": s.pollutants_csv.split(","),
            "validation_status": s.validation_status,
        }
        for s in stations
    ]
    return snapshot


@app.get("/api/v1/air/pollution-shadow")
async def get_pollution_shadow(
    city: str = Query(default="Ludhiana", max_length=140),
    horizon_hours: int = Query(default=0, ge=0, le=71),
    lat: Optional[float] = Query(default=None, ge=-85.0, le=85.0),
    lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
):
    return await fetch_pollution_shadow_grid(city, horizon_hours, lat=lat, lon=lon)


# ---------------------------------------------------------------------------
# Module 3: Future Me Scenario Simulator
# ---------------------------------------------------------------------------
class ScenarioSpec(BaseModel):
    label: str = "Scenario"
    departure_hour: int = Field(default=8, ge=0, le=23)
    duration_min: int = Field(default=45, ge=5, le=480)
    setting: str = Field(default="outdoor")
    transport_mode: str = Field(default="two_wheeler")
    activity_level: str = Field(default="light")
    mask_type: str = Field(default="none")
    distance_km: float = Field(default=0.0, ge=0.0, le=250.0)


class FutureMeRequest(BaseModel):
    city: str = "Ludhiana"
    title: Optional[str] = None
    save: bool = False
    scenario_a: ScenarioSpec
    scenario_b: ScenarioSpec


@app.get("/api/v1/future-me/factors")
def get_future_me_factors():
    return {
        "transport_modes": TRANSPORT_FACTORS,
        "activity_levels": ACTIVITY_VENTILATION_M3_PER_HR,
        "mask_types": MASK_FACTOR,
    }


@app.post("/api/v1/future-me/compare")
async def post_future_me(
    payload: FutureMeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bundle = await fetch_live_air_bundle(payload.city)
    result = compare_future_me(payload.scenario_a.model_dump(), payload.scenario_b.model_dump(), bundle)
    saved_id = None
    if payload.save:
        title = payload.title or f"{payload.scenario_a.label} vs {payload.scenario_b.label} ({bundle['location']['city']})"
        sc = RouteScenario(
            user_id=user.id,
            scenario_type="future_me",
            title=title[:180],
            city=bundle["location"]["city"],
            input_json=json.dumps({"a": payload.scenario_a.model_dump(), "b": payload.scenario_b.model_dump()}),
            result_json=json.dumps(result),
            exposure_delta_pct=result["comparison"]["exposure_delta_pct"],
            emissions_delta_g=result["comparison"]["emissions_delta_g"],
            provenance="ESTIMATED",
        )
        db.add(sc)
        db.add(
            Recommendation(
                user_id=user.id,
                module="Future Me Simulator",
                prompt_or_trigger=title,
                summary=result["comparison"]["summary"],
                inputs_json=json.dumps({"city": payload.city, "live": bundle["is_live"]}),
                sources_json=json.dumps([bundle["provenance"]["air_quality_source"], "VAYU-EXPOSURE-SIM-V1"]),
                provenance="ESTIMATED",
                model_used="VAYU-EXPOSURE-SIM-V1 (Deterministic)",
            )
        )
        log_audit(db, user, "scenario.saved", "route_scenario", sc.id, {"type": "future_me"})
        db.commit()
        saved_id = sc.id
    result["saved_scenario_id"] = saved_id
    return result


@app.get("/api/v1/scenarios")
def list_user_scenarios(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(RouteScenario)
        .filter(RouteScenario.user_id == user.id)
        .order_by(RouteScenario.created_at.desc())
        .limit(30)
        .all()
    )
    return {
        "scenarios": [
            {
                "id": r.id,
                "scenario_type": r.scenario_type,
                "title": r.title,
                "city": r.city,
                "exposure_delta_pct": r.exposure_delta_pct,
                "emissions_delta_g": r.emissions_delta_g,
                "provenance": r.provenance,
                "created_at": r.created_at.isoformat(),
                "result": json.loads(r.result_json),
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# Module 4: Before-You-Go & Route Comparison
# ---------------------------------------------------------------------------
class PlacePoint(BaseModel):
    name: str
    lat: float
    lon: float


class RouteCompareRequest(BaseModel):
    city: str = "Ludhiana"
    origin: PlacePoint
    destination: PlacePoint
    departure_hour: int = Field(default=9, ge=0, le=23)
    transport_mode: str = Field(default="ac_car")
    save: bool = False


@app.post("/api/v1/routes/compare")
async def post_route_compare(
    payload: RouteCompareRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bundle = await fetch_live_air_bundle(payload.city)
    res = compare_routes(
        payload.origin.model_dump(),
        payload.destination.model_dump(),
        payload.departure_hour,
        payload.transport_mode,
        bundle,
    )
    if payload.save:
        title = f"{payload.origin.name} → {payload.destination.name} ({payload.departure_hour:02d}:00)"
        routes = res["routes"]
        best = min(r["exposure_conc_hours"] for r in routes)
        worst = max(r["exposure_conc_hours"] for r in routes)
        delta = round(((best - worst) / max(0.1, worst)) * 100.0, 1)
        sc = RouteScenario(
            user_id=user.id,
            scenario_type="route_comparison",
            title=title[:180],
            city=bundle["location"]["city"],
            input_json=json.dumps(payload.model_dump()),
            result_json=json.dumps(res),
            exposure_delta_pct=delta,
            emissions_delta_g=0.0,
            provenance="ESTIMATED",
        )
        db.add(sc)
        log_audit(db, user, "route.saved", "route_scenario", sc.id)
        db.commit()
        res["saved_scenario_id"] = sc.id
    return res


# ---------------------------------------------------------------------------
# Module 5: AI Daily Replanner
# ---------------------------------------------------------------------------
class ScheduleBlockPayload(BaseModel):
    title: str = Field(..., min_length=2, max_length=140)
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    duration_min: int = Field(default=40, ge=10, le=360)
    setting: str = Field(default="outdoor")
    transport: str = Field(default="walking")
    flexible: bool = True


class ApproveReplanPayload(BaseModel):
    block_id: str
    new_time: str
    new_setting: str
    new_transport: str
    estimated_reduction_pct: float = 0.0


@app.get("/api/v1/replanner")
async def get_replanner(
    city: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    target_city = city or (prof.city if prof else "Ludhiana")
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    blocks = json.loads(routine.schedule_blocks_json) if routine and routine.schedule_blocks_json else []
    bundle = await fetch_live_air_bundle(target_city)
    suggestions = generate_replan_suggestions(blocks, bundle)
    return {
        "city": bundle["location"]["city"],
        "is_live": bundle["is_live"],
        "current_aqi": bundle["current"]["indian_aqi"],
        "current_category": bundle["current"]["category"],
        "cleanest_window": bundle["comparison"]["cleanest_window"],
        "peak_window": bundle["comparison"]["peak_window"],
        "hourly_curve": bundle["forecast_72h"][:24],
        "blocks": blocks,
        "suggestions": suggestions,
    }


@app.post("/api/v1/replanner/blocks")
def add_schedule_block(
    payload: ScheduleBlockPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    if not routine:
        routine = RoutineProfile(user_id=user.id)
        db.add(routine)
    blocks = json.loads(routine.schedule_blocks_json or "[]")
    new_block = {
        "id": f"blk-{uuid.uuid4().hex[:8]}",
        "title": payload.title.strip(),
        "time": payload.time,
        "duration_min": payload.duration_min,
        "setting": payload.setting,
        "transport": payload.transport,
        "flexible": payload.flexible,
        "approved_shift": False,
    }
    blocks.append(new_block)
    blocks.sort(key=lambda b: b["time"])
    routine.schedule_blocks_json = json.dumps(blocks)
    log_audit(db, user, "replanner.block_added", "routine", routine.id, {"title": payload.title})
    db.commit()
    return {"blocks": blocks, "added": new_block}


@app.delete("/api/v1/replanner/blocks/{block_id}")
def delete_schedule_block(
    block_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    blocks = [b for b in json.loads(routine.schedule_blocks_json or "[]") if b.get("id") != block_id]
    routine.schedule_blocks_json = json.dumps(blocks)
    db.commit()
    return {"blocks": blocks}


@app.post("/api/v1/replanner/approve")
def approve_replan(
    payload: ApproveReplanPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Applies a suggested schedule change ONLY after explicit user approval."""
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found.")
    blocks = json.loads(routine.schedule_blocks_json or "[]")
    updated_title = None
    old_time = None
    for b in blocks:
        if b.get("id") == payload.block_id:
            old_time = b["time"]
            updated_title = b["title"]
            b["time"] = payload.new_time
            b["setting"] = payload.new_setting
            b["transport"] = payload.new_transport
            b["approved_shift"] = True
            break
    if not updated_title:
        raise HTTPException(status_code=404, detail="Schedule item not found.")
    blocks.sort(key=lambda b: b["time"])
    routine.schedule_blocks_json = json.dumps(blocks)
    co2_saved = 340.0 if payload.new_transport in ("metro_ev", "city_bus", "walking", "cycling") else 0.0
    db.add(
        ActionOutcome(
            user_id=user.id,
            action_category="replanner_approved",
            title=f"Approved replan: '{updated_title}' ({old_time} → {payload.new_time})",
            estimated_exposure_saved_pct=max(0.0, payload.estimated_reduction_pct),
            estimated_co2_saved_g=co2_saved,
        )
    )
    db.add(
        Recommendation(
            user_id=user.id,
            module="AI Daily Replanner",
            prompt_or_trigger=f"User-approved shift for {updated_title}",
            summary=f"Moved from {old_time} to {payload.new_time} ({payload.new_setting}) — ~{payload.estimated_reduction_pct}% lower forecast PM2.5.",
            provenance="ESTIMATED",
            model_used="VAYU-REPLANNER-V1",
        )
    )
    log_audit(db, user, "replanner.suggestion_approved", "routine", payload.block_id)
    db.commit()
    return {"status": "approved", "blocks": blocks}


# ---------------------------------------------------------------------------
# Module 6: VAYU Home (Indoor Air Dashboard)
# ---------------------------------------------------------------------------
class RoomCreatePayload(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=100)
    room_type: str = Field(default="bedroom")
    filter_device_name: Optional[str] = None
    filter_life_pct: Optional[int] = Field(default=None, ge=0, le=100)


class ManualReadingPayload(BaseModel):
    pm25: float = Field(..., ge=0, le=999)
    pm10: Optional[float] = Field(default=None, ge=0, le=1500)
    co2_ppm: Optional[int] = Field(default=None, ge=350, le=5000)
    temp_c: Optional[float] = Field(default=None, ge=-10, le=55)
    humidity_pct: Optional[float] = Field(default=None, ge=0, le=100)
    entry_method: str = Field(default="manual")
    notes: str = Field(default="", max_length=240)


class SurveyPayload(BaseModel):
    cooking_fuel: str
    incense_frequency: str
    road_proximity: str
    dampness: str
    purifier_count: int = 0


@app.get("/api/v1/home")
async def get_vayu_home(
    city: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    target_city = city or (prof.city if prof else "Ludhiana")
    rooms = (
        db.query(SensorDevice)
        .filter(SensorDevice.owner_user_id == user.id, SensorDevice.deployment_scope == "home_room")
        .order_by(SensorDevice.created_at.asc())
        .all()
    )
    room_cards = []
    for r in rooms:
        latest = (
            db.query(SensorReading)
            .filter(SensorReading.sensor_id == r.id)
            .order_by(SensorReading.recorded_at.desc())
            .first()
        )
        history = (
            db.query(SensorReading)
            .filter(SensorReading.sensor_id == r.id)
            .order_by(SensorReading.recorded_at.desc())
            .limit(8)
            .all()
        )
        status_label = "Unmonitored"
        if latest and latest.pm25 is not None:
            if latest.pm25 <= 15:
                status_label = "Optimal Indoor"
            elif latest.pm25 <= 35:
                status_label = "Good Indoor"
            elif latest.pm25 <= 60:
                status_label = "Elevated — Filter / Check Sources"
            else:
                status_label = "High Indoor PM2.5 — Act Now"
        room_cards.append(
            {
                "id": r.id,
                "device_code": r.device_code,
                "display_name": r.display_name,
                "room_type": r.room_type,
                "validation_status": r.validation_status,
                "filter_device_name": r.filter_device_name,
                "filter_life_pct": r.filter_life_pct,
                "is_demo_starter": r.is_demo,
                "status_label": status_label,
                "latest_reading": {
                    "pm25": latest.pm25,
                    "pm10": latest.pm10,
                    "co2_ppm": latest.co2_ppm,
                    "temp_c": latest.temp_c,
                    "humidity_pct": latest.humidity_pct,
                    "entry_method": latest.entry_method,
                    "provenance": latest.provenance,
                    "notes": latest.notes,
                    "recorded_at": latest.recorded_at.isoformat(),
                }
                if latest
                else None,
                "reading_count": len(history),
            }
        )

    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    checklist = json.loads(routine.ventilation_checklist_json or "[]") if routine else []
    survey = json.loads(routine.indoor_survey_json or "{}") if routine else {}

    bundle = await fetch_live_air_bundle(target_city)
    vent = compute_ventilation_windows(bundle)

    return {
        "city": target_city,
        "rooms": room_cards,
        "ventilation_checklist": checklist,
        "survey": survey,
        "survey_findings": _evaluate_indoor_survey(survey),
        "ventilation_advisor": vent,
        "core_disclaimer": "Indoor air quality is NEVER inferred from outdoor AQI alone. Unmonitored rooms show 'Unmonitored' until a real sensor or manual monitor reading is logged.",
    }


def _evaluate_indoor_survey(survey: Dict[str, Any]) -> List[str]:
    tips = []
    fuel = survey.get("cooking_fuel", "")
    if fuel in ("lpg_no_exhaust", "biomass"):
        tips.append("High indoor PM2.5 & NO2 source: Run an exhaust fan or crack a non-street kitchen window during frying/tadka cooking.")
    else:
        tips.append("Kitchen exhaust habit is positive — keep running the chimney 15 minutes after burner shut-off.")
    if survey.get("incense_frequency") in ("daily", "weekly"):
        tips.append("Combustion alert: Indoor incense, dhoop, and coils emit concentrated fine PM2.5 — ventilate immediately or limit during high-AQI episodes.")
    if survey.get("road_proximity") in ("adjacent_main_road", "within_200m"):
        tips.append("Near-road infiltration: Add weather-stripping on street-facing windows and ventilate from courtyard-facing openings during midday.")
    if survey.get("dampness") in ("visible_mould", "occasional_damp"):
        tips.append("Moisture & bioaerosol control: Target 40–55% relative humidity and inspect plumbing/wall seepage promptly.")
    if int(survey.get("purifier_count", 0)) == 0:
        tips.append("Optional clean-air room strategy: Prioritise sealing & filtering a single sleeping room first for highest overnight exposure reduction.")
    return tips


@app.post("/api/v1/home/rooms")
def create_home_room(
    payload: RoomCreatePayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    dev = SensorDevice(
        owner_user_id=user.id,
        device_code=f"HOME-{uuid.uuid4().hex[:8].upper()}",
        display_name=payload.display_name.strip(),
        deployment_scope="home_room",
        room_type=payload.room_type,
        city=prof.city if prof else "Ludhiana",
        validation_status="manual_only",
        filter_device_name=payload.filter_device_name,
        filter_life_pct=payload.filter_life_pct,
        is_demo=False,
    )
    db.add(dev)
    log_audit(db, user, "home.room_created", "sensor_device", dev.id, {"name": dev.display_name})
    db.commit()
    return {"id": dev.id, "display_name": dev.display_name}


@app.post("/api/v1/home/rooms/{room_id}/readings")
def add_room_reading(
    room_id: str,
    payload: ManualReadingPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = (
        db.query(SensorDevice)
        .filter(SensorDevice.id == room_id, SensorDevice.owner_user_id == user.id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found in your account.")
    room.is_demo = False
    prov = "MEASURED" if payload.entry_method == "sensor" else "USER REPORTED"
    rec = SensorReading(
        sensor_id=room.id,
        recorded_at=datetime.now(timezone.utc),
        pm25=payload.pm25,
        pm10=payload.pm10,
        co2_ppm=payload.co2_ppm,
        temp_c=payload.temp_c,
        humidity_pct=payload.humidity_pct,
        entry_method=payload.entry_method,
        provenance=prov,
        notes=payload.notes.strip() or "Logged from indoor air monitor.",
    )
    db.add(rec)
    log_audit(db, user, "home.reading_logged", "sensor_device", room.id, {"pm25": payload.pm25})
    db.commit()
    return {"status": "saved", "reading_id": rec.id, "provenance": prov}


@app.post("/api/v1/home/checklist/{item_id}/toggle")
def toggle_ventilation_item(
    item_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Checklist not found.")
    items = json.loads(routine.ventilation_checklist_json or "[]")
    for it in items:
        if it.get("id") == item_id:
            it["done"] = not it.get("done", False)
    routine.ventilation_checklist_json = json.dumps(items)
    db.commit()
    return {"ventilation_checklist": items}


@app.post("/api/v1/home/survey")
def save_home_survey(
    payload: SurveyPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = db.query(RoutineProfile).filter(RoutineProfile.user_id == user.id).first()
    data = payload.model_dump()
    if routine:
        routine.indoor_survey_json = json.dumps(data)
        db.commit()
    return {"survey": data, "survey_findings": _evaluate_indoor_survey(data)}


@app.post("/api/v1/home/rooms/{room_id}/reset-filter")
def reset_room_filter(
    room_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = (
        db.query(SensorDevice)
        .filter(SensorDevice.id == room_id, SensorDevice.owner_user_id == user.id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    room.filter_life_pct = 100
    db.add(
        ActionOutcome(
            user_id=user.id,
            action_category="indoor_care",
            title=f"Cleaned/Replaced filter in {room.display_name}",
            estimated_exposure_saved_pct=15.0,
            estimated_co2_saved_g=0,
        )
    )
    db.commit()
    return {"status": "reset", "filter_life_pct": 100}


# ---------------------------------------------------------------------------
# Module 7: Family Air Guardian
# ---------------------------------------------------------------------------
class FamilyMemberPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    relation: str = Field(..., min_length=2, max_length=64)
    age_group: str = Field(default="Adult")
    routine_window: str = Field(default="08:00 - 15:00", max_length=120)
    care_preference: str = Field(default="", max_length=280)
    aqi_threshold: int = Field(default=150, ge=50, le=400)
    notify_enabled: bool = True


@app.get("/api/v1/family")
async def get_family(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hh = db.query(Household).filter(Household.owner_user_id == user.id).first()
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    if not hh:
        hh = Household(
            owner_user_id=user.id,
            name=f"{(prof.full_name if prof else 'My').split()[0]}'s Household",
            city=prof.city if prof else "Ludhiana",
            checklist_json="[]",
        )
        db.add(hh)
        db.commit()
        db.refresh(hh)
    members = db.query(HouseholdMember).filter(HouseholdMember.household_id == hh.id).all()
    bundle = await fetch_live_air_bundle(hh.city)
    cur_aqi = bundle["current"]["indian_aqi"]

    shared_alerts = []
    for m in members:
        if m.notify_enabled and cur_aqi >= m.aqi_threshold:
            shared_alerts.append(
                {
                    "member_name": m.name,
                    "relation": m.relation,
                    "threshold": m.aqi_threshold,
                    "current_aqi": cur_aqi,
                    "message": f"Current regional NAQI ({cur_aqi}) exceeds {m.name}'s configured alert threshold ({m.aqi_threshold}) during window {m.routine_window}.",
                }
            )
    return {
        "household": {
            "id": hh.id,
            "name": hh.name,
            "city": hh.city,
            "access_scope": "Private to authenticated household owner (RBAC enforced)",
            "checklist": json.loads(hh.checklist_json or "[]"),
        },
        "current_aqi": cur_aqi,
        "current_category": bundle["current"]["category"],
        "members": [
            {
                "id": m.id,
                "name": m.name,
                "relation": m.relation,
                "age_group": m.age_group,
                "routine_window": m.routine_window,
                "care_preference": m.care_preference,
                "aqi_threshold": m.aqi_threshold,
                "notify_enabled": m.notify_enabled,
                "alert_triggered": cur_aqi >= m.aqi_threshold,
            }
            for m in members
        ],
        "shared_alerts": shared_alerts,
    }


@app.post("/api/v1/family/members")
def add_family_member(
    payload: FamilyMemberPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hh = db.query(Household).filter(Household.owner_user_id == user.id).first()
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found.")
    m = HouseholdMember(
        household_id=hh.id,
        name=payload.name.strip(),
        relation=payload.relation.strip(),
        age_group=payload.age_group,
        routine_window=payload.routine_window,
        care_preference=payload.care_preference.strip(),
        aqi_threshold=payload.aqi_threshold,
        notify_enabled=payload.notify_enabled,
    )
    db.add(m)
    log_audit(db, user, "family.member_added", "household_member", m.id, {"name": m.name})
    db.commit()
    return {"id": m.id, "name": m.name}


@app.delete("/api/v1/family/members/{member_id}")
def delete_family_member(
    member_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hh = db.query(Household).filter(Household.owner_user_id == user.id).first()
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found.")
    m = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.id == member_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found.")
    db.delete(m)
    db.commit()
    return {"status": "deleted"}


@app.post("/api/v1/family/checklist/{item_id}/toggle")
def toggle_family_checklist(
    item_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hh = db.query(Household).filter(Household.owner_user_id == user.id).first()
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found.")
    items = json.loads(hh.checklist_json or "[]")
    for it in items:
        if it.get("id") == item_id:
            it["done"] = not it.get("done", False)
    hh.checklist_json = json.dumps(items)
    db.commit()
    return {"checklist": items}


@app.post("/api/v1/family/notify")
def send_family_brief(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hh = db.query(Household).filter(Household.owner_user_id == user.id).first()
    count = db.query(HouseholdMember).filter(HouseholdMember.household_id == hh.id, HouseholdMember.notify_enabled == True).count() if hh else 0  # noqa: E712
    db.add(
        Notification(
            user_id=user.id,
            category="reminder",
            severity="info",
            title=f"Household Air Readiness Brief shared ({count} member profiles)",
            body="Before-You-Go checklist, afternoon ventilation window, and N95 reminder logged for your household.",
            action_url="/dashboard/family",
        )
    )
    db.add(
        ActionOutcome(
            user_id=user.id,
            action_category="family_protection",
            title=f"Dispatched Household Clean-Air Brief ({count} members)",
            estimated_exposure_saved_pct=12.0,
            estimated_co2_saved_g=0,
        )
    )
    db.commit()
    return {"status": "sent", "notified_count": count}


# ---------------------------------------------------------------------------
# Module 8: VAYU Campus
# ---------------------------------------------------------------------------
class CampusAdvisoryPayload(BaseModel):
    audience: str = Field(default="Parents, Students & Faculty")
    title: str = Field(..., min_length=4, max_length=200)
    message: str = Field(..., min_length=10, max_length=1500)
    action_type: str = Field(default="schedule_adjustment")


@app.get("/api/v1/campus")
async def get_campus(
    city: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inst = db.query(Institution).first()
    target_city = city or (inst.city if inst else "Ludhiana")
    zones = db.query(CampusZone).filter(CampusZone.institution_id == inst.id).all() if inst else []
    advisories = (
        db.query(CampusAdvisory)
        .filter(CampusAdvisory.institution_id == inst.id)
        .order_by(CampusAdvisory.created_at.desc())
        .limit(12)
        .all()
        if inst
        else []
    )
    bundle = await fetch_live_air_bundle(target_city)
    can_manage = user.role in {"campus_admin", "community_moderator", "civic_team"}
    incidents = (
        db.query(IncidentReport)
        .filter(IncidentReport.city == bundle["location"]["city"])
        .order_by(IncidentReport.created_at.desc())
        .limit(5)
        .all()
    )

    # Build outdoor sports/assembly schedule suitability from live forecast
    activity_slots = []
    for label, hr in [
        ("08:00 Morning Assembly", 8),
        ("10:30 Mid-Morning Recess", 10),
        ("14:00 Afternoon PE & Athletics", 14),
        ("16:30 After-School Sports Practice", 16),
    ]:
        pm = bundle["current"]["pollutants"]["pm25"] or 55.0
        for pt in bundle["forecast_72h"][:24]:
            if f"T{hr:02d}:" in pt.get("time", "") and pt.get("pm25") is not None:
                pm = pt["pm25"]
                break
        rec = (
            "Proceed Outdoors Normally"
            if pm <= 45
            else "Modified Low-Intensity Outdoor / Monitor"
            if pm <= 80
            else "Relocate to Filtered Indoor Hall"
        )
        activity_slots.append({"slot": label, "hour": hr, "forecast_pm25": round(pm, 1), "recommendation": rec})

    return {
        "can_manage_campus": can_manage,
        "user_role": user.role,
        "institution": {
            "id": inst.id,
            "name": inst.name,
            "type": inst.institution_type,
            "city": inst.city,
            "lat": inst.lat,
            "lon": inst.lon,
            "is_demo": inst.is_demo,
            "demo_notice": "Classroom indoor readings below represent a clearly labelled pilot campus simulation; outdoor activity guidance uses LIVE Open-Meteo regional forecasts.",
        }
        if inst
        else None,
        "outdoor_live": {
            "city": bundle["location"]["city"],
            "indian_aqi": bundle["current"]["indian_aqi"],
            "category": bundle["current"]["category"],
            "pm25": bundle["current"]["pollutants"]["pm25"],
            "is_live": bundle["is_live"],
        },
        "zones": [
            {
                "id": z.id,
                "zone_name": z.zone_name,
                "zone_type": z.zone_type,
                "capacity": z.capacity,
                "lat": round(inst.lat + z.lat_offset, 5),
                "lon": round(inst.lon + z.lon_offset, 5),
                "sensor_status": z.sensor_status,
                "pm25": z.pm25,
                "co2_ppm": z.co2_ppm,
                "temp_c": z.temp_c,
                "humidity_pct": z.humidity_pct,
                "ventilation_state": z.ventilation_state,
                "provenance": z.provenance,
                "is_demo": z.is_demo,
                "recorded_at": z.recorded_at.isoformat(),
            }
            for z in zones
        ],
        "outdoor_planner": activity_slots,
        "nearby_incidents": [
            {
                "id": inc.id,
                "category": inc.category,
                "area_label": inc.area_label,
                "status": inc.status,
                "severity": inc.severity,
                "observed_at": inc.observed_at.isoformat(),
            }
            for inc in incidents
        ],
        "advisories": [
            {
                "id": a.id,
                "author_name": a.author_name,
                "audience": a.audience,
                "title": a.title,
                "message": a.message,
                "action_type": a.action_type,
                "created_at": a.created_at.isoformat(),
            }
            for a in advisories
        ],
    }


@app.post("/api/v1/campus/advisories")
def create_campus_advisory(
    payload: CampusAdvisoryPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {"campus_admin", "community_moderator", "civic_team"}:
        raise HTTPException(
            status_code=403,
            detail="Campus Administrator or Moderator role required to publish official campus communications.",
        )
    inst = db.query(Institution).first()
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    adv = CampusAdvisory(
        institution_id=inst.id,
        author_name=prof.full_name if prof else user.email,
        audience=payload.audience,
        title=payload.title.strip(),
        message=payload.message.strip(),
        action_type=payload.action_type,
    )
    db.add(adv)
    log_audit(db, user, "campus.advisory_published", "campus_advisory", adv.id, {"title": adv.title})
    db.commit()
    return {"id": adv.id, "status": "published"}


# ---------------------------------------------------------------------------
# Module 9 & 10: VAYU Community & Citizen Incident Reporting
# ---------------------------------------------------------------------------
ACCUSATORY_PATTERNS = [
    r"\b(arrest|punish|guilty|criminal|blame\s+mr|blame\s+mrs|caused\s+by\s+mr|owned\s+by)\b",
]


class IncidentCreatePayload(BaseModel):
    category: str = Field(..., pattern=r"^(smoke|waste_burning|dust|industrial_plume|traffic_exhaust|odour)$")
    severity: str = Field(default="moderate", pattern=r"^(low|moderate|high)$")
    description: str = Field(..., min_length=12, max_length=1500)
    city: str = Field(default="Ludhiana", max_length=120)
    area_label: str = Field(..., min_length=3, max_length=160)
    approx_lat: float = Field(..., ge=-90, le=90)
    approx_lon: float = Field(..., ge=-180, le=180)
    observed_at: Optional[str] = None
    photo_data_uri: Optional[str] = None
    photo_file_name: Optional[str] = None


@app.get("/api/v1/community")
def get_community(
    city: str = Query(default="Ludhiana"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    official = db.query(MonitoringStation).all()
    sensors = db.query(SensorDevice).filter(SensorDevice.deployment_scope == "community").all()
    sensor_list = []
    for s in sensors:
        latest = (
            db.query(SensorReading)
            .filter(SensorReading.sensor_id == s.id)
            .order_by(SensorReading.recorded_at.desc())
            .first()
        )
        sensor_list.append(
            {
                "id": s.id,
                "device_code": s.device_code,
                "display_name": s.display_name,
                "tier": "Community Low-Cost Optical Node (Separate from Official Reference)",
                "city": s.city,
                "lat": s.lat,
                "lon": s.lon,
                "trust_score": s.trust_score,
                "validation_status": s.validation_status,
                "anomaly_flag": s.anomaly_flag,
                "is_demo": s.is_demo,
                "pm25": latest.pm25 if latest else None,
                "pm10": latest.pm10 if latest else None,
                "recorded_at": latest.recorded_at.isoformat() if latest else None,
                "provenance": "MEASURED",
            }
        )

    incidents = db.query(IncidentReport).order_by(IncidentReport.created_at.desc()).limit(40).all()
    user_actions = (
        db.query(ActionOutcome)
        .filter(ActionOutcome.user_id == user.id, ActionOutcome.action_category == "community_task")
        .all()
    )
    completed_titles = {a.title for a in user_actions}

    tasks = [
        {
            "id": "ct-1",
            "title": "Verify loose road-dust hotspots for municipal wet-sweeping request",
            "impact": "Reduces local PM10 resuspension",
            "co2_saved_g": 0,
            "completed": "Verify loose road-dust hotspots for municipal wet-sweeping request" in completed_titles,
        },
        {
            "id": "ct-2",
            "title": "Share dry-leaf composting guide with neighbourhood RWA instead of open burning",
            "impact": "Prevents concentrated winter PM2.5 smoke plumes",
            "co2_saved_g": 850,
            "completed": "Share dry-leaf composting guide with neighbourhood RWA instead of open burning" in completed_titles,
        },
        {
            "id": "ct-3",
            "title": "Join weekly school-gate No-Idling Drop-Off pledge",
            "impact": "Cuts morning NO2 & tailpipe PM2.5 at school entrances",
            "co2_saved_g": 620,
            "completed": "Join weekly school-gate No-Idling Drop-Off pledge" in completed_titles,
        },
        {
            "id": "ct-4",
            "title": "Log visual air-clarity & sensor enclosure dust check",
            "impact": "Improves community sensor data quality score",
            "co2_saved_g": 0,
            "completed": "Log visual air-clarity & sensor enclosure dust check" in completed_titles,
        },
    ]

    return {
        "selected_city": city,
        "tier_separation_notice": "Official CPCB/SPCB reference stations, calibrated low-cost community sensors, and unverified citizen incident reports are strictly separated by symbol and data badge.",
        "official_stations": [
            {
                "id": st.id,
                "code": st.station_code,
                "name": st.name,
                "operator": st.operator,
                "city": st.city,
                "lat": st.lat,
                "lon": st.lon,
                "tier": "Official Reference CAAQMS",
                "validation_status": st.validation_status,
            }
            for st in official
        ],
        "community_sensors": sensor_list,
        "incidents": [_serialize_incident(db, i, include_photo=False) for i in incidents],
        "neighbourhood_tasks": tasks,
    }


class CommunityTaskPayload(BaseModel):
    title: str
    co2_saved_g: float = 0.0


@app.post("/api/v1/community/tasks/complete")
def complete_community_task(
    payload: CommunityTaskPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(ActionOutcome)
        .filter(
            ActionOutcome.user_id == user.id,
            ActionOutcome.action_category == "community_task",
            ActionOutcome.title == payload.title,
        )
        .first()
    )
    if not existing:
        db.add(
            ActionOutcome(
                user_id=user.id,
                action_category="community_task",
                title=payload.title[:200],
                estimated_exposure_saved_pct=8.0,
                estimated_co2_saved_g=payload.co2_saved_g,
            )
        )
        log_audit(db, user, "community.task_completed", "action_outcome", payload.title[:60])
        db.commit()
    return {"status": "completed"}


def _serialize_incident(db: Session, inc: IncidentReport, include_photo: bool = False) -> Dict[str, Any]:
    photo = None
    if include_photo and inc.has_photo:
        att = db.query(EvidenceAttachment).filter(EvidenceAttachment.incident_id == inc.id).first()
        if att:
            photo = {"file_name": att.file_name, "data_uri": att.data_uri, "moderation_state": att.moderation_state}
    return {
        "id": inc.id,
        "reporter_user_id": inc.reporter_user_id,
        "reporter_alias": inc.reporter_alias,
        "category": inc.category,
        "severity": inc.severity,
        "description": inc.description,
        "city": inc.city,
        "area_label": inc.area_label,
        "approx_lat": inc.approx_lat,
        "approx_lon": inc.approx_lon,
        "observed_at": inc.observed_at.isoformat() if inc.observed_at else None,
        "status": inc.status,
        "duplicate_of_id": inc.duplicate_of_id,
        "moderator_note": inc.moderator_note,
        "reviewed_by_name": inc.reviewed_by_name,
        "has_photo": inc.has_photo,
        "photo": photo,
        "provenance": "USER REPORTED",
        "is_demo": inc.is_demo,
        "created_at": inc.created_at.isoformat() if inc.created_at else None,
    }


@app.get("/api/v1/incidents")
def list_incidents(
    city: Optional[str] = None,
    status_filter: Optional[str] = None,
    mine_only: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(IncidentReport)
    if mine_only:
        q = q.filter(IncidentReport.reporter_user_id == user.id)
    elif city and city != "All":
        q = q.filter(IncidentReport.city == city)
    if status_filter and status_filter != "All":
        q = q.filter(IncidentReport.status == status_filter)
    rows = q.order_by(IncidentReport.created_at.desc()).limit(50).all()
    return {
        "incidents": [_serialize_incident(db, r, include_photo=True) for r in rows],
        "statuses": list(VALID_INCIDENT_STATUSES),
    }


@app.post("/api/v1/incidents")
def create_incident(
    payload: IncidentCreatePayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Non-accusation ethics check
    for pat in ACCUSATORY_PATTERNS:
        if re.search(pat, payload.description, re.IGNORECASE):
            raise HTTPException(
                status_code=400,
                detail="Please describe only observable environmental conditions (smoke, dust, odour, visibility). VAYUVERSE never accuses specific individuals, companies, or organisations.",
            )

    # Privacy-preserving coarse location rounding (~1.1 km grid = 2 decimal places)
    coarse_lat = round(payload.approx_lat, 2)
    coarse_lon = round(payload.approx_lon, 2)

    obs_dt = datetime.now(timezone.utc)
    if payload.observed_at:
        try:
            parsed = datetime.fromisoformat(payload.observed_at.replace("Z", "+00:00"))
            obs_dt = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # Automated duplicate detection: same category within 2.5 km in past 12 hours
    cutoff = datetime.now(timezone.utc) - timedelta(hours=12)
    recent_same = (
        db.query(IncidentReport)
        .filter(IncidentReport.category == payload.category, IncidentReport.created_at >= cutoff)
        .all()
    )
    duplicate_id = None
    for cand in recent_same:
        if haversine_km(coarse_lat, coarse_lon, cand.approx_lat, cand.approx_lon) <= 2.5:
            duplicate_id = cand.id
            break

    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    first_name = (prof.full_name.split()[0] if prof and prof.full_name else "Citizen")

    has_photo = False
    if payload.photo_data_uri:
        if not payload.photo_data_uri.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="Attachment must be a valid JPEG, PNG, or WebP image.")
        if len(payload.photo_data_uri) > 2_800_000:
            raise HTTPException(status_code=400, detail="Photograph exceeds maximum size limit (2 MB).")
        has_photo = True

    meta = resolve_city(payload.city)
    inc = IncidentReport(
        reporter_user_id=user.id,
        reporter_alias=f"{first_name} (Verified Account)",
        category=payload.category,
        severity=payload.severity,
        description=payload.description.strip(),
        city=meta["city"],
        area_label=f"{payload.area_label.strip()} (Coarse ~1 km)",
        approx_lat=coarse_lat,
        approx_lon=coarse_lon,
        observed_at=obs_dt,
        status="Submitted",
        duplicate_of_id=duplicate_id,
        has_photo=has_photo,
        provenance="USER REPORTED",
        is_demo=False,
    )
    db.add(inc)
    db.flush()

    if has_photo and payload.photo_data_uri:
        mime = payload.photo_data_uri.split(";")[0].replace("data:", "")
        db.add(
            EvidenceAttachment(
                incident_id=inc.id,
                file_name=(payload.photo_file_name or "incident-photo.jpg")[:200],
                mime_type=mime[:80],
                file_size_bytes=len(payload.photo_data_uri),
                data_uri=payload.photo_data_uri,
                exif_stripped=True,
                moderation_state="pending_review",
            )
        )

    db.add(
        Notification(
            user_id=user.id,
            category="community",
            severity="info",
            title=f"Incident Report Submitted ({payload.category.replace('_', ' ').title()})",
            body=(
                f"Logged for {inc.area_label} with status 'Submitted' (USER REPORTED)."
                + (" Potential nearby duplicate flagged for moderator review." if duplicate_id else "")
            ),
            action_url="/dashboard/incidents",
        )
    )
    log_audit(
        db,
        user,
        "incident.submitted",
        "incident_report",
        inc.id,
        {"category": inc.category, "city": inc.city, "duplicate_of": duplicate_id},
    )
    db.commit()
    db.refresh(inc)
    return {
        "incident": _serialize_incident(db, inc, include_photo=True),
        "duplicate_detected": bool(duplicate_id),
        "duplicate_of_id": duplicate_id,
    }


# ---------------------------------------------------------------------------
# Module 11: Grounded AI Response Agent
# ---------------------------------------------------------------------------
class AssistantChatPayload(BaseModel):
    message: str = Field(..., min_length=2, max_length=2000)
    thread_id: Optional[str] = None
    city: Optional[str] = None
    language: Optional[str] = None


@app.get("/api/v1/assistant/threads")
def get_assistant_threads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    threads: Dict[str, Dict[str, Any]] = {}
    for m in msgs:
        if m.thread_id not in threads:
            threads[m.thread_id] = {
                "thread_id": m.thread_id,
                "title": m.thread_title,
                "updated_at": m.created_at.isoformat(),
                "messages": [],
            }
        threads[m.thread_id]["updated_at"] = m.created_at.isoformat()
        threads[m.thread_id]["messages"].append(
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sources": json.loads(m.sources_json or "[]"),
                "reasoning": json.loads(m.reasoning_json or "{}"),
                "model_used": m.model_used,
                "created_at": m.created_at.isoformat(),
            }
        )
    sorted_threads = sorted(threads.values(), key=lambda t: t["updated_at"], reverse=True)
    return {
        "threads": sorted_threads,
        "claude_api_live": bool(os.getenv("ANTHROPIC_API_KEY", "").strip()),
    }


@app.post("/api/v1/assistant/chat")
async def post_assistant_chat(
    payload: AssistantChatPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    city = payload.city or (prof.city if prof else "Ludhiana")
    lang = payload.language or (prof.preferred_language if prof else "en")
    thread_id = payload.thread_id or f"thr-{uuid.uuid4().hex[:10]}"
    title = payload.message.strip()[:56]

    prev = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id, ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    if prev:
        title = prev[0].thread_title
    history = [{"role": m.role, "content": m.content} for m in prev]

    bundle = await fetch_live_air_bundle(city)
    incs = (
        db.query(IncidentReport)
        .filter(IncidentReport.city == bundle["location"]["city"])
        .order_by(IncidentReport.created_at.desc())
        .limit(6)
        .all()
    )
    inc_dicts = [
        {
            "category": i.category,
            "severity": i.severity,
            "area_label": i.area_label,
            "status": i.status,
            "observed_at": i.observed_at.isoformat(),
        }
        for i in incs
    ]

    ai_out = await generate_grounded_response(
        message=payload.message.strip(),
        language=lang,
        live_bundle=bundle,
        recent_incidents=inc_dicts,
        user_context={
            "name": prof.full_name if prof else "User",
            "aqi_threshold": prefs.aqi_alert_threshold if prefs else 150,
        },
        history=history,
    )

    u_msg = ChatMessage(
        user_id=user.id,
        thread_id=thread_id,
        thread_title=title,
        role="user",
        content=payload.message.strip(),
    )
    a_msg = ChatMessage(
        user_id=user.id,
        thread_id=thread_id,
        thread_title=title,
        role="assistant",
        content=ai_out["reply"],
        sources_json=json.dumps(ai_out["sources"]),
        reasoning_json=json.dumps(ai_out["reasoning"]),
        model_used=ai_out["model_used"],
    )
    # Record in Explainable AI Audit Trail (Trust & Sources)
    audit_rec = Recommendation(
        user_id=user.id,
        module="AI Response Agent",
        prompt_or_trigger=payload.message.strip()[:200],
        summary=ai_out["reply"][:360],
        inputs_json=json.dumps(ai_out["reasoning"]),
        sources_json=json.dumps(ai_out["sources"]),
        provenance="AI SUMMARY",
        model_used=ai_out["model_used"],
    )
    db.add_all([u_msg, a_msg, audit_rec])
    db.commit()
    return {
        "thread_id": thread_id,
        "thread_title": title,
        "message": {
            "id": a_msg.id,
            "role": "assistant",
            "content": ai_out["reply"],
            "sources": ai_out["sources"],
            "reasoning": ai_out["reasoning"],
            "model_used": ai_out["model_used"],
            "provenance": "AI SUMMARY",
            "created_at": a_msg.created_at.isoformat(),
        },
    }


# ---------------------------------------------------------------------------
# Module 12: Alerts & Notifications
# ---------------------------------------------------------------------------
@app.get("/api/v1/notifications")
async def get_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    return {
        "unread_count": sum(1 for r in rows if not r.is_read),
        "notifications": [
            {
                "id": r.id,
                "category": r.category,
                "severity": r.severity,
                "title": r.title,
                "body": r.body,
                "action_url": r.action_url,
                "is_read": r.is_read,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "preferences": {
            "aqi_alert_threshold": prefs.aqi_alert_threshold if prefs else 150,
            "notify_aqi_alerts": prefs.notify_aqi_alerts if prefs else True,
            "notify_forecast_spikes": prefs.notify_forecast_spikes if prefs else True,
            "notify_community_updates": prefs.notify_community_updates if prefs else True,
            "notify_campus_alerts": prefs.notify_campus_alerts if prefs else False,
            "notify_routine_reminders": prefs.notify_routine_reminders if prefs else True,
        },
    }


@app.post("/api/v1/notifications/evaluate-live")
async def evaluate_live_alert(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    city = prof.city if prof else "Ludhiana"
    threshold = prefs.aqi_alert_threshold if prefs else 150
    bundle = await fetch_live_air_bundle(city)
    cur_aqi = bundle["current"]["indian_aqi"]
    peak = bundle["comparison"].get("peak_window") or {}
    peak_aqi = peak.get("indian_aqi", cur_aqi)

    if cur_aqi >= threshold:
        title = f"AQI Threshold Alert — {city} NAQI is {cur_aqi} ({bundle['current']['category']})"
        sev = "critical" if cur_aqi >= 201 else "warning"
        body = f"Live regional Indian NAQI ({cur_aqi}) crossed your alert threshold ({threshold}). {bundle['current']['advisory']}"
    elif peak_aqi >= threshold:
        title = f"Forecast Early Warning — {city} NAQI projected to reach {peak_aqi}"
        sev = "warning"
        body = f"Currently NAQI {cur_aqi}, but forecast peaks near {peak_aqi} around {(peak.get('time') or '').split('T')[-1]} IST. Plan outdoor tasks earlier."
    else:
        title = f"Air Check Complete — {city} NAQI {cur_aqi} stays below your {threshold} threshold"
        sev = "info"
        body = f"Current NAQI is {cur_aqi} ({bundle['current']['category']}) and 24h peak is ~{peak_aqi} (Source: Open-Meteo CAMS)."

    n = Notification(
        user_id=user.id,
        category="aqi_alert" if cur_aqi >= threshold else "forecast",
        severity=sev,
        title=title,
        body=body,
        action_url="/dashboard/live-air",
        is_read=False,
    )
    db.add(n)
    db.commit()
    return {"created": {"id": n.id, "title": n.title, "severity": n.severity}}


@app.post("/api/v1/notifications/{notif_id}/read")
def mark_notif_read(notif_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == user.id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"status": "ok"}


@app.post("/api/v1/notifications/read-all")
def mark_all_notifs_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id).update({"is_read": True})
    db.commit()
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Module 13: Trust & Sources + Explainable AI Audit Trail
# ---------------------------------------------------------------------------
@app.get("/api/v1/trust")
async def get_trust_dashboard(
    city: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    target_city = city or (prof.city if prof else "Ludhiana")
    bundle = await fetch_live_air_bundle(target_city)
    models = db.query(ModelVersion).all()
    sensors = db.query(SensorDevice).filter(SensorDevice.deployment_scope == "community").all()
    recs = (
        db.query(Recommendation)
        .filter(Recommendation.user_id == user.id)
        .order_by(Recommendation.created_at.desc())
        .limit(20)
        .all()
    )

    return {
        "classifications": [
            {"code": "MEASURED", "description": "Direct observation from an identified official monitoring station or calibrated physical sensor."},
            {"code": "MODEL FORECAST", "description": "Generated by a named numerical atmospheric composition or weather forecast model (with resolution & uncertainty disclosed)."},
            {"code": "ESTIMATED", "description": "Deterministically calculated from disclosed inputs, CPCB equations, and literature assumptions."},
            {"code": "USER REPORTED", "description": "Submitted manually by a citizen or household member and not independently instrument-verified."},
            {"code": "AI SUMMARY", "description": "Natural-language explanation grounded exclusively in retrieved structured evidence."},
        ],
        "live_feed_audit": {
            "city": bundle["location"]["city"],
            "is_live": bundle["is_live"],
            "air_quality_source": bundle["provenance"]["air_quality_source"],
            "weather_source": bundle["provenance"]["weather_source"],
            "observed_time_ist": bundle["current"]["observed_time_ist"],
            "fetched_at_utc": bundle["current"]["fetched_at_utc"],
            "freshness_status": bundle["current"]["freshness_status"],
            "pollutants_retrieved": ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO", "Dust", "AOD"],
            "spatial_resolution": bundle["provenance"]["spatial_resolution"],
            "license": bundle["provenance"]["license"],
            "cpcb_direct_status": "Configured" if os.getenv("CPCB_DATA_GOV_API_KEY") else "Optional (Add CPCB_DATA_GOV_API_KEY for direct CAAQMS ground station ingestion)",
        },
        "models": [
            {
                "code": m.model_code,
                "provider": m.provider,
                "version": m.version,
                "spatial_resolution_km": m.spatial_resolution_km,
                "max_horizon_hours": m.max_horizon_hours,
                "uncertainty_profile": m.uncertainty_profile,
                "limitations": m.limitations,
            }
            for m in models
        ],
        "sensor_validation_summary": {
            "total_community_nodes": len(sensors),
            "calibrated": sum(1 for s in sensors if s.validation_status == "calibrated"),
            "needs_calibration": sum(1 for s in sensors if s.validation_status == "needs_calibration"),
            "anomaly_flagged": sum(1 for s in sensors if s.anomaly_flag),
        },
        "naqi_breakpoints": NAQI_BREAKPOINTS,
        "ai_audit_trail": [
            {
                "id": r.id,
                "module": r.module,
                "trigger": r.prompt_or_trigger,
                "summary": r.summary,
                "provenance": r.provenance,
                "model_used": r.model_used,
                "inputs": json.loads(r.inputs_json or "{}"),
                "sources": json.loads(r.sources_json or "[]"),
                "created_at": r.created_at.isoformat(),
            }
            for r in recs
        ],
    }


# ---------------------------------------------------------------------------
# Module 14: Reports, Analytics & Action-to-Impact Ledger
# ---------------------------------------------------------------------------
class LogActionPayload(BaseModel):
    action_category: str = Field(default="daily_protection")
    title: str = Field(..., min_length=3, max_length=200)
    estimated_exposure_saved_pct: float = Field(default=15.0, ge=0, le=95)
    estimated_co2_saved_g: float = Field(default=0.0, ge=0, le=50000)


@app.post("/api/v1/actions")
def log_action(
    payload: LogActionPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    act = ActionOutcome(
        user_id=user.id,
        action_category=payload.action_category,
        title=payload.title.strip(),
        estimated_exposure_saved_pct=payload.estimated_exposure_saved_pct,
        estimated_co2_saved_g=payload.estimated_co2_saved_g,
    )
    db.add(act)
    log_audit(db, user, "action.completed", "action_outcome", act.id, {"title": act.title})
    db.commit()
    return {"id": act.id, "title": act.title}


@app.get("/api/v1/reports/summary")
async def get_reports_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    city = prof.city if prof else "Ludhiana"
    bundle = await fetch_live_air_bundle(city)
    scenarios = (
        db.query(RouteScenario)
        .filter(RouteScenario.user_id == user.id)
        .order_by(RouteScenario.created_at.desc())
        .all()
    )
    incidents = (
        db.query(IncidentReport)
        .filter(IncidentReport.reporter_user_id == user.id)
        .order_by(IncidentReport.created_at.desc())
        .all()
    )
    actions = (
        db.query(ActionOutcome)
        .filter(ActionOutcome.user_id == user.id)
        .order_by(ActionOutcome.completed_at.desc())
        .all()
    )
    advisories = db.query(CampusAdvisory).order_by(CampusAdvisory.created_at.desc()).limit(10).all()

    total_co2_saved_g = round(sum(a.estimated_co2_saved_g or 0 for a in actions), 0)
    avg_exp_reduction = (
        round(sum(a.estimated_exposure_saved_pct or 0 for a in actions) / len(actions), 1)
        if actions
        else 0.0
    )

    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "city": city,
        "provenance": bundle["provenance"],
        "is_live": bundle["is_live"],
        "air_history_48h": bundle["history_48h"],
        "kpis": {
            "last_24h_avg_aqi": bundle["comparison"]["last_24h_avg_aqi"],
            "prev_24h_avg_aqi": bundle["comparison"]["prev_24h_avg_aqi"],
            "scenarios_saved": len(scenarios),
            "actions_completed": len(actions),
            "avg_exposure_reduction_pct": avg_exp_reduction,
            "total_co2_avoided_g": total_co2_saved_g,
            "citizen_reports_filed": len(incidents),
        },
        "scenarios": [
            {
                "id": s.id,
                "type": s.scenario_type,
                "title": s.title,
                "city": s.city,
                "exposure_delta_pct": s.exposure_delta_pct,
                "emissions_delta_g": s.emissions_delta_g,
                "provenance": s.provenance,
                "created_at": s.created_at.isoformat(),
            }
            for s in scenarios[:15]
        ],
        "actions": [
            {
                "id": a.id,
                "category": a.action_category,
                "title": a.title,
                "exposure_saved_pct": a.estimated_exposure_saved_pct,
                "co2_saved_g": a.estimated_co2_saved_g,
                "completed_at": a.completed_at.isoformat(),
            }
            for a in actions[:20]
        ],
        "my_incidents": [_serialize_incident(db, i, include_photo=False) for i in incidents[:15]],
        "campus_reports_count": len(advisories),
    }


# ---------------------------------------------------------------------------
# User Profile, Settings, Consent, Data Export & Account Deletion
# ---------------------------------------------------------------------------
class ProfileUpdatePayload(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    avatar_url: Optional[str] = None
    city: Optional[str] = None
    preferred_language: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)
    role: Optional[str] = None


class PreferencesUpdatePayload(BaseModel):
    aqi_alert_threshold: Optional[int] = Field(default=None, ge=50, le=450)
    notify_aqi_alerts: Optional[bool] = None
    notify_forecast_spikes: Optional[bool] = None
    notify_community_updates: Optional[bool] = None
    notify_campus_alerts: Optional[bool] = None
    notify_routine_reminders: Optional[bool] = None
    coarse_location_only: Optional[bool] = None
    routine_profiling_enabled: Optional[bool] = None
    low_bandwidth_mode: Optional[bool] = None
    reduced_motion: Optional[bool] = None


class PasswordChangePayload(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(..., min_length=8, max_length=128)


class SavedLocationPayload(BaseModel):
    label: str = Field(..., min_length=2, max_length=120)
    city: str = Field(..., min_length=2, max_length=120)


@app.patch("/api/v1/profile")
def update_profile(
    payload: ProfileUpdatePayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prof = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if payload.full_name is not None:
        prof.full_name = payload.full_name.strip()
    if payload.avatar_url is not None:
        prof.avatar_url = payload.avatar_url
    if payload.city is not None:
        meta = resolve_city(payload.city)
        prof.city = meta["city"]
        prof.state = meta["state"]
        prof.coarse_lat = meta["lat"]
        prof.coarse_lon = meta["lon"]
    if payload.preferred_language in VALID_LANGUAGES:
        prof.preferred_language = payload.preferred_language
    if payload.bio is not None:
        prof.bio = payload.bio.strip()
    self_selectable = (
        {"individual", "family_caregiver", "community_volunteer", "research_user"}
        if user.auth_provider == "demo"
        else {"individual", "family_caregiver", "campus_admin", "community_volunteer", "research_user"}
    )
    if payload.role and payload.role in self_selectable and user.role not in {"community_moderator", "civic_team"}:
        user.role = payload.role
    prof.updated_at = datetime.now(timezone.utc)
    log_audit(db, user, "profile.updated", "user_profile", user.id)
    db.commit()
    return {"user": serialize_user(db, user)}


@app.patch("/api/v1/profile/preferences")
def update_preferences(
    payload: PreferencesUpdatePayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not prefs:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
    data = payload.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(prefs, k, v)
    # Record consent changes transparently
    if "coarse_location_only" in data:
        db.add(ConsentRecord(user_id=user.id, consent_type="coarse_location", granted=bool(data["coarse_location_only"])))
    if "routine_profiling_enabled" in data:
        db.add(ConsentRecord(user_id=user.id, consent_type="routine_profiling", granted=bool(data["routine_profiling_enabled"])))
    prefs.updated_at = datetime.now(timezone.utc)
    log_audit(db, user, "preferences.updated", "user_preferences", user.id, data)
    db.commit()
    return {"user": serialize_user(db, user)}


@app.post("/api/v1/profile/password")
def change_password(
    payload: PasswordChangePayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.auth_provider == "demo":
        raise HTTPException(
            status_code=400,
            detail="Passwords cannot be set in Demo Mode. Sign up with Google or email to create your own secure account.",
        )
    if user.password_hash:
        if not payload.current_password or not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
    user.password_hash = hash_password(payload.new_password)
    if user.auth_provider == "google":
        user.auth_provider = "google+email"
    log_audit(db, user, "profile.password_changed", "user", user.id)
    db.commit()
    return {"status": "updated", "message": "Password updated successfully."}


@app.get("/api/v1/profile/activity")
def get_profile_activity(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    locs = db.query(SavedLocation).filter(SavedLocation.user_id == user.id).order_by(SavedLocation.created_at.asc()).all()
    audits = db.query(AuditLog).filter(AuditLog.actor_user_id == user.id).order_by(AuditLog.created_at.desc()).limit(25).all()
    consents = db.query(ConsentRecord).filter(ConsentRecord.user_id == user.id).order_by(ConsentRecord.recorded_at.desc()).limit(15).all()
    reports = db.query(IncidentReport).filter(IncidentReport.reporter_user_id == user.id).order_by(IncidentReport.created_at.desc()).all()
    actions = db.query(ActionOutcome).filter(ActionOutcome.user_id == user.id).order_by(ActionOutcome.completed_at.desc()).all()
    scenarios = db.query(RouteScenario).filter(RouteScenario.user_id == user.id).order_by(RouteScenario.created_at.desc()).all()
    notifs = db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(15).all()

    return {
        "saved_locations": [
            {"id": l.id, "label": l.label, "city": l.city, "state": l.state, "lat": l.lat, "lon": l.lon, "is_primary": l.is_primary}
            for l in locs
        ],
        "recent_activity": [
            {"id": a.id, "action": a.action, "target_type": a.target_type, "created_at": a.created_at.isoformat()}
            for a in audits
        ],
        "consent_records": [
            {"id": c.id, "consent_type": c.consent_type, "granted": c.granted, "version": c.version, "recorded_at": c.recorded_at.isoformat()}
            for c in consents
        ],
        "recent_reports": [_serialize_incident(db, r, include_photo=False) for r in reports],
        "completed_actions": [
            {"id": x.id, "category": x.action_category, "title": x.title, "exposure_saved_pct": x.estimated_exposure_saved_pct, "co2_saved_g": x.estimated_co2_saved_g, "completed_at": x.completed_at.isoformat()}
            for x in actions
        ],
        "saved_scenarios": [
            {"id": s.id, "type": s.scenario_type, "title": s.title, "city": s.city, "exposure_delta_pct": s.exposure_delta_pct, "created_at": s.created_at.isoformat()}
            for s in scenarios
        ],
        "notification_history": [
            {"id": n.id, "title": n.title, "category": n.category, "is_read": n.is_read, "created_at": n.created_at.isoformat()}
            for n in notifs
        ],
    }


@app.post("/api/v1/profile/locations")
def add_saved_location(
    payload: SavedLocationPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meta = resolve_city(payload.city)
    loc = SavedLocation(
        user_id=user.id,
        label=payload.label.strip(),
        city=meta["city"],
        state=meta["state"],
        country=meta["country"],
        lat=meta["lat"],
        lon=meta["lon"],
        is_primary=False,
    )
    db.add(loc)
    log_audit(db, user, "location.saved", "location", loc.id, {"city": meta["city"]})
    db.commit()
    return {"id": loc.id, "label": loc.label, "city": loc.city, "state": loc.state}


@app.delete("/api/v1/profile/locations/{loc_id}")
def delete_saved_location(loc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loc = db.query(SavedLocation).filter(SavedLocation.id == loc_id, SavedLocation.user_id == user.id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Saved location not found.")
    db.delete(loc)
    db.commit()
    return {"status": "deleted"}


@app.get("/api/v1/profile/export")
def export_account_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    activity = get_profile_activity(user, db)
    log_audit(db, user, "account.data_exported", "user", user.id)
    db.commit()
    return {
        "export_schema": "VAYUVERSE_USER_DATA_EXPORT_V1",
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "account": serialize_user(db, user),
        "data": activity,
    }


@app.delete("/api/v1/profile/account")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uid, email, was_demo = user.id, user.email, (user.auth_provider == "demo")
    _purge_user_workspace(db, user)
    if not was_demo:
        db.add(
            AuditLog(
                actor_user_id=None,
                actor_email="redacted",
                action="account.permanently_deleted",
                target_type="user",
                target_id=uid,
                metadata_json=json.dumps({"domain": email.split("@")[-1]}),
            )
        )
    db.commit()
    return {"status": "deleted", "message": "Your VAYUVERSE AI account and personal data have been permanently deleted."}


# ---------------------------------------------------------------------------
# Administrative & Moderation Console (Strictly RBAC-Protected)
# ---------------------------------------------------------------------------
class ModerateIncidentPayload(BaseModel):
    status: str
    moderator_note: str = Field(default="", max_length=600)


class SensorStatusPayload(BaseModel):
    validation_status: str = Field(..., pattern=r"^(calibrated|needs_calibration|anomaly_flagged)$")
    trust_score: int = Field(..., ge=0, le=100)
    anomaly_flag: bool = False


class BroadcastPayload(BaseModel):
    category: str = Field(default="pollution_event")
    severity: str = Field(default="warning")
    title: str = Field(..., min_length=4, max_length=200)
    body: str = Field(..., min_length=8, max_length=1000)
    city_filter: str = Field(default="All")


class RoleUpdatePayload(BaseModel):
    role: str


@app.get("/api/v1/admin/overview")
def get_admin_overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    incidents = db.query(IncidentReport).order_by(IncidentReport.created_at.desc()).limit(50).all()
    sensors = db.query(SensorDevice).filter(SensorDevice.deployment_scope == "community").all()
    users = db.query(User).filter(User.auth_provider != "demo").order_by(User.created_at.desc()).limit(50).all()
    audits = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(40).all()

    user_rows = []
    for u in users:
        p = db.query(UserProfile).filter(UserProfile.user_id == u.id).first()
        user_rows.append(
            {
                "id": u.id,
                "email": u.email,
                "full_name": p.full_name if p else "",
                "city": p.city if p else "",
                "role": u.role,
                "auth_provider": u.auth_provider,
                "account_status": u.account_status,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
        )

    return {
        "admin_role": admin.role,
        "stats": {
            "total_users": db.query(User).count(),
            "pending_incidents": db.query(IncidentReport).filter(IncidentReport.status.in_(["Submitted", "Under Review"])).count(),
            "total_incidents": db.query(IncidentReport).count(),
            "community_sensors": len(sensors),
            "flagged_sensors": sum(1 for s in sensors if s.anomaly_flag),
        },
        "incidents": [_serialize_incident(db, i, include_photo=True) for i in incidents],
        "sensors": [
            {
                "id": s.id,
                "device_code": s.device_code,
                "display_name": s.display_name,
                "city": s.city,
                "trust_score": s.trust_score,
                "validation_status": s.validation_status,
                "anomaly_flag": s.anomaly_flag,
                "is_demo": s.is_demo,
            }
            for s in sensors
        ],
        "users": user_rows,
        "audit_logs": [
            {
                "id": a.id,
                "actor_email": a.actor_email,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "metadata": json.loads(a.metadata_json or "{}"),
                "created_at": a.created_at.isoformat(),
            }
            for a in audits
        ],
    }


@app.patch("/api/v1/admin/incidents/{incident_id}")
def moderate_incident(
    incident_id: str,
    payload: ModerateIncidentPayload,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.status not in VALID_INCIDENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid incident status.")
    inc = db.query(IncidentReport).filter(IncidentReport.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident report not found.")
    prof = db.query(UserProfile).filter(UserProfile.user_id == admin.id).first()
    inc.status = payload.status
    inc.moderator_note = payload.moderator_note.strip()
    inc.reviewed_by_name = prof.full_name if prof else admin.email
    inc.updated_at = datetime.now(timezone.utc)

    # Notify original reporter if account exists
    if inc.reporter_user_id:
        db.add(
            Notification(
                user_id=inc.reporter_user_id,
                category="community",
                severity="info",
                title=f"Incident Report Updated → {payload.status}",
                body=f"Your report near {inc.area_label} is now '{payload.status}'. Note: {inc.moderator_note or 'Reviewed by moderation team.'}",
                action_url="/dashboard/incidents",
            )
        )
    log_audit(db, admin, "admin.incident_moderated", "incident_report", inc.id, {"status": payload.status})
    db.commit()
    return {"incident": _serialize_incident(db, inc, include_photo=False)}


@app.patch("/api/v1/admin/sensors/{sensor_id}")
def update_sensor_status(
    sensor_id: str,
    payload: SensorStatusPayload,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(SensorDevice).filter(SensorDevice.id == sensor_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sensor not found.")
    s.validation_status = payload.validation_status
    s.trust_score = payload.trust_score
    s.anomaly_flag = payload.anomaly_flag
    log_audit(db, admin, "admin.sensor_updated", "sensor_device", s.id, payload.model_dump())
    db.commit()
    return {"status": "updated"}


@app.patch("/api/v1/admin/users/{target_user_id}/role")
def admin_update_role(
    target_user_id: str,
    payload: RoleUpdatePayload,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if admin.role not in {"community_moderator", "civic_team"}:
        raise HTTPException(status_code=403, detail="Only Community Moderators or Civic Team admins may assign roles.")
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role.")
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    target.role = payload.role
    log_audit(db, admin, "admin.role_updated", "user", target.id, {"new_role": payload.role})
    db.commit()
    return {"status": "updated", "role": target.role}


@app.post("/api/v1/admin/broadcast")
def admin_broadcast_alert(
    payload: BroadcastPayload,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).filter(User.account_status == "active").all()
    sent = 0
    for u in users:
        if payload.city_filter != "All":
            p = db.query(UserProfile).filter(UserProfile.user_id == u.id).first()
            if not p or p.city != payload.city_filter:
                continue
        db.add(
            Notification(
                user_id=u.id,
                category=payload.category,
                severity=payload.severity,
                title=payload.title.strip(),
                body=payload.body.strip(),
                action_url="/dashboard/alerts",
            )
        )
        sent += 1
    log_audit(db, admin, "admin.broadcast_sent", "notification", payload.city_filter, {"recipients": sent})
    db.commit()
    return {"status": "sent", "recipients": sent}

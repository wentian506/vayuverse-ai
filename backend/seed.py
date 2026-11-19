"""
Initial database seeding & per-user starter workspace provisioning.
All sample/demo community sensors, campus zones, and example incidents carry `is_demo=True`
and explicit provenance classifications so they are never misrepresented as official live feeds.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
import bcrypt
from sqlalchemy.orm import Session
from .models import (
    ActionOutcome,
    AuditLog,
    CampusAdvisory,
    CampusZone,
    ConsentRecord,
    Household,
    HouseholdMember,
    IncidentReport,
    Institution,
    ModelVersion,
    MonitoringStation,
    Notification,
    RoutineProfile,
    SavedLocation,
    SensorDevice,
    SensorReading,
    User,
    UserPreference,
    UserProfile,
)
from .aqi_engine import resolve_city


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def provision_user_defaults(
    db: Session,
    user: User,
    full_name: str,
    city: str = "Ludhiana",
    language: str = "en",
    avatar_url: str | None = None,
) -> None:
    """Create isolated profile, preferences, routine, home rooms, household, consent & welcome notification."""
    meta = resolve_city(city)
    now = datetime.now(timezone.utc)

    profile = UserProfile(
        user_id=user.id,
        full_name=full_name,
        avatar_url=avatar_url,
        city=meta["city"],
        state=meta["state"],
        country=meta["country"],
        coarse_lat=meta["lat"],
        coarse_lon=meta["lon"],
        preferred_language=language,
        bio="Using VAYUVERSE AI for predictive air intelligence and healthier low-emission routines.",
    )
    prefs = UserPreference(
        user_id=user.id,
        aqi_alert_threshold=150,
        notify_aqi_alerts=True,
        notify_forecast_spikes=True,
        notify_community_updates=True,
        notify_campus_alerts=(user.role == "campus_admin"),
        notify_routine_reminders=True,
        coarse_location_only=True,
        routine_profiling_enabled=True,
    )
    default_blocks = [
        {
            "id": "blk-1",
            "time": "06:30",
            "title": "Morning Brisk Walk / Jog",
            "duration_min": 40,
            "setting": "outdoor",
            "transport": "walking",
            "flexible": True,
            "approved_shift": False,
        },
        {
            "id": "blk-2",
            "time": "08:30",
            "title": "Morning Commute to Campus / Office",
            "duration_min": 35,
            "setting": "outdoor",
            "transport": "ac_car",
            "flexible": False,
            "approved_shift": False,
        },
        {
            "id": "blk-3",
            "time": "14:00",
            "title": "Home Cross-Ventilation & Short Errand",
            "duration_min": 30,
            "setting": "outdoor",
            "transport": "walking",
            "flexible": True,
            "approved_shift": False,
        },
        {
            "id": "blk-4",
            "time": "18:30",
            "title": "Evening Return Commute",
            "duration_min": 40,
            "setting": "outdoor",
            "transport": "ac_car",
            "flexible": True,
            "approved_shift": False,
        },
    ]
    default_vent = [
        {"id": "v1", "label": "Keep street-facing windows shut during 06:00–09:00 & 19:00–23:00 peak traffic/inversion hours", "done": True},
        {"id": "v2", "label": "Run kitchen chimney / exhaust fan while cooking and for 15 minutes after", "done": True},
        {"id": "v3", "label": "Cross-ventilate for 20–30 minutes during lowest outdoor PM2.5 afternoon window", "done": False},
        {"id": "v4", "label": "Avoid indoor incense, mosquito coils, or open smoke sources on elevated AQI days", "done": False},
        {"id": "v5", "label": "Wet-mop hard floors instead of dry sweeping to limit PM10 resuspension", "done": False},
    ]
    routine = RoutineProfile(
        user_id=user.id,
        commute_start="08:30",
        commute_end="18:30",
        primary_transport="ac_car",
        exercise_window="06:30",
        has_indoor_purifier=True,
        schedule_blocks_json=json.dumps(default_blocks),
        ventilation_checklist_json=json.dumps(default_vent),
        indoor_survey_json=json.dumps(
            {
                "cooking_fuel": "lpg_with_exhaust",
                "incense_frequency": "rarely",
                "road_proximity": "within_200m",
                "dampness": "none",
                "purifier_count": 1,
            }
        ),
    )

    loc = SavedLocation(
        user_id=user.id,
        label=f"{meta['city']} (Primary)",
        city=meta["city"],
        state=meta["state"],
        country=meta["country"],
        lat=meta["lat"],
        lon=meta["lon"],
        is_primary=True,
    )

    # Starter VAYU Home rooms scoped solely to this user
    short_id = user.id[:8]
    rooms = [
        ("Living Room", "living_room", "HEPA Purifier (Living)", 74, 28.5, 610, 23.5, 48.0, "manual_sample"),
        ("Master Bedroom", "bedroom", "Bedroom HEPA Clean-Air Unit", 86, 19.0, 580, 22.8, 50.0, "manual_sample"),
        ("Kitchen", "kitchen", "Chimney Baffle Filter", 52, 46.0, 720, 25.4, 54.0, "manual_sample"),
        ("Study / Work Room", "study", None, None, None, None, None, None, "unmonitored"),
    ]
    db.add_all([profile, prefs, routine, loc])
    db.flush()

    for idx, (rname, rtype, fdev, flife, pm, co2, tc, rh, mode) in enumerate(rooms):
        dev = SensorDevice(
            owner_user_id=user.id,
            device_code=f"HOME-{short_id}-{idx+1}",
            display_name=rname,
            deployment_scope="home_room",
            room_type=rtype,
            city=meta["city"],
            trust_score=85,
            validation_status="manual_only" if mode == "unmonitored" else "calibrated",
            filter_device_name=fdev,
            filter_life_pct=flife,
            is_demo=(mode == "manual_sample"),
        )
        db.add(dev)
        db.flush()
        if pm is not None:
            db.add(
                SensorReading(
                    sensor_id=dev.id,
                    recorded_at=now - timedelta(hours=2),
                    pm25=pm,
                    pm10=round(pm * 1.4, 1),
                    co2_ppm=co2,
                    temp_c=tc,
                    humidity_pct=rh,
                    entry_method="sample_starter",
                    provenance="USER REPORTED",
                    notes="Starter room baseline (add your own indoor monitor reading anytime).",
                )
            )

    # Starter Household scoped to this user
    household_checklist = [
        {"id": "hc1", "label": "Keep well-fitted N95/FFP2 masks by the front entrance", "done": True},
        {"id": "hc2", "label": "Run bedroom HEPA purifier 45 min before sleep when outdoor NAQI > 150", "done": False},
        {"id": "hc3", "label": "Check Before-You-Go brief prior to morning school & office departures", "done": True},
        {"id": "hc4", "label": "Coordinate afternoon window ventilation with family members", "done": False},
    ]
    hh = Household(
        owner_user_id=user.id,
        name=f"{full_name.split()[0]}'s Household",
        city=meta["city"],
        checklist_json=json.dumps(household_checklist),
    )
    db.add(hh)
    db.flush()
    db.add(
        HouseholdMember(
            household_id=hh.id,
            name=full_name,
            relation="Self (Household Admin)",
            age_group="Adult",
            routine_window="08:30 - 18:30",
            care_preference="Prefers afternoon outdoor workouts and low-emission transit.",
            aqi_threshold=150,
            notify_enabled=True,
        )
    )

    # Initial Consent records
    for ctype, granted in [
        ("terms_privacy", True),
        ("coarse_location", True),
        ("routine_profiling", True),
        ("incident_media", True),
        ("research_opt_in", False),
    ]:
        db.add(ConsentRecord(user_id=user.id, consent_type=ctype, granted=granted, version="v1.0"))

    # Welcome notifications
    db.add_all(
        [
            Notification(
                user_id=user.id,
                category="aqi_alert",
                severity="info",
                title=f"Live Air Intelligence active for {meta['city']}",
                body=f"Connected to Open-Meteo CAMS regional forecasts & CPCB Indian NAQI engine. Alert threshold set to NAQI {prefs.aqi_alert_threshold}.",
                action_url="/dashboard/live-air",
                is_read=False,
            ),
            Notification(
                user_id=user.id,
                category="forecast",
                severity="warning",
                title="Morning & Late-Evening Inversion Advisory",
                body="Cooler boundary-layer conditions commonly trap PM2.5 between 06:00–09:00 and 20:00–23:00 IST. Review your Daily Replanner for cleaner midday windows.",
                action_url="/dashboard/replanner",
                is_read=False,
            ),
            Notification(
                user_id=user.id,
                category="reminder",
                severity="info",
                title="Verify Data Provenance Anytime",
                body="Every figure in VAYUVERSE AI carries its exact source classification (MEASURED, MODEL FORECAST, ESTIMATED, USER REPORTED, or AI SUMMARY).",
                action_url="/dashboard/trust",
                is_read=True,
            ),
        ]
    )

    db.add(
        AuditLog(
            actor_user_id=user.id,
            actor_email=user.email,
            action="account.created",
            target_type="user",
            target_id=user.id,
            metadata_json=json.dumps({"provider": user.auth_provider, "role": user.role, "city": meta["city"]}),
        )
    )


def seed_platform_data(db: Session) -> None:
    """Idempotent seed for reference stations, model registry, campus demo, community network & reviewer users."""
    if db.query(ModelVersion).count() == 0:
        db.add_all(
            [
                ModelVersion(
                    model_code="CAMS-IFS-48R1",
                    provider="Copernicus Atmosphere Monitoring Service (via Open-Meteo)",
                    version="Cycle 48r1 (2026)",
                    spatial_resolution_km=40.0,
                    max_horizon_hours=72,
                    uncertainty_profile="±15–22% (0–12h nowcast), ±23–32% (13–36h), ±33–42% (37–72h)",
                    limitations="Regional background chemical transport grid (~11–40 km). Cannot resolve individual street canyons, indoor spaces, or transient local burning plumes.",
                    active=True,
                ),
                ModelVersion(
                    model_code="OPENMETEO-NWP-BLEND",
                    provider="Open-Meteo Weather Forecast (ECMWF IFS / NOAA GFS)",
                    version="v1.4 Multi-Model",
                    spatial_resolution_km=11.0,
                    max_horizon_hours=72,
                    uncertainty_profile="Temperature ±1.2°C, Wind speed ±15% over 48h",
                    limitations="Gridded boundary-layer meteorology; urban heat-island microclimates may deviate.",
                    active=True,
                ),
                ModelVersion(
                    model_code="VAYU-NAQI-CPCB-V1",
                    provider="VAYUVERSE Deterministic Environmental Engine",
                    version="v1.0 (CPCB 2014 Breakpoints)",
                    spatial_resolution_km=0.0,
                    max_horizon_hours=72,
                    uncertainty_profile="Deterministic piecewise-linear index transform; inherits upstream concentration uncertainty.",
                    limitations="Computed over instantaneous/hourly pollutant inputs for transparent comparison; official CPCB daily bulletins use 24h/8h rolling station averages.",
                    active=True,
                ),
                ModelVersion(
                    model_code="VAYU-EXPOSURE-SIM-V1",
                    provider="VAYUVERSE Future Me Scenario Engine",
                    version="v1.0",
                    spatial_resolution_km=0.0,
                    max_horizon_hours=24,
                    uncertainty_profile="Literature-derived cabin infiltration (0.25×–1.15×) and ventilation rates (0.60–2.80 m³/h).",
                    limitations="Relative scenario comparison metric ONLY — never an individual clinical or medical inhaled dose.",
                    active=True,
                ),
            ]
        )

    if db.query(MonitoringStation).count() == 0:
        stations = [
            ("CPCB-PB-LDH-01", "Punjab Agricultural University (PAU) CAAQMS", "PPCB / CPCB", "Ludhiana", "Punjab", 30.9010, 75.8070),
            ("CPCB-DL-ITO-01", "ITO Continuous Ambient Monitoring Station", "CPCB", "New Delhi", "Delhi NCR", 28.6286, 77.2410),
            ("CPCB-DL-LRD-02", "Lodhi Road IMD CAAQMS", "IMD / CPCB", "New Delhi", "Delhi NCR", 28.5918, 77.2273),
            ("CPCB-CH-S25-01", "Sector 25 CAAQMS", "CPCC / CPCB", "Chandigarh", "Chandigarh UT", 30.7512, 76.7628),
            ("CPCB-PB-ASR-01", "Golden Temple Complex CAAQMS", "PPCB / CPCB", "Amritsar", "Punjab", 31.6200, 74.8765),
            ("CPCB-MH-BKC-01", "Bandra Kurla Complex CAAQMS", "MPCB / CPCB", "Mumbai", "Maharashtra", 19.0654, 72.8681),
            ("CPCB-KA-CBP-01", "Cubbon Park CAAQMS", "KSPCB / CPCB", "Bengaluru", "Karnataka", 12.9763, 77.5929),
            ("CPCB-WB-VIC-01", "Victoria Memorial CAAQMS", "WBPCB / CPCB", "Kolkata", "West Bengal", 22.5448, 88.3426),
            ("CPCB-TG-SNT-01", "Sanathnagar CAAQMS", "TGPCB / CPCB", "Hyderabad", "Telangana", 17.4563, 78.4439),
        ]
        for code, name, op, city, state, lat, lon in stations:
            db.add(
                MonitoringStation(
                    station_code=code,
                    name=name,
                    operator=op,
                    city=city,
                    state=state,
                    lat=lat,
                    lon=lon,
                    station_tier="official_reference",
                    validation_status="verified_registry",
                )
            )

    if db.query(Institution).count() == 0:
        inst = Institution(
            name="Greenfield Institute of Science & School Campus (Demo Pilot)",
            institution_type="K-12 & University Campus",
            city="Ludhiana",
            lat=30.9035,
            lon=75.8125,
            is_demo=True,
        )
        db.add(inst)
        db.flush()
        zones = [
            ("Block A — Senior Classrooms (101–108)", "classroom", 240, 0.0012, -0.0015, "online", 24.2, 640, 23.1, 49.0, "HEPA + MERV-13 Active"),
            ("Block B — Primary Wing", "classroom", 180, -0.0010, -0.0018, "online", 19.8, 590, 22.8, 51.0, "Clean-Air Classroom Mode"),
            ("Central Library & Innovation Lab", "indoor_common", 320, 0.0005, 0.0012, "online", 16.5, 540, 22.4, 46.0, "Demand-Controlled Fresh Air"),
            ("Chemistry & Maker Wing", "laboratory", 90, 0.0018, 0.0010, "needs_calibration", 38.4, 780, 24.2, 52.0, "Local Exhaust Running"),
            ("North Athletics Track & Assembly Ground", "outdoor_field", 600, 0.0024, -0.0004, "online", 62.5, 425, 20.6, 56.0, "Ambient Outdoor Zone"),
            ("Main Auditorium", "auditorium", 450, -0.0018, 0.0015, "unmonitored", None, None, None, None, "Sensor Deployment Planned"),
        ]
        for zname, ztype, cap, dlat, dlon, status, pm, co2, tc, rh, vent in zones:
            db.add(
                CampusZone(
                    institution_id=inst.id,
                    zone_name=zname,
                    zone_type=ztype,
                    capacity=cap,
                    lat_offset=dlat,
                    lon_offset=dlon,
                    sensor_status=status,
                    pm25=pm,
                    co2_ppm=co2,
                    temp_c=tc,
                    humidity_pct=rh,
                    ventilation_state=vent,
                    provenance="MEASURED",
                    is_demo=True,
                )
            )
        db.add_all(
            [
                CampusAdvisory(
                    institution_id=inst.id,
                    author_name="Campus Air Desk (Demo)",
                    audience="Parents, Students & Faculty",
                    title="Morning Assembly Shifted Indoors; PE Moved to 14:00 Window",
                    message="Due to elevated early-morning regional PM2.5, 08:00 outdoor assembly is held in Block A commons. Light outdoor sports are scheduled during the cleaner 13:30–15:30 afternoon window.",
                    action_type="schedule_adjustment",
                ),
                CampusAdvisory(
                    institution_id=inst.id,
                    author_name="Facilities Engineering (Demo)",
                    audience="Staff & Operations",
                    title="Block B HEPA Pre-Filters Inspected & Chemistry Node Queued for Calibration",
                    message="Routine weekly sensor trust check flagged +9% drift on Chemistry Wing optical node; co-location check scheduled.",
                    action_type="maintenance",
                ),
            ]
        )

    if db.query(SensorDevice).filter(SensorDevice.deployment_scope == "community").count() == 0:
        now = datetime.now(timezone.utc)
        comm_nodes = [
            ("COMM-LDH-101", "Sarabha Nagar RWA Node #1 (Demo Community)", "Ludhiana", 30.8860, 75.8220, 91, "calibrated", False, 54.2, 86.0),
            ("COMM-LDH-102", "Civil Lines Library Roof Node (Demo Community)", "Ludhiana", 30.9150, 75.8445, 87, "calibrated", False, 58.6, 92.4),
            ("COMM-LDH-103", "Gill Road Transit Corridor Node (Demo Community)", "Ludhiana", 30.8795, 75.8640, 74, "needs_calibration", False, 73.8, 121.0),
            ("COMM-LDH-104", "Focal Point East Optical Node (Demo Community)", "Ludhiana", 30.8765, 75.9120, 48, "anomaly_flagged", True, 189.0, 260.0),
            ("COMM-DEL-201", "Hauz Khas Citizen Air Node (Demo Community)", "New Delhi", 28.5502, 77.2015, 89, "calibrated", False, 98.4, 156.0),
            ("COMM-CHD-301", "Sector 15 Eco-Club Node (Demo Community)", "Chandigarh", 30.7520, 76.7715, 93, "calibrated", False, 44.1, 74.5),
        ]
        for code, name, city, lat, lon, trust, vstat, anom, pm25, pm10 in comm_nodes:
            dev = SensorDevice(
                device_code=code,
                display_name=name,
                deployment_scope="community",
                city=city,
                lat=lat,
                lon=lon,
                trust_score=trust,
                validation_status=vstat,
                anomaly_flag=anom,
                is_demo=True,
            )
            db.add(dev)
            db.flush()
            db.add(
                SensorReading(
                    sensor_id=dev.id,
                    recorded_at=now - timedelta(minutes=22),
                    pm25=pm25,
                    pm10=pm10,
                    temp_c=20.2,
                    humidity_pct=57.0,
                    entry_method="sensor_demo",
                    provenance="MEASURED",
                    notes="Sample low-cost community sensor reading (humidity-corrected; separate from official CPCB tier).",
                )
            )

    if db.query(IncidentReport).count() == 0:
        now = datetime.now(timezone.utc)
        sample_reports = [
            ("dust", "moderate", "Unscreened road-widening excavation dust swirling along service lane during dry afternoon breeze. Water sprinkling requested.", "Ludhiana", "Ferozepur Road Corridor (Coarse ~1 km)", 30.892, 75.838, "Under Review", "Forwarded to municipal dust-suppression desk for verification.", 5),
            ("waste_burning", "high", "Visible grey smoke from roadside dry-leaf and mixed waste pile burning near open plot during evening hours.", "Ludhiana", "Haibowal North Sector (Coarse ~1 km)", 30.928, 75.818, "Acknowledged", "Geo-cluster matched; awaiting volunteer visual re-check.", 11),
            ("smoke", "low", "Intermittent dark haze and pungent smoke odour reported along outer ring road stretch around dusk.", "Ludhiana", "Southern Bypass Belt (Coarse ~1 km)", 30.858, 75.852, "Submitted", None, 2),
            ("dust", "low", "Construction aggregate uncovered on roadside footpath; resolved after tarpaulin covering and wet sweeping.", "Chandigarh", "Sector 34 Corridor (Coarse ~1 km)", 30.722, 76.768, "Resolved", "Site mitigation confirmed and case closed positively.", 30),
            ("waste_burning", "moderate", "Open trash smouldering observed near drainage embankment early morning.", "New Delhi", "East Ring Corridor (Coarse ~1 km)", 28.638, 77.285, "Unverified", "Single report without photo attachment; retained as unverified community signal.", 18),
        ]
        for cat, sev, desc, city, area, lat, lon, status, mnote, hrs_ago in sample_reports:
            db.add(
                IncidentReport(
                    reporter_alias="Sample Community Report",
                    category=cat,
                    severity=sev,
                    description=desc,
                    city=city,
                    area_label=area,
                    approx_lat=lat,
                    approx_lon=lon,
                    observed_at=now - timedelta(hours=hrs_ago),
                    status=status,
                    moderator_note=mnote,
                    reviewed_by_name="VAYU Moderation Desk" if mnote else None,
                    provenance="USER REPORTED",
                    is_demo=True,
                )
            )

    # Seed two real, password-hashed reviewer accounts (Individual + Community Moderator/Admin)
    if not db.query(User).filter(User.email == "arjun@vayuverse.app").first():
        u1 = User(
            email="arjun@vayuverse.app",
            password_hash=hash_password("VayuUser@2026"),
            auth_provider="email",
            role="individual",
            onboarding_completed=True,
        )
        db.add(u1)
        db.flush()
        provision_user_defaults(db, u1, "Arjun Gill", city="Ludhiana", language="en")
        db.add_all(
            [
                ActionOutcome(
                    user_id=u1.id,
                    action_category="routine_shift",
                    title="Shifted morning jog from 06:30 to 14:30 lower-PM2.5 window",
                    estimated_exposure_saved_pct=31.5,
                    estimated_co2_saved_g=0,
                ),
                ActionOutcome(
                    user_id=u1.id,
                    action_category="low_emission_mobility",
                    title="Chose shared electric transit instead of solo car trip (9 km)",
                    estimated_exposure_saved_pct=18.0,
                    estimated_co2_saved_g=1180,
                ),
            ]
        )

    if not db.query(User).filter(User.email == "meera.mod@vayuverse.app").first():
        u2 = User(
            email="meera.mod@vayuverse.app",
            password_hash=hash_password("VayuAdmin@2026"),
            auth_provider="email",
            role="community_moderator",
            onboarding_completed=True,
        )
        db.add(u2)
        db.flush()
        provision_user_defaults(db, u2, "Dr. Meera Kaur", city="Ludhiana", language="en")

    db.commit()

-- =============================================================================
-- VAYUVERSE AI — Production PostgreSQL + PostGIS + TimescaleDB Schema
-- Supports Supabase PostgreSQL, Timescale Cloud, and self-hosted Docker PostGIS.
-- Covers all 22 core product entities, RBAC roles, provenance classes, and indexes.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
-- Uncomment on TimescaleDB / Timescale Cloud instances:
-- CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- Canonical enumerations
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'individual',
    'family_caregiver',
    'campus_admin',
    'community_volunteer',
    'community_moderator',
    'civic_team',
    'research_user'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE data_provenance AS ENUM (
    'MEASURED',
    'MODEL FORECAST',
    'ESTIMATED',
    'USER REPORTED',
    'AI SUMMARY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM (
    'Submitted',
    'Acknowledged',
    'Under Review',
    'Resolved',
    'Closed',
    'Unverified'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  google_sub VARCHAR(255) UNIQUE,
  auth_provider VARCHAR(32) NOT NULL DEFAULT 'email',
  role user_role NOT NULL DEFAULT 'individual',
  account_status VARCHAR(32) NOT NULL DEFAULT 'active',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 2. User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(160) NOT NULL,
  avatar_url TEXT,
  city VARCHAR(120) NOT NULL DEFAULT 'Ludhiana',
  state VARCHAR(120) NOT NULL DEFAULT 'Punjab',
  country VARCHAR(80) NOT NULL DEFAULT 'India',
  coarse_lat DOUBLE PRECISION NOT NULL DEFAULT 30.9010,
  coarse_lon DOUBLE PRECISION NOT NULL DEFAULT 75.8573,
  coarse_geom GEOMETRY(Point, 4326),
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en',
  bio VARCHAR(500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  aqi_alert_threshold INTEGER NOT NULL DEFAULT 150,
  notify_aqi_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  notify_forecast_spikes BOOLEAN NOT NULL DEFAULT TRUE,
  notify_community_updates BOOLEAN NOT NULL DEFAULT TRUE,
  notify_campus_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  notify_routine_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  coarse_location_only BOOLEAN NOT NULL DEFAULT TRUE,
  routine_profiling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  low_bandwidth_mode BOOLEAN NOT NULL DEFAULT FALSE,
  reduced_motion BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Households (Family Air Guardian)
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  city VARCHAR(120) NOT NULL,
  checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  relation VARCHAR(64) NOT NULL,
  age_group VARCHAR(32) NOT NULL,
  routine_window VARCHAR(120),
  care_preference VARCHAR(280),
  aqi_threshold INTEGER NOT NULL DEFAULT 150,
  notify_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Institutions (VAYU Campus)
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  institution_type VARCHAR(64) NOT NULL DEFAULT 'school_university',
  city VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  boundary_geom GEOMETRY(Polygon, 4326),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campus_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  zone_name VARCHAR(140) NOT NULL,
  zone_type VARCHAR(64) NOT NULL,
  capacity INTEGER,
  sensor_status VARCHAR(32) NOT NULL DEFAULT 'online',
  pm25 DOUBLE PRECISION,
  co2_ppm INTEGER,
  temp_c DOUBLE PRECISION,
  humidity_pct DOUBLE PRECISION,
  ventilation_state VARCHAR(64),
  provenance data_provenance NOT NULL DEFAULT 'MEASURED',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campus_advisories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  audience VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Saved Locations
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120),
  country VARCHAR(80) NOT NULL DEFAULT 'India',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Monitoring Stations (Official Reference Tier)
CREATE TABLE IF NOT EXISTS monitoring_stations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_code VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  operator VARCHAR(140) NOT NULL, -- e.g. CPCB, PPCB, DPCC, MPCB
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326),
  station_tier VARCHAR(32) NOT NULL DEFAULT 'official_reference',
  pollutants_monitored TEXT[] NOT NULL DEFAULT ARRAY['PM2.5','PM10','NO2','SO2','CO','O3'],
  validation_status VARCHAR(32) NOT NULL DEFAULT 'verified',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 8. Sensor Devices (Indoor VAYU Home + Community Sensor Network)
CREATE TABLE IF NOT EXISTS sensor_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  device_code VARCHAR(80) UNIQUE NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  deployment_scope VARCHAR(32) NOT NULL, -- 'home_room' | 'community' | 'campus'
  room_type VARCHAR(64),
  city VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  geom GEOMETRY(Point, 4326),
  trust_score INTEGER NOT NULL DEFAULT 85,
  validation_status VARCHAR(32) NOT NULL DEFAULT 'calibrated',
  anomaly_flag BOOLEAN NOT NULL DEFAULT FALSE,
  last_calibrated_at TIMESTAMPTZ,
  filter_life_pct INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Sensor Readings (TimescaleDB Hypertable candidate)
CREATE TABLE IF NOT EXISTS sensor_readings (
  id UUID DEFAULT uuid_generate_v4(),
  sensor_id UUID NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pm25 DOUBLE PRECISION,
  pm10 DOUBLE PRECISION,
  co2_ppm INTEGER,
  temp_c DOUBLE PRECISION,
  humidity_pct DOUBLE PRECISION,
  entry_method VARCHAR(32) NOT NULL DEFAULT 'sensor', -- 'sensor' | 'manual'
  provenance data_provenance NOT NULL DEFAULT 'MEASURED',
  notes VARCHAR(280),
  PRIMARY KEY (id, recorded_at)
);
-- SELECT create_hypertable('sensor_readings', 'recorded_at', if_not_exists => TRUE);

-- 10. Pollutant Observations (TimescaleDB Hypertable candidate)
CREATE TABLE IF NOT EXISTS pollutant_observations (
  id UUID DEFAULT uuid_generate_v4(),
  station_id UUID REFERENCES monitoring_stations(id) ON DELETE SET NULL,
  city VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  indian_aqi INTEGER,
  aqi_category VARCHAR(32),
  dominant_pollutant VARCHAR(16),
  pm25 DOUBLE PRECISION,
  pm10 DOUBLE PRECISION,
  no2 DOUBLE PRECISION,
  so2 DOUBLE PRECISION,
  co DOUBLE PRECISION,
  o3 DOUBLE PRECISION,
  temp_c DOUBLE PRECISION,
  humidity_pct DOUBLE PRECISION,
  wind_kph DOUBLE PRECISION,
  wind_dir_deg INTEGER,
  source_name VARCHAR(160) NOT NULL,
  provenance data_provenance NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, observed_at)
);
-- SELECT create_hypertable('pollutant_observations', 'observed_at', if_not_exists => TRUE);

-- 11. Model Versions
CREATE TABLE IF NOT EXISTS model_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_code VARCHAR(80) UNIQUE NOT NULL,
  provider VARCHAR(140) NOT NULL,
  version VARCHAR(64) NOT NULL,
  spatial_resolution_km DOUBLE PRECISION NOT NULL,
  max_horizon_hours INTEGER NOT NULL,
  uncertainty_profile TEXT NOT NULL,
  limitations TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Forecast Runs
CREATE TABLE IF NOT EXISTS forecast_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_version_id UUID REFERENCES model_versions(id) ON DELETE SET NULL,
  city VARCHAR(120) NOT NULL,
  run_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  horizon_hours INTEGER NOT NULL DEFAULT 72,
  source_name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'completed'
);

-- 13. Forecast Grid Cells
CREATE TABLE IF NOT EXISTS forecast_grid_cells (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_run_id UUID NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  valid_at TIMESTAMPTZ NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lon DOUBLE PRECISION NOT NULL,
  cell_geom GEOMETRY(Polygon, 4326),
  pm25 DOUBLE PRECISION,
  pm10 DOUBLE PRECISION,
  no2 DOUBLE PRECISION,
  o3 DOUBLE PRECISION,
  indian_aqi INTEGER,
  uncertainty_pct DOUBLE PRECISION NOT NULL,
  provenance data_provenance NOT NULL DEFAULT 'MODEL FORECAST'
);

-- 14. Route & Future-Me Scenarios
CREATE TABLE IF NOT EXISTS route_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_type VARCHAR(32) NOT NULL, -- 'future_me' | 'route_comparison'
  title VARCHAR(180) NOT NULL,
  city VARCHAR(120) NOT NULL,
  input_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  exposure_delta_pct DOUBLE PRECISION,
  emissions_delta_g DOUBLE PRECISION,
  provenance data_provenance NOT NULL DEFAULT 'ESTIMATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Routine Profiles & Daily Schedule Blocks
CREATE TABLE IF NOT EXISTS routine_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commute_start VARCHAR(16) DEFAULT '08:30',
  commute_end VARCHAR(16) DEFAULT '18:00',
  primary_transport VARCHAR(48) DEFAULT 'metro_ev',
  exercise_window VARCHAR(32) DEFAULT '06:30',
  has_indoor_purifier BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_blocks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Recommendations & Explainable AI Audit Trail
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  module VARCHAR(64) NOT NULL,
  prompt_or_trigger TEXT NOT NULL,
  summary TEXT NOT NULL,
  inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  provenance data_provenance NOT NULL DEFAULT 'AI SUMMARY',
  model_used VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Citizen Incident Reports
CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category VARCHAR(64) NOT NULL, -- smoke, waste_burning, dust, industrial_plume, traffic, odour
  severity VARCHAR(24) NOT NULL DEFAULT 'moderate',
  description TEXT NOT NULL,
  city VARCHAR(120) NOT NULL,
  area_label VARCHAR(160) NOT NULL,
  approx_lat DOUBLE PRECISION NOT NULL,
  approx_lon DOUBLE PRECISION NOT NULL,
  approx_geom GEOMETRY(Point, 4326),
  observed_at TIMESTAMPTZ NOT NULL,
  status incident_status NOT NULL DEFAULT 'Submitted',
  duplicate_of_id UUID REFERENCES incident_reports(id) ON DELETE SET NULL,
  moderator_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  provenance data_provenance NOT NULL DEFAULT 'USER REPORTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Evidence Attachments
CREATE TABLE IF NOT EXISTS evidence_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path_or_data TEXT NOT NULL,
  exif_stripped BOOLEAN NOT NULL DEFAULT TRUE,
  moderation_state VARCHAR(32) NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. Civic Cases (Workflow linkage)
CREATE TABLE IF NOT EXISTS civic_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number VARCHAR(48) UNIQUE NOT NULL,
  incident_id UUID REFERENCES incident_reports(id) ON DELETE SET NULL,
  assigned_team VARCHAR(120),
  status VARCHAR(48) NOT NULL DEFAULT 'open',
  resolution_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(48) NOT NULL, -- aqi_alert, pollution_event, forecast, reminder, community, campus
  severity VARCHAR(24) NOT NULL DEFAULT 'info',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  action_url VARCHAR(200),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. Consent Records (DPDP / GDPR Compliance)
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(64) NOT NULL, -- terms_privacy, coarse_location, routine_profiling, incident_media, research_opt_in
  granted BOOLEAN NOT NULL,
  version VARCHAR(24) NOT NULL DEFAULT 'v1.0',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. Action Outcomes & Audit Logs (Action-to-Impact Ledger)
CREATE TABLE IF NOT EXISTS action_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_category VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  estimated_exposure_saved_pct DOUBLE PRECISION,
  estimated_co2_saved_g DOUBLE PRECISION,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(96) NOT NULL,
  target_type VARCHAR(64),
  target_id VARCHAR(96),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Spatial Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_stations_geom ON monitoring_stations USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_sensors_scope_city ON sensor_devices(deployment_scope, city);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time ON sensor_readings(sensor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_city_time ON pollutant_observations(city, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_cells_run_valid ON forecast_grid_cells(forecast_run_id, valid_at);
CREATE INDEX IF NOT EXISTS idx_scenarios_user_time ON route_scenarios(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_city_status ON incident_reports(city, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_geom ON incident_reports USING GIST(approx_geom);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_time ON recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);

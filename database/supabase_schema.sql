-- =============================================================================
-- VAYUVERSE AI — Supabase Free-Tier PostgreSQL Schema (100% SQLAlchemy-Matched)
-- How to use: Open Supabase Dashboard -> SQL Editor -> New Query -> Paste & Run.
-- (Note: FastAPI on Render ALSO auto-creates any missing tables on startup,
--  and running this script additionally enables Row Level Security on all tables
--  so Supabase Security Advisor passes with zero warnings.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
	id VARCHAR(36) NOT NULL, 
	actor_user_id VARCHAR(36), 
	actor_email VARCHAR(255), 
	action VARCHAR(96) NOT NULL, 
	target_type VARCHAR(64), 
	target_id VARCHAR(96), 
	metadata_json TEXT, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_audit_logs_actor_user_id ON audit_logs (actor_user_id);

CREATE TABLE IF NOT EXISTS contact_inquiries (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(140) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	organization VARCHAR(160), 
	category VARCHAR(64), 
	message TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS institutions (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	institution_type VARCHAR(64), 
	city VARCHAR(120) NOT NULL, 
	lat FLOAT NOT NULL, 
	lon FLOAT NOT NULL, 
	is_demo BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS model_versions (
	id VARCHAR(36) NOT NULL, 
	model_code VARCHAR(80) NOT NULL, 
	provider VARCHAR(140) NOT NULL, 
	version VARCHAR(64) NOT NULL, 
	spatial_resolution_km FLOAT NOT NULL, 
	max_horizon_hours INTEGER NOT NULL, 
	uncertainty_profile TEXT NOT NULL, 
	limitations TEXT NOT NULL, 
	active BOOLEAN, 
	PRIMARY KEY (id), 
	UNIQUE (model_code)
);

CREATE TABLE IF NOT EXISTS monitoring_stations (
	id VARCHAR(36) NOT NULL, 
	station_code VARCHAR(64) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	operator VARCHAR(140) NOT NULL, 
	city VARCHAR(120) NOT NULL, 
	state VARCHAR(120) NOT NULL, 
	lat FLOAT NOT NULL, 
	lon FLOAT NOT NULL, 
	station_tier VARCHAR(32), 
	pollutants_csv VARCHAR(160), 
	validation_status VARCHAR(32), 
	PRIMARY KEY (id), 
	UNIQUE (station_code)
);
CREATE INDEX IF NOT EXISTS ix_monitoring_stations_city ON monitoring_stations (city);

CREATE TABLE IF NOT EXISTS users (
	id VARCHAR(36) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	password_hash TEXT, 
	google_sub VARCHAR(255), 
	auth_provider VARCHAR(32) NOT NULL, 
	role VARCHAR(48) NOT NULL, 
	account_status VARCHAR(32) NOT NULL, 
	onboarding_completed BOOLEAN NOT NULL, 
	reset_token_hash VARCHAR(255), 
	reset_token_expires_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	last_login_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE TABLE IF NOT EXISTS action_outcomes (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	action_category VARCHAR(64) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	estimated_exposure_saved_pct FLOAT, 
	estimated_co2_saved_g FLOAT, 
	status VARCHAR(32), 
	completed_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_action_outcomes_user_id ON action_outcomes (user_id);

CREATE TABLE IF NOT EXISTS campus_advisories (
	id VARCHAR(36) NOT NULL, 
	institution_id VARCHAR(36), 
	author_name VARCHAR(140) NOT NULL, 
	audience VARCHAR(64) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	message TEXT NOT NULL, 
	action_type VARCHAR(64) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(institution_id) REFERENCES institutions (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_campus_advisories_institution_id ON campus_advisories (institution_id);

CREATE TABLE IF NOT EXISTS campus_zones (
	id VARCHAR(36) NOT NULL, 
	institution_id VARCHAR(36), 
	zone_name VARCHAR(140) NOT NULL, 
	zone_type VARCHAR(64) NOT NULL, 
	capacity INTEGER, 
	lat_offset FLOAT, 
	lon_offset FLOAT, 
	sensor_status VARCHAR(32), 
	pm25 FLOAT, 
	co2_ppm INTEGER, 
	temp_c FLOAT, 
	humidity_pct FLOAT, 
	ventilation_state VARCHAR(64), 
	provenance VARCHAR(32), 
	is_demo BOOLEAN, 
	recorded_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(institution_id) REFERENCES institutions (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_campus_zones_institution_id ON campus_zones (institution_id);

CREATE TABLE IF NOT EXISTS chat_messages (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	thread_id VARCHAR(64) NOT NULL, 
	thread_title VARCHAR(160), 
	role VARCHAR(16) NOT NULL, 
	content TEXT NOT NULL, 
	sources_json TEXT, 
	reasoning_json TEXT, 
	model_used VARCHAR(80), 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_chat_messages_thread_id ON chat_messages (thread_id);
CREATE INDEX IF NOT EXISTS ix_chat_messages_user_id ON chat_messages (user_id);

CREATE TABLE IF NOT EXISTS consent_records (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	consent_type VARCHAR(64) NOT NULL, 
	granted BOOLEAN NOT NULL, 
	version VARCHAR(24), 
	recorded_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_consent_records_user_id ON consent_records (user_id);

CREATE TABLE IF NOT EXISTS households (
	id VARCHAR(36) NOT NULL, 
	owner_user_id VARCHAR(36), 
	name VARCHAR(140) NOT NULL, 
	city VARCHAR(120) NOT NULL, 
	checklist_json TEXT, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_households_owner_user_id ON households (owner_user_id);

CREATE TABLE IF NOT EXISTS incident_reports (
	id VARCHAR(36) NOT NULL, 
	reporter_user_id VARCHAR(36), 
	reporter_alias VARCHAR(80), 
	category VARCHAR(64) NOT NULL, 
	severity VARCHAR(24), 
	description TEXT NOT NULL, 
	city VARCHAR(120) NOT NULL, 
	area_label VARCHAR(160) NOT NULL, 
	approx_lat FLOAT NOT NULL, 
	approx_lon FLOAT NOT NULL, 
	observed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	status VARCHAR(32), 
	duplicate_of_id VARCHAR(36), 
	moderator_note TEXT, 
	reviewed_by_name VARCHAR(120), 
	has_photo BOOLEAN, 
	provenance VARCHAR(32), 
	is_demo BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(reporter_user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_incident_reports_city ON incident_reports (city);
CREATE INDEX IF NOT EXISTS ix_incident_reports_reporter_user_id ON incident_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS ix_incident_reports_status ON incident_reports (status);

CREATE TABLE IF NOT EXISTS locations (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	label VARCHAR(120) NOT NULL, 
	city VARCHAR(120) NOT NULL, 
	state VARCHAR(120), 
	country VARCHAR(80), 
	lat FLOAT NOT NULL, 
	lon FLOAT NOT NULL, 
	is_primary BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_locations_user_id ON locations (user_id);

CREATE TABLE IF NOT EXISTS notifications (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	category VARCHAR(48) NOT NULL, 
	severity VARCHAR(24), 
	title VARCHAR(200) NOT NULL, 
	body TEXT NOT NULL, 
	action_url VARCHAR(200), 
	is_read BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications (is_read);
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id);

CREATE TABLE IF NOT EXISTS recommendations (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	module VARCHAR(64) NOT NULL, 
	prompt_or_trigger TEXT NOT NULL, 
	summary TEXT NOT NULL, 
	inputs_json TEXT, 
	sources_json TEXT, 
	provenance VARCHAR(32), 
	model_used VARCHAR(80) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_recommendations_user_id ON recommendations (user_id);

CREATE TABLE IF NOT EXISTS route_scenarios (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	scenario_type VARCHAR(32) NOT NULL, 
	title VARCHAR(180) NOT NULL, 
	city VARCHAR(120) NOT NULL, 
	input_json TEXT NOT NULL, 
	result_json TEXT NOT NULL, 
	exposure_delta_pct FLOAT, 
	emissions_delta_g FLOAT, 
	provenance VARCHAR(32), 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_route_scenarios_user_id ON route_scenarios (user_id);

CREATE TABLE IF NOT EXISTS routine_profiles (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	commute_start VARCHAR(16), 
	commute_end VARCHAR(16), 
	primary_transport VARCHAR(48), 
	exercise_window VARCHAR(32), 
	has_indoor_purifier BOOLEAN, 
	schedule_blocks_json TEXT, 
	ventilation_checklist_json TEXT, 
	indoor_survey_json TEXT, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_routine_profiles_user_id ON routine_profiles (user_id);

CREATE TABLE IF NOT EXISTS sensor_devices (
	id VARCHAR(36) NOT NULL, 
	owner_user_id VARCHAR(36), 
	device_code VARCHAR(80) NOT NULL, 
	display_name VARCHAR(160) NOT NULL, 
	deployment_scope VARCHAR(32) NOT NULL, 
	room_type VARCHAR(64), 
	city VARCHAR(120) NOT NULL, 
	lat FLOAT, 
	lon FLOAT, 
	trust_score INTEGER, 
	validation_status VARCHAR(32), 
	anomaly_flag BOOLEAN, 
	filter_device_name VARCHAR(120), 
	filter_life_pct INTEGER, 
	is_demo BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE, 
	UNIQUE (device_code)
);
CREATE INDEX IF NOT EXISTS ix_sensor_devices_deployment_scope ON sensor_devices (deployment_scope);
CREATE INDEX IF NOT EXISTS ix_sensor_devices_owner_user_id ON sensor_devices (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_sensor_devices_city ON sensor_devices (city);

CREATE TABLE IF NOT EXISTS user_preferences (
	user_id VARCHAR(36) NOT NULL, 
	aqi_alert_threshold INTEGER NOT NULL, 
	notify_aqi_alerts BOOLEAN NOT NULL, 
	notify_forecast_spikes BOOLEAN NOT NULL, 
	notify_community_updates BOOLEAN NOT NULL, 
	notify_campus_alerts BOOLEAN NOT NULL, 
	notify_routine_reminders BOOLEAN NOT NULL, 
	coarse_location_only BOOLEAN NOT NULL, 
	routine_profiling_enabled BOOLEAN NOT NULL, 
	low_bandwidth_mode BOOLEAN NOT NULL, 
	reduced_motion BOOLEAN NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_profiles (
	user_id VARCHAR(36) NOT NULL, 
	full_name VARCHAR(160) NOT NULL, 
	avatar_url TEXT, 
	city VARCHAR(120) NOT NULL, 
	state VARCHAR(120) NOT NULL, 
	country VARCHAR(80) NOT NULL, 
	coarse_lat FLOAT NOT NULL, 
	coarse_lon FLOAT NOT NULL, 
	preferred_language VARCHAR(8) NOT NULL, 
	bio VARCHAR(500), 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_attachments (
	id VARCHAR(36) NOT NULL, 
	incident_id VARCHAR(36), 
	file_name VARCHAR(255) NOT NULL, 
	mime_type VARCHAR(80) NOT NULL, 
	file_size_bytes INTEGER NOT NULL, 
	data_uri TEXT NOT NULL, 
	exif_stripped BOOLEAN, 
	moderation_state VARCHAR(32), 
	uploaded_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(incident_id) REFERENCES incident_reports (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_evidence_attachments_incident_id ON evidence_attachments (incident_id);

CREATE TABLE IF NOT EXISTS household_members (
	id VARCHAR(36) NOT NULL, 
	household_id VARCHAR(36), 
	name VARCHAR(120) NOT NULL, 
	relation VARCHAR(64) NOT NULL, 
	age_group VARCHAR(32) NOT NULL, 
	routine_window VARCHAR(120), 
	care_preference VARCHAR(280), 
	aqi_threshold INTEGER, 
	notify_enabled BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(household_id) REFERENCES households (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_household_members_household_id ON household_members (household_id);

CREATE TABLE IF NOT EXISTS sensor_readings (
	id VARCHAR(36) NOT NULL, 
	sensor_id VARCHAR(36), 
	recorded_at TIMESTAMP WITH TIME ZONE, 
	pm25 FLOAT, 
	pm10 FLOAT, 
	co2_ppm INTEGER, 
	temp_c FLOAT, 
	humidity_pct FLOAT, 
	entry_method VARCHAR(32), 
	provenance VARCHAR(32), 
	notes VARCHAR(280), 
	PRIMARY KEY (id), 
	FOREIGN KEY(sensor_id) REFERENCES sensor_devices (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sensor_readings_sensor_id ON sensor_readings (sensor_id);
CREATE INDEX IF NOT EXISTS ix_sensor_readings_recorded_at ON sensor_readings (recorded_at);

-- Enable Supabase Row Level Security (blocks anonymous PostgREST exposure;
-- FastAPI authenticates server-side via the privileged postgres pooler role)
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contact_inquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."institutions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."model_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."monitoring_stations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."action_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."campus_advisories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."campus_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."consent_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."households" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."incident_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."route_scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."routine_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sensor_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evidence_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."household_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sensor_readings" ENABLE ROW LEVEL SECURITY;

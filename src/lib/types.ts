export type ProvenanceClass =
  | 'MEASURED'
  | 'MODEL FORECAST'
  | 'ESTIMATED'
  | 'USER REPORTED'
  | 'AI SUMMARY';

export type LanguageCode = 'en' | 'hi' | 'pa';

export type UserRole =
  | 'individual'
  | 'family_caregiver'
  | 'campus_admin'
  | 'community_volunteer'
  | 'community_moderator'
  | 'civic_team'
  | 'research_user';

export interface AuthUser {
  id: string;
  email: string;
  auth_provider: string;
  is_demo?: boolean;
  google_connected: boolean;
  has_password: boolean;
  role: UserRole;
  is_admin: boolean;
  account_status: string;
  onboarding_completed: boolean;
  created_at: string | null;
  last_login_at: string | null;
  unread_notifications: number;
  profile: {
    full_name: string;
    avatar_url: string | null;
    city: string;
    state: string;
    country: string;
    coarse_lat: number;
    coarse_lon: number;
    preferred_language: LanguageCode;
    bio: string;
  };
  preferences: {
    aqi_alert_threshold: number;
    notify_aqi_alerts: boolean;
    notify_forecast_spikes: boolean;
    notify_community_updates: boolean;
    notify_campus_alerts: boolean;
    notify_routine_reminders: boolean;
    coarse_location_only: boolean;
    routine_profiling_enabled: boolean;
    low_bandwidth_mode: boolean;
    reduced_motion: boolean;
  };
  routine: {
    commute_start: string;
    commute_end: string;
    primary_transport: string;
    exercise_window: string;
    has_indoor_purifier: boolean;
  };
}

export interface HourlyAirPoint {
  time: string;
  indian_aqi: number;
  category: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  so2?: number | null;
  co_mg?: number | null;
  temp_c?: number | null;
  humidity_pct?: number | null;
  wind_kph?: number | null;
  wind_dir?: number | null;
  is_forecast: boolean;
  provenance: ProvenanceClass;
}

export interface CitySearchResult {
  city: string;
  state: string;
  country: string;
  country_code?: string;
  lat: number;
  lon: number;
  population?: number | null;
  elevation_m?: number | null;
  timezone?: string;
  nearest_station?: string;
  is_curated?: boolean;
}

export interface SelectedLocation {
  city: string;
  state?: string;
  country?: string;
  lat?: number | null;
  lon?: number | null;
  isCustomPin?: boolean;
}

export interface LiveSourceItem {
  name: string;
  type: string;
  metrics: string;
  url: string;
  license: string;
  status: string;
}

export interface LiveAirBundle {
  is_live: boolean;
  is_demo_fallback: boolean;
  fallback_reason?: string;
  location: {
    city: string;
    state: string;
    country: string;
    lat: number;
    lon: number;
    grid_lat: number;
    grid_lon: number;
    elevation_m?: number;
    timezone: string;
    nearest_reference_station: string;
    station_operator: string;
    is_custom_pin?: boolean;
    corridors: { name: string; lat: number; lon: number }[];
  };
  current: {
    observed_time_ist: string;
    weather_time_ist: string;
    fetched_at_utc: string;
    freshness_status: string;
    indian_aqi: number;
    us_aqi?: number | null;
    european_aqi?: number | null;
    uv_index?: number | null;
    category: string;
    color: string;
    dominant_pollutant: string;
    advisory: string;
    standard: string;
    sub_indices: Record<string, number | null>;
    live_station?: {
      station_name: string;
      us_aqi?: number | null;
      dominant_pollutant?: string | null;
      observed_time?: string | null;
      distance_km?: number | null;
      attributions?: string[];
      provenance: 'MEASURED';
    } | null;
    pollutants: {
      pm25: number | null;
      pm10: number | null;
      no2: number | null;
      o3: number | null;
      so2?: number | null;
      co_ug?: number | null;
      co_mg?: number | null;
      dust?: number | null;
      aod?: number | null;
    };
    weather: {
      temp_c: number | null;
      feels_like_c?: number | null;
      humidity_pct: number | null;
      wind_kph: number | null;
      wind_dir_deg?: number | null;
      wind_compass: string;
      pressure_hpa?: number | null;
      cloud_cover_pct?: number | null;
    };
  };
  provenance: {
    concentrations_class: ProvenanceClass;
    aqi_class: ProvenanceClass;
    air_quality_source: string;
    weather_source: string;
    aqi_methodology: string;
    spatial_resolution: string;
    license: string;
    sources_list?: LiveSourceItem[];
    note: string;
  };
  comparison: {
    last_24h_avg_aqi: number;
    prev_24h_avg_aqi: number;
    delta_aqi: number;
    cleanest_window: HourlyAirPoint | null;
    peak_window: HourlyAirPoint | null;
    emergency_mode_recommended: boolean;
  };
  history_48h: HourlyAirPoint[];
  forecast_72h: HourlyAirPoint[];
  combined_timeline: HourlyAirPoint[];
}

export interface MapMarkerItem {
  id: string;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  badge?: string;
  value?: string;
  color?: string;
  kind?: 'official' | 'community' | 'incident' | 'campus' | 'city';
  radiusM?: number;
  fillOpacity?: number;
}

export interface MapPolylineItem {
  id: string;
  positions: [number, number][];
  color: string;
  weight?: number;
  dashed?: boolean;
  label?: string;
}

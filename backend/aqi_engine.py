"""
Deterministic Indian National AQI (CPCB NAQI) Calculator, Live Open-Meteo Ingestion,
Pollution Shadow Regional Grid, Future Me Scenario Simulator, Route Comparator,
and Daily Replanner Engine.

CRITICAL PRINCIPLE:
- Never fabricate live AQI readings.
- Open-Meteo Air Quality feeds derive from CAMS global/regional atmospheric analysis & forecast models
  and are transparently labelled 'MODEL FORECAST' with Indian NAQI labelled 'ESTIMATED' (from CPCB
  breakpoints applied to Open-Meteo CAMS concentrations).
- If upstream Open-Meteo is unreachable, explicitly flagged fallback sample data (`is_demo_fallback: true`)
  is returned so the UI can warn the user clearly.
"""

from __future__ import annotations

import math
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx

OPEN_METEO_AQ_BASE = os.getenv(
    "OPEN_METEO_AQ_BASE", "https://air-quality-api.open-meteo.com/v1/air-quality"
)
OPEN_METEO_WEATHER_BASE = os.getenv(
    "OPEN_METEO_WEATHER_BASE", "https://api.open-meteo.com/v1/forecast"
)
OPEN_METEO_GEOCODE_BASE = os.getenv(
    "OPEN_METEO_GEOCODE_BASE", "https://geocoding-api.open-meteo.com/v1/search"
)
REVERSE_GEOCODE_BASE = os.getenv(
    "REVERSE_GEOCODE_BASE", "https://api.bigdatacloud.net/data/reverse-geocode-client"
)
NOMINATIM_REVERSE_BASE = "https://nominatim.openstreetmap.org/reverse"
WAQI_API_TOKEN = os.getenv("WAQI_API_TOKEN", "").strip()


def _auto_corridors(city: str, lat: float, lon: float) -> List[Dict[str, Any]]:
    """Generate 5 coarse regional sectors (~3–5 km) around any city or map pin."""
    return [
        {"name": f"{city} Central", "lat": round(lat, 4), "lon": round(lon, 4)},
        {"name": f"{city} North Sector", "lat": round(lat + 0.032, 4), "lon": round(lon, 4)},
        {"name": f"{city} East Corridor", "lat": round(lat, 4), "lon": round(lon + 0.036, 4)},
        {"name": f"{city} South Sector", "lat": round(lat - 0.032, 4), "lon": round(lon, 4)},
        {"name": f"{city} West Corridor", "lat": round(lat, 4), "lon": round(lon - 0.036, 4)},
    ]


def _city_entry(
    city: str,
    state: str,
    lat: float,
    lon: float,
    nearest_station: str,
    operator: str,
    region: str = "North",
    country: str = "India",
) -> Dict[str, Any]:
    return {
        "city": city,
        "state": state,
        "country": country,
        "region": region,
        "lat": lat,
        "lon": lon,
        "nearest_station": nearest_station,
        "operator": operator,
        "corridors": _auto_corridors(city, lat, lon),
    }

# Supported Indian cities with coarse reference coordinates & CPCB/SPCB context
INDIAN_CITIES: Dict[str, Dict[str, Any]] = {
    "Ludhiana": {
        "city": "Ludhiana",
        "state": "Punjab",
        "country": "India",
        "lat": 30.9010,
        "lon": 75.8573,
        "nearest_station": "PAU Campus CAAQMS, Ludhiana",
        "operator": "Punjab Pollution Control Board (PPCB) / CPCB",
        "corridors": [
            {"name": "PAU Campus", "lat": 30.9010, "lon": 75.8070},
            {"name": "Sarabha Nagar", "lat": 30.8855, "lon": 75.8212},
            {"name": "Ferozepur Road", "lat": 30.8920, "lon": 75.8380},
            {"name": "Civil Lines", "lat": 30.9145, "lon": 75.8440},
            {"name": "Clock Tower / Chaura Bazar", "lat": 30.9118, "lon": 75.8535},
            {"name": "Focal Point Phase V", "lat": 30.8750, "lon": 75.9150},
        ],
    },
    "New Delhi": {
        "city": "New Delhi",
        "state": "Delhi NCR",
        "country": "India",
        "lat": 28.6139,
        "lon": 77.2090,
        "nearest_station": "ITO / Lodhi Road CAAQMS, New Delhi",
        "operator": "CPCB / DPCC / IMD",
        "corridors": [
            {"name": "Connaught Place", "lat": 28.6315, "lon": 77.2167},
            {"name": "Lodhi Road", "lat": 28.5918, "lon": 77.2273},
            {"name": "Anand Vihar", "lat": 28.6469, "lon": 77.3164},
            {"name": "RK Puram", "lat": 28.5651, "lon": 77.1752},
            {"name": "Dwarka Sector 8", "lat": 28.5710, "lon": 77.0719},
            {"name": "Hauz Khas", "lat": 28.5494, "lon": 77.2001},
        ],
    },
    "Ahmedabad": {
        "city": "Ahmedabad",
        "state": "Gujarat",
        "country": "India",
        "lat": 23.0225,
        "lon": 72.5714,
        "nearest_station": "Maninagar / Navrangpura CAAQMS, Ahmedabad",
        "operator": "Gujarat Pollution Control Board (GPCB) / CPCB / SAFAR",
        "corridors": [
            {"name": "Navrangpura", "lat": 23.0365, "lon": 72.5611},
            {"name": "Sabarmati Riverfront", "lat": 23.0274, "lon": 72.5746},
            {"name": "Maninagar", "lat": 22.9962, "lon": 72.6026},
            {"name": "SG Highway", "lat": 23.0305, "lon": 72.5076},
            {"name": "Vastrapur Lake", "lat": 23.0387, "lon": 72.5289},
        ],
    },
    "Chandigarh": {
        "city": "Chandigarh",
        "state": "Chandigarh UT",
        "country": "India",
        "lat": 30.7333,
        "lon": 76.7794,
        "nearest_station": "Sector 25 / Sector 22 CAAQMS, Chandigarh",
        "operator": "Chandigarh Pollution Control Committee (CPCC) / CPCB",
        "corridors": [
            {"name": "Sector 17 Plaza", "lat": 30.7415, "lon": 76.7821},
            {"name": "Panjab University Sec 14", "lat": 30.7603, "lon": 76.7664},
            {"name": "Sukhna Lake", "lat": 30.7421, "lon": 76.8188},
            {"name": "IT Park", "lat": 30.7278, "lon": 76.8458},
            {"name": "Industrial Area Phase I", "lat": 30.7055, "lon": 76.8012},
        ],
    },
    "Amritsar": {
        "city": "Amritsar",
        "state": "Punjab",
        "country": "India",
        "lat": 31.6340,
        "lon": 74.8723,
        "nearest_station": "Golden Temple CAAQMS, Amritsar",
        "operator": "Punjab Pollution Control Board (PPCB) / CPCB",
        "corridors": [
            {"name": "Heritage Street", "lat": 31.6225, "lon": 74.8788},
            {"name": "GNDU Campus", "lat": 31.6348, "lon": 74.8256},
            {"name": "Ranjit Avenue", "lat": 31.6542, "lon": 74.8647},
            {"name": "Mall Road", "lat": 31.6401, "lon": 74.8722},
        ],
    },
    "Mumbai": {
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "lat": 19.0760,
        "lon": 72.8777,
        "nearest_station": "Bandra Kurla Complex CAAQMS, Mumbai",
        "operator": "MPCB / CPCB / IITM SAFAR",
        "corridors": [
            {"name": "Bandra Kurla Complex", "lat": 19.0654, "lon": 72.8681},
            {"name": "Colaba", "lat": 18.9067, "lon": 72.8147},
            {"name": "Powai", "lat": 19.1176, "lon": 72.9060},
            {"name": "Andheri East", "lat": 19.1136, "lon": 72.8697},
            {"name": "Worli Sea Face", "lat": 19.0096, "lon": 72.8151},
        ],
    },
    "Bengaluru": {
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "lat": 12.9716,
        "lon": 77.5946,
        "nearest_station": "Cubbon Park / Silk Board CAAQMS, Bengaluru",
        "operator": "KSPCB / CPCB",
        "corridors": [
            {"name": "Cubbon Park", "lat": 12.9763, "lon": 77.5929},
            {"name": "Indiranagar", "lat": 12.9784, "lon": 77.6408},
            {"name": "Silk Board Junction", "lat": 12.9177, "lon": 77.6238},
            {"name": "Whitefield", "lat": 12.9698, "lon": 77.7500},
            {"name": "IISc Malleshwaram", "lat": 13.0219, "lon": 77.5671},
        ],
    },
    "Kolkata": {
        "city": "Kolkata",
        "state": "West Bengal",
        "country": "India",
        "lat": 22.5726,
        "lon": 88.3639,
        "nearest_station": "Victoria / Ballygunge CAAQMS, Kolkata",
        "operator": "WBPCB / CPCB",
        "corridors": [
            {"name": "Victoria Memorial", "lat": 22.5448, "lon": 88.3426},
            {"name": "Salt Lake Sector V", "lat": 22.5769, "lon": 88.4337},
            {"name": "Jadavpur", "lat": 22.4989, "lon": 88.3714},
            {"name": "Park Street", "lat": 22.5529, "lon": 88.3527},
        ],
    },
    "Hyderabad": {
        "city": "Hyderabad",
        "state": "Telangana",
        "country": "India",
        "lat": 17.3850,
        "lon": 78.4867,
        "nearest_station": "Sanathnagar / HCU CAAQMS, Hyderabad",
        "operator": "TGPCB / CPCB",
        "corridors": [
            {"name": "HITEC City", "lat": 17.4435, "lon": 78.3772},
            {"name": "Banjara Hills", "lat": 17.4156, "lon": 78.4347},
            {"name": "Sanathnagar", "lat": 17.4563, "lon": 78.4439},
            {"name": "Secunderabad", "lat": 17.4399, "lon": 78.4983},
        ],
    },
    "Jaipur": {
        "city": "Jaipur",
        "state": "Rajasthan",
        "country": "India",
        "lat": 26.9124,
        "lon": 75.7873,
        "nearest_station": "Adarsh Nagar / Police Commissionerate CAAQMS, Jaipur",
        "operator": "RSPCB / CPCB",
        "corridors": [
            {"name": "MI Road", "lat": 26.9154, "lon": 75.8065},
            {"name": "Malviya Nagar", "lat": 26.8549, "lon": 75.8243},
            {"name": "Adarsh Nagar", "lat": 26.9012, "lon": 75.8295},
        ],
    },
    "Lucknow": {
        "city": "Lucknow",
        "state": "Uttar Pradesh",
        "country": "India",
        "lat": 26.8467,
        "lon": 80.9462,
        "nearest_station": "Lalbagh / Gomti Nagar CAAQMS, Lucknow",
        "operator": "UPPCB / CPCB",
        "corridors": [
            {"name": "Hazratganj", "lat": 26.8505, "lon": 80.9467},
            {"name": "Gomti Nagar", "lat": 26.8496, "lon": 81.0072},
            {"name": "Talkatora", "lat": 26.8339, "lon": 80.8917},
        ],
    },
    "Chennai": _city_entry("Chennai", "Tamil Nadu", 13.0827, 80.2707, "Alandur / Velachery CAAQMS, Chennai", "TNPCB / CPCB", "South"),
    "Pune": _city_entry("Pune", "Maharashtra", 18.5204, 73.8567, "Shivajinagar / Karve Road CAAQMS, Pune", "MPCB / IITM SAFAR / CPCB", "West"),
    "Jalandhar": _city_entry("Jalandhar", "Punjab", 31.3260, 75.5762, "Civil Lines CAAQMS, Jalandhar", "PPCB / CPCB", "North"),
    "Patiala": _city_entry("Patiala", "Punjab", 30.3398, 76.3869, "Model Town CAAQMS, Patiala", "PPCB / CPCB", "North"),
    "Noida": _city_entry("Noida", "Uttar Pradesh", 28.5355, 77.3910, "Sector 62 / Sector 125 CAAQMS, Noida", "UPPCB / CPCB", "North"),
    "Gurugram": _city_entry("Gurugram", "Haryana", 28.4595, 77.0266, "Vikas Sadan / Sector 51 CAAQMS, Gurugram", "HSPCB / CPCB", "North"),
    "Shimla": _city_entry("Shimla", "Himachal Pradesh", 31.1048, 77.1734, "Ridge / ISBT Station, Shimla", "HPPCB / CPCB", "Himalayan"),
    "Dehradun": _city_entry("Dehradun", "Uttarakhand", 30.3165, 78.0322, "Doon University CAAQMS, Dehradun", "UKPCB / CPCB", "Himalayan"),
    "Srinagar": _city_entry("Srinagar", "Jammu & Kashmir", 34.0837, 74.7973, "Rajbagh CAAQMS, Srinagar", "JKPCC / CPCB", "Himalayan"),
    "Agra": _city_entry("Agra", "Uttar Pradesh", 27.1767, 78.0081, "Sanjay Palace / Taj Mahal CAAQMS, Agra", "UPPCB / CPCB", "North"),
    "Varanasi": _city_entry("Varanasi", "Uttar Pradesh", 25.3176, 82.9739, "Ardhali Bazar / BHU CAAQMS, Varanasi", "UPPCB / CPCB", "North"),
    "Kanpur": _city_entry("Kanpur", "Uttar Pradesh", 26.4499, 80.3319, "Nehru Nagar / IITK CAAQMS, Kanpur", "UPPCB / CPCB", "North"),
    "Surat": _city_entry("Surat", "Gujarat", 21.1702, 72.8311, "Science Centre CAAQMS, Surat", "GPCB / CPCB", "West"),
    "Nagpur": _city_entry("Nagpur", "Maharashtra", 21.1458, 79.0882, "Opp GPO Civil Lines CAAQMS, Nagpur", "MPCB / CPCB", "Central"),
    "Indore": _city_entry("Indore", "Madhya Pradesh", 22.7196, 75.8577, "Chhoti Gwaltoli CAAQMS, Indore", "MPPCB / CPCB", "Central"),
    "Bhopal": _city_entry("Bhopal", "Madhya Pradesh", 23.2599, 77.4126, "TT Nagar / Paryavaran Parisar CAAQMS, Bhopal", "MPPCB / CPCB", "Central"),
    "Raipur": _city_entry("Raipur", "Chhattisgarh", 21.2514, 81.6296, "AIIMS / Siltara CAAQMS, Raipur", "CECB / CPCB", "Central"),
    "Patna": _city_entry("Patna", "Bihar", 25.5941, 85.1376, "IGSC Planetarium / Eco Park CAAQMS, Patna", "BSPCB / CPCB", "East"),
    "Ranchi": _city_entry("Ranchi", "Jharkhand", 23.3441, 85.3096, "Albert Ekka Chowk Station, Ranchi", "JSPCB / CPCB", "East"),
    "Bhubaneswar": _city_entry("Bhubaneswar", "Odisha", 20.2961, 85.8245, "Lingaraj / Patia CAAQMS, Bhubaneswar", "OSPCB / CPCB", "East"),
    "Guwahati": _city_entry("Guwahati", "Assam", 26.1445, 91.7362, "Railway Colony / IITG CAAQMS, Guwahati", "PCBA / CPCB", "North-East"),
    "Kochi": _city_entry("Kochi", "Kerala", 9.9312, 76.2673, "Vyttila / Eloor CAAQMS, Kochi", "KSPCB / CPCB", "South"),
    "Coimbatore": _city_entry("Coimbatore", "Tamil Nadu", 11.0168, 76.9558, "SIDCO Kurichi / RS Puram CAAQMS, Coimbatore", "TNPCB / CPCB", "South"),
    "Visakhapatnam": _city_entry("Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185, "GVM Corporation CAAQMS, Visakhapatnam", "APPCB / CPCB", "South"),
    "Panaji": _city_entry("Panaji", "Goa", 15.4909, 73.8278, "Patto Plaza Station, Panaji", "GSPCB / CPCB", "West"),
}

# Official CPCB Indian National Air Quality Index (NAQI) Breakpoints
# Format: [(C_low, C_high, I_low, I_high), ...]
# Units: PM2.5, PM10, NO2, SO2, O3 in µg/m³; CO in mg/m³ (converted from µg/m³ / 1000)
NAQI_BREAKPOINTS: Dict[str, List[Tuple[float, float, int, int]]] = {
    "pm25": [
        (0, 30, 0, 50),
        (30, 60, 51, 100),
        (60, 90, 101, 200),
        (90, 120, 201, 300),
        (120, 250, 301, 400),
        (250, 500, 401, 500),
    ],
    "pm10": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 250, 101, 200),
        (250, 350, 201, 300),
        (350, 430, 301, 400),
        (430, 600, 401, 500),
    ],
    "no2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 180, 101, 200),
        (180, 280, 201, 300),
        (280, 400, 301, 400),
        (400, 600, 401, 500),
    ],
    "o3": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 168, 101, 200),
        (168, 208, 201, 300),
        (208, 748, 301, 400),
        (748, 1000, 401, 500),
    ],
    "so2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 380, 101, 200),
        (380, 800, 201, 300),
        (800, 1600, 301, 400),
        (1600, 2400, 401, 500),
    ],
    "co_mg": [
        (0.0, 1.0, 0, 50),
        (1.0, 2.0, 51, 100),
        (2.0, 10.0, 101, 200),
        (10.0, 17.0, 201, 300),
        (17.0, 34.0, 301, 400),
        (34.0, 50.0, 401, 500),
    ],
}


def compute_sub_index(pollutant: str, value: Optional[float]) -> Optional[int]:
    if value is None or value < 0:
        return None
    bps = NAQI_BREAKPOINTS.get(pollutant)
    if not bps:
        return None
    for c_lo, c_hi, i_lo, i_hi in bps:
        if value <= c_hi:
            idx = ((i_hi - i_lo) / (c_hi - c_lo)) * (value - c_lo) + i_lo
            return max(0, min(500, round(idx)))
    return 500


def classify_indian_aqi(aqi: int) -> Dict[str, str]:
    if aqi <= 50:
        return {
            "category": "Good",
            "color": "#12BFA5",
            "advisory": "Favourable ambient conditions for normal outdoor schedules and natural home ventilation.",
        }
    if aqi <= 100:
        return {
            "category": "Satisfactory",
            "color": "#84CC16",
            "advisory": "Acceptable air quality overall. Prefer greener, lower-traffic corridors for long outdoor workouts.",
        }
    if aqi <= 200:
        return {
            "category": "Moderate",
            "color": "#EAB308",
            "advisory": "Elevated particulate or gas levels. Consider shifting prolonged strenuous outdoor activity to cleaner daytime windows.",
        }
    if aqi <= 300:
        return {
            "category": "Poor",
            "color": "#F97316",
            "advisory": "High ambient pollution. Shorten prolonged outdoor exertion, keep windows closed during morning/evening peaks, and consider a well-fitted N95/FFP2 respirator outdoors.",
        }
    if aqi <= 400:
        return {
            "category": "Very Poor",
            "color": "#EF4444",
            "advisory": "Very high ambient pollution. Shift strenuous routines indoors where possible, use indoor HEPA filtration if available, and wear a well-fitted N95/FFP2 respirator for essential trips.",
        }
    return {
        "category": "Severe",
        "color": "#B91C1C",
        "advisory": "Pollution Emergency conditions. Avoid non-essential outdoor exposure, activate indoor clean-air room protocols, and follow official CPCB/GRAP civic advisories.",
    }


def compute_indian_naqi(
    pm25: Optional[float] = None,
    pm10: Optional[float] = None,
    no2: Optional[float] = None,
    o3: Optional[float] = None,
    so2: Optional[float] = None,
    co_ug: Optional[float] = None,
) -> Dict[str, Any]:
    co_mg = round(co_ug / 1000.0, 2) if co_ug is not None else None
    subs = {
        "PM2.5": compute_sub_index("pm25", pm25),
        "PM10": compute_sub_index("pm10", pm10),
        "NO2": compute_sub_index("no2", no2),
        "O3": compute_sub_index("o3", o3),
        "SO2": compute_sub_index("so2", so2),
        "CO": compute_sub_index("co_mg", co_mg),
    }
    valid = {k: v for k, v in subs.items() if v is not None}
    if not valid:
        return {
            "aqi": 0,
            "category": "Unavailable",
            "color": "#64748B",
            "dominant_pollutant": "N/A",
            "sub_indices": subs,
            "advisory": "Insufficient pollutant inputs to calculate Indian NAQI.",
        }
    dominant = max(valid, key=lambda k: valid[k])
    aqi_val = valid[dominant]
    meta = classify_indian_aqi(aqi_val)
    return {
        "aqi": aqi_val,
        "category": meta["category"],
        "color": meta["color"],
        "dominant_pollutant": dominant,
        "sub_indices": subs,
        "advisory": meta["advisory"],
        "standard": "Indian National AQI (CPCB Breakpoint Methodology)",
    }


def wind_deg_to_compass(deg: Optional[float]) -> str:
    if deg is None:
        return "Calm"
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[int((deg + 22.5) % 360 // 45)]


# Simple TTL Cache to keep UI blazing fast while preserving real data freshness
_CACHE: Dict[str, Tuple[float, Any]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _cache_get(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL_SECONDS:
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.time(), value)


# Runtime registry of dynamically searched cities & map-clicked pins (in-memory LRU-style)
_DYNAMIC_CITIES: Dict[str, Dict[str, Any]] = {}


def _remember_dynamic_city(meta: Dict[str, Any]) -> None:
    key = meta.get("city", "").strip().lower()
    if not key:
        return
    if len(_DYNAMIC_CITIES) > 400:
        oldest = next(iter(_DYNAMIC_CITIES))
        _DYNAMIC_CITIES.pop(oldest, None)
    _DYNAMIC_CITIES[key] = meta


def _nearest_catalog_city(lat: float, lon: float) -> Tuple[Dict[str, Any], float]:
    best = next(iter(INDIAN_CITIES.values()))
    best_d = float("inf")
    for c in INDIAN_CITIES.values():
        d = haversine_km(lat, lon, c["lat"], c["lon"])
        if d < best_d:
            best_d = d
            best = c
    return best, best_d


def _build_dynamic_meta(
    city: str,
    state: str,
    country: str,
    lat: float,
    lon: float,
    timezone_name: str = "auto",
    is_custom_pin: bool = False,
) -> Dict[str, Any]:
    nearest, dist_km = _nearest_catalog_city(lat, lon)
    if dist_km <= 55.0:
        ref_station = f"{nearest['nearest_station']} (~{dist_km:.1f} km)"
        operator = f"{nearest['operator']} · Open-Meteo CAMS"
    elif country.lower() == "india":
        ref_station = f"Open-Meteo CAMS India Grid ({lat:.3f}°N, {lon:.3f}°E)"
        operator = "Copernicus CAMS / IMD-Assimilated Regional Grid (CPCB NAQI)"
    else:
        ns = "N" if lat >= 0 else "S"
        ew = "E" if lon >= 0 else "W"
        ref_station = f"Open-Meteo CAMS Global Grid ({abs(lat):.3f}°{ns}, {abs(lon):.3f}°{ew})"
        operator = "Copernicus CAMS / ECMWF / NOAA GFS Atmospheric Analysis"

    meta = {
        "city": city,
        "state": state or country or "Regional Grid",
        "country": country or "Global",
        "lat": round(float(lat), 4),
        "lon": round(float(lon), 4),
        "timezone": timezone_name or "auto",
        "nearest_station": ref_station,
        "operator": operator,
        "is_custom_pin": is_custom_pin,
        "corridors": _auto_corridors(city, lat, lon),
    }
    _remember_dynamic_city(meta)
    return meta


def resolve_city(city_name: Optional[str]) -> Dict[str, Any]:
    if not city_name:
        return INDIAN_CITIES["Ludhiana"]
    cleaned = city_name.strip()
    low = cleaned.lower()
    for k, v in INDIAN_CITIES.items():
        if k.lower() == low:
            return v
    if low in _DYNAMIC_CITIES:
        return _DYNAMIC_CITIES[low]
    # Also allow prefix match like "Jalandhar, Punjab"
    head = low.split(",")[0].strip()
    for k, v in INDIAN_CITIES.items():
        if k.lower() == head:
            return v
    if head in _DYNAMIC_CITIES:
        return _DYNAMIC_CITIES[head]
    return INDIAN_CITIES["Ludhiana"]


async def search_cities_live(query: str, limit: int = 14) -> List[Dict[str, Any]]:
    """
    Search any city, town, district, or locality across India and worldwide via the free
    Open-Meteo Geocoding API (no API key required), merged with curated Indian city stations.
    """
    q = (query or "").strip()
    if not q:
        return [
            {
                "city": c["city"],
                "state": c["state"],
                "country": c["country"],
                "country_code": "IN",
                "lat": c["lat"],
                "lon": c["lon"],
                "nearest_station": c["nearest_station"],
                "is_curated": True,
            }
            for c in list(INDIAN_CITIES.values())[:limit]
        ]

    cache_key = f"geocode:{q.lower()}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    q_low = q.lower()
    results: List[Dict[str, Any]] = []
    seen_coords: List[Tuple[float, float]] = []

    # 1. Exact/substring matches from curated 36 Indian cities
    for c in INDIAN_CITIES.values():
        if q_low in c["city"].lower() or q_low in c["state"].lower():
            results.append(
                {
                    "city": c["city"],
                    "state": c["state"],
                    "country": c["country"],
                    "country_code": "IN",
                    "lat": c["lat"],
                    "lon": c["lon"],
                    "nearest_station": c["nearest_station"],
                    "is_curated": True,
                }
            )
            seen_coords.append((c["lat"], c["lon"]))

    # 2. Live Open-Meteo Global + All-India Geocoding API (100% free, zero API key)
    if len(q) >= 2:
        try:
            async with httpx.AsyncClient(
                transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"), timeout=8.0
            ) as client:
                res = await client.get(
                    OPEN_METEO_GEOCODE_BASE,
                    params={"name": q, "count": 20, "language": "en", "format": "json"},
                )
                res.raise_for_status()
                geo_items = res.json().get("results") or []

            # Rank Indian cities slightly ahead while keeping full global search support
            geo_items.sort(
                key=lambda g: (
                    0 if (g.get("country_code") == "IN") else 1,
                    -(g.get("population") or 0),
                )
            )

            for g in geo_items:
                glat = float(g.get("latitude", 0.0))
                glon = float(g.get("longitude", 0.0))
                if any(haversine_km(glat, glon, slat, slon) < 12.0 for slat, slon in seen_coords):
                    continue
                name = str(g.get("name") or q).strip()
                state = str(g.get("admin1") or g.get("admin2") or "").strip()
                country = str(g.get("country") or "").strip()
                cc = str(g.get("country_code") or "").upper()
                tz = str(g.get("timezone") or "auto")
                dyn = _build_dynamic_meta(name, state, country, glat, glon, tz, is_custom_pin=False)
                results.append(
                    {
                        "city": name,
                        "state": state or country,
                        "country": country or "Global",
                        "country_code": cc,
                        "lat": round(glat, 4),
                        "lon": round(glon, 4),
                        "population": g.get("population"),
                        "elevation_m": g.get("elevation"),
                        "timezone": tz,
                        "nearest_station": dyn["nearest_station"],
                        "is_curated": False,
                    }
                )
                seen_coords.append((glat, glon))
                if len(results) >= limit:
                    break
        except Exception:
            pass

    final = results[:limit]
    _cache_set(cache_key, final)
    return final


async def reverse_geocode_live(lat: float, lon: float) -> Dict[str, Any]:
    """
    Reverse-geocode any clicked map coordinate (lat, lon) into real locality, state, and country
    using free, keyless BigDataCloud + OpenStreetMap Nominatim fallback.
    """
    lat = max(-85.0, min(85.0, float(lat)))
    lon = ((float(lon) + 180.0) % 360.0) - 180.0
    rounded_key = f"revgeo:{lat:.3f}:{lon:.3f}"
    cached = _cache_get(rounded_key)
    if cached:
        return cached

    # If clicked right on a curated city (< 8 km), return that city cleanly
    nearest, dist_km = _nearest_catalog_city(lat, lon)
    if dist_km <= 8.0:
        _cache_set(rounded_key, nearest)
        return nearest

    city_label = ""
    state_label = ""
    country_label = ""

    async with httpx.AsyncClient(
        transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
        timeout=7.0,
        headers={"User-Agent": "VayuverseAI/1.0 (Environmental Air Quality Intelligence)"},
    ) as client:
        # Source 1: BigDataCloud client reverse geocoder (free, fast, no API key)
        try:
            r1 = await client.get(
                REVERSE_GEOCODE_BASE,
                params={"latitude": round(lat, 4), "longitude": round(lon, 4), "localityLanguage": "en"},
            )
            if r1.status_code == 200:
                d1 = r1.json()
                city_label = (
                    d1.get("city")
                    or d1.get("locality")
                    or d1.get("principalSubdivision")
                    or ""
                ).strip()
                state_label = (d1.get("principalSubdivision") or "").strip()
                country_label = (d1.get("countryName") or "").strip()
        except Exception:
            pass

        # Source 2: OpenStreetMap Nominatim fallback if needed
        if not city_label:
            try:
                r2 = await client.get(
                    NOMINATIM_REVERSE_BASE,
                    params={"format": "jsonv2", "lat": round(lat, 4), "lon": round(lon, 4), "zoom": 11, "accept-language": "en"},
                )
                if r2.status_code == 200:
                    d2 = r2.json()
                    addr = d2.get("address") or {}
                    city_label = (
                        addr.get("city")
                        or addr.get("town")
                        or addr.get("village")
                        or addr.get("county")
                        or addr.get("state_district")
                        or addr.get("state")
                        or ""
                    ).strip()
                    state_label = (addr.get("state") or addr.get("region") or "").strip()
                    country_label = (addr.get("country") or "").strip()
            except Exception:
                pass

    if not city_label:
        if dist_km <= 80.0:
            city_label = f"Near {nearest['city']}"
            state_label = nearest["state"]
            country_label = nearest["country"]
        else:
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            city_label = f"Map Pin ({abs(lat):.2f}°{ns}, {abs(lon):.2f}°{ew})"
            state_label = "Open Ocean / Remote Area"
            country_label = "Global Grid"

    meta = _build_dynamic_meta(
        city=city_label,
        state=state_label,
        country=country_label,
        lat=lat,
        lon=lon,
        timezone_name="auto",
        is_custom_pin=True,
    )
    _cache_set(rounded_key, meta)
    return meta


async def resolve_location_async(
    city_name: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Universal resolver: handles exact map/GPS coordinates (lat, lon), curated Indian cities,
    previously resolved dynamic locations, and live geocoding of any city worldwide.
    """
    if lat is not None and lon is not None:
        if city_name and city_name.strip():
            cname = city_name.strip()
            for k, v in INDIAN_CITIES.items():
                if k.lower() == cname.lower() and haversine_km(lat, lon, v["lat"], v["lon"]) <= 18.0:
                    return v
            cached_dyn = _DYNAMIC_CITIES.get(cname.lower())
            if cached_dyn and haversine_km(lat, lon, cached_dyn["lat"], cached_dyn["lon"]) <= 12.0:
                return cached_dyn
        return await reverse_geocode_live(lat, lon)

    if not city_name or not city_name.strip():
        return INDIAN_CITIES["Ludhiana"]

    cleaned = city_name.strip()
    low = cleaned.lower()
    for k, v in INDIAN_CITIES.items():
        if k.lower() == low:
            return v
    if low in _DYNAMIC_CITIES:
        return _DYNAMIC_CITIES[low]

    # Geocode unknown city name live via Open-Meteo Geocoding API
    matches = await search_cities_live(cleaned, limit=3)
    if matches:
        top = matches[0]
        return _build_dynamic_meta(
            city=top["city"],
            state=top.get("state", ""),
            country=top.get("country", ""),
            lat=top["lat"],
            lon=top["lon"],
            timezone_name=top.get("timezone", "auto"),
            is_custom_pin=False,
        )
    return INDIAN_CITIES["Ludhiana"]


async def _fetch_optional_waqi_station(
    client: httpx.AsyncClient, lat: float, lon: float
) -> Optional[Dict[str, Any]]:
    """If optional free WAQI_API_TOKEN is configured, attach live nearest ground-station observation."""
    if not WAQI_API_TOKEN:
        return None
    try:
        res = await client.get(
            f"https://api.waqi.info/feed/geo:{lat:.4f};{lon:.4f}/",
            params={"token": WAQI_API_TOKEN},
            timeout=5.0,
        )
        if res.status_code != 200:
            return None
        payload = res.json()
        if payload.get("status") != "ok" or not isinstance(payload.get("data"), dict):
            return None
        d = payload["data"]
        aqi_raw = d.get("aqi")
        us_aqi_val = int(aqi_raw) if isinstance(aqi_raw, (int, float)) or (isinstance(aqi_raw, str) and aqi_raw.isdigit()) else None
        city_obj = d.get("city") or {}
        geo = city_obj.get("geo") or []
        dist_km = (
            round(haversine_km(lat, lon, float(geo[0]), float(geo[1])), 1)
            if len(geo) >= 2
            else None
        )
        attributions = [a.get("name") for a in (d.get("attributions") or []) if a.get("name")]
        return {
            "station_name": city_obj.get("name") or "Regulatory Ground Station",
            "us_aqi": us_aqi_val,
            "dominant_pollutant": str(d.get("dominentpol") or "").upper() or None,
            "observed_time": (d.get("time") or {}).get("s"),
            "distance_km": dist_km,
            "attributions": attributions[:3],
            "provenance": "MEASURED",
        }
    except Exception:
        return None


async def fetch_live_air_bundle(
    city_name: str = "Ludhiana",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    meta = await resolve_location_async(city_name=city_name, lat=lat, lon=lon)
    cache_key = f"live_bundle:{meta['lat']:.3f}:{meta['lon']:.3f}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    mlat, mlon = meta["lat"], meta["lon"]
    tz_param = "Asia/Kolkata" if meta.get("country", "India") == "India" else "auto"
    aq_params = {
        "latitude": mlat,
        "longitude": mlon,
        "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi,uv_index,dust,aerosol_optical_depth",
        "hourly": "pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide",
        "past_days": 2,
        "forecast_days": 3,
        "timezone": tz_param,
    }
    wx_params = {
        "latitude": mlat,
        "longitude": mlon,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,apparent_temperature,cloud_cover",
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
        "past_days": 1,
        "forecast_days": 3,
        "timezone": tz_param,
    }

    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"), timeout=12.0
        ) as client:
            aq_res, wx_res, waqi_station = await _gather_three(
                client.get(OPEN_METEO_AQ_BASE, params=aq_params),
                client.get(OPEN_METEO_WEATHER_BASE, params=wx_params),
                _fetch_optional_waqi_station(client, mlat, mlon),
            )
            aq_res.raise_for_status()
            wx_res.raise_for_status()
            aq = aq_res.json()
            wx = wx_res.json()

        cur_aq = aq.get("current", {})
        cur_wx = wx.get("current", {})

        pm25 = cur_aq.get("pm2_5")
        pm10 = cur_aq.get("pm10")
        no2 = cur_aq.get("nitrogen_dioxide")
        o3 = cur_aq.get("ozone")
        so2 = cur_aq.get("sulphur_dioxide")
        co = cur_aq.get("carbon_monoxide")

        naqi = compute_indian_naqi(pm25=pm25, pm10=pm10, no2=no2, o3=o3, so2=so2, co_ug=co)

        # Build hourly series (past 48h + next 72h)
        h_aq = aq.get("hourly", {})
        h_wx = wx.get("hourly", {})
        wx_by_time: Dict[str, Dict[str, Any]] = {}
        for idx, t in enumerate(h_wx.get("time", [])):
            wx_by_time[t] = {
                "temp_c": _safe_idx(h_wx.get("temperature_2m"), idx),
                "humidity_pct": _safe_idx(h_wx.get("relative_humidity_2m"), idx),
                "wind_kph": _safe_idx(h_wx.get("wind_speed_10m"), idx),
                "wind_dir": _safe_idx(h_wx.get("wind_direction_10m"), idx),
            }

        cur_time_str = cur_aq.get("time", "")
        hourly_points: List[Dict[str, Any]] = []
        times = h_aq.get("time", [])
        for idx, t in enumerate(times):
            p25 = _safe_idx(h_aq.get("pm2_5"), idx)
            p10 = _safe_idx(h_aq.get("pm10"), idx)
            n2 = _safe_idx(h_aq.get("nitrogen_dioxide"), idx)
            oz = _safe_idx(h_aq.get("ozone"), idx)
            s2 = _safe_idx(h_aq.get("sulphur_dioxide"), idx)
            c_o = _safe_idx(h_aq.get("carbon_monoxide"), idx)
            h_naqi = compute_indian_naqi(pm25=p25, pm10=p10, no2=n2, o3=oz, so2=s2, co_ug=c_o)
            w = wx_by_time.get(t, {})
            is_forecast = t > cur_time_str if cur_time_str else idx >= 48
            hourly_points.append(
                {
                    "time": t,
                    "indian_aqi": h_naqi["aqi"],
                    "category": h_naqi["category"],
                    "pm25": round(p25, 1) if p25 is not None else None,
                    "pm10": round(p10, 1) if p10 is not None else None,
                    "no2": round(n2, 1) if n2 is not None else None,
                    "o3": round(oz, 1) if oz is not None else None,
                    "so2": round(s2, 1) if s2 is not None else None,
                    "co_mg": round(c_o / 1000.0, 2) if c_o is not None else None,
                    "temp_c": w.get("temp_c"),
                    "humidity_pct": w.get("humidity_pct"),
                    "wind_kph": w.get("wind_kph"),
                    "wind_dir": w.get("wind_dir"),
                    "is_forecast": is_forecast,
                    "provenance": "MODEL FORECAST",
                }
            )

        # Split past 24h vs yesterday 24h vs next 48h
        past_points = [p for p in hourly_points if not p["is_forecast"]]
        future_points = [p for p in hourly_points if p["is_forecast"]]

        last_24 = past_points[-24:] if len(past_points) >= 24 else past_points
        prev_24 = past_points[-48:-24] if len(past_points) >= 48 else []
        avg_today = round(sum(p["indian_aqi"] for p in last_24) / max(1, len(last_24)))
        avg_yesterday = (
            round(sum(p["indian_aqi"] for p in prev_24) / len(prev_24)) if prev_24 else avg_today
        )

        # Compute cleanest upcoming window in next 24h
        next_24 = future_points[:24] if future_points else last_24[-12:]
        cleanest = min(next_24, key=lambda p: p["indian_aqi"]) if next_24 else None
        peak = max(next_24, key=lambda p: p["indian_aqi"]) if next_24 else None

        resolved_tz = aq.get("timezone") or wx.get("timezone") or "Asia/Kolkata"
        tz_abbr = aq.get("timezone_abbreviation") or ("IST" if resolved_tz == "Asia/Kolkata" else "")
        tz_display = f"{resolved_tz} ({tz_abbr})" if tz_abbr else resolved_tz

        sources_list: List[Dict[str, Any]] = [
            {
                "name": "Open-Meteo Air Quality API (Copernicus CAMS)",
                "type": "MODEL FORECAST",
                "metrics": "PM2.5, PM10, CO, NO2, SO2, O3, US AQI, EU AQI, UV Index, Dust, AOD + 72h hourly",
                "url": "https://open-meteo.com/en/docs/air-quality-api",
                "license": "CC BY 4.0 (Open-Meteo & ECMWF Copernicus CAMS)",
                "status": "live",
            },
            {
                "name": "Open-Meteo Meteorological Forecast API (ECMWF IFS / NOAA GFS)",
                "type": "MODEL FORECAST",
                "metrics": "Temperature, Feels Like, Humidity, Wind Speed/Direction, Surface Pressure, Cloud Cover",
                "url": "https://open-meteo.com/en/docs",
                "license": "CC BY 4.0",
                "status": "live",
            },
            {
                "name": "CPCB Indian National AQI (NAQI) & US EPA Breakpoint Engines",
                "type": "ESTIMATED",
                "metrics": "Deterministic pollutant sub-indices, dominant pollutant & AQI category band",
                "url": "https://cpcb.nic.in/",
                "license": "Public Regulatory Methodology",
                "status": "computed",
            },
            {
                "name": "Open-Meteo Geocoding + OpenStreetMap / BigDataCloud Reverse Geocoding",
                "type": "REFERENCE",
                "metrics": "Global city lookup & interactive map pin locality resolution",
                "url": "https://www.openstreetmap.org/copyright",
                "license": "ODbL / Free Attribution",
                "status": "live",
            },
        ]
        if waqi_station:
            sources_list.insert(
                0,
                {
                    "name": f"WAQI Ground Station: {waqi_station['station_name']}",
                    "type": "MEASURED",
                    "metrics": f"Regulatory US AQI {waqi_station.get('us_aqi')} ({waqi_station.get('distance_km', '?')} km away)",
                    "url": "https://aqicn.org/",
                    "license": "World Air Quality Index Project / SPCB / CPCB",
                    "status": "live",
                },
            )

        bundle = {
            "is_live": True,
            "is_demo_fallback": False,
            "location": {
                "city": meta["city"],
                "state": meta["state"],
                "country": meta["country"],
                "lat": meta["lat"],
                "lon": meta["lon"],
                "grid_lat": aq.get("latitude", mlat),
                "grid_lon": aq.get("longitude", mlon),
                "elevation_m": aq.get("elevation") if aq.get("elevation") is not None else wx.get("elevation"),
                "timezone": tz_display,
                "nearest_reference_station": (
                    waqi_station["station_name"] if waqi_station else meta["nearest_station"]
                ),
                "station_operator": meta["operator"],
                "is_custom_pin": bool(meta.get("is_custom_pin", False)),
                "corridors": meta["corridors"],
            },
            "current": {
                "observed_time_ist": cur_aq.get("time"),
                "weather_time_ist": cur_wx.get("time"),
                "fetched_at_utc": fetched_at,
                "freshness_status": "Live Feed (< 60 min atmospheric cycle)",
                "indian_aqi": naqi["aqi"],
                "us_aqi": cur_aq.get("us_aqi"),
                "european_aqi": cur_aq.get("european_aqi"),
                "uv_index": cur_aq.get("uv_index"),
                "category": naqi["category"],
                "color": naqi["color"],
                "dominant_pollutant": naqi["dominant_pollutant"],
                "advisory": naqi["advisory"],
                "standard": naqi["standard"],
                "sub_indices": naqi["sub_indices"],
                "live_station": waqi_station,
                "pollutants": {
                    "pm25": round(pm25, 1) if pm25 is not None else None,
                    "pm10": round(pm10, 1) if pm10 is not None else None,
                    "no2": round(no2, 1) if no2 is not None else None,
                    "o3": round(o3, 1) if o3 is not None else None,
                    "so2": round(so2, 1) if so2 is not None else None,
                    "co_ug": round(co, 0) if co is not None else None,
                    "co_mg": round(co / 1000.0, 2) if co is not None else None,
                    "dust": cur_aq.get("dust"),
                    "aod": cur_aq.get("aerosol_optical_depth"),
                },
                "weather": {
                    "temp_c": cur_wx.get("temperature_2m"),
                    "feels_like_c": cur_wx.get("apparent_temperature"),
                    "humidity_pct": cur_wx.get("relative_humidity_2m"),
                    "wind_kph": cur_wx.get("wind_speed_10m"),
                    "wind_dir_deg": cur_wx.get("wind_direction_10m"),
                    "wind_compass": wind_deg_to_compass(cur_wx.get("wind_direction_10m")),
                    "pressure_hpa": cur_wx.get("surface_pressure"),
                    "cloud_cover_pct": cur_wx.get("cloud_cover"),
                },
            },
            "provenance": {
                "concentrations_class": "MEASURED" if waqi_station else "MODEL FORECAST",
                "aqi_class": "ESTIMATED",
                "air_quality_source": "Open-Meteo Air Quality API (Copernicus CAMS Global/Regional Analysis)",
                "weather_source": "Open-Meteo Meteorological Forecast API (NOAA GFS / ECMWF IFS)",
                "aqi_methodology": "CPCB Indian National Air Quality Index (NAQI) & US EPA deterministic breakpoints",
                "spatial_resolution": "~11–40 km regional atmospheric grid (exact coordinate interpolated)",
                "license": "CC BY 4.0 (Open-Meteo & Copernicus Atmosphere Monitoring Service)",
                "sources_list": sources_list,
                "note": "Pollutant concentrations reflect live Open-Meteo Copernicus CAMS atmospheric analysis/forecast for the requested coordinates; optional WAQI/CPCB ground-station observations layer on automatically when configured.",
            },
            "comparison": {
                "last_24h_avg_aqi": avg_today,
                "prev_24h_avg_aqi": avg_yesterday,
                "delta_aqi": avg_today - avg_yesterday,
                "cleanest_window": cleanest,
                "peak_window": peak,
                "emergency_mode_recommended": naqi["aqi"] >= 201,
            },
            "history_48h": past_points[-48:],
            "forecast_72h": future_points[:72],
            "combined_timeline": past_points[-24:] + future_points[:24],
        }
        _cache_set(cache_key, bundle)
        return bundle

    except Exception as exc:
        return _build_labelled_demo_bundle(meta, str(exc), fetched_at)


async def _gather_two(coro1, coro2):
    import asyncio
    return await asyncio.gather(coro1, coro2)


async def _gather_three(coro1, coro2, coro3):
    import asyncio
    return await asyncio.gather(coro1, coro2, coro3)


def _safe_idx(arr: Optional[List[Any]], idx: int) -> Optional[Any]:
    if arr is None or idx >= len(arr):
        return None
    return arr[idx]


def _build_labelled_demo_bundle(meta: Dict[str, Any], reason: str, fetched_at: str) -> Dict[str, Any]:
    """Explicitly labelled offline demo bundle used ONLY if live Open-Meteo API fails."""
    pm25, pm10, no2, o3, so2, co = 64.0, 118.0, 34.0, 42.0, 14.0, 1120.0
    naqi = compute_indian_naqi(pm25=pm25, pm10=pm10, no2=no2, o3=o3, so2=so2, co_ug=co)
    now_hour = datetime.now().strftime("%Y-%m-%dT%H:00")
    timeline = []
    for offset in range(-24, 48):
        h = (12 + offset) % 24
        diurnal = 1.28 if (h in (6, 7, 8, 20, 21, 22)) else (0.76 if 13 <= h <= 16 else 1.0)
        p25 = round(pm25 * diurnal, 1)
        p10 = round(pm10 * diurnal, 1)
        sub = compute_indian_naqi(pm25=p25, pm10=p10, no2=no2, o3=o3)
        timeline.append(
            {
                "time": f"2026-11-{18 + (offset // 24):02d}T{h:02d}:00",
                "indian_aqi": sub["aqi"],
                "category": sub["category"],
                "pm25": p25,
                "pm10": p10,
                "no2": round(no2 * diurnal, 1),
                "o3": round(o3 * (1.3 if 12 <= h <= 16 else 0.8), 1),
                "so2": so2,
                "co_mg": 1.12,
                "temp_c": round(19 + 5 * math.sin((h - 8) * math.pi / 12), 1),
                "humidity_pct": round(62 - 14 * math.sin((h - 8) * math.pi / 12)),
                "wind_kph": round(8.5 + (3.5 if 12 <= h <= 17 else 0), 1),
                "wind_dir": 305,
                "is_forecast": offset > 0,
                "provenance": "MODEL FORECAST",
            }
        )
    past = [t for t in timeline if not t["is_forecast"]]
    fut = [t for t in timeline if t["is_forecast"]]
    return {
        "is_live": False,
        "is_demo_fallback": True,
        "fallback_reason": f"Live upstream API unreachable ({reason}). Showing clearly labelled sample data.",
        "location": {
            "city": meta["city"],
            "state": meta["state"],
            "country": meta["country"],
            "lat": meta["lat"],
            "lon": meta["lon"],
            "grid_lat": meta["lat"],
            "grid_lon": meta["lon"],
            "elevation_m": 250,
            "timezone": "Asia/Kolkata (IST)",
            "nearest_reference_station": meta["nearest_station"],
            "station_operator": meta["operator"],
            "corridors": meta["corridors"],
        },
        "current": {
            "observed_time_ist": now_hour,
            "weather_time_ist": now_hour,
            "fetched_at_utc": fetched_at,
            "freshness_status": "DEMO FALLBACK — Sample Data (Upstream API Offline)",
            "indian_aqi": naqi["aqi"],
            "us_aqi": 154,
            "category": naqi["category"],
            "color": naqi["color"],
            "dominant_pollutant": naqi["dominant_pollutant"],
            "advisory": naqi["advisory"],
            "standard": naqi["standard"],
            "sub_indices": naqi["sub_indices"],
            "pollutants": {
                "pm25": pm25,
                "pm10": pm10,
                "no2": no2,
                "o3": o3,
                "so2": so2,
                "co_ug": co,
                "co_mg": 1.12,
                "dust": 18.0,
                "aod": 0.52,
            },
            "weather": {
                "temp_c": 20.4,
                "feels_like_c": 20.1,
                "humidity_pct": 58,
                "wind_kph": 8.4,
                "wind_dir_deg": 310,
                "wind_compass": "NW",
                "pressure_hpa": 1013.2,
            },
        },
        "provenance": {
            "concentrations_class": "MODEL FORECAST",
            "aqi_class": "ESTIMATED",
            "air_quality_source": "VAYUVERSE Offline Sample Dataset (Live Open-Meteo temporarily unreachable)",
            "weather_source": "VAYUVERSE Offline Sample Dataset",
            "aqi_methodology": "CPCB Indian NAQI deterministic breakpoint calculation",
            "spatial_resolution": "Sample city-level demonstration profile",
            "license": "Demonstration dataset — not a live observation",
            "note": "Clearly labelled demonstration fallback because upstream network call failed.",
        },
        "comparison": {
            "last_24h_avg_aqi": 116,
            "prev_24h_avg_aqi": 124,
            "delta_aqi": -8,
            "cleanest_window": fut[14] if len(fut) > 14 else fut[0],
            "peak_window": fut[8] if len(fut) > 8 else fut[0],
            "emergency_mode_recommended": naqi["aqi"] >= 201,
        },
        "history_48h": past,
        "forecast_72h": fut,
        "combined_timeline": past[-24:] + fut[:24],
    }


async def fetch_multi_city_snapshot() -> Dict[str, Any]:
    """Fetch live air quality across major Indian cities in one batched Open-Meteo call."""
    cached = _cache_get("multi_city_india")
    if cached:
        return cached

    cities = list(INDIAN_CITIES.values())
    lats = ",".join(str(c["lat"]) for c in cities)
    lons = ",".join(str(c["lon"]) for c in cities)
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"), timeout=12.0
        ) as client:
            res = await client.get(
                OPEN_METEO_AQ_BASE,
                params={
                    "latitude": lats,
                    "longitude": lons,
                    "current": "pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,us_aqi",
                    "timezone": "Asia/Kolkata",
                },
            )
            res.raise_for_status()
            payload = res.json()

        items = payload if isinstance(payload, list) else [payload]
        stations = []
        for c, item in zip(cities, items):
            cur = item.get("current", {})
            naqi = compute_indian_naqi(
                pm25=cur.get("pm2_5"),
                pm10=cur.get("pm10"),
                no2=cur.get("nitrogen_dioxide"),
                o3=cur.get("ozone"),
                so2=cur.get("sulphur_dioxide"),
                co_ug=cur.get("carbon_monoxide"),
            )
            stations.append(
                {
                    "city": c["city"],
                    "state": c["state"],
                    "country": c.get("country", "India"),
                    "region": c.get("region", "India"),
                    "lat": c["lat"],
                    "lon": c["lon"],
                    "nearest_station": c["nearest_station"],
                    "operator": c["operator"],
                    "observed_time_ist": cur.get("time"),
                    "indian_aqi": naqi["aqi"],
                    "us_aqi": cur.get("us_aqi"),
                    "category": naqi["category"],
                    "color": naqi["color"],
                    "dominant_pollutant": naqi["dominant_pollutant"],
                    "pm25": cur.get("pm2_5"),
                    "pm10": cur.get("pm10"),
                    "no2": cur.get("nitrogen_dioxide"),
                    "o3": cur.get("ozone"),
                    "so2": cur.get("sulphur_dioxide"),
                    "co_mg": round(cur.get("carbon_monoxide") / 1000.0, 2)
                    if cur.get("carbon_monoxide") is not None
                    else None,
                    "provenance": "MODEL FORECAST",
                    "source": "Open-Meteo CAMS Regional Grid",
                }
            )
        result = {"is_live": True, "fetched_at_utc": fetched_at, "cities": stations}
        _cache_set("multi_city_india", result)
        return result
    except Exception:
        fallback = []
        for idx, c in enumerate(cities):
            p25 = 42.0 + (idx * 11) % 95
            naqi = compute_indian_naqi(pm25=p25, pm10=p25 * 1.6)
            fallback.append(
                {
                    "city": c["city"],
                    "state": c["state"],
                    "lat": c["lat"],
                    "lon": c["lon"],
                    "nearest_station": c["nearest_station"],
                    "operator": c["operator"],
                    "observed_time_ist": "Sample Snapshot",
                    "indian_aqi": naqi["aqi"],
                    "category": naqi["category"],
                    "color": naqi["color"],
                    "dominant_pollutant": "PM2.5",
                    "pm25": p25,
                    "pm10": round(p25 * 1.6, 1),
                    "no2": 28.0,
                    "o3": 39.0,
                    "provenance": "MODEL FORECAST",
                    "source": "Sample Fallback (Upstream API Offline)",
                }
            )
        return {"is_live": False, "fetched_at_utc": fetched_at, "cities": fallback}


async def fetch_pollution_shadow_grid(
    city_name: str,
    horizon_offset: int = 0,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Fetch a real 9-cell (3x3 regional ~25 km spacing) spatial-temporal pollution forecast grid
    around any city or clicked coordinate from Open-Meteo. Explicitly discloses ~25–40 km
    regional cell size and growing uncertainty band — NEVER claims street-level accuracy.
    """
    meta = await resolve_location_async(city_name=city_name, lat=lat, lon=lon)
    horizon_offset = max(0, min(71, horizon_offset))
    cache_key = f"shadow_raw:{meta['lat']:.3f}:{meta['lon']:.3f}"
    raw_grid = _cache_get(cache_key)

    # 3x3 grid at ~0.25 degree (~27 km) spacing to match CAMS regional resolution honestly
    offsets = [
        (-0.25, -0.25, "SW Sector (~35 km)"),
        (-0.25, 0.0, "South Sector (~27 km)"),
        (-0.25, 0.25, "SE Sector (~35 km)"),
        (0.0, -0.25, "West Sector (~24 km)"),
        (0.0, 0.0, f"{meta['city']} Central Grid"),
        (0.0, 0.25, "East Sector (~24 km)"),
        (0.25, -0.25, "NW Upwind Sector (~35 km)"),
        (0.25, 0.0, "North Sector (~27 km)"),
        (0.25, 0.25, "NE Sector (~35 km)"),
    ]

    is_live = True
    if raw_grid is None:
        lats = ",".join(f"{meta['lat'] + dlat:.4f}" for dlat, _, _ in offsets)
        lons = ",".join(f"{meta['lon'] + dlon:.4f}" for _, dlon, _ in offsets)
        try:
            async with httpx.AsyncClient(
                transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"), timeout=12.0
            ) as client:
                res = await client.get(
                    OPEN_METEO_AQ_BASE,
                    params={
                        "latitude": lats,
                        "longitude": lons,
                        "hourly": "pm2_5,pm10,nitrogen_dioxide,ozone",
                        "forecast_days": 3,
                        "timezone": "Asia/Kolkata",
                    },
                )
                res.raise_for_status()
                raw_grid = res.json()
                _cache_set(cache_key, raw_grid)
        except Exception:
            is_live = False
            raw_grid = None

    # Uncertainty widens transparently with forecast horizon (15% at +0h up to 42% at +72h)
    uncertainty_pct = round(15.0 + (horizon_offset / 72.0) * 27.0, 1)
    confidence_tier = (
        "Moderate-High (Nowcast 0–12h)"
        if horizon_offset <= 12
        else "Moderate (Short-Range 13–36h)"
        if horizon_offset <= 36
        else "Lower Confidence (Medium-Range 37–72h)"
    )

    cells = []
    valid_time = None
    if raw_grid and isinstance(raw_grid, list):
        # Align index 0 to current IST hour approximately
        now_ist_hour = datetime.now().strftime("%Y-%m-%dT%H:00")
        sample_times = raw_grid[0].get("hourly", {}).get("time", [])
        base_idx = 0
        for i, t in enumerate(sample_times):
            if t >= now_ist_hour:
                base_idx = i
                break
        target_idx = min(len(sample_times) - 1, base_idx + horizon_offset) if sample_times else 0
        valid_time = sample_times[target_idx] if sample_times else now_ist_hour

        for (dlat, dlon, label), cell_data in zip(offsets, raw_grid):
            h = cell_data.get("hourly", {})
            p25 = _safe_idx(h.get("pm2_5"), target_idx) or 0.0
            p10 = _safe_idx(h.get("pm10"), target_idx) or 0.0
            n2 = _safe_idx(h.get("nitrogen_dioxide"), target_idx) or 0.0
            oz = _safe_idx(h.get("ozone"), target_idx) or 0.0
            naqi = compute_indian_naqi(pm25=p25, pm10=p10, no2=n2, o3=oz)
            cells.append(
                {
                    "label": label,
                    "lat": round(meta["lat"] + dlat, 4),
                    "lon": round(meta["lon"] + dlon, 4),
                    "radius_m": 12500,
                    "pm25": round(p25, 1),
                    "pm10": round(p10, 1),
                    "no2": round(n2, 1),
                    "o3": round(oz, 1),
                    "indian_aqi": naqi["aqi"],
                    "category": naqi["category"],
                    "color": naqi["color"],
                    "uncertainty_pct": uncertainty_pct,
                    "provenance": "MODEL FORECAST",
                }
            )
    else:
        is_live = False
        valid_time = f"+{horizon_offset}h Sample Forecast"
        for idx, (dlat, dlon, label) in enumerate(offsets):
            p25 = round(55.0 + (idx - 4) * 4.5 + (horizon_offset % 12) * 1.8, 1)
            p10 = round(p25 * 1.55, 1)
            naqi = compute_indian_naqi(pm25=p25, pm10=p10, no2=30.0, o3=44.0)
            cells.append(
                {
                    "label": label,
                    "lat": round(meta["lat"] + dlat, 4),
                    "lon": round(meta["lon"] + dlon, 4),
                    "radius_m": 12500,
                    "pm25": p25,
                    "pm10": p10,
                    "no2": 30.0,
                    "o3": 44.0,
                    "indian_aqi": naqi["aqi"],
                    "category": naqi["category"],
                    "color": naqi["color"],
                    "uncertainty_pct": uncertainty_pct,
                    "provenance": "MODEL FORECAST",
                }
            )

    # Identify regional data coverage gaps transparently
    data_gaps = [
        {
            "sector": "Peri-urban agricultural belt (20–40 km radius)",
            "gap_type": "Sparse continuous reference CAAQMS coverage",
            "recommendation": "Candidate zone for co-located calibrated community PM2.5 nodes.",
        },
        {
            "sector": "Street-canyon & highway intersections (< 500 m scale)",
            "gap_type": "Sub-grid variation unresolved by ~25–40 km CAMS model cells",
            "recommendation": "Treat forecast cells as regional background trends, not kerbside readings.",
        },
    ]

    return {
        "is_live": is_live,
        "city": meta["city"],
        "center": {"lat": meta["lat"], "lon": meta["lon"]},
        "horizon_hours": horizon_offset,
        "valid_time_ist": valid_time,
        "uncertainty_pct": uncertainty_pct,
        "confidence_tier": confidence_tier,
        "model": {
            "name": "Copernicus CAMS Global Atmospheric Composition via Open-Meteo",
            "version": "CAMS-IFS Cycle 48r1",
            "spatial_resolution_km": 40.0,
            "grid_spacing_km": 27.0,
            "max_horizon_hours": 72,
            "precision_disclaimer": "Regional gridded forecast (~27–40 km cells). Does NOT represent street-level or building-level pollutant concentrations.",
        },
        "nearest_reference": {
            "name": meta["nearest_station"],
            "operator": meta["operator"],
            "lat": meta["lat"],
            "lon": meta["lon"],
        },
        "cells": cells,
        "data_gaps": data_gaps,
    }


# ---------------------------------------------------------------------------
# Deterministic Future Me Exposure & Emissions Engine
# ---------------------------------------------------------------------------
TRANSPORT_FACTORS: Dict[str, Dict[str, Any]] = {
    "walking": {"label": "Walking (Outdoor)", "infiltration": 1.00, "co2_g_per_km": 0.0, "speed_kph": 4.8},
    "cycling": {"label": "Cycling (Outdoor)", "infiltration": 1.05, "co2_g_per_km": 0.0, "speed_kph": 15.0},
    "two_wheeler": {"label": "Two-Wheeler / Scooter", "infiltration": 1.15, "co2_g_per_km": 42.0, "speed_kph": 26.0},
    "auto_rickshaw": {"label": "Auto-Rickshaw (Open Cabin)", "infiltration": 1.12, "co2_g_per_km": 68.0, "speed_kph": 22.0},
    "car_open": {"label": "Car (Windows Open)", "infiltration": 1.08, "co2_g_per_km": 148.0, "speed_kph": 28.0},
    "ac_car": {"label": "AC Car (Cabin Recirculate)", "infiltration": 0.52, "co2_g_per_km": 162.0, "speed_kph": 28.0},
    "city_bus": {"label": "City Bus / Shared Transit", "infiltration": 0.82, "co2_g_per_km": 32.0, "speed_kph": 20.0},
    "metro_ev": {"label": "Metro / AC Electric Transit", "infiltration": 0.42, "co2_g_per_km": 18.0, "speed_kph": 34.0},
    "indoor_unfiltered": {"label": "Stay Indoors (Natural Ventilation)", "infiltration": 0.65, "co2_g_per_km": 0.0, "speed_kph": 0.0},
    "indoor_hepa": {"label": "Stay Indoors (Closed + HEPA Purifier)", "infiltration": 0.25, "co2_g_per_km": 0.0, "speed_kph": 0.0},
}

ACTIVITY_VENTILATION_M3_PER_HR: Dict[str, Dict[str, Any]] = {
    "resting": {"label": "Resting / Seated Commute", "rate_m3_h": 0.60},
    "light": {"label": "Light Activity / Office / Errand", "rate_m3_h": 0.95},
    "moderate": {"label": "Brisk Walk / Moderate Cycling", "rate_m3_h": 1.65},
    "vigorous": {"label": "Running / Outdoor Sport", "rate_m3_h": 2.80},
}

MASK_FACTOR: Dict[str, Dict[str, Any]] = {
    "none": {"label": "No Respirator", "penetration": 1.00},
    "cloth_surgical": {"label": "Cloth / Loose Mask", "penetration": 0.72},
    "n95_fitted": {"label": "Well-Fitted N95 / FFP2", "penetration": 0.25},
}


def evaluate_single_scenario(
    scenario: Dict[str, Any], hourly_forecast: List[Dict[str, Any]], fallback_pm25: float
) -> Dict[str, Any]:
    dep_hour = int(scenario.get("departure_hour", 8)) % 24
    duration_min = max(5, min(480, int(scenario.get("duration_min", 45))))
    mode_key = scenario.get("transport_mode", "two_wheeler")
    act_key = scenario.get("activity_level", "light")
    mask_key = scenario.get("mask_type", "none")
    setting = scenario.get("setting", "outdoor")  # outdoor | indoor_unfiltered | indoor_hepa
    distance_km = float(scenario.get("distance_km", 0.0))

    # Look up matching forecast hour PM2.5
    ambient_pm25 = fallback_pm25
    matched_time = f"{dep_hour:02d}:00 IST"
    for pt in hourly_forecast[:24]:
        t = pt.get("time", "")
        if f"T{dep_hour:02d}:" in t and pt.get("pm25") is not None:
            ambient_pm25 = float(pt["pm25"])
            matched_time = t
            break

    mode = TRANSPORT_FACTORS.get(mode_key, TRANSPORT_FACTORS["walking"])
    if setting in ("indoor_unfiltered", "indoor_hepa"):
        infiltration = TRANSPORT_FACTORS[setting]["infiltration"]
        co2_rate = 0.0
        effective_distance = 0.0
    else:
        infiltration = mode["infiltration"]
        co2_rate = mode["co2_g_per_km"]
        effective_distance = (
            distance_km
            if distance_km > 0
            else round(mode["speed_kph"] * (duration_min / 60.0), 1)
        )

    act = ACTIVITY_VENTILATION_M3_PER_HR.get(act_key, ACTIVITY_VENTILATION_M3_PER_HR["light"])
    mask = MASK_FACTOR.get(mask_key, MASK_FACTOR["none"])

    hours = duration_min / 60.0
    micro_env_pm25 = ambient_pm25 * infiltration * mask["penetration"]
    concentration_time_ug_h_m3 = round(micro_env_pm25 * hours, 1)
    inhaled_proxy_ug = round(micro_env_pm25 * act["rate_m3_h"] * hours, 1)
    co2_g = round(effective_distance * co2_rate, 0)
    naqi = compute_indian_naqi(pm25=ambient_pm25)

    return {
        "label": scenario.get("label", "Scenario"),
        "departure_hour": dep_hour,
        "matched_forecast_time": matched_time,
        "duration_min": duration_min,
        "distance_km": round(effective_distance, 1),
        "setting": setting,
        "transport_label": TRANSPORT_FACTORS[setting]["label"]
        if setting in ("indoor_unfiltered", "indoor_hepa")
        else mode["label"],
        "activity_label": act["label"],
        "mask_label": mask["label"],
        "ambient_pm25": round(ambient_pm25, 1),
        "ambient_indian_aqi": naqi["aqi"],
        "micro_env_pm25": round(micro_env_pm25, 1),
        "exposure_conc_hours": concentration_time_ug_h_m3,
        "estimated_exposure_index_ug": inhaled_proxy_ug,
        "emissions_co2_g": co2_g,
        "assumptions": {
            "infiltration_factor": infiltration,
            "breathing_rate_m3_h": act["rate_m3_h"],
            "respirator_penetration_factor": mask["penetration"],
            "emission_factor_g_km": co2_rate,
        },
    }


def compare_future_me(
    scenario_a: Dict[str, Any],
    scenario_b: Dict[str, Any],
    live_bundle: Dict[str, Any],
) -> Dict[str, Any]:
    forecast = live_bundle.get("forecast_72h", [])
    fallback_pm25 = live_bundle.get("current", {}).get("pollutants", {}).get("pm25") or 55.0

    res_a = evaluate_single_scenario({**scenario_a, "label": scenario_a.get("label", "Scenario A")}, forecast, fallback_pm25)
    res_b = evaluate_single_scenario({**scenario_b, "label": scenario_b.get("label", "Scenario B")}, forecast, fallback_pm25)

    exp_a = max(0.1, res_a["estimated_exposure_index_ug"])
    exp_b = res_b["estimated_exposure_index_ug"]
    exp_delta_pct = round(((exp_b - exp_a) / exp_a) * 100.0, 1)
    time_delta_min = res_b["duration_min"] - res_a["duration_min"]
    co2_delta_g = round(res_b["emissions_co2_g"] - res_a["emissions_co2_g"], 0)

    if exp_delta_pct < -5:
        verdict = (
            f"Scenario B reduces estimated PM2.5 exposure by {abs(exp_delta_pct):.1f}% "
            f"({res_a['estimated_exposure_index_ug']} → {res_b['estimated_exposure_index_ug']} µg index)"
        )
    elif exp_delta_pct > 5:
        verdict = (
            f"Scenario A results in lower estimated PM2.5 exposure; Scenario B is {exp_delta_pct:.1f}% higher "
            f"({res_a['estimated_exposure_index_ug']} vs {res_b['estimated_exposure_index_ug']} µg index)"
        )
    else:
        verdict = "Both scenarios yield broadly similar estimated PM2.5 exposure (within ±5%)."

    if co2_delta_g < 0:
        verdict += f" and avoids ~{abs(int(co2_delta_g))} g CO2e of direct travel emissions."
    elif co2_delta_g > 0:
        verdict += f", with a trade-off of +{int(co2_delta_g)} g CO2e travel emissions."
    else:
        verdict += " with identical direct travel emissions."

    return {
        "city": live_bundle["location"]["city"],
        "provenance": "ESTIMATED",
        "source_feed": live_bundle["provenance"]["air_quality_source"],
        "is_live_input": live_bundle["is_live"],
        "scenario_a": res_a,
        "scenario_b": res_b,
        "comparison": {
            "exposure_delta_pct": exp_delta_pct,
            "exposure_delta_ug": round(exp_b - res_a["estimated_exposure_index_ug"], 1),
            "time_delta_min": time_delta_min,
            "emissions_delta_g": co2_delta_g,
            "recommended": "B" if exp_b <= res_a["estimated_exposure_index_ug"] else "A",
            "summary": verdict,
        },
        "formula_disclosure": "Exposure Index (µg) = Ambient Forecast PM2.5 (µg/m³) × Micro-environment Infiltration Factor × Respirator Penetration Factor × Standardised Ventilation Rate (m³/h) × Duration (h).",
        "non_medical_disclaimer": "ESTIMATED environmental comparison metric only. This is NOT an individual physiological, clinical, or medical inhaled dose and must not be used for medical decisions.",
    }


# ---------------------------------------------------------------------------
# Route Comparison & Before-You-Go Engine
# ---------------------------------------------------------------------------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def compare_routes(
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    departure_hour: int,
    transport_mode: str,
    live_bundle: Dict[str, Any],
) -> Dict[str, Any]:
    straight_km = max(1.2, haversine_km(origin["lat"], origin["lon"], destination["lat"], destination["lon"]))
    mode = TRANSPORT_FACTORS.get(transport_mode, TRANSPORT_FACTORS["ac_car"])
    speed = max(4.8, mode["speed_kph"])

    # Match hourly forecast for departure_hour
    base_pm25 = live_bundle["current"]["pollutants"]["pm25"] or 55.0
    matched_time = f"{departure_hour:02d}:00 IST"
    for pt in live_bundle.get("forecast_72h", [])[:24]:
        if f"T{departure_hour:02d}:" in pt.get("time", "") and pt.get("pm25") is not None:
            base_pm25 = float(pt["pm25"])
            matched_time = pt["time"]
            break

    mid_lat = (origin["lat"] + destination["lat"]) / 2
    mid_lon = (origin["lon"] + destination["lon"]) / 2
    dlat = destination["lat"] - origin["lat"]
    dlon = destination["lon"] - origin["lon"]

    # Three realistic route corridor profiles with transparent corridor assumption factors
    profiles = [
        {
            "id": "route_direct",
            "name": "Option 1 — Direct Arterial Corridor",
            "road_factor": 1.24,
            "speed_mult": 0.92,
            "corridor_pm_factor": 1.14,
            "coverage_label": "Regional grid + arterial traffic proxy (Moderate coverage)",
            "coverage_pct": 72,
            "offset": (0.0, 0.0),
            "color": "#F97316",
            "notes": "Shortest road distance along primary arterial junctions; typically higher stop-and-go exhaust exposure.",
        },
        {
            "id": "route_green",
            "name": "Option 2 — Low-Traffic / Green-Buffered Detour",
            "road_factor": 1.42,
            "speed_mult": 1.0,
            "corridor_pm_factor": 0.88,
            "coverage_label": "Regional grid + low-traffic buffer assumption (Moderate coverage)",
            "coverage_pct": 68,
            "offset": (-dlon * 0.22 + 0.008, dlat * 0.22 - 0.006),
            "color": "#12BFA5",
            "notes": "Adds slight distance via secondary tree-lined/institutional roads to reduce direct arterial traffic exposure.",
        },
        {
            "id": "route_ring",
            "name": "Option 3 — Ring / Transit-Priority Corridor",
            "road_factor": 1.35,
            "speed_mult": 1.08,
            "corridor_pm_factor": 0.96,
            "coverage_label": "Regional grid + steady-flow corridor estimate (Moderate coverage)",
            "coverage_pct": 75,
            "offset": (dlon * 0.20 - 0.006, -dlat * 0.20 + 0.008),
            "color": "#3478F6",
            "notes": "Fewer signal bottlenecks reduce total duration spent in traffic plumes.",
        },
    ]

    routes = []
    for p in profiles:
        dist = round(straight_km * p["road_factor"], 1)
        dur_min = max(6, round((dist / (speed * p["speed_mult"])) * 60))
        corridor_pm25 = round(base_pm25 * p["corridor_pm_factor"], 1)
        in_mode_pm25 = round(corridor_pm25 * mode["infiltration"], 1)
        exposure_score = round(in_mode_pm25 * (dur_min / 60.0), 1)
        co2_g = round(dist * mode["co2_g_per_km"], 0)
        corridor_aqi = compute_indian_naqi(pm25=corridor_pm25)
        wp1 = [round(origin["lat"] * 0.65 + mid_lat * 0.35 + p["offset"][0] * 0.6, 5), round(origin["lon"] * 0.65 + mid_lon * 0.35 + p["offset"][1] * 0.6, 5)]
        wp2 = [round(mid_lat + p["offset"][0], 5), round(mid_lon + p["offset"][1], 5)]
        wp3 = [round(destination["lat"] * 0.65 + mid_lat * 0.35 + p["offset"][0] * 0.6, 5), round(destination["lon"] * 0.65 + mid_lon * 0.35 + p["offset"][1] * 0.6, 5)]
        routes.append(
            {
                "id": p["id"],
                "name": p["name"],
                "color": p["color"],
                "distance_km": dist,
                "duration_min": dur_min,
                "corridor_pm25_est": corridor_pm25,
                "corridor_indian_aqi": corridor_aqi["aqi"],
                "corridor_category": corridor_aqi["category"],
                "exposure_conc_hours": exposure_score,
                "emissions_co2_g": co2_g,
                "data_coverage_pct": p["coverage_pct"],
                "coverage_label": p["coverage_label"],
                "notes": p["notes"],
                "geometry": [
                    [origin["lat"], origin["lon"]],
                    wp1,
                    wp2,
                    wp3,
                    [destination["lat"], destination["lon"]],
                ],
                "provenance": "ESTIMATED",
            }
        )

    lowest_exp = min(routes, key=lambda r: r["exposure_conc_hours"])
    fastest = min(routes, key=lambda r: r["duration_min"])

    aqi_now = compute_indian_naqi(pm25=base_pm25)
    brief_checklist = [
        f"Forecast regional PM2.5 at {matched_time}: {round(base_pm25, 1)} µg/m³ (Indian NAQI ~{aqi_now['aqi']}, {aqi_now['category']}).",
        "Carry drinking water and check wind direction before departure.",
    ]
    if aqi_now["aqi"] > 150:
        brief_checklist.append("Pack a well-fitted N95/FFP2 respirator if walking, cycling, or using open-cabin transport.")
        brief_checklist.append("If driving an AC vehicle, enable cabin air recirculation through congested junctions.")
    else:
        brief_checklist.append("Consider lower-emission shared transit, cycling, or walking along greener secondary streets.")

    return {
        "city": live_bundle["location"]["city"],
        "origin": origin,
        "destination": destination,
        "departure_hour": departure_hour,
        "matched_forecast_time": matched_time,
        "transport_mode": transport_mode,
        "transport_label": mode["label"],
        "regional_pm25": round(base_pm25, 1),
        "routes": routes,
        "lowest_exposure_route_id": lowest_exp["id"],
        "fastest_route_id": fastest["id"],
        "before_you_go_brief": brief_checklist,
        "explanation": (
            f"{lowest_exp['name']} yields the lowest estimated cumulative PM2.5 exposure "
            f"({lowest_exp['exposure_conc_hours']} µg·h/m³ over {lowest_exp['duration_min']} min), "
            f"compared with {fastest['exposure_conc_hours']} µg·h/m³ on the fastest corridor ({fastest['duration_min']} min)."
        ),
        "safety_disclaimer": "IMPORTANT: No outdoor route is labelled 'clean' or medically safe. Corridor comparisons apply disclosed traffic-proximity multipliers (0.88×–1.14×) to regional Open-Meteo CAMS forecasts because street-by-street sensor telemetry is not universally available.",
        "provenance": "ESTIMATED",
    }


# ---------------------------------------------------------------------------
# AI Daily Replanner Deterministic Optimizer & Ventilation Window Advisor
# ---------------------------------------------------------------------------
def generate_replan_suggestions(
    blocks: List[Dict[str, Any]], live_bundle: Dict[str, Any]
) -> List[Dict[str, Any]]:
    forecast = live_bundle.get("forecast_72h", [])[:24]
    by_hour: Dict[int, Dict[str, Any]] = {}
    for pt in forecast:
        t = pt.get("time", "")
        if "T" in t:
            try:
                hr = int(t.split("T")[1].split(":")[0])
                by_hour[hr] = pt
            except ValueError:
                pass

    default_pm = live_bundle["current"]["pollutants"]["pm25"] or 55.0
    suggestions = []
    for block in blocks:
        time_str = block.get("time", "07:00")
        try:
            cur_hr = int(time_str.split(":")[0]) % 24
        except ValueError:
            cur_hr = 8
        cur_pm = (by_hour.get(cur_hr) or {}).get("pm25") or default_pm
        is_flexible = block.get("flexible", True)
        setting = block.get("setting", "outdoor")

        # Search candidate hours (6:00–20:00) for cleaner slot
        candidates = [
            (h, by_hour[h]["pm25"])
            for h in range(6, 21)
            if h in by_hour and by_hour[h].get("pm25") is not None
        ]
        best_hr, best_pm = (min(candidates, key=lambda x: x[1]) if candidates else (cur_hr, cur_pm))
        reduction_pct = round(((cur_pm - best_pm) / max(1.0, cur_pm)) * 100.0, 1)

        rec_transport = block.get("transport", "walking")
        transport_tip = "Current transport choice retained."
        if rec_transport in ("car_open", "two_wheeler", "auto_rickshaw") and cur_pm > 50:
            rec_transport = "metro_ev"
            transport_tip = "Switch to AC Metro/EV transit or use a fitted N95 respirator to lower cabin infiltration & CO2e."
        elif rec_transport == "ac_car" and cur_pm <= 45:
            transport_tip = "Moderate/Satisfactory air allows shifting short trips to shared transit or cycling for lower emissions."

        if setting == "outdoor" and is_flexible and best_hr != cur_hr and reduction_pct >= 10:
            action = "reschedule"
            suggested_time = f"{best_hr:02d}:00"
            rationale = (
                f"Forecast PM2.5 at {time_str} is {cur_pm:.1f} µg/m³ vs {best_pm:.1f} µg/m³ at {suggested_time} "
                f"(~{reduction_pct}% lower ambient PM2.5 due to daytime boundary-layer mixing)."
            )
        elif setting == "outdoor" and cur_pm > 90:
            action = "shift_indoor"
            suggested_time = time_str
            reduction_pct = 55.0
            rationale = (
                f"Forecast PM2.5 stays elevated ({cur_pm:.1f} µg/m³). Consider moving strenuous portions indoors "
                f"with filtration if your schedule allows."
            )
        else:
            action = "keep"
            suggested_time = time_str
            reduction_pct = max(0.0, reduction_pct)
            rationale = f"Scheduled slot ({time_str}, forecast PM2.5 {cur_pm:.1f} µg/m³) is already well-aligned with today's atmospheric curve."

        suggestions.append(
            {
                "block_id": block.get("id"),
                "title": block.get("title"),
                "current_time": time_str,
                "current_pm25": round(cur_pm, 1),
                "suggested_time": suggested_time,
                "suggested_pm25": round(best_pm if action == "reschedule" else cur_pm, 1),
                "suggested_action": action,
                "suggested_setting": "indoor" if action == "shift_indoor" else setting,
                "suggested_transport": rec_transport,
                "transport_tip": transport_tip,
                "estimated_reduction_pct": reduction_pct,
                "rationale": rationale,
                "requires_approval": action != "keep",
                "provenance": "ESTIMATED",
            }
        )
    return suggestions


def compute_ventilation_windows(live_bundle: Dict[str, Any]) -> Dict[str, Any]:
    forecast = live_bundle.get("forecast_72h", [])[:24]
    windows = []
    for pt in forecast:
        pm25 = pt.get("pm25")
        if pm25 is None:
            continue
        status = (
            "favourable"
            if pm25 <= 45
            else "cautious_brief"
            if pm25 <= 75
            else "keep_closed"
        )
        windows.append(
            {
                "time": pt["time"],
                "outdoor_pm25": pm25,
                "outdoor_aqi": pt["indian_aqi"],
                "wind_kph": pt.get("wind_kph"),
                "status": status,
            }
        )
    favourable = [w for w in windows if w["status"] == "favourable"]
    best = sorted(windows, key=lambda w: w["outdoor_pm25"])[:3]
    return {
        "windows": windows,
        "best_3_hours": best,
        "has_clean_window": len(favourable) > 0,
        "guidance": (
            f"Best cross-ventilation slots today are around {', '.join(w['time'].split('T')[-1] for w in best)} "
            f"(lowest forecast outdoor PM2.5: {best[0]['outdoor_pm25']} µg/m³)."
            if best
            else "Forecast hourly data unavailable for ventilation advice."
        ),
        "disclaimer": "Indoor air quality is NEVER inferred from outdoor AQI alone. Cooking, incense, cleaning sprays, CO2 build-up, and filtration independently govern indoor air.",
        "provenance": "MODEL FORECAST",
    }

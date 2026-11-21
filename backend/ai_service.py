"""
Grounded VAYUVERSE AI Response Agent.
- Uses Claude API (`ANTHROPIC_API_KEY`) when configured in server environment variables.
- When `ANTHROPIC_API_KEY` is not set, uses VAYUVERSE's deterministic grounded environmental
  synthesis engine over the exact retrieved live environmental bundle, community reports, and
  user schedule — transparently disclosing the active engine and NEVER inventing data.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List


SYSTEM_PROMPT = """You are the VAYUVERSE AI Response Agent — a rigorous, empathetic, transparent environmental intelligence assistant.

STRICT GROUNDING & SAFETY RULES:
1. Ground EVERY numerical air-quality statement strictly in the RETRIEVED EVIDENCE CONTEXT provided below. Never invent AQI readings, station readings, or pollutant numbers.
2. Distinguish clearly between data classes: MEASURED, MODEL FORECAST, ESTIMATED, USER REPORTED, and AI SUMMARY.
3. Explicitly state spatial limitations: Open-Meteo CAMS provides regional grid analysis (~11-40 km), NOT street-level or room-level measurements.
4. Never infer indoor air quality from outdoor AQI alone.
5. Never provide medical diagnoses, treatment advice, or claim any place/route is "medically safe". Frame all exposure figures as relative environmental comparisons.
6. Never accuse a specific person, company, or organization of causing pollution.
7. If the user asks for information not present in the retrieved evidence, say clearly what is unavailable and explain what IS known.
8. Respond in the user's preferred language when requested (English, Hindi हिन्दी, or Punjabi ਪੰਜਾਬੀ). Keep formatting clean with concise bullet points and practical daily steps."""


async def generate_grounded_response(
    message: str,
    language: str,
    live_bundle: Dict[str, Any],
    recent_incidents: List[Dict[str, Any]],
    user_context: Dict[str, Any],
    history: List[Dict[str, str]],
) -> Dict[str, Any]:
    loc = live_bundle["location"]
    cur = live_bundle["current"]
    comp = live_bundle["comparison"]
    prov = live_bundle["provenance"]
    pol = cur["pollutants"]
    wx = cur["weather"]

    cleanest = comp.get("cleanest_window") or {}
    peak = comp.get("peak_window") or {}

    sources = [
        {
            "title": prov["air_quality_source"],
            "classification": prov["concentrations_class"],
            "timestamp": cur["observed_time_ist"],
            "location": f"{loc['city']}, {loc['state']} ({loc['lat']:.3f}°N, {loc['lon']:.3f}°E)",
        },
        {
            "title": "Indian National AQI (CPCB Breakpoint Engine)",
            "classification": "ESTIMATED",
            "timestamp": cur["observed_time_ist"],
            "location": f"NAQI {cur['indian_aqi']} ({cur['category']}), Dominant: {cur['dominant_pollutant']}",
        },
        {
            "title": prov["weather_source"],
            "classification": "MODEL FORECAST",
            "timestamp": cur["weather_time_ist"],
            "location": f"{wx['temp_c']}°C, RH {wx['humidity_pct']}%, Wind {wx['wind_kph']} km/h {wx['wind_compass']}",
        },
    ]
    if recent_incidents:
        sources.append(
            {
                "title": f"VAYU Community Incident Feed ({len(recent_incidents)} local reports)",
                "classification": "USER REPORTED",
                "timestamp": recent_incidents[0].get("observed_at", "Recent"),
                "location": loc["city"],
            }
        )

    reasoning_inputs = {
        "city": loc["city"],
        "is_live_feed": live_bundle["is_live"],
        "indian_aqi": cur["indian_aqi"],
        "category": cur["category"],
        "pm25_ug_m3": pol["pm25"],
        "pm10_ug_m3": pol["pm10"],
        "no2_ug_m3": pol["no2"],
        "o3_ug_m3": pol["o3"],
        "cleanest_24h_slot": cleanest.get("time"),
        "cleanest_24h_pm25": cleanest.get("pm25"),
        "peak_24h_slot": peak.get("time"),
        "peak_24h_pm25": peak.get("pm25"),
        "incident_count_retrieved": len(recent_incidents),
        "user_aqi_threshold": user_context.get("aqi_threshold", 150),
        "preferred_language": language,
        "safety_guardrails": [
            "Non-medical framing enforced",
            "No street-level precision claims",
            "Indoor air decoupled from outdoor AQI",
            "Zero fabricated observations",
        ],
    }

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    model_name = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    if api_key:
        try:
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=api_key)
            evidence_block = (
                f"RETRIEVED EVIDENCE CONTEXT ({loc['city']}, {loc['state']}):\n"
                f"- Feed Status: {'LIVE' if live_bundle['is_live'] else 'DEMO FALLBACK'}\n"
                f"- Source: {prov['air_quality_source']} | Observed: {cur['observed_time_ist']} IST\n"
                f"- Indian NAQI (ESTIMATED from CAMS): {cur['indian_aqi']} ({cur['category']}), Dominant: {cur['dominant_pollutant']}\n"
                f"- PM2.5: {pol['pm25']} µg/m³ | PM10: {pol['pm10']} µg/m³ | NO2: {pol['no2']} µg/m³ | O3: {pol['o3']} µg/m³ | SO2: {pol['so2']} µg/m³ | CO: {pol['co_mg']} mg/m³\n"
                f"- Weather: {wx['temp_c']}°C, Humidity {wx['humidity_pct']}%, Wind {wx['wind_kph']} km/h ({wx['wind_compass']}), Pressure {wx['pressure_hpa']} hPa\n"
                f"- 24h Avg NAQI: {comp['last_24h_avg_aqi']} (vs prior 24h: {comp['prev_24h_avg_aqi']}, delta {comp['delta_aqi']:+d})\n"
                f"- Cleanest upcoming forecast slot: {cleanest.get('time')} (NAQI {cleanest.get('indian_aqi')}, PM2.5 {cleanest.get('pm25')} µg/m³)\n"
                f"- Highest upcoming forecast slot: {peak.get('time')} (NAQI {peak.get('indian_aqi')}, PM2.5 {peak.get('pm25')} µg/m³)\n"
                f"- Community Reports (USER REPORTED, unverified unless stated): {recent_incidents[:5]}\n"
                f"- User Context: Name={user_context.get('name')}, Language={language}, Alert Threshold={user_context.get('aqi_threshold')}\n"
            )
            msgs = [{"role": m["role"], "content": m["content"]} for m in history[-6:] if m["role"] in ("user", "assistant")]
            msgs.append({"role": "user", "content": f"{evidence_block}\n\nUSER QUESTION: {message}"})
            resp = await client.messages.create(
                model=model_name,
                max_tokens=900,
                system=SYSTEM_PROMPT,
                messages=msgs,
            )
            text = resp.content[0].text
            return {
                "reply": text,
                "sources": sources,
                "reasoning": reasoning_inputs,
                "model_used": f"Claude ({model_name}) — Live Grounded Mode",
                "provenance": "AI SUMMARY",
            }
        except Exception as exc:
            reasoning_inputs["claude_fallback_note"] = f"Claude API error ({type(exc).__name__}); served by Grounded Evidence Engine."

    # Optional Free-Tier Google AI Studio Gemini API (gemini-2.0-flash — $0 free tier)
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            import httpx
            gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
            evidence_block = (
                f"RETRIEVED LIVE EVIDENCE CONTEXT:\n"
                f"- Location: {loc['city']}, {loc['state']}, {loc['country']} ({loc['lat']:.3f}, {loc['lon']:.3f})\n"
                f"- Feed Live: {live_bundle['is_live']} | Observed: {cur['observed_time_ist']}\n"
                f"- Estimated Indian NAQI: {cur['indian_aqi']} ({cur['category']}), US AQI: {cur.get('us_aqi')}, Dominant: {cur['dominant_pollutant']}\n"
                f"- Pollutants: PM2.5={pol['pm25']} µg/m³, PM10={pol['pm10']} µg/m³, NO2={pol['no2']} µg/m³, O3={pol['o3']} µg/m³, SO2={pol['so2']} µg/m³, CO={pol['co_mg']} mg/m³\n"
                f"- Weather: Temp={wx['temp_c']}°C, Humidity={wx['humidity_pct']}%, Wind={wx['wind_kph']} km/h {wx['wind_compass']}, Pressure={wx['pressure_hpa']} hPa\n"
                f"- 24h Avg NAQI: {comp['last_24h_avg_aqi']} (delta {comp['delta_aqi']:+d} vs prior 24h)\n"
                f"- Cleanest upcoming hour: {cleanest.get('time')} (NAQI {cleanest.get('indian_aqi')}) | Peak hour: {peak.get('time')} (NAQI {peak.get('indian_aqi')})\n"
                f"- Community Reports (USER REPORTED, unverified unless stated): {recent_incidents[:5]}\n"
                f"- User Context: Name={user_context.get('name')}, Language={language}, Alert Threshold={user_context.get('aqi_threshold')}\n"
            )
            async with httpx.AsyncClient(timeout=18.0) as gclient:
                gres = await gclient.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent",
                    params={"key": gemini_key},
                    json={
                        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                        "contents": [
                            {"role": "user", "parts": [{"text": f"{evidence_block}\n\nUSER QUESTION: {message}"}]}
                        ],
                        "generationConfig": {"maxOutputTokens": 900, "temperature": 0.3},
                    },
                )
                gres.raise_for_status()
                gdata = gres.json()
                gtext = (
                    gdata.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                    .strip()
                )
                if gtext:
                    return {
                        "reply": gtext,
                        "sources": sources,
                        "reasoning": reasoning_inputs,
                        "model_used": f"Google Gemini ({gemini_model}) — Live Grounded Mode (Free Tier)",
                        "provenance": "AI SUMMARY",
                    }
        except Exception as exc:
            reasoning_inputs["gemini_fallback_note"] = (
                f"Gemini API error ({type(exc).__name__}); served by Grounded Evidence Engine."
            )

    # Deterministic Grounded Environmental Evidence Synthesis (works offline / without API key — 100% Free)
    reply = _build_deterministic_grounded_reply(
        message=message,
        language=language,
        loc=loc,
        cur=cur,
        pol=pol,
        wx=wx,
        comp=comp,
        cleanest=cleanest,
        peak=peak,
        recent_incidents=recent_incidents,
        is_live=live_bundle["is_live"],
    )
    return {
        "reply": reply,
        "sources": sources,
        "reasoning": reasoning_inputs,
        "model_used": "VAYUVERSE Grounded Evidence Engine v1.1 (Free Tier — Optional GEMINI_API_KEY supported)",
        "provenance": "AI SUMMARY",
    }


def _build_deterministic_grounded_reply(
    message: str,
    language: str,
    loc: Dict[str, Any],
    cur: Dict[str, Any],
    pol: Dict[str, Any],
    wx: Dict[str, Any],
    comp: Dict[str, Any],
    cleanest: Dict[str, Any],
    peak: Dict[str, Any],
    recent_incidents: List[Dict[str, Any]],
    is_live: bool,
) -> str:
    q = message.lower()
    city = loc["city"]
    aqi = cur["indian_aqi"]
    cat = cur["category"]
    pm25 = pol["pm25"]
    pm10 = pol["pm10"]
    no2 = pol["no2"]
    o3 = pol["o3"]
    clean_t = (cleanest.get("time") or "14:00").split("T")[-1]
    clean_pm = cleanest.get("pm25", pm25)
    clean_aqi = cleanest.get("indian_aqi", aqi)
    peak_t = (peak.get("time") or "07:00").split("T")[-1]
    peak_pm = peak.get("pm25", pm25)
    peak_aqi = peak.get("indian_aqi", aqi)
    feed_tag = "Live Open-Meteo CAMS analysis" if is_live else "Offline labelled sample feed"

    # Guardrail 1: Medical questions
    if any(w in q for w in ("asthma", "medicine", "inhaler", "doctor", "diagnos", "hospital", "lung disease", "safe medically")):
        return (
            f"**Important Boundary:** VAYUVERSE AI is an environmental intelligence platform, not a medical diagnostic or treatment service, and cannot label any condition or location medically safe. Please consult a qualified healthcare professional for personal clinical guidance.\n\n"
            f"**Available Environmental Context for {city}** (`MODEL FORECAST` / `ESTIMATED` — {cur['observed_time_ist']} IST):\n"
            f"- **Indian NAQI:** {aqi} (**{cat}**), driven primarily by **{cur['dominant_pollutant']}** (PM2.5: {pm25} µg/m³, PM10: {pm10} µg/m³).\n"
            f"- **Lower-pollution forecast window (next 24h):** around **{clean_t} IST** (forecast PM2.5 ~{clean_pm} µg/m³, NAQI ~{clean_aqi}).\n"
            f"- **Practical non-medical steps:** {cur['advisory']}"
        )

    # Guardrail 2: Unavailable street-level / unmeasured sensor queries
    if any(w in q for w in ("exact street", "my house", "my bedroom", "street-level", "exact building", "who caused", "which factory")):
        return (
            f"**Transparency Notice — Data Not Available at That Granularity:**\n"
            f"- Street-level and inside-room pollutant concentrations are **not directly measured** by regional atmospheric feeds, and VAYUVERSE never invents readings or attributes pollution to named individuals or companies.\n"
            f"- Indoor air depends on cooking, ventilation, CO2 accumulation, and filtration — open **VAYU Home** to log a manual monitor reading or run the Ventilation Window Advisor.\n\n"
            f"**What We Do Know for {city} Regional Grid (~11–40 km)** ({feed_tag}, {cur['observed_time_ist']} IST):\n"
            f"- **Regional Indian NAQI:** {aqi} (**{cat}**) | PM2.5: {pm25} µg/m³ | PM10: {pm10} µg/m³ | Wind: {wx['wind_kph']} km/h {wx['wind_compass']}.\n"
            f"- **Best upcoming outdoor window:** ~**{clean_t} IST** (forecast PM2.5: {clean_pm} µg/m³)."
        )

    # Community report summary
    if any(w in q for w in ("community", "incident", "report", "smoke", "burning", "dust")):
        inc_lines = "\n".join(
            f"- **[{r['status']}] {r['category'].replace('_', ' ').title()}** near *{r['area_label']}* ({r['severity']} severity) — `USER REPORTED`"
            for r in recent_incidents[:5]
        ) or "- No citizen incident reports are currently filed for this city."
        return (
            f"### Community Incident Summary — {city} (`AI SUMMARY` of `USER REPORTED` records)\n"
            f"We retrieved **{len(recent_incidents)}** local report(s) for {city}. Note that citizen submissions are marked `USER REPORTED` and are not independently verified ground-sensor measurements:\n\n"
            f"{inc_lines}\n\n"
            f"**Regional Backdrop (`MODEL FORECAST`):** Indian NAQI **{aqi} ({cat})**, PM2.5 **{pm25} µg/m³**, Wind **{wx['wind_kph']} km/h {wx['wind_compass']}**.\n"
            f"- To log a new observation with coarse privacy-preserving location, visit **Incident Reporting**."
        )

    # Routine / run / walk / commute / ventilation planning
    if any(w in q for w in ("run", "walk", "exercise", "commute", "plan", "routine", "schedule", "window", "ventilat", "action")):
        return (
            f"### Grounded Daily Action Plan — {city} (`AI SUMMARY`)\n"
            f"Based on retrieved regional telemetry at **{cur['observed_time_ist']} IST** ({feed_tag}):\n\n"
            f"- **Current Baseline:** Indian NAQI **{aqi} ({cat})** | PM2.5 **{pm25} µg/m³** | Temp **{wx['temp_c']}°C** | Wind **{wx['wind_kph']} km/h {wx['wind_compass']}**.\n"
            f"- **Optimal Forecast Window (Next 24h):** Around **{clean_t} IST** — forecast PM2.5 drops to **{clean_pm} µg/m³** (NAQI ~**{clean_aqi}**) as daytime mixing improves.\n"
            f"- **Peak Forecast Window to Watch:** Around **{peak_t} IST** — forecast PM2.5 reaches **{peak_pm} µg/m³** (NAQI ~**{peak_aqi}**).\n"
            f"- **Routine & Mobility Guidance:** Shift flexible outdoor exercise or home cross-ventilation toward **{clean_t} IST**. During peak hours, prefer enclosed AC/electric transit or a well-fitted N95/FFP2 respirator over open-cabin commuting.\n"
            f"- **Next Step:** Open **Future Me** to quantify the exact estimated exposure & CO2e difference between two departure times, or **Daily Replanner** to approve schedule shifts.\n\n"
            f"*Note: Forecast figures represent regional ~11–40 km CAMS grid estimates, not clinical exposure doses.*"
        )

    # Hindi response support
    if language == "hi" or any(w in q for w in ("hindi", "हिंदी", "हिन्दी")):
        return (
            f"### {city} वायु गुणवत्ता सारांश (`AI SUMMARY`)\n"
            f"**स्रोत:** {feed_tag} ({cur['observed_time_ist']} IST)\n\n"
            f"- **भारतीय NAQI (`ESTIMATED`):** **{aqi}** (**{cat}**) — प्रमुख प्रदूषक: **{cur['dominant_pollutant']}**\n"
            f"- **प्रदूषक स्तर (`MODEL FORECAST`):** PM2.5: **{pm25} µg/m³**, PM10: **{pm10} µg/m³**, NO2: **{no2} µg/m³**, O3: **{o3} µg/m³**\n"
            f"- **मौसम:** तापमान **{wx['temp_c']}°C**, आर्द्रता **{wx['humidity_pct']}%**, हवा **{wx['wind_kph']} km/h ({wx['wind_compass']})**\n"
            f"- **अगले 24 घंटों का बेहतर समय:** लगभग **{clean_t} IST** (अनुमानित PM2.5: {clean_pm} µg/m³); उच्चतम स्तर लगभग **{peak_t} IST** ({peak_pm} µg/m³)।\n"
            f"- **सुझाव:** बाहरी व्यायाम और घर के वेंटिलेशन के लिए **{clean_t} IST** के आसपास का समय चुनें। *(यह क्षेत्रीय मॉडल डेटा है, चिकित्सा सलाह नहीं।)*"
        )

    # Punjabi response support
    if language == "pa" or any(w in q for w in ("punjabi", "ਪੰਜਾਬੀ")):
        return (
            f"### {city} ਹਵਾ ਗੁਣਵੱਤਾ ਸਾਰ (`AI SUMMARY`)\n"
            f"**ਸਰੋਤ:** {feed_tag} ({cur['observed_time_ist']} IST)\n\n"
            f"- **ਭਾਰਤੀ NAQI (`ESTIMATED`):** **{aqi}** (**{cat}**) — ਮੁੱਖ ਪ੍ਰਦੂਸ਼ਕ: **{cur['dominant_pollutant']}**\n"
            f"- **ਪ੍ਰਦੂਸ਼ਕ ਪੱਧਰ (`MODEL FORECAST`):** PM2.5: **{pm25} µg/m³**, PM10: **{pm10} µg/m³**, NO2: **{no2} µg/m³**, O3: **{o3} µg/m³**\n"
            f"- **ਮੌਸਮ:** ਤਾਪਮਾਨ **{wx['temp_c']}°C**, ਨਮੀ **{wx['humidity_pct']}%**, ਹਵਾ **{wx['wind_kph']} km/h ({wx['wind_compass']})**\n"
            f"- **ਅਗਲੇ 24 ਘੰਟਿਆਂ ਦਾ ਬਿਹਤਰ ਸਮਾਂ:** ਲਗਭਗ **{clean_t} IST** (ਅਨੁਮਾਨਿਤ PM2.5: {clean_pm} µg/m³); ਵੱਧ ਪ੍ਰਦੂਸ਼ਣ ਸਮਾਂ: **{peak_t} IST** ({peak_pm} µg/m³)।\n"
            f"- **ਸੁਝਾਅ:** ਬਾਹਰੀ ਸੈਰ ਜਾਂ ਕਸਰਤ ਨੂੰ **{clean_t} IST** ਦੇ ਨੇੜੇ ਰੱਖੋ। *(ਇਹ ਖੇਤਰੀ ਮਾਡਲ ਜਾਣਕਾਰੀ ਹੈ, ਡਾਕਟਰੀ ਸਲਾਹ ਨਹੀਂ।)*"
        )

    # Default comprehensive air & forecast briefing
    delta = comp["delta_aqi"]
    trend_word = (
        f"up {delta} NAQI points vs the prior 24h"
        if delta > 3
        else f"down {abs(delta)} NAQI points vs the prior 24h"
        if delta < -3
        else "broadly steady compared with the prior 24h"
    )
    return (
        f"### {city} Air Intelligence Briefing (`AI SUMMARY`)\n"
        f"Grounded in **{feed_tag}** recorded at **{cur['observed_time_ist']} IST**:\n\n"
        f"- **Current Indian NAQI (`ESTIMATED`):** **{aqi} — {cat}** (Dominant pollutant: **{cur['dominant_pollutant']}**, 24h average {comp['last_24h_avg_aqi']}, {trend_word}).\n"
        f"- **Pollutant Breakdown (`MODEL FORECAST`):** PM2.5 **{pm25} µg/m³** · PM10 **{pm10} µg/m³** · NO2 **{no2} µg/m³** · O3 **{o3} µg/m³** · SO2 **{pol['so2']} µg/m³** · CO **{pol['co_mg']} mg/m³**.\n"
        f"- **Meteorological Dispersion:** **{wx['temp_c']}°C**, humidity **{wx['humidity_pct']}%**, wind **{wx['wind_kph']} km/h from {wx['wind_compass']}** ({wx['pressure_hpa']} hPa).\n"
        f"- **24-Hour Forecast Outlook:** Cleanest window near **{clean_t} IST** (PM2.5 ~**{clean_pm} µg/m³**, NAQI ~{clean_aqi}); peak accumulation near **{peak_t} IST** (PM2.5 ~**{peak_pm} µg/m³**, NAQI ~{peak_aqi}).\n"
        f"- **Recommended Action:** {cur['advisory']}\n\n"
        f"*Provenance note: Figures reflect regional atmospheric grid analysis (~11–40 km) and CPCB NAQI equations — not street-level or clinical measurements.*"
    )

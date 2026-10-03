from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
PROVIDER_NAME = "Open-Meteo"


async def fetch_current_conditions(stations: list[dict[str, Any]]) -> dict[str, Any]:
    params = {
        "latitude": ",".join(str(station["lat"]) for station in stations),
        "longitude": ",".join(str(station["lon"]) for station in stations),
        "current": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation",
        "wind_speed_unit": "kmh",
        "timezone": "UTC",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    locations = payload if isinstance(payload, list) else [payload]
    if len(locations) != len(stations):
        raise ValueError(
            f"Open-Meteo returned {len(locations)} locations for {len(stations)} requested stations."
        )

    conditions: list[dict[str, Any]] = []
    for station, location in zip(stations, locations, strict=True):
        current = location.get("current")
        if not isinstance(current, dict) or not current.get("time"):
            raise ValueError(f"Open-Meteo did not return current conditions for {station['id']}.")
        conditions.append({
            "station_id": station["id"],
            "station_name": station["name"],
            "district": station["district"],
            "state": station["state"],
            "latitude": station["lat"],
            "longitude": station["lon"],
            "observed_at": _utc_timestamp(current["time"]),
            "temperature_c": current.get("temperature_2m"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "pressure_hpa": current.get("surface_pressure"),
            "wind_kmh": current.get("wind_speed_10m"),
            "precipitation_mm": current.get("precipitation"),
            "source": PROVIDER_NAME,
        })

    return {
        "provider": PROVIDER_NAME,
        "data_kind": "gridded weather model estimate; not an AWS sensor observation",
        "disclaimer": (
            "These are Open-Meteo weather-model conditions for the station coordinates. "
            "They are not measurements transmitted by the listed AWS stations and are not "
            "used as sensor-health or station-trust evidence."
        ),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "stations": conditions,
    }


def _utc_timestamp(value: str) -> str:
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc).isoformat()

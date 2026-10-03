from __future__ import annotations

import asyncio
import csv
import io
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .config import get_settings
from .database import (
    count_alert_records,
    count_alerts_by_status,
    get_alert_statuses,
    get_app_settings,
    get_runtime_value,
    has_saved_app_settings,
    initialize_database,
    count_raw_observations,
    list_alert_records,
    list_analysis_results,
    list_raw_observations,
    persist_provider_observations,
    persist_dashboard,
    save_app_settings,
    save_runtime_value,
    update_alert_status,
)
initialize_database()
from .engine import (
    ANALYSIS_SETTINGS,
    SCENARIO_ALIASES,
    STATION_BLUEPRINTS,
    build_demo_dashboard,
    retrain_demo_models,
    update_analysis_settings,
)
from .open_meteo import fetch_current_conditions

logger = logging.getLogger("skyguard")
settings = get_settings()
CURRENT_SCENARIO = "normal-weather"
SCENARIO_RUN_ID = "initial"
MONITORING: dict[str, Any] = {
    "running": False,
    "paused": False,
    "update_interval_seconds": 60,
    "last_run_at": None,
    "mode": "simulated",
}
monitor_task: asyncio.Task[None] | None = None
PERSISTED_SCENARIOS: set[str] = set()

DEFAULT_SETTINGS: dict[str, Any] = {
    **ANALYSIS_SETTINGS,
    "temperature_min_c": -60.0,
    "temperature_max_c": 60.0,
    "pressure_min_hpa": 850.0,
    "pressure_max_hpa": 1100.0,
    "humidity_min_pct": 0.0,
    "humidity_max_pct": 100.0,
    "max_reporting_delay_minutes": 20,
    "history_window_hours": 3,
    "frozen_window_readings": 12,
    "trust_weight_validation": 20,
    "trust_weight_temporal": 25,
    "trust_weight_spatial": 25,
    "trust_weight_multivariate": 15,
    "trust_weight_ml": 15,
    "monitoring_interval_seconds": 60,
    "isolation_forest_contamination": 0.025,
}


class ScenarioRequest(BaseModel):
    station_id: str | None = Field(default=None, description="Optional station to highlight in the scenario result.")
    scenario: str = Field(default="normal-weather", description="One of the supported demo scenarios.")


class SettingsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    temperature_min_c: float = Field(default=-60, ge=-100, le=0)
    temperature_max_c: float = Field(default=60, ge=1, le=100)
    pressure_min_hpa: float = Field(default=850, ge=300, le=1100)
    pressure_max_hpa: float = Field(default=1100, ge=800, le=1300)
    humidity_min_pct: float = Field(default=0, ge=0, le=100)
    humidity_max_pct: float = Field(default=100, ge=0, le=100)
    nearby_radius_km: float = Field(default=350, gt=0, le=2000)
    minimum_nearby_stations: int = Field(default=2, ge=0, le=20)
    max_reporting_delay_minutes: int = Field(default=20, ge=1, le=1440)
    history_window_hours: int = Field(default=3, ge=1, le=168)
    frozen_window_readings: int = Field(default=12, ge=3, le=288)
    trust_weight_validation: int = Field(default=20, ge=0, le=100)
    trust_weight_temporal: int = Field(default=25, ge=0, le=100)
    trust_weight_spatial: int = Field(default=25, ge=0, le=100)
    trust_weight_multivariate: int = Field(default=15, ge=0, le=100)
    trust_weight_ml: int = Field(default=15, ge=0, le=100)
    health_weight_anomaly: int = Field(default=30, ge=0, le=100)
    health_weight_quality: int = Field(default=25, ge=0, le=100)
    health_weight_frozen: int = Field(default=25, ge=0, le=100)
    health_weight_drift: int = Field(default=20, ge=0, le=100)
    severity_critical_anomaly_threshold: int = Field(default=82, ge=40, le=100)
    severity_critical_health_threshold: int = Field(default=45, ge=0, le=75)
    severity_degradation_anomaly_threshold: int = Field(default=72, ge=40, le=100)
    severity_weather_event_anomaly_threshold: int = Field(default=68, ge=40, le=100)
    severity_review_anomaly_threshold: int = Field(default=60, ge=40, le=100)
    monitoring_interval_seconds: int = Field(default=60, ge=10, le=3600)
    isolation_forest_contamination: float = Field(default=0.025, gt=0.001, le=0.2)

    @model_validator(mode="after")
    def validate_related_bounds(self) -> SettingsPayload:
        if self.temperature_min_c >= self.temperature_max_c:
            raise ValueError("temperature_min_c must be lower than temperature_max_c")
        if self.pressure_min_hpa >= self.pressure_max_hpa:
            raise ValueError("pressure_min_hpa must be lower than pressure_max_hpa")
        if self.humidity_min_pct >= self.humidity_max_pct:
            raise ValueError("humidity_min_pct must be lower than humidity_max_pct")
        weight_total = sum((
            self.trust_weight_validation,
            self.trust_weight_temporal,
            self.trust_weight_spatial,
            self.trust_weight_multivariate,
            self.trust_weight_ml,
        ))
        if weight_total != 100:
            raise ValueError("TrustFusion weights must total 100")
        health_weight_total = sum((
            self.health_weight_anomaly,
            self.health_weight_quality,
            self.health_weight_frozen,
            self.health_weight_drift,
        ))
        if health_weight_total != 100:
            raise ValueError("Sensor Health weights must total 100")
        if not (
            self.severity_critical_anomaly_threshold
            > self.severity_degradation_anomaly_threshold
            > self.severity_weather_event_anomaly_threshold
            > self.severity_review_anomaly_threshold
        ):
            raise ValueError("Severity thresholds must descend from critical to review.")
        return self


SCENARIO_DESCRIPTIONS = [
    {"id": "normal-weather", "name": "Normal Weather", "target_station": None, "description": "A stable baseline with ordinary local variation."},
    {"id": "faulty-sensor", "name": "Faulty Sensor", "target_station": "AWS-004", "description": "AWS-004 reports 85°C while nearby stations remain near their baseline."},
    {"id": "genuine-heatwave", "name": "Genuine Heatwave", "target_station": "AWS-001", "description": "Four nearby stations rise together to around 42–43°C."},
    {"id": "frozen-sensor", "name": "Frozen Sensor", "target_station": "AWS-008", "description": "Recent readings repeat exactly, which may indicate a stuck sensor."},
    {"id": "missing-data", "name": "Missing Data", "target_station": "AWS-010", "description": "The latest observations are missing for one station."},
    {"id": "gradual-degradation", "name": "Gradual Sensor Degradation", "target_station": "AWS-009", "description": "Measurements drift gradually as signal quality weakens."},
]


def _scenario_name(value: str) -> str:
    scenario = SCENARIO_ALIASES.get(value.strip().lower())
    if scenario is None:
        raise HTTPException(status_code=400, detail=f"Unsupported scenario: {value}")
    return scenario


def _with_scenario_run_id(result: dict[str, Any]) -> dict[str, Any]:
    result["scenario_run_id"] = SCENARIO_RUN_ID
    for alert in result["alerts"]:
        alert["id"] = f"{alert['id']}-{SCENARIO_RUN_ID}"
    return result


def _dashboard() -> dict[str, Any]:
    if CURRENT_SCENARIO not in PERSISTED_SCENARIOS:
        persist_dashboard(_with_scenario_run_id(build_demo_dashboard(CURRENT_SCENARIO)))
        PERSISTED_SCENARIOS.add(CURRENT_SCENARIO)
    result = _with_scenario_run_id(build_demo_dashboard(CURRENT_SCENARIO))
    statuses = get_alert_statuses(CURRENT_SCENARIO)
    for alert in result["alerts"]:
        status = statuses.get(alert["id"], {})
        alert.update(status)
        alert.setdefault("status", "active")
    unresolved = [alert for alert in result["alerts"] if alert["status"] != "resolved"]
    result["summary"]["alerts"] = len(unresolved)
    result["summary"]["critical"] = sum(alert["severity"] == "critical" for alert in unresolved)
    result["scenario"] = CURRENT_SCENARIO
    result["monitoring"] = dict(MONITORING)
    return result


async def _monitor_loop() -> None:
    global CURRENT_SCENARIO
    while MONITORING["running"]:
        await asyncio.sleep(MONITORING["update_interval_seconds"])
        if not MONITORING["running"]:
            break
        if MONITORING["paused"]:
            continue
        try:
            latest = _with_scenario_run_id(build_demo_dashboard(CURRENT_SCENARIO))
            persist_dashboard(latest)
            MONITORING["last_run_at"] = datetime.now(timezone.utc).isoformat()
            save_runtime_value("monitoring", MONITORING)
            logger.info("Stored simulated monitoring batch for scenario %s", CURRENT_SCENARIO)
        except Exception:
            logger.exception("Simulated monitoring batch failed")
            MONITORING["paused"] = True
            save_runtime_value("monitoring", MONITORING)
            raise


async def _activate_scenario(name: str) -> dict[str, Any]:
    global CURRENT_SCENARIO, SCENARIO_RUN_ID
    CURRENT_SCENARIO = name
    SCENARIO_RUN_ID = uuid4().hex[:12]
    save_runtime_value("scenario", CURRENT_SCENARIO)
    save_runtime_value("scenario_run_id", SCENARIO_RUN_ID)
    result = _with_scenario_run_id(build_demo_dashboard(CURRENT_SCENARIO))
    persist_dashboard(result)
    PERSISTED_SCENARIOS.add(CURRENT_SCENARIO)
    logger.info("Activated demo scenario %s", CURRENT_SCENARIO)
    return _dashboard()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global CURRENT_SCENARIO, SCENARIO_RUN_ID
    initialize_database()
    CURRENT_SCENARIO = _scenario_name(get_runtime_value("scenario", "normal-weather"))
    SCENARIO_RUN_ID = get_runtime_value("scenario_run_id", "initial")
    saved_settings = get_app_settings(DEFAULT_SETTINGS)
    update_analysis_settings({key: saved_settings[key] for key in ANALYSIS_SETTINGS})
    MONITORING.update(get_runtime_value("monitoring", {}))
    MONITORING["running"] = False
    MONITORING["paused"] = False
    MONITORING["update_interval_seconds"] = saved_settings["monitoring_interval_seconds"]
    save_runtime_value("monitoring", MONITORING)
    persist_dashboard(_with_scenario_run_id(build_demo_dashboard(CURRENT_SCENARIO)))
    PERSISTED_SCENARIOS.add(CURRENT_SCENARIO)
    logger.info("SkyGuard API ready in simulated-data mode")
    try:
        yield
    finally:
        if monitor_task and not monitor_task.done():
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="SkyGuard AI API",
    version="1.1.0",
    description="TrustFusion prototype for simulated weather-station anomaly analysis.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "skyguard-ai", "mode": "simulated", "app_env": settings.app_env}


@app.get("/api/system/status")
@app.get("/api/v1/system/status")
async def system_status() -> dict[str, Any]:
    return {"demo_mode": True, "scenario": CURRENT_SCENARIO, "monitoring": dict(MONITORING), "station_count": len(STATION_BLUEPRINTS)}


@app.get("/api/v1/dashboard")
@app.get("/api/dashboard/summary")
async def get_dashboard() -> dict[str, Any]:
    return _dashboard()


@app.post("/api/providers/open-meteo/current")
async def get_open_meteo_current() -> dict[str, Any]:
    try:
        result = await fetch_current_conditions(STATION_BLUEPRINTS)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Open-Meteo current conditions request failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve current weather conditions from Open-Meteo. Please try again later.",
        ) from exc
    persist_provider_observations(result["stations"])
    return result


@app.get("/api/dashboard/map")
async def get_dashboard_map() -> dict[str, Any]:
    data = _dashboard()
    return {"stations": [{key: station[key] for key in ("id", "name", "state", "district", "lat", "lon", "status", "trust_score", "sensor_health_score", "metrics", "classification")} for station in data["stations"]]}


@app.get("/api/dashboard/activity")
async def get_dashboard_activity() -> dict[str, Any]:
    data = _dashboard()
    return {"alerts": data["alerts"][:8], "generated_at": data["generated_at"]}


@app.get("/api/v1/stations")
@app.get("/api/stations")
async def get_stations() -> dict[str, Any]:
    data = _dashboard()
    return {"stations": data["stations"], "count": len(data["stations"]), "scenario": CURRENT_SCENARIO}


@app.get("/api/v1/stations/{station_id}")
@app.get("/api/stations/{station_id}")
async def get_station(station_id: str) -> dict[str, Any]:
    station = next((item for item in _dashboard()["stations"] if item["id"].lower() == station_id.lower()), None)
    if station is None:
        raise HTTPException(status_code=404, detail=f"No station was found with ID {station_id}.")
    return station


@app.get("/api/stations/{station_id}/history")
@app.get("/api/v1/stations/{station_id}/history")
async def get_station_history(station_id: str, hours: int = Query(default=24, ge=1, le=168)) -> dict[str, Any]:
    station = await get_station(station_id)
    return {"station_id": station["id"], "observations": station["history"][-min(hours * 12, len(station["history"])):]}


@app.get("/api/stations/{station_id}/health")
async def get_station_health(station_id: str, hours: int = Query(default=24, ge=1, le=168)) -> dict[str, Any]:
    station = await get_station(station_id)
    history = list_analysis_results(CURRENT_SCENARIO, hours=hours, station_id=station["id"], run_id=SCENARIO_RUN_ID)
    return {
        "station_id": station["id"],
        "score": station["sensor_health_score"],
        "status": "Needs inspection" if station["sensor_health_score"] < 50 else "Watch" if station["sensor_health_score"] < 75 else "Good",
        "recommendation": station["recommendation"],
        "history": [{
            "timestamp": row["created_at"],
            "score": row["sensor_health_score"],
            "trust_score": row["trust_score"],
            "anomaly_status": row["anomaly_status"],
        } for row in history],
        "history_hours": hours,
    }


@app.get("/api/stations/{station_id}/nearby")
async def get_nearby_stations(station_id: str) -> dict[str, Any]:
    station = await get_station(station_id)
    dashboard = _dashboard()
    return {"station_id": station["id"], "nearby": [
        {"id": item["id"], "name": item["name"], "distance_km": round(_distance_km(station["lat"], station["lon"], item["lat"], item["lon"]), 1), "metrics": item["metrics"], "trust_score": item["trust_score"]}
        for item in dashboard["stations"] if item["id"] != station["id"]
        and _distance_km(station["lat"], station["lon"], item["lat"], item["lon"]) <= DEFAULT_SETTINGS["nearby_radius_km"]
    ]}


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    delta_lat, delta_lon = radians(lat2 - lat1), radians(lon2 - lon1)
    value = sin(delta_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(delta_lon / 2) ** 2
    return 6371 * 2 * asin(sqrt(value))


def _current_observations(
    station_id: str | None,
    limit: int,
    offset: int = 0,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[dict[str, Any]]:
    result = _dashboard()
    stations = {station["id"]: station for station in result["stations"]}
    scenario_key = f"{CURRENT_SCENARIO}:{SCENARIO_RUN_ID}"
    records = list_raw_observations(scenario_key, station_id, limit, offset, start, end)
    for record in records:
        station = stations.get(record["station_id"])
        is_latest = bool(station and record["id"].endswith(station["last_updated"]))
        record["validation_status"] = station["analysis"]["validation"]["status"] if is_latest and station else "Historical — not scored individually"
        record["issue_status"] = station["classification"] if is_latest and station else "Historical observation"
        record["trust_score"] = station["trust_score"] if is_latest and station else None
        record["sensor_health_score"] = station["sensor_health_score"] if is_latest and station else None
    return records


@app.get("/api/v1/alerts")
@app.get("/api/alerts")
async def get_alerts(
    status: str | None = None,
    severity: str | None = None,
    station_id: str | None = None,
    scenario: str | None = None,
    include_history: bool = False,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    selected_scenario = None if include_history else (scenario or CURRENT_SCENARIO)
    records = list_alert_records(
        selected_scenario,
        limit=limit,
        offset=offset,
        status=status,
        severity=severity,
        station_id=station_id,
    )
    names = {station["id"]: station["name"] for station in build_demo_dashboard("normal-weather")["stations"]}
    alerts = []
    for alert in records:
        alert["station_name"] = names.get(alert["station_id"], alert["station_id"])
        alerts.append(alert)
    return {
        "alerts": alerts,
        "count": len(alerts),
        "total_count": count_alert_records(selected_scenario, status, severity, station_id),
        "limit": limit,
        "offset": offset,
        "status_counts": count_alerts_by_status(selected_scenario),
    }


@app.get("/api/alerts/{alert_id}")
async def get_alert(alert_id: str) -> dict[str, Any]:
    records = list_alert_records()
    alert = next((record for record in records if record["id"] == alert_id), None)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return alert


@app.post("/api/v1/alerts/{alert_id}/acknowledge")
@app.post("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str) -> dict[str, Any]:
    status = update_alert_status(alert_id, "acknowledged")
    if status is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return {"id": alert_id, **status}


@app.post("/api/v1/alerts/{alert_id}/resolve")
@app.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str) -> dict[str, Any]:
    status = update_alert_status(alert_id, "resolved")
    if status is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return {"id": alert_id, **status}


@app.get("/api/scenarios")
async def list_scenarios() -> dict[str, Any]:
    return {"scenarios": SCENARIO_DESCRIPTIONS, "active": CURRENT_SCENARIO}


@app.get("/api/scenarios/status")
async def scenario_status() -> dict[str, Any]:
    return {"scenario": CURRENT_SCENARIO, "description": next((item["description"] for item in SCENARIO_DESCRIPTIONS if item["id"] == CURRENT_SCENARIO), "")}


@app.post("/api/v1/simulate")
async def simulate(request: ScenarioRequest) -> dict[str, Any]:
    name = _scenario_name(request.scenario)
    if request.station_id and not any(item["id"].lower() == request.station_id.lower() for item in STATION_BLUEPRINTS):
        raise HTTPException(status_code=404, detail=f"No station was found with ID {request.station_id}.")
    dashboard = await _activate_scenario(name)
    selected = next((station for station in dashboard["stations"] if request.station_id and station["id"].lower() == request.station_id.lower()), None)
    return {"scenario": name, "station": selected, "dashboard": dashboard, "generated_at": dashboard["generated_at"]}


@app.post("/api/scenarios/{scenario_name}/run")
async def run_scenario(scenario_name: str) -> dict[str, Any]:
    return await _activate_scenario(_scenario_name(scenario_name))


@app.post("/api/scenarios/normal")
@app.post("/api/scenarios/reset")
async def reset_scenario() -> dict[str, Any]:
    result = await _activate_scenario("normal-weather")
    return {"message": "Demo returned to normal weather. Previous scenario records and alerts remain in history.", **result}


@app.get("/api/anomalies")
async def get_anomalies(station_id: str | None = None, severity: str | None = None, issue_type: str | None = None) -> dict[str, Any]:
    data = _dashboard()
    alert_status_by_station = {
        alert["station_id"]: alert["status"]
        for alert in list_alert_records(CURRENT_SCENARIO)
        if alert["id"].endswith(SCENARIO_RUN_ID)
    }
    items = []
    for station in data["stations"]:
        if station["classification"] == "normal":
            continue
        issue = {
            "id": f"analysis-{CURRENT_SCENARIO}-{station['id']}",
            "timestamp": station["last_updated"],
            "station_id": station["id"],
            "station_name": station["name"],
            "parameter": "temperature" if station["metrics"]["temperature_c"] is not None else "observation",
            "observed_value": station["metrics"]["temperature_c"],
            "nearby_median": station["analysis"]["spatial"]["median_temperature_c"],
            "type": station["classification"],
            "severity": station["severity"],
            "trust_score": station["trust_score"],
            "sensor_health_score": station["sensor_health_score"],
            "status": alert_status_by_station.get(station["id"], "active"),
            "explanation": station["data_quality"]["explanation"],
            "recommendation": station["recommendation"],
            "evidence": station["analysis"],
        }
        if station_id and station["id"] != station_id:
            continue
        if severity and station["severity"] != severity:
            continue
        if issue_type and station["classification"] != issue_type:
            continue
        items.append(issue)
    return {"anomalies": items, "count": len(items), "scenario": CURRENT_SCENARIO}


@app.get("/api/anomalies/{anomaly_id}")
async def get_anomaly(anomaly_id: str) -> dict[str, Any]:
    result = await get_anomalies()
    anomaly = next((item for item in result["anomalies"] if item["id"] == anomaly_id), None)
    if anomaly is None:
        raise HTTPException(status_code=404, detail=f"No current issue was found with ID {anomaly_id}.")
    return anomaly


@app.get("/api/analytics")
async def get_analytics(hours: int = Query(default=24, ge=1, le=168)) -> dict[str, Any]:
    data = _dashboard()
    history = list_analysis_results(CURRENT_SCENARIO, hours=hours, run_id=SCENARIO_RUN_ID)
    classifications: dict[str, int] = {}
    for station in data["stations"]:
        kind = station["classification"]
        classifications[kind] = classifications.get(kind, 0) + 1
    anomaly_by_station: dict[str, dict[str, Any]] = {}
    anomaly_types: dict[str, int] = {}
    trend_buckets: dict[str, dict[str, float]] = {}
    trust_buckets = [
        {"range": "0–24", "label": "Very low", "count": 0},
        {"range": "25–49", "label": "Low", "count": 0},
        {"range": "50–74", "label": "Needs review", "count": 0},
        {"range": "75–89", "label": "Generally consistent", "count": 0},
        {"range": "90–100", "label": "High trust", "count": 0},
    ]
    normal_count = 0
    issue_count = 0
    for record in history:
        station_id = record["station_id"]
        station = anomaly_by_station.setdefault(
            station_id,
            {"station_id": station_id, "anomalies": 0, "observations": 0},
        )
        station["observations"] += 1
        is_anomaly = record["anomaly_status"] != "normal"
        if is_anomaly:
            station["anomalies"] += 1
            anomaly_types[record["anomaly_status"]] = anomaly_types.get(record["anomaly_status"], 0) + 1
            issue_count += 1
        else:
            normal_count += 1
        score = record["trust_score"]
        score_bucket = next(
            bucket for bucket in trust_buckets
            if int(bucket["range"].split("–")[0]) <= score <= int(bucket["range"].split("–")[1])
        )
        score_bucket["count"] += 1
        timestamp = datetime.fromisoformat(record["created_at"])
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        timestamp = timestamp.astimezone(timezone.utc)
        bucket_key = timestamp.replace(minute=0, second=0, microsecond=0).isoformat()
        bucket = trend_buckets.setdefault(
            bucket_key,
            {"normal": 0, "anomalies": 0, "health_total": 0, "trust_total": 0, "count": 0},
        )
        bucket["normal"] += int(not is_anomaly)
        bucket["anomalies"] += int(is_anomaly)
        bucket["health_total"] += record["sensor_health_score"]
        bucket["trust_total"] += score
        bucket["count"] += 1
    station_names = {station["id"]: station["name"] for station in data["stations"]}
    for item in anomaly_by_station.values():
        item["name"] = station_names.get(item["station_id"], item["station_id"])
    trend = [
        {
            "time": key,
            "normal": int(value["normal"]),
            "anomalies": int(value["anomalies"]),
            "health": round(value["health_total"] / value["count"], 1),
            "trust": round(value["trust_total"] / value["count"], 1),
        }
        for key, value in sorted(trend_buckets.items())
    ]
    alerts_by_severity = [
        {
            "severity": severity,
            "count": sum(alert["severity"] == severity for alert in data["alerts"]),
        }
        for severity in ("critical", "high", "medium", "low")
    ]
    return {
        "scenario": CURRENT_SCENARIO,
        "hours": hours,
        "observation_count": len(history),
        "normal_count": normal_count,
        "anomaly_count": issue_count,
        "summary": data["summary"],
        "classifications": classifications,
        "anomalies_by_station": list(anomaly_by_station.values()),
        "anomalies_by_type": [{"type": key, "count": value} for key, value in anomaly_types.items()],
        "trust_distribution": trust_buckets,
        "observation_status": [
            {"status": "Normal", "count": normal_count},
            {"status": "Needs review", "count": issue_count},
        ],
        "anomaly_frequency": trend,
        "sensor_health_trend": trend,
        "alerts_by_severity": alerts_by_severity,
        "stations": [{"id": station["id"], "name": station["name"], "trust_score": station["trust_score"], "sensor_health_score": station["sensor_health_score"], "anomaly_score": station["anomaly_score"], "classification": station["classification"]} for station in data["stations"]],
        "trust_trend": [{"station": station["name"], "trust": station["trust_score"], "health": station["sensor_health_score"]} for station in data["stations"]],
        "generated_at": data["generated_at"],
    }


@app.get("/api/v1/observations")
@app.get("/api/observations")
async def get_observations(
    station_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be earlier than or equal to end_date.")
    scenario_key = f"{CURRENT_SCENARIO}:{SCENARIO_RUN_ID}"
    records = _current_observations(station_id, limit, offset, start_date, end_date)
    total_count = count_raw_observations(scenario_key, station_id, start_date, end_date)
    return {
        "observations": records,
        "count": len(records),
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "scenario": CURRENT_SCENARIO,
        "total_stations": len(STATION_BLUEPRINTS),
    }


@app.get("/api/observations/export/csv")
async def export_observations(
    station_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> Response:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be earlier than or equal to end_date.")
    records = _current_observations(station_id, limit=10000, start=start_date, end=end_date)
    buffer = io.StringIO()
    columns = ["timestamp", "station_id", "temperature_c", "pressure_hpa", "humidity_pct", "latitude", "longitude", "source", "validation_status", "issue_status", "trust_score", "sensor_health_score"]
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for record in records:
        writer.writerow({
            **record,
            "validation_status": record["validation_status"],
            "issue_status": record["issue_status"],
            "trust_score": record["trust_score"] if record["trust_score"] is not None else "",
            "sensor_health_score": record["sensor_health_score"] if record["sensor_health_score"] is not None else "",
        })
    return Response(content=buffer.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=skyguard-observations.csv"})


@app.post("/api/monitoring/start")
async def start_monitoring() -> dict[str, Any]:
    global monitor_task
    MONITORING["running"] = True
    MONITORING["paused"] = False
    MONITORING["update_interval_seconds"] = get_app_settings(DEFAULT_SETTINGS)["monitoring_interval_seconds"]
    if monitor_task is None or monitor_task.done():
        monitor_task = asyncio.create_task(_monitor_loop(), name="skyguard-simulated-monitor")
    save_runtime_value("monitoring", MONITORING)
    logger.info("Started simulated monitoring")
    return {"monitoring": dict(MONITORING)}


@app.post("/api/monitoring/pause")
async def pause_monitoring() -> dict[str, Any]:
    MONITORING["paused"] = True
    save_runtime_value("monitoring", MONITORING)
    logger.info("Paused simulated monitoring")
    return {"monitoring": dict(MONITORING)}


@app.post("/api/monitoring/stop")
async def stop_monitoring() -> dict[str, Any]:
    global monitor_task
    MONITORING["running"] = False
    MONITORING["paused"] = False
    if monitor_task and not monitor_task.done():
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass
    monitor_task = None
    save_runtime_value("monitoring", MONITORING)
    logger.info("Stopped simulated monitoring")
    return {"monitoring": dict(MONITORING)}


@app.get("/api/monitoring/status")
async def monitoring_status() -> dict[str, Any]:
    return {"monitoring": dict(MONITORING), "demo_mode": True}


@app.get("/api/settings")
async def get_settings_endpoint() -> dict[str, Any]:
    return {
        "settings": get_app_settings(DEFAULT_SETTINGS),
        "prototype_defaults": DEFAULT_SETTINGS,
        "using_prototype_defaults": not has_saved_app_settings(),
    }


@app.put("/api/settings")
async def put_settings(payload: SettingsPayload) -> dict[str, Any]:
    values = payload.model_dump()
    save_app_settings(values)
    update_analysis_settings({key: values[key] for key in ANALYSIS_SETTINGS})
    MONITORING["update_interval_seconds"] = values["monitoring_interval_seconds"]
    logger.info("Updated prototype analysis settings")
    return {"settings": values, "message": "Prototype settings saved. They affect subsequent analyses."}


@app.get("/api/model/status")
async def model_status() -> dict[str, Any]:
    return {
        "model": "Isolation Forest",
        "status": "ready",
        "random_state": 42,
        "training_window": "simulated normal observations",
        "trained_stations": len(STATION_BLUEPRINTS),
        "calibrated_probability": False,
        "last_retrained_at": get_runtime_value("model_last_retrained_at"),
    }


@app.post("/api/model/retrain")
async def retrain_model() -> dict[str, Any]:
    training = retrain_demo_models()
    retrained_at = datetime.now(timezone.utc).isoformat()
    save_runtime_value("model_last_retrained_at", retrained_at)
    logger.info("Retrained Isolation Forest models for %s simulated stations", training["stations_trained"])
    return {
        "status": "complete",
        "message": "Isolation Forest models retrained against simulated normal station history.",
        "random_state": training["random_state"],
        "stations_trained": training["stations_trained"],
        "training_observations_per_station": training["training_observations_per_station"],
        "last_retrained_at": retrained_at,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

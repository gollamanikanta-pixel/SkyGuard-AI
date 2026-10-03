from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class StationMetrics(BaseModel):
    temperature_c: float
    humidity_pct: float
    pressure_hpa: float
    wind_kmh: float | None = None
    rainfall_mm: float | None = None
    battery_v: float | None = None
    signal_strength: float | None = None


class AlertItem(BaseModel):
    id: str
    station_id: str
    station_name: str
    priority: str
    title: str
    description: str
    severity: str
    confidence: float
    created_at: str
    recommended_action: str


class StationSummary(BaseModel):
    id: str
    name: str
    state: str
    district: str
    lat: float
    lon: float
    mode: str = "demo"
    last_updated: str
    trust_score: int = Field(..., ge=0, le=100)
    sensor_health_score: int = Field(..., ge=0, le=100)
    anomaly_score: float
    classification: str
    severity: str
    confidence: float
    metrics: StationMetrics
    data_quality: dict[str, Any]
    alert_count: int
    status: str


class DashboardResponse(BaseModel):
    summary: dict[str, Any]
    stations: list[StationSummary]
    alerts: list[AlertItem]
    generated_at: str

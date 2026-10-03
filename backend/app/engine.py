from __future__ import annotations

import math
from copy import deepcopy
from functools import lru_cache
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


STATION_BLUEPRINTS = [
    {"id": "AWS-001", "name": "Delhi Central", "state": "Delhi", "district": "New Delhi", "lat": 28.6139, "lon": 77.2090, "base_temp": 33.0, "base_humidity": 46.0, "base_pressure": 1007.5, "base_wind": 18.0, "base_rain": 0.2},
    {"id": "AWS-002", "name": "Noida East", "state": "Uttar Pradesh", "district": "Noida", "lat": 28.5355, "lon": 77.3910, "base_temp": 33.4, "base_humidity": 45.0, "base_pressure": 1007.0, "base_wind": 16.2, "base_rain": 0.1},
    {"id": "AWS-003", "name": "Gurugram South", "state": "Haryana", "district": "Gurugram", "lat": 28.4595, "lon": 77.0266, "base_temp": 32.7, "base_humidity": 47.0, "base_pressure": 1008.0, "base_wind": 17.0, "base_rain": 0.2},
    {"id": "AWS-004", "name": "Jaipur North", "state": "Rajasthan", "district": "Jaipur", "lat": 26.9124, "lon": 75.7873, "base_temp": 35.0, "base_humidity": 31.0, "base_pressure": 1003.5, "base_wind": 20.0, "base_rain": 0.0},
    {"id": "AWS-005", "name": "Mumbai Harbour", "state": "Maharashtra", "district": "Mumbai", "lat": 19.0760, "lon": 72.8777, "base_temp": 30.1, "base_humidity": 71.0, "base_pressure": 1009.4, "base_wind": 16.2, "base_rain": 1.1},
    {"id": "AWS-006", "name": "Kolkata River", "state": "West Bengal", "district": "Kolkata", "lat": 22.5726, "lon": 88.3639, "base_temp": 31.5, "base_humidity": 69.0, "base_pressure": 1006.8, "base_wind": 20.2, "base_rain": 0.8},
    {"id": "AWS-007", "name": "Chennai South", "state": "Tamil Nadu", "district": "Chennai", "lat": 13.0827, "lon": 80.2707, "base_temp": 34.1, "base_humidity": 57.5, "base_pressure": 1005.9, "base_wind": 22.8, "base_rain": 0.4},
    {"id": "AWS-008", "name": "Bengaluru Urban", "state": "Karnataka", "district": "Bengaluru", "lat": 12.9716, "lon": 77.5946, "base_temp": 27.6, "base_humidity": 53.2, "base_pressure": 1010.8, "base_wind": 12.7, "base_rain": 0.6},
    {"id": "AWS-009", "name": "Hyderabad West", "state": "Telangana", "district": "Hyderabad", "lat": 17.3850, "lon": 78.4867, "base_temp": 31.2, "base_humidity": 51.0, "base_pressure": 1008.7, "base_wind": 15.0, "base_rain": 0.5},
    {"id": "AWS-010", "name": "Guwahati East", "state": "Assam", "district": "Guwahati", "lat": 26.1445, "lon": 91.7362, "base_temp": 29.8, "base_humidity": 76.0, "base_pressure": 1005.0, "base_wind": 14.0, "base_rain": 2.2},
    {"id": "AWS-011", "name": "Kochi Coast", "state": "Kerala", "district": "Kochi", "lat": 9.9312, "lon": 76.2673, "base_temp": 29.4, "base_humidity": 84.0, "base_pressure": 1009.0, "base_wind": 14.5, "base_rain": 1.4},
    {"id": "AWS-012", "name": "Srinagar Valley", "state": "Jammu and Kashmir", "district": "Srinagar", "lat": 34.0837, "lon": 74.7973, "base_temp": 24.3, "base_humidity": 43.0, "base_pressure": 1014.0, "base_wind": 10.5, "base_rain": 0.3},
]

SCENARIO_TARGETS = {
    "faulty-sensor": "AWS-004",
    "frozen-sensor": "AWS-008",
    "missing-data": "AWS-010",
    "gradual-degradation": "AWS-009",
}
SCENARIO_ALIASES = {
    "stable": "normal-weather",
    "normal": "normal-weather",
    "normal-weather": "normal-weather",
    "sensor-fault": "faulty-sensor",
    "faulty-sensor": "faulty-sensor",
    "heatwave": "genuine-heatwave",
    "genuine-heatwave": "genuine-heatwave",
    "frozen-sensor": "frozen-sensor",
    "data-quality": "missing-data",
    "missing-data": "missing-data",
    "sensor-degradation": "gradual-degradation",
    "gradual-degradation": "gradual-degradation",
    "cyclone": "cyclone",
    "manual-review": "manual-review",
}
ANALYSIS_SETTINGS = {
    "temperature_min_c": -60.0,
    "temperature_max_c": 60.0,
    "pressure_min_hpa": 850.0,
    "pressure_max_hpa": 1100.0,
    "humidity_min_pct": 0.0,
    "humidity_max_pct": 100.0,
    "nearby_radius_km": 350.0,
    "minimum_nearby_stations": 2,
    "history_window_hours": 3,
    "frozen_window_readings": 12,
    "max_reporting_delay_minutes": 20,
    "isolation_forest_contamination": 0.025,
    "trust_weight_validation": 20,
    "trust_weight_temporal": 25,
    "trust_weight_spatial": 25,
    "trust_weight_multivariate": 15,
    "trust_weight_ml": 15,
    "health_weight_anomaly": 30,
    "health_weight_quality": 25,
    "health_weight_frozen": 25,
    "health_weight_drift": 20,
    "severity_critical_anomaly_threshold": 82,
    "severity_critical_health_threshold": 45,
    "severity_degradation_anomaly_threshold": 72,
    "severity_weather_event_anomaly_threshold": 68,
    "severity_review_anomaly_threshold": 60,
}
MODEL_ARTIFACTS: dict[str, tuple[StandardScaler, IsolationForest]] = {}


def update_analysis_settings(values: dict[str, float | int]) -> None:
    ANALYSIS_SETTINGS.update(values)
    _build_demo_dashboard_cached.cache_clear()


def _safe_round(value: float | None, digits: int = 2) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits)


def _calc_station_data(station: dict, scenario: str = "normal-weather") -> list[dict]:
    now = datetime.now(timezone.utc)
    end = now.replace(minute=now.minute - now.minute % 5, second=0, microsecond=0)
    start = end - timedelta(hours=24) + timedelta(minutes=5)
    timestamps = pd.date_range(start=start, periods=288, freq="5min")
    records: list[dict] = []
    station_index = int(station["id"][-3:])
    target_id = SCENARIO_TARGETS.get(scenario)

    for idx, ts in enumerate(timestamps):
        phase = (idx / 288.0) * 2 * math.pi
        temp = station["base_temp"] + 3.2 * math.sin(phase - 1.0) + 0.45 * math.sin(idx / 4.0 + station_index)
        humidity = station["base_humidity"] + 8.0 * math.sin(phase + 1.8) + 1.5 * math.cos(idx / 8.0 + station_index)
        pressure = station["base_pressure"] + 2.0 * math.sin(phase + station_index / 3.0) + 0.25 * math.sin(idx / 7.0)
        wind = station["base_wind"] + 4.5 * math.sin(phase + 0.8)
        rainfall = max(0.0, station["base_rain"] + 0.5 * abs(math.sin((idx + 3) / 3.2)))
        battery = 12.5 + 0.15 * math.sin(idx / 35.0 + station_index)
        signal = 86 + 4 * math.cos(idx / 29.0 + station_index)

        if scenario == "genuine-heatwave" and station["id"] in {"AWS-001", "AWS-002", "AWS-003", "AWS-004"} and idx >= 276:
            temp = 42.2 + station_index * 0.12 + 0.15 * math.sin(idx)
            humidity -= 12
        elif scenario == "faulty-sensor" and station["id"] == target_id and idx == 287:
            temp = 85.0
        elif scenario == "frozen-sensor" and station["id"] == target_id and idx >= 276:
            temp = 31.4
        elif scenario == "missing-data" and station["id"] == target_id and idx >= 284:
            temp = humidity = pressure = None
        elif scenario == "gradual-degradation" and station["id"] == target_id and idx >= 216:
            drift = (idx - 216) / 71.0
            temp += drift * 6.0
            pressure += drift * 5.0
            battery -= drift * 1.2
            signal -= drift * 20.0
        elif scenario == "cyclone" and station["id"] in {"AWS-005", "AWS-007", "AWS-009", "AWS-011"} and idx >= 276:
            pressure -= 16
            wind += 28
            rainfall += 8
        elif scenario == "manual-review" and station["id"] == target_id and idx >= 276:
            temp += 8
            humidity += 10
            pressure -= 5

        record = {
            "timestamp": ts.isoformat(),
            "temperature_c": round(float(temp), 2) if temp is not None else None,
            "humidity_pct": round(float(humidity), 2) if humidity is not None else None,
            "pressure_hpa": round(float(pressure), 2) if pressure is not None else None,
            "wind_kmh": round(float(wind), 2),
            "rainfall_mm": round(float(rainfall), 2),
            "battery_v": round(float(battery), 2),
            "signal_strength": round(float(signal), 2),
            "quality_score": 96.0,
            "source": "simulated",
        }
        if scenario == "frozen-sensor" and station["id"] == target_id and idx >= 276:
            record["humidity_pct"] = round(float(station["base_humidity"]), 2)
            record["pressure_hpa"] = round(float(station["base_pressure"]), 2)
        records.append(record)

    return records


def _feature_matrix(records: list[dict]) -> np.ndarray:
    frame = pd.DataFrame(records)[["temperature_c", "humidity_pct", "pressure_hpa"]].astype(float)
    frame = frame.replace([np.inf, -np.inf], np.nan).ffill().bfill()
    frame["temperature_change"] = frame["temperature_c"].diff().fillna(0)
    frame["pressure_change"] = frame["pressure_hpa"].diff().fillna(0)
    frame["humidity_change"] = frame["humidity_pct"].diff().fillna(0)
    return frame.to_numpy(dtype=float)


def _train_station_model(station: dict) -> tuple[StandardScaler, IsolationForest]:
    baseline_records = _calc_station_data(station, "normal-weather")
    baseline_features = _feature_matrix(baseline_records)
    scaler = StandardScaler()
    training_values = scaler.fit_transform(baseline_features)
    model = IsolationForest(
        contamination=ANALYSIS_SETTINGS["isolation_forest_contamination"],
        random_state=42,
        n_estimators=100,
    )
    model.fit(training_values[:-1])
    MODEL_ARTIFACTS[station["id"]] = (scaler, model)
    return scaler, model


def retrain_demo_models() -> dict[str, int]:
    MODEL_ARTIFACTS.clear()
    for station in STATION_BLUEPRINTS:
        _train_station_model(station)
    return {"stations_trained": len(MODEL_ARTIFACTS), "training_observations_per_station": 287, "random_state": 42}


def _mad(values: np.ndarray) -> float:
    med = np.median(values)
    mad = np.median(np.abs(values - med))
    return float(max(mad, 1.0))


def _classify_from_scores(trust: float, anomaly: float, health: float, quality_issues: int) -> tuple[str, str, float, str]:
    if trust < 45 or quality_issues >= 3:
        classification = "data_quality_issue"
        severity = "high"
        confidence = 0.86
        explanation = "Multiple quality checks failed or the station is producing stale or inconsistent reads."
    elif anomaly > ANALYSIS_SETTINGS["severity_critical_anomaly_threshold"] and health < ANALYSIS_SETTINGS["severity_critical_health_threshold"]:
        classification = "sensor_fault"
        severity = "critical"
        confidence = 0.9
        explanation = "Repeated abnormal values align with a local sensor failure pattern."
    elif anomaly > ANALYSIS_SETTINGS["severity_degradation_anomaly_threshold"] and health < 58:
        classification = "sensor_degradation"
        severity = "medium"
        confidence = 0.74
        explanation = "The sensor drifted over time but the event may still be meteorological."
    elif anomaly > ANALYSIS_SETTINGS["severity_weather_event_anomaly_threshold"] and trust > 60:
        classification = "weather_event"
        severity = "medium"
        confidence = 0.83
        explanation = "The anomaly is consistent with a real weather phase and spatial context."
    elif anomaly > ANALYSIS_SETTINGS["severity_review_anomaly_threshold"]:
        classification = "manual_review"
        severity = "medium"
        confidence = 0.7
        explanation = "The observation is plausible but ambiguous and needs human verification."
    else:
        classification = "normal"
        severity = "low"
        confidence = 0.9
        explanation = "Values are within normal operating bounds and align with expected pattern."

    if severity == "critical":
        confidence += 0.05
    elif severity == "high":
        confidence += 0.02
    return classification, severity, round(confidence, 2), explanation


def _analyze_station(station: dict, records: list[dict]) -> dict:
    df = pd.DataFrame(records)
    if df.empty:
        raise ValueError(f"No records for station {station['id']}")

    temps = df["temperature_c"].replace([None], np.nan).dropna().to_numpy(dtype=float)
    pressure = df["pressure_hpa"].replace([None], np.nan).dropna().to_numpy(dtype=float)
    humidity = df["humidity_pct"].replace([None], np.nan).dropna().to_numpy(dtype=float)

    timestamps = pd.to_datetime(df["timestamp"], utc=True, errors="raise")
    duplicate_packets = int(timestamps.duplicated().sum())
    delayed_packets = int((timestamps.diff().dt.total_seconds().dropna() < 0).sum())
    latest_timestamp = timestamps.iloc[-1]
    now = datetime.now(timezone.utc)
    latest_observation_age_minutes = max(0.0, (now - latest_timestamp.to_pydatetime()).total_seconds() / 60)
    valid_observations = df[["temperature_c", "humidity_pct", "pressure_hpa"]].notna().any(axis=1)
    last_valid_index = valid_observations[valid_observations].index[-1] if valid_observations.any() else None
    minutes_since_valid_observation = (
        max(0.0, (now - timestamps.loc[last_valid_index].to_pydatetime()).total_seconds() / 60)
        if last_valid_index is not None else float("inf")
    )

    quality_issues = 0
    if df["temperature_c"].isna().sum() > 0:
        quality_issues += 1
    if df["pressure_hpa"].isna().sum() > 0:
        quality_issues += 1
    if df["humidity_pct"].isna().sum() > 0:
        quality_issues += 1
    if df["signal_strength"].lt(20).any():
        quality_issues += 1
    if df["battery_v"].lt(11.5).any():
        quality_issues += 1
    if duplicate_packets:
        quality_issues += 1
    if delayed_packets:
        quality_issues += 1
    if minutes_since_valid_observation > ANALYSIS_SETTINGS["max_reporting_delay_minutes"]:
        quality_issues += 1

    current = df.iloc[-1]
    history_size = max(12, min(len(temps), int(ANALYSIS_SETTINGS["history_window_hours"] * 12)))
    temp_median = float(np.median(temps[-history_size:]))
    temp_mad = _mad(temps[-history_size:])
    temp_z = max(abs((temps[-1] - temp_median) / temp_mad), 0.0)

    pressure_median = float(np.median(pressure[-history_size:]))
    pressure_mad = _mad(pressure[-history_size:])
    pressure_z = max(abs((pressure[-1] - pressure_median) / pressure_mad), 0.0)

    humidity_median = float(np.median(humidity[-history_size:]))
    humidity_mad = _mad(humidity[-history_size:])
    humidity_z = max(abs((humidity[-1] - humidity_median) / humidity_mad), 0.0)

    pressure_bounds = [ANALYSIS_SETTINGS["pressure_min_hpa"], ANALYSIS_SETTINGS["pressure_max_hpa"]]
    temp_bounds = [ANALYSIS_SETTINGS["temperature_min_c"], ANALYSIS_SETTINGS["temperature_max_c"]]
    humidity_bounds = [ANALYSIS_SETTINGS["humidity_min_pct"], ANALYSIS_SETTINGS["humidity_max_pct"]]

    if temps[-1] < temp_bounds[0] or temps[-1] > temp_bounds[1]:
        temp_z += 1.4
    if pressure[-1] < pressure_bounds[0] or pressure[-1] > pressure_bounds[1]:
        pressure_z += 1.5
    if humidity[-1] < humidity_bounds[0] or humidity[-1] > humidity_bounds[1]:
        humidity_z += 1.5

    scaler, model = MODEL_ARTIFACTS.get(station["id"]) or _train_station_model(station)
    feature_values = scaler.transform(_feature_matrix(records))
    latest_values = feature_values[-1:].reshape(1, -1)
    ml_decision = float(model.decision_function(latest_values)[0])
    ml_flag = bool(model.predict(latest_values)[0] == -1)
    anomaly_ml = max(0.0, min(1.0, 0.5 - ml_decision))

    missing_latest = sum(pd.isna(current[field]) for field in ("temperature_c", "humidity_pct", "pressure_hpa"))
    latest_temperature = float(current["temperature_c"]) if not pd.isna(current["temperature_c"]) else None
    previous_temperature = float(df["temperature_c"].ffill().iloc[-2])
    temperature_change = abs(latest_temperature - previous_temperature) if latest_temperature is not None else 0.0
    frozen_count = int(ANALYSIS_SETTINGS["frozen_window_readings"])
    recent_temperature = df["temperature_c"].dropna().to_numpy(dtype=float)[-frozen_count:]
    frozen = len(recent_temperature) == frozen_count and float(np.ptp(recent_temperature)) < 0.005
    latest_pressure = current["pressure_hpa"]
    latest_humidity = current["humidity_pct"]
    out_of_range = (
        latest_temperature is not None
        and not ANALYSIS_SETTINGS["temperature_min_c"] <= latest_temperature <= ANALYSIS_SETTINGS["temperature_max_c"]
    ) or (
        not pd.isna(latest_pressure)
        and not pressure_bounds[0] <= float(latest_pressure) <= pressure_bounds[1]
    ) or (
        not pd.isna(latest_humidity)
        and not humidity_bounds[0] <= float(latest_humidity) <= humidity_bounds[1]
    )

    components = {
        "validation": min(100.0, quality_issues * 12 + missing_latest * 30 + (80 if out_of_range else 0)),
        "temporal": min(100.0, temp_z * 5 + pressure_z * 2 + humidity_z * 2 + temperature_change * 1.4 + (40 if frozen else 0)),
        "spatial": 0.0,
        "multivariate": min(100.0, (pressure_z + humidity_z) * 3),
        "ml": min(100.0, anomaly_ml * 100 + (15 if ml_flag else 0)),
    }
    component_weights = {
        "validation": ANALYSIS_SETTINGS["trust_weight_validation"],
        "temporal": ANALYSIS_SETTINGS["trust_weight_temporal"],
        "spatial": ANALYSIS_SETTINGS["trust_weight_spatial"],
        "multivariate": ANALYSIS_SETTINGS["trust_weight_multivariate"],
        "ml": ANALYSIS_SETTINGS["trust_weight_ml"],
    }
    anomaly_score = min(100.0, sum(components[key] * component_weights[key] / 100 for key in components))
    trust_score = max(0, min(100, 100 - anomaly_score))
    health_penalties = {
        "anomaly": min(anomaly_score * 0.24, 30),
        "quality": min(max(0, quality_issues - 1) * 8, 30),
        "frozen": 22 if frozen else 0,
        "drift": min(max(0, temperature_change - 3) * 1.5, 20),
    }
    health_weights = {
        "anomaly": ANALYSIS_SETTINGS["health_weight_anomaly"],
        "quality": ANALYSIS_SETTINGS["health_weight_quality"],
        "frozen": ANALYSIS_SETTINGS["health_weight_frozen"],
        "drift": ANALYSIS_SETTINGS["health_weight_drift"],
    }
    sensor_health = max(0, min(100, 100 - sum(
        health_penalties[key] * health_weights[key] / 100 for key in health_penalties
    )))

    classification, severity, confidence, explanation = _classify_from_scores(trust_score, anomaly_score, sensor_health, quality_issues)
    if out_of_range or temperature_change > 30:
        classification, severity, confidence = "sensor_fault", "critical", 0.94
        explanation = f"{station['name']} reported {latest_temperature}°C, far outside the recent pattern and prototype limits."
    elif frozen:
        classification, severity, confidence = "sensor_degradation", "high", 0.84
        explanation = f"The same temperature has repeated across {frozen_count} consecutive readings, which may indicate a stuck sensor."
    elif missing_latest:
        classification, severity, confidence = "data_quality_issue", "high", 0.9
        explanation = "The latest observation is missing one or more key readings; check the station connection and transmission."
    last = current
    result = {
        "id": station["id"],
        "name": station["name"],
        "state": station["state"],
        "district": station["district"],
        "lat": station["lat"],
        "lon": station["lon"],
        "mode": "demo",
        "last_updated": last["timestamp"],
        "trust_score": int(round(trust_score)),
        "sensor_health_score": int(round(sensor_health)),
        "anomaly_score": round(float(anomaly_score), 2),
        "classification": classification,
        "severity": severity,
        "confidence": confidence,
        "metrics": {
            "temperature_c": _safe_round(last["temperature_c"], 2),
            "humidity_pct": _safe_round(last["humidity_pct"], 2),
            "pressure_hpa": _safe_round(last["pressure_hpa"], 2),
            "wind_kmh": _safe_round(last["wind_kmh"], 2),
            "rainfall_mm": _safe_round(last["rainfall_mm"], 2),
            "battery_v": _safe_round(last["battery_v"], 2),
            "signal_strength": _safe_round(last["signal_strength"], 2),
        },
        "data_quality": {
            "missing_fields": int(df[["temperature_c", "humidity_pct", "pressure_hpa"]].isna().sum().sum()),
            "duplicate_packets": duplicate_packets,
            "stale_window_minutes": round(minutes_since_valid_observation, 2),
            "quality_issues": quality_issues,
            "freshness_ok": minutes_since_valid_observation <= ANALYSIS_SETTINGS["max_reporting_delay_minutes"],
            "explanation": explanation,
        },
        "analysis": {
            "validation": {
                "status": "offline" if missing_latest == 3 or minutes_since_valid_observation > ANALYSIS_SETTINGS["max_reporting_delay_minutes"] else "anomaly" if out_of_range or duplicate_packets or delayed_packets else "warning" if missing_latest or frozen else "normal",
                "out_of_range": out_of_range,
                "missing_latest_fields": missing_latest,
                "frozen": frozen,
                "duplicate_packets": duplicate_packets,
                "delayed_packets": delayed_packets,
                "latest_observation_age_minutes": round(latest_observation_age_minutes, 2),
                "minutes_since_valid_observation": round(minutes_since_valid_observation, 2) if math.isfinite(minutes_since_valid_observation) else None,
                "reporting_delay_limit_minutes": ANALYSIS_SETTINGS["max_reporting_delay_minutes"],
            },
            "temporal": {"median_temperature_c": round(temp_median, 2), "temperature_difference_c": round(latest_temperature - temp_median, 2) if latest_temperature is not None else None, "recent_temperature_change_c": round(temperature_change, 2), "frozen_observations": frozen_count if frozen else 0},
            "multivariate": {"score": round(max(0, 100 - anomaly_score * 0.6), 1), "reason": "Temperature, pressure, and humidity are considered together as supporting evidence."},
            "ml": {"model": "Isolation Forest", "anomaly_flag": ml_flag, "decision_score": round(ml_decision, 4), "score_is_probability": False},
            "spatial": {"nearby_count": 0, "median_temperature_c": None, "temperature_difference_c": None, "agreement_ratio": None, "explanation": "Nearby comparison is calculated across the network."},
            "trust_components": {"scores": components, "weights": component_weights, "total_penalty": round(anomaly_score, 2)},
            "sensor_health": {
                "penalties": {key: round(value, 2) for key, value in health_penalties.items()},
                "weights": health_weights,
                "score": round(sensor_health, 1),
            },
        },
        "recommendation": (
            "Inspect the temperature sensor and compare it with a trusted reference."
            if classification == "sensor_fault" else
            "Check station connectivity and confirm the missing readings."
            if classification == "data_quality_issue" else
            "Check sensor hardware, power, and communication."
            if classification == "sensor_degradation" else
            "Continue monitoring and compare with additional weather observations."
            if classification == "weather_event" else
            "Review the reading with nearby evidence before taking action."
        ),
        "alert_count": 1 if classification != "normal" else 0,
        "status": "offline" if missing_latest else "attention" if classification != "normal" else "normal",
        "history": records,
    }
    return result


def build_demo_dashboard(scenario: str | None = None) -> dict:
    scenario_name = SCENARIO_ALIASES.get((scenario or "normal-weather").lower())
    if scenario_name is None:
        raise ValueError(f"Unsupported scenario: {scenario}")
    current_window = int(datetime.now(timezone.utc).timestamp() // 300)
    return deepcopy(_build_demo_dashboard_cached(scenario_name, current_window))


@lru_cache(maxsize=24)
def _build_demo_dashboard_cached(scenario_name: str, current_window: int) -> dict:
    del current_window
    stations = [
        _analyze_station(station, _calc_station_data(station, scenario_name))
        for station in STATION_BLUEPRINTS
    ]
    alerts = []

    for station in stations:
        neighbors = [
            other for other in stations
            if other["id"] != station["id"]
            and _distance_km(station["lat"], station["lon"], other["lat"], other["lon"]) <= ANALYSIS_SETTINGS["nearby_radius_km"]
            and other["status"] != "offline"
        ]
        spatial = station["analysis"]["spatial"]
        spatial["nearby_count"] = len(neighbors)
        nearby_temperatures = [
            other["metrics"]["temperature_c"] for other in neighbors
            if other["metrics"]["temperature_c"] is not None
        ]
        if len(nearby_temperatures) >= ANALYSIS_SETTINGS["minimum_nearby_stations"] and station["metrics"]["temperature_c"] is not None:
            nearby_median = float(np.median(nearby_temperatures))
            difference = float(station["metrics"]["temperature_c"]) - nearby_median
            agreement_ratio = sum(abs(value - nearby_median) <= 2.5 for value in nearby_temperatures) / len(nearby_temperatures)
            spatial.update({
                "median_temperature_c": round(nearby_median, 2),
                "temperature_difference_c": round(difference, 2),
                "agreement_ratio": round(agreement_ratio, 2),
                "explanation": "Nearby stations broadly agree." if agreement_ratio >= 0.6 else "This reading differs from the nearby-station median.",
            })
            trust_components = station["analysis"]["trust_components"]
            spatial_penalty = min(100.0, abs(difference) * 3.0) if agreement_ratio < 0.6 else 0.0
            trust_components["scores"]["spatial"] = round(spatial_penalty, 2)
            updated_penalty = sum(
                trust_components["scores"][key] * trust_components["weights"][key] / 100
                for key in trust_components["scores"]
            )
            trust_components["total_penalty"] = round(updated_penalty, 2)
            station["anomaly_score"] = round(updated_penalty, 2)
            station["trust_score"] = max(0, min(100, round(100 - updated_penalty)))
            if abs(difference) > 20:
                station["classification"] = "sensor_fault"
                station["severity"] = "critical"
                station["confidence"] = 0.96
                station["trust_score"] = min(station["trust_score"], 28)
                station["recommendation"] = "Inspect the temperature sensor and verify the reading against a trusted reference."
                station["data_quality"]["explanation"] = (
                    f"This station reports {station['metrics']['temperature_c']}°C while nearby stations "
                    f"are around {nearby_median:.1f}°C. This may be an isolated sensor issue."
                )
            elif scenario_name == "genuine-heatwave" and station["id"] in {"AWS-001", "AWS-002", "AWS-003", "AWS-004"} and agreement_ratio >= 0.6:
                station["classification"] = "weather_event"
                station["severity"] = "medium"
                station["confidence"] = 0.88
                station["trust_score"] = max(station["trust_score"], 84)
                station["recommendation"] = "Continue monitoring and compare with additional weather observations."
                station["data_quality"]["explanation"] = (
                    "Nearby stations show a similar temperature increase. This may represent a genuine "
                    "regional weather event rather than an isolated sensor issue."
                )

        if scenario_name == "gradual-degradation" and station["id"] == SCENARIO_TARGETS[scenario_name]:
            station["classification"] = "sensor_degradation"
            station["severity"] = "medium"
            station["confidence"] = 0.82
            station["sensor_health_score"] = min(station["sensor_health_score"], 68)
            station["trust_score"] = min(station["trust_score"], 69)
            station["data_quality"]["explanation"] = "Several measurements are drifting together and signal quality is weakening over time."
        if scenario_name == "manual-review" and station["id"] == "AWS-004":
            station["classification"] = "manual_review"
            station["severity"] = "medium"
            station["confidence"] = 0.7

    for station in stations:
        if station["classification"] == "normal":
            continue
        alert_id = f"alert-{station['id']}-{scenario_name}"
        alerts.append({
            "id": alert_id,
            "station_id": station["id"],
            "station_name": station["name"],
            "priority": "high" if station["severity"] in {"high", "critical"} else "medium",
            "title": f"{station['classification'].replace('_', ' ').title()} at {station['name']}",
            "description": station["data_quality"]["explanation"],
            "severity": station["severity"],
            "confidence": station["confidence"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "recommended_action": station["recommendation"],
            "trust_score": station["trust_score"],
            "sensor_health_score": station["sensor_health_score"],
            "parameter": "temperature" if station["metrics"]["temperature_c"] is not None else "observation",
            "observed_value": station["metrics"]["temperature_c"],
            "nearby_median": station["analysis"]["spatial"]["median_temperature_c"],
            "anomaly_type": station["classification"],
            "evidence": station["analysis"],
            "status": "active",
            "scenario": scenario_name,
        })

    summary = {
        "stations_monitored": len(stations),
        "online": sum(station["status"] != "offline" for station in stations),
        "offline": sum(station["status"] == "offline" for station in stations),
        "alerts": len(alerts),
        "critical": sum(alert["severity"] == "critical" for alert in alerts),
        "avg_trust_score": round(sum(station["trust_score"] for station in stations) / len(stations), 1),
        "avg_sensor_health_score": round(sum(station["sensor_health_score"] for station in stations) / len(stations), 1),
        "healthy": sum(station["trust_score"] >= 75 and station["status"] == "normal" for station in stations),
        "needs_attention": sum(station["classification"] != "normal" for station in stations),
        "status": "stable" if not alerts else "watchlist",
    }
    return {
        "summary": summary,
        "stations": stations,
        "alerts": alerts,
        "scenario": scenario_name,
        "demo_mode": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    return earth_radius_km * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))

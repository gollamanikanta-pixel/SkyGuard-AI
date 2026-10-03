from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_mock_engine
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import main as main_module
from app.config import Settings
from app.database import RuntimeStateRecord, _insert_for, list_raw_observations
from app.engine import STATION_BLUEPRINTS
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_health_and_demo_station_history(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["mode"] == "simulated"

    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["demo_mode"] is True
    assert len(dashboard["stations"]) >= 12
    assert all(len(station["history"]) == 288 for station in dashboard["stations"])
    assert all(row["source"] == "simulated" for row in dashboard["stations"][0]["history"])
    health = client.get("/api/stations/AWS-001/health?hours=24")
    assert health.status_code == 200
    assert health.json()["history"]


def test_open_meteo_reference_is_labeled_and_stored_separately(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed_at = datetime.now(timezone.utc).replace(second=0, microsecond=0).isoformat()

    async def fake_fetch(stations: list[dict]) -> dict:
        return {
            "provider": "Open-Meteo",
            "data_kind": "gridded weather model estimate; not an AWS sensor observation",
            "disclaimer": "Reference only; not sensor data.",
            "fetched_at": observed_at,
            "stations": [{
                "station_id": station["id"],
                "station_name": station["name"],
                "district": station["district"],
                "state": station["state"],
                "latitude": station["lat"],
                "longitude": station["lon"],
                "observed_at": observed_at,
                "temperature_c": 29.5,
                "humidity_pct": 60,
                "pressure_hpa": 1008,
                "wind_kmh": 10,
                "precipitation_mm": 0,
                "source": "Open-Meteo",
            } for station in stations],
        }

    monkeypatch.setattr(main_module, "fetch_current_conditions", fake_fetch)
    response = client.post("/api/providers/open-meteo/current")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["stations"]) == len(STATION_BLUEPRINTS)
    assert "not an AWS sensor observation" in payload["data_kind"]
    assert payload["stations"][0]["source"] == "Open-Meteo"

    stored = list_raw_observations("external-reference", station_id="AWS-001", limit=1)
    assert stored
    assert stored[0]["source"] == "open-meteo"


def test_faulty_sensor_isolated_from_neighbor_stations(client: TestClient) -> None:
    response = client.post("/api/v1/simulate", json={"scenario": "faulty-sensor", "station_id": "AWS-004"})
    assert response.status_code == 200
    payload = response.json()
    station = payload["station"]
    assert station["metrics"]["temperature_c"] == 85.0
    assert station["classification"] == "sensor_fault"
    assert station["trust_score"] < 50
    assert station["analysis"]["spatial"]["temperature_difference_c"] > 20
    assert station["recommendation"]
    assert payload["dashboard"]["summary"]["critical"] >= 1


def test_regional_heatwave_is_not_classified_as_sensor_fault(client: TestClient) -> None:
    response = client.post("/api/scenarios/genuine-heatwave/run")
    assert response.status_code == 200
    payload = response.json()
    affected = [station for station in payload["stations"] if station["id"] in {"AWS-001", "AWS-002", "AWS-003", "AWS-004"}]
    assert len(affected) == 4
    assert all(42 <= station["metrics"]["temperature_c"] <= 43.5 for station in affected)
    assert all(station["classification"] == "weather_event" for station in affected)


def test_alert_actions_persist_without_removing_history(client: TestClient) -> None:
    scenario = client.post("/api/scenarios/faulty-sensor/run").json()
    alert = scenario["alerts"][0]
    alert_id = alert["id"]
    assert alert["observed_value"] == 85.0
    assert alert["nearby_median"] is not None
    assert alert["trust_score"] < 50
    assert alert["sensor_health_score"] is not None
    assert alert["evidence"]
    assert client.post(f"/api/alerts/{alert_id}/acknowledge").json()["status"] == "acknowledged"
    assert client.post(f"/api/alerts/{alert_id}/resolve").json()["status"] == "resolved"
    records = client.get(
        f"/api/alerts?include_history=true&station_id={alert['station_id']}&status=resolved&limit=100"
    ).json()["alerts"]
    saved = next(item for item in records if item["id"] == alert_id)
    assert saved["status"] == "resolved"
    anomalies = client.get("/api/anomalies").json()["anomalies"]
    assert next(item for item in anomalies if item["station_id"] == alert["station_id"])["status"] == "resolved"


def test_alert_history_filters_and_paginates_on_the_server(client: TestClient) -> None:
    client.post("/api/scenarios/faulty-sensor/run")
    client.post("/api/scenarios/faulty-sensor/run")

    first_page = client.get("/api/alerts?include_history=true&limit=1&offset=0").json()
    second_page = client.get("/api/alerts?include_history=true&limit=1&offset=1").json()
    assert first_page["count"] == 1
    assert second_page["count"] == 1
    assert first_page["total_count"] >= 2
    assert first_page["alerts"][0]["id"] != second_page["alerts"][0]["id"]
    assert sum(first_page["status_counts"].values()) == first_page["total_count"]

    filtered = client.get("/api/alerts?include_history=true&station_id=AWS-004&limit=100").json()
    assert filtered["total_count"] >= 2
    assert all(alert["station_id"] == "AWS-004" for alert in filtered["alerts"])
    assert client.get("/api/alerts?limit=101").status_code == 422


def test_raw_observations_and_scenario_reset(client: TestClient) -> None:
    response = client.get("/api/observations?station_id=AWS-004&limit=300")
    assert response.status_code == 200
    rows = response.json()["observations"]
    assert len(rows) >= 288
    assert rows[0]["source"] == "simulated"
    assert rows[0]["validation_status"]

    reset = client.post("/api/scenarios/reset")
    assert reset.status_code == 200
    assert reset.json()["scenario"] == "normal-weather"


def test_raw_observation_date_filters_pagination_and_csv(client: TestClient) -> None:
    dashboard = client.post("/api/scenarios/faulty-sensor/run").json()
    latest = next(item for item in dashboard["stations"] if item["id"] == "AWS-004")["last_updated"]
    date = datetime.fromisoformat(latest).astimezone(timezone.utc).date().isoformat()
    response = client.get(f"/api/observations?station_id=AWS-004&limit=5&start_date={date}T00:00:00Z&end_date={date}T23:59:59Z")
    assert response.status_code == 200
    page = response.json()
    assert len(page["observations"]) <= 5
    assert page["count"] == len(page["observations"])
    assert page["total_count"] >= page["count"]
    assert all(item["station_id"] == "AWS-004" for item in page["observations"])
    assert client.get("/api/observations?start_date=2026-10-03T00:00:00Z&end_date=2026-10-02T00:00:00Z").status_code == 422

    csv_response = client.get(f"/api/observations/export/csv?station_id=AWS-004&start_date={date}T00:00:00Z&end_date={date}T23:59:59Z")
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "temperature_c" in csv_response.text.splitlines()[0]


def test_settings_validation_and_monitoring_controls(client: TestClient) -> None:
    settings = client.get("/api/settings").json()["settings"]
    assert client.put("/api/settings", json={**settings, "trust_weight_ml": 16}).status_code == 422
    assert client.put("/api/settings", json={**settings, "health_weight_drift": 19}).status_code == 422
    assert client.put("/api/settings", json={**settings, "severity_review_anomaly_threshold": 75}).status_code == 422

    started = client.post("/api/monitoring/start")
    assert started.status_code == 200
    assert started.json()["monitoring"]["running"] is True
    assert client.post("/api/monitoring/pause").json()["monitoring"]["paused"] is True
    stopped = client.post("/api/monitoring/stop")
    assert stopped.json()["monitoring"]["running"] is False
    assert client.post("/api/scenarios/reset").status_code == 200


def test_model_retraining_updates_persisted_status(client: TestClient) -> None:
    response = client.post("/api/model/retrain")
    assert response.status_code == 200
    retraining = response.json()
    assert retraining["status"] == "complete"
    assert retraining["stations_trained"] == 12
    assert retraining["training_observations_per_station"] == 287

    status = client.get("/api/model/status").json()
    assert status["trained_stations"] == 12
    assert status["last_retrained_at"] == retraining["last_retrained_at"]


def test_unknown_station_and_scenario_return_clear_errors(client: TestClient) -> None:
    assert client.get("/api/stations/AWS-999").status_code == 404
    assert client.post("/api/scenarios/unknown-event/run").status_code == 400


def test_analytics_returns_stored_reading_summaries_and_time_window(client: TestClient) -> None:
    response = client.get("/api/analytics?hours=24")
    assert response.status_code == 200
    analytics = response.json()
    assert analytics["hours"] == 24
    assert analytics["observation_count"] >= 12
    assert analytics["anomaly_count"] + analytics["normal_count"] == analytics["observation_count"]
    assert len(analytics["anomalies_by_station"]) >= 12
    assert len(analytics["trust_distribution"]) == 5
    assert analytics["sensor_health_trend"]
    assert client.get("/api/analytics?hours=200").status_code == 422


def test_repeated_scenario_runs_keep_fresh_raw_and_analysis_records(client: TestClient) -> None:
    first = client.post("/api/scenarios/faulty-sensor/run").json()
    first_run_id = first["scenario_run_id"]
    second = client.post("/api/scenarios/faulty-sensor/run").json()
    second_run_id = second["scenario_run_id"]
    assert first_run_id != second_run_id

    raw = client.get("/api/observations?station_id=AWS-004&limit=1000").json()["observations"]
    assert len(raw) == 288
    assert all(second_run_id in row["id"] for row in raw)
    analytics = client.get("/api/analytics?hours=24").json()
    assert analytics["observation_count"] == 12


def test_supabase_database_url_uses_project_and_encoded_password(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_BACKEND", "supabase")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://upuneqcdtqleoptdhnvq.supabase.co")
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "safe+ password")

    assert Settings().database_url == (
        "postgresql+psycopg://postgres:safe%2B%20password@"
        "db.upuneqcdtqleoptdhnvq.supabase.co:5432/postgres?sslmode=require"
    )


def test_supabase_configuration_requires_database_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_BACKEND", "supabase")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_PASSWORD", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://upuneqcdtqleoptdhnvq.supabase.co")

    with pytest.raises(ValueError, match="SUPABASE_DB_PASSWORD"):
        Settings()


def test_supabase_pooler_url_and_postgres_upsert_are_supported(monkeypatch: pytest.MonkeyPatch) -> None:
    pooler_url = "postgresql+psycopg://postgres.project:secret@pooler.supabase.com:6543/postgres"
    monkeypatch.setenv("DATABASE_BACKEND", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://upuneqcdtqleoptdhnvq.supabase.co")
    monkeypatch.setenv("SUPABASE_DB_URL", pooler_url)
    monkeypatch.delenv("SUPABASE_DB_PASSWORD", raising=False)
    assert Settings().database_url == pooler_url

    mock_engine = create_mock_engine("postgresql+psycopg://", print)
    with Session(mock_engine) as session:
        statement = _insert_for(session, RuntimeStateRecord).values(key="scenario", value_json="{}")
        statement = statement.on_conflict_do_update(
            index_elements=[RuntimeStateRecord.key],
            set_={"value_json": "{}"},
        )
        assert "ON CONFLICT" in str(statement.compile(dialect=mock_engine.dialect))

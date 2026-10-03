from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Generator

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, case, create_engine, func, inspect, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


class WeatherStationRecord(Base):
    __tablename__ = "weather_stations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RawObservationRecord(Base):
    __tablename__ = "raw_observations"
    __table_args__ = (
        UniqueConstraint("station_id", "scenario", "observed_at", name="uq_raw_station_scenario_time"),
        Index("ix_raw_station_time", "station_id", "observed_at"),
    )

    id: Mapped[str] = mapped_column(String(180), primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("weather_stations.id"), index=True)
    scenario: Mapped[str] = mapped_column(String(64), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure_hpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    battery_v: Mapped[float | None] = mapped_column(Float, nullable=True)
    signal_strength: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="simulated")
    raw_payload_json: Mapped[str] = mapped_column(Text)


class AnalysisResultRecord(Base):
    __tablename__ = "analysis_results"

    id: Mapped[str] = mapped_column(String(180), primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("weather_stations.id"), index=True)
    observation_id: Mapped[str] = mapped_column(String(180), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    anomaly_status: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20))
    trust_score: Mapped[int] = mapped_column(Integer)
    sensor_health_score: Mapped[int] = mapped_column(Integer)
    evidence_json: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)


class SensorHealthHistoryRecord(Base):
    __tablename__ = "sensor_health_history"
    __table_args__ = (Index("ix_health_station_time", "station_id", "calculated_at"),)

    id: Mapped[str] = mapped_column(String(180), primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("weather_stations.id"), index=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    health_score: Mapped[int] = mapped_column(Integer)
    health_status: Mapped[str] = mapped_column(String(32))
    reason_json: Mapped[str] = mapped_column(Text)


class AlertRecord(Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alert_status_severity", "status", "severity"),)

    id: Mapped[str] = mapped_column(String(180), primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("weather_stations.id"), index=True)
    scenario: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    recommendation: Mapped[str] = mapped_column(Text)
    parameter: Mapped[str | None] = mapped_column(String(40), nullable=True)
    observed_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    nearby_median: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomaly_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    trust_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sensor_health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AppSettingsRecord(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RuntimeStateRecord(Base):
    __tablename__ = "runtime_state"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ScenarioStateRecord(Base):
    __tablename__ = "scenario_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    current_scenario: Mapped[str] = mapped_column(String(64))
    scenario_status: Mapped[str] = mapped_column(String(24), default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    details_json: Mapped[str] = mapped_column(Text, default="{}")


class MonitoringStateRecord(Base):
    __tablename__ = "monitoring_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    is_running: Mapped[bool] = mapped_column(default=False)
    is_paused: Mapped[bool] = mapped_column(default=False)
    update_interval_seconds: Mapped[int] = mapped_column(Integer, default=60)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


DATABASE_URL = get_settings().database_url
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionFactory = sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    session = SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def initialize_database() -> None:
    Base.metadata.create_all(engine)
    alert_columns = {
        "parameter": "VARCHAR(40)",
        "observed_value": "FLOAT",
        "nearby_median": "FLOAT",
        "anomaly_type": "VARCHAR(40)",
        "trust_score": "INTEGER",
        "sensor_health_score": "INTEGER",
        "confidence": "FLOAT",
        "evidence_json": "TEXT",
    }
    existing = {column["name"] for column in inspect(engine).get_columns("alerts")}
    with engine.begin() as connection:
        for name, sql_type in alert_columns.items():
            if name not in existing:
                connection.exec_driver_sql(f"ALTER TABLE alerts ADD COLUMN {name} {sql_type}")


def _insert_for(session: Session, model: type[Base]) -> Any:
    dialect = session.get_bind().dialect.name
    if dialect == "sqlite":
        return sqlite_insert(model)
    if dialect == "postgresql":
        return postgresql_insert(model)
    raise RuntimeError(f"Unsupported database dialect for persistence: {dialect}")


def save_runtime_value(key: str, value: Any) -> None:
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        statement = _insert_for(session, RuntimeStateRecord).values(key=key, value_json=json.dumps(value), updated_at=now)
        statement = statement.on_conflict_do_update(
            index_elements=[RuntimeStateRecord.key],
            set_={"value_json": json.dumps(value), "updated_at": now},
        )
        session.execute(statement)
        if key == "scenario":
            scenario_statement = _insert_for(session, ScenarioStateRecord).values(
                id=1, current_scenario=value, scenario_status="active", started_at=now,
                updated_at=now, details_json="{}",
            ).on_conflict_do_update(
                index_elements=[ScenarioStateRecord.id],
                set_={"current_scenario": value, "scenario_status": "active", "updated_at": now},
            )
            session.execute(scenario_statement)
        elif key == "monitoring":
            monitoring_statement = _insert_for(session, MonitoringStateRecord).values(
                id=1, is_running=bool(value["running"]), is_paused=bool(value["paused"]),
                update_interval_seconds=int(value["update_interval_seconds"]),
                last_run_at=datetime.fromisoformat(value["last_run_at"]) if value.get("last_run_at") else None,
                updated_at=now,
            ).on_conflict_do_update(
                index_elements=[MonitoringStateRecord.id],
                set_={
                    "is_running": bool(value["running"]), "is_paused": bool(value["paused"]),
                    "update_interval_seconds": int(value["update_interval_seconds"]),
                    "last_run_at": datetime.fromisoformat(value["last_run_at"]) if value.get("last_run_at") else None,
                    "updated_at": now,
                },
            )
            session.execute(monitoring_statement)


def get_runtime_value(key: str, default: Any = None) -> Any:
    with session_scope() as session:
        record = session.get(RuntimeStateRecord, key)
        return json.loads(record.value_json) if record else default


def persist_dashboard(dashboard: dict[str, Any]) -> None:
    scenario = dashboard["scenario"]
    scenario_key = f"{scenario}:{dashboard.get('scenario_run_id', 'initial')}"
    received = datetime.now(timezone.utc)
    with session_scope() as session:
        for station in dashboard["stations"]:
            station_stmt = _insert_for(session, WeatherStationRecord).values(
                id=station["id"], name=station["name"], city=station["district"],
                state=station["state"], latitude=station["lat"], longitude=station["lon"],
            )
            station_stmt = station_stmt.on_conflict_do_update(
                index_elements=[WeatherStationRecord.id],
                set_={
                    "name": station["name"], "city": station["district"],
                    "state": station["state"], "latitude": station["lat"], "longitude": station["lon"],
                },
            )
            session.execute(station_stmt)

        for station in dashboard["stations"]:
            raw_rows: list[dict[str, Any]] = []
            for row in station["history"]:
                observed_at = datetime.fromisoformat(row["timestamp"])
                row_id = f"{scenario_key}:{station['id']}:{row['timestamp']}"
                raw_rows.append({
                    "id": row_id, "station_id": station["id"], "scenario": scenario_key,
                    "observed_at": observed_at, "received_at": received,
                    "temperature_c": row.get("temperature_c"), "pressure_hpa": row.get("pressure_hpa"),
                    "humidity_pct": row.get("humidity_pct"), "battery_v": row.get("battery_v"),
                    "signal_strength": row.get("signal_strength"), "source": "simulated",
                    "raw_payload_json": json.dumps(row, separators=(",", ":")),
                })
            for start in range(0, len(raw_rows), 50):
                raw_stmt = _insert_for(session, RawObservationRecord).values(raw_rows[start:start + 50])
                session.execute(raw_stmt.on_conflict_do_nothing(index_elements=[
                    RawObservationRecord.station_id, RawObservationRecord.scenario, RawObservationRecord.observed_at,
                ]))

            latest = station["history"][-1]
            observation_id = f"{scenario}:{station['id']}:{latest['timestamp']}"
            analysis_id = f"analysis:{dashboard.get('scenario_run_id', 'initial')}:{observation_id}"
            analysis_stmt = _insert_for(session, AnalysisResultRecord).values(
                id=analysis_id,
                station_id=station["id"],
                observation_id=observation_id,
                anomaly_status=station["classification"],
                severity=station["severity"],
                trust_score=station["trust_score"],
                sensor_health_score=station["sensor_health_score"],
                evidence_json=json.dumps(station["analysis"], separators=(",", ":")),
                recommendation=station["recommendation"],
            )
            session.execute(analysis_stmt.on_conflict_do_nothing(index_elements=[AnalysisResultRecord.id]))
            health_id = f"health:{scenario}:{station['id']}:{latest['timestamp']}"
            health_status = "Needs inspection" if station["sensor_health_score"] < 50 else "Watch" if station["sensor_health_score"] < 75 else "Good"
            health_stmt = _insert_for(session, SensorHealthHistoryRecord).values(
                id=health_id, station_id=station["id"], calculated_at=datetime.fromisoformat(latest["timestamp"]),
                health_score=station["sensor_health_score"], health_status=health_status,
                reason_json=json.dumps({"classification": station["classification"], "explanation": station["data_quality"]["explanation"]}),
            )
            session.execute(health_stmt.on_conflict_do_nothing(index_elements=[SensorHealthHistoryRecord.id]))

        for alert in dashboard["alerts"]:
            created_at = datetime.fromisoformat(alert["created_at"])
            alert_stmt = _insert_for(session, AlertRecord).values(
                id=alert["id"], station_id=alert["station_id"], scenario=scenario,
                title=alert["title"], message=alert["description"], severity=alert["severity"],
                status="active", recommendation=alert["recommended_action"], created_at=created_at,
                parameter=alert.get("parameter"),
                observed_value=alert.get("observed_value"),
                nearby_median=alert.get("nearby_median"),
                anomaly_type=alert.get("anomaly_type"),
                trust_score=alert.get("trust_score"),
                sensor_health_score=alert.get("sensor_health_score"),
                confidence=alert.get("confidence"),
                evidence_json=json.dumps(alert.get("evidence", {}), separators=(",", ":")),
            )
            session.execute(alert_stmt.on_conflict_do_nothing(index_elements=[AlertRecord.id]))


def persist_provider_observations(observations: list[dict[str, Any]]) -> None:
    received_at = datetime.now(timezone.utc)
    with session_scope() as session:
        for observation in observations:
            station_stmt = _insert_for(session, WeatherStationRecord).values(
                id=observation["station_id"], name=observation["station_name"],
                city=observation["district"], state=observation["state"],
                latitude=observation["latitude"], longitude=observation["longitude"],
            ).on_conflict_do_update(
                index_elements=[WeatherStationRecord.id],
                set_={
                    "name": observation["station_name"], "city": observation["district"],
                    "state": observation["state"], "latitude": observation["latitude"],
                    "longitude": observation["longitude"],
                },
            )
            session.execute(station_stmt)
            observed_at = datetime.fromisoformat(observation["observed_at"])
            row = {
                "id": f"open-meteo:{observation['station_id']}:{observation['observed_at']}",
                "station_id": observation["station_id"],
                "scenario": "external-reference",
                "observed_at": observed_at,
                "received_at": received_at,
                "temperature_c": observation.get("temperature_c"),
                "pressure_hpa": observation.get("pressure_hpa"),
                "humidity_pct": observation.get("humidity_pct"),
                "battery_v": None,
                "signal_strength": None,
                "source": "open-meteo",
                "raw_payload_json": json.dumps(observation, separators=(",", ":")),
            }
            statement = _insert_for(session, RawObservationRecord).values(**row)
            session.execute(statement.on_conflict_do_nothing(index_elements=[
                RawObservationRecord.station_id,
                RawObservationRecord.scenario,
                RawObservationRecord.observed_at,
            ]))


def get_alert_statuses(scenario: str | None = None) -> dict[str, dict[str, Any]]:
    with session_scope() as session:
        query = select(AlertRecord)
        if scenario:
            query = query.where(AlertRecord.scenario == scenario)
        return {
            row.id: {
                "status": row.status,
                "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
                "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
            }
            for row in session.scalars(query).all()
        }


def update_alert_status(alert_id: str, status: str) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        record = session.get(AlertRecord, alert_id)
        if record is None:
            return None
        if record.status == "resolved" and status != "resolved":
            return {"status": record.status, "acknowledged_at": None, "resolved_at": record.resolved_at.isoformat() if record.resolved_at else None}
        record.status = status
        if status == "acknowledged":
            record.acknowledged_at = now
        elif status == "resolved":
            record.resolved_at = now
        return {
            "status": record.status,
            "acknowledged_at": record.acknowledged_at.isoformat() if record.acknowledged_at else None,
            "resolved_at": record.resolved_at.isoformat() if record.resolved_at else None,
        }


def _alert_filters(
    scenario: str | None,
    status: str | None,
    severity: str | None,
    station_id: str | None,
) -> list[Any]:
    filters = []
    if scenario:
        filters.append(AlertRecord.scenario == scenario)
    if status:
        filters.append(AlertRecord.status == status)
    if severity:
        filters.append(AlertRecord.severity == severity)
    if station_id:
        filters.append(AlertRecord.station_id == station_id)
    return filters


def count_alert_records(
    scenario: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    station_id: str | None = None,
) -> int:
    with session_scope() as session:
        query = select(func.count()).select_from(AlertRecord).where(
            *_alert_filters(scenario, status, severity, station_id)
        )
        return int(session.scalar(query) or 0)


def count_alerts_by_status(scenario: str | None = None) -> dict[str, int]:
    with session_scope() as session:
        query = select(AlertRecord.status, func.count()).group_by(AlertRecord.status)
        if scenario:
            query = query.where(AlertRecord.scenario == scenario)
        return {status: count for status, count in session.execute(query).all()}


def list_alert_records(
    scenario: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    status: str | None = None,
    severity: str | None = None,
    station_id: str | None = None,
) -> list[dict[str, Any]]:
    with session_scope() as session:
        query = select(AlertRecord).where(
            *_alert_filters(scenario, status, severity, station_id)
        ).order_by(
            case((AlertRecord.status == "resolved", 1), else_=0),
            case(
                (AlertRecord.severity == "critical", 0),
                (AlertRecord.severity == "high", 1),
                (AlertRecord.severity == "medium", 2),
                else_=3,
            ),
            AlertRecord.created_at.desc(),
        )
        if limit is not None:
            query = query.limit(limit)
        if offset:
            query = query.offset(offset)
        return [{
            "id": row.id,
            "station_id": row.station_id,
            "scenario": row.scenario,
            "title": row.title,
            "description": row.message,
            "severity": row.severity,
            "status": row.status,
            "recommended_action": row.recommendation,
            "parameter": row.parameter,
            "observed_value": row.observed_value,
            "nearby_median": row.nearby_median,
            "anomaly_type": row.anomaly_type,
            "trust_score": row.trust_score,
            "sensor_health_score": row.sensor_health_score,
            "confidence": row.confidence,
            "evidence": json.loads(row.evidence_json) if row.evidence_json else {},
            "created_at": row.created_at.isoformat(),
            "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
            "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        } for row in session.scalars(query).all()]


def get_app_settings(defaults: dict[str, Any]) -> dict[str, Any]:
    with session_scope() as session:
        records = session.scalars(select(AppSettingsRecord)).all()
        saved = {record.key: json.loads(record.value_json) for record in records}
    return {**defaults, **saved}


def has_saved_app_settings() -> bool:
    with session_scope() as session:
        return bool(session.scalar(select(func.count()).select_from(AppSettingsRecord)))


def list_analysis_results(
    scenario: str,
    hours: int = 24,
    limit: int = 5000,
    station_id: str | None = None,
    run_id: str | None = None,
) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    with session_scope() as session:
        query = (
            select(AnalysisResultRecord)
            .where(
                AnalysisResultRecord.created_at >= since,
            )
            .order_by(AnalysisResultRecord.created_at.asc())
            .limit(limit)
        )
        if run_id:
            query = query.where(AnalysisResultRecord.id.like(f"analysis:{run_id}:{scenario}:%"))
        else:
            query = query.where(AnalysisResultRecord.observation_id.like(f"{scenario}:%"))
        if station_id:
            query = query.where(AnalysisResultRecord.station_id == station_id)
        return [{
            "id": row.id,
            "station_id": row.station_id,
            "observation_id": row.observation_id,
            "created_at": row.created_at.isoformat(),
            "anomaly_status": row.anomaly_status,
            "severity": row.severity,
            "trust_score": row.trust_score,
            "sensor_health_score": row.sensor_health_score,
        } for row in session.scalars(query).all()]


def save_app_settings(values: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        for key, value in values.items():
            statement = _insert_for(session, AppSettingsRecord).values(
                key=key, value_json=json.dumps(value), updated_at=now,
            ).on_conflict_do_update(
                index_elements=[AppSettingsRecord.key],
                set_={"value_json": json.dumps(value), "updated_at": now},
            )
            session.execute(statement)


def list_raw_observations(
    scenario: str,
    station_id: str | None = None,
    limit: int = 500,
    offset: int = 0,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[dict[str, Any]]:
    with session_scope() as session:
        query = select(RawObservationRecord).where(RawObservationRecord.scenario == scenario).order_by(RawObservationRecord.observed_at.desc())
        if station_id:
            query = query.where(RawObservationRecord.station_id == station_id)
        if start:
            query = query.where(RawObservationRecord.observed_at >= start)
        if end:
            query = query.where(RawObservationRecord.observed_at <= end)
        rows = session.scalars(query.limit(limit).offset(offset)).all()
        stations = {record.id: record for record in session.scalars(select(WeatherStationRecord)).all()}
        return [{
            "id": row.id,
            "station_id": row.station_id,
            "timestamp": row.observed_at.isoformat(),
            "temperature_c": row.temperature_c,
            "pressure_hpa": row.pressure_hpa,
            "humidity_pct": row.humidity_pct,
            "latitude": stations[row.station_id].latitude,
            "longitude": stations[row.station_id].longitude,
            "source": row.source,
            "raw_payload": json.loads(row.raw_payload_json),
            "analysis": session.get(AnalysisResultRecord, f"analysis:{row.id}").evidence_json
            if row.id.endswith(row.observed_at.isoformat()) and session.get(AnalysisResultRecord, f"analysis:{row.id}") else None,
        } for row in rows]


def count_raw_observations(
    scenario: str,
    station_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> int:
    with session_scope() as session:
        query = select(func.count()).select_from(RawObservationRecord).where(RawObservationRecord.scenario == scenario)
        if station_id:
            query = query.where(RawObservationRecord.station_id == station_id)
        if start:
            query = query.where(RawObservationRecord.observed_at >= start)
        if end:
            query = query.where(RawObservationRecord.observed_at <= end)
        return int(session.scalar(query) or 0)

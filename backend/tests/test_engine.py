from copy import deepcopy

from app.engine import STATION_BLUEPRINTS, _analyze_station, _calc_station_data, build_demo_dashboard


def test_normal_network_has_no_alerts_and_high_trust() -> None:
    dashboard = build_demo_dashboard("normal-weather")
    assert len(dashboard["stations"]) == 12
    assert not dashboard["alerts"]
    assert all(station["trust_score"] >= 75 for station in dashboard["stations"])


def test_all_demo_scenarios_produce_the_expected_detection() -> None:
    targets = {
        "faulty-sensor": ("AWS-004", "sensor_fault"),
        "frozen-sensor": ("AWS-008", "sensor_degradation"),
        "missing-data": ("AWS-010", "data_quality_issue"),
        "gradual-degradation": ("AWS-009", "sensor_degradation"),
    }
    for scenario, (station_id, expected_classification) in targets.items():
        dashboard = build_demo_dashboard(scenario)
        station = next(item for item in dashboard["stations"] if item["id"] == station_id)
        assert station["classification"] == expected_classification

    missing = next(item for item in build_demo_dashboard("missing-data")["stations"] if item["id"] == "AWS-010")
    assert missing["analysis"]["validation"]["status"] == "offline"
    assert missing["analysis"]["validation"]["minutes_since_valid_observation"] > 0

    heatwave = build_demo_dashboard("genuine-heatwave")
    affected = [item for item in heatwave["stations"] if item["id"] in {"AWS-001", "AWS-002", "AWS-003", "AWS-004"}]
    assert all(item["classification"] == "weather_event" for item in affected)
    assert all(item["analysis"]["spatial"]["nearby_count"] > 0 for item in affected)


def test_validation_detects_duplicate_and_out_of_order_observations() -> None:
    records = _calc_station_data(STATION_BLUEPRINTS[0])
    duplicate_records = deepcopy(records)
    duplicate_records[10]["timestamp"] = duplicate_records[8]["timestamp"]

    station = _analyze_station(STATION_BLUEPRINTS[0], duplicate_records)
    validation = station["analysis"]["validation"]
    assert validation["duplicate_packets"] == 1
    assert validation["delayed_packets"] == 1
    assert validation["status"] == "anomaly"

export type Severity = "low" | "medium" | "high" | "critical";
export type StationClassification =
  | "normal"
  | "weather_event"
  | "sensor_fault"
  | "data_quality_issue"
  | "sensor_degradation"
  | "manual_review";

export interface WeatherMetrics {
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  wind_kmh: number | null;
  rainfall_mm: number | null;
  battery_v: number | null;
  signal_strength: number | null;
}

export interface StationSummary {
  id: string;
  name: string;
  state: string;
  district: string;
  lat: number;
  lon: number;
  mode: string;
  last_updated: string;
  trust_score: number;
  sensor_health_score: number;
  anomaly_score: number;
  classification: StationClassification;
  severity: Severity;
  confidence?: number | null;
  metrics: WeatherMetrics;
  data_quality: {
    missing_fields: number;
    duplicate_packets: number;
    stale_window_minutes: number;
    quality_issues: number;
    freshness_ok: boolean;
    explanation: string;
  };
  alert_count: number;
  status: string;
  recommendation: string;
  analysis: {
    validation: Record<string, string | number | boolean | null>;
    temporal: Record<string, string | number | boolean | null>;
    multivariate: Record<string, string | number>;
    ml: Record<string, string | number | boolean>;
    sensor_health: {
      penalties: Record<string, number>;
      weights: Record<string, number>;
      score: number;
    };
    spatial: {
      nearby_count: number;
      median_temperature_c: number | null;
      temperature_difference_c: number | null;
      agreement_ratio: number | null;
      explanation: string;
    };
  };
  history?: Array<Record<string, number | string | null>>;
}

export interface AlertItem {
  id: string;
  station_id: string;
  station_name: string;
  priority: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: number;
  created_at: string;
  recommended_action: string;
  status: "active" | "acknowledged" | "resolved";
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  trust_score?: number;
  sensor_health_score?: number;
  scenario?: string;
  parameter?: string | null;
  observed_value?: number | null;
  nearby_median?: number | null;
  anomaly_type?: string | null;
}

export interface AlertsResponse {
  alerts: AlertItem[];
  count: number;
  total_count: number;
  limit: number;
  offset: number;
  status_counts: Record<AlertItem["status"], number>;
}

export interface OpenMeteoConditions {
  provider: "Open-Meteo";
  data_kind: string;
  disclaimer: string;
  fetched_at: string;
  stations: Array<{
    station_id: string;
    station_name: string;
    district: string;
    state: string;
    latitude: number;
    longitude: number;
    observed_at: string;
    temperature_c: number | null;
    humidity_pct: number | null;
    pressure_hpa: number | null;
    wind_kmh: number | null;
    precipitation_mm: number | null;
    source: "Open-Meteo";
  }>;
}

export interface DashboardSummary {
  stations_monitored: number;
  online: number;
  alerts: number;
  avg_trust_score: number;
  critical: number;
  status: string;
  offline?: number;
  healthy?: number;
  needs_attention?: number;
  avg_sensor_health_score?: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  stations: StationSummary[];
  alerts: AlertItem[];
  generated_at: string;
  scenario: string;
  demo_mode: boolean;
  monitoring?: {
    running: boolean;
    paused: boolean;
    last_run_at: string | null;
    update_interval_seconds: number;
    mode: string;
  };
}

export interface AnomalyItem {
  id: string;
  timestamp: string;
  station_id: string;
  station_name: string;
  parameter: string;
  observed_value: number | null;
  nearby_median: number | null;
  type: string;
  severity: Severity;
  trust_score: number;
  sensor_health_score: number;
  status: string;
  explanation: string;
  recommendation: string;
}

export interface RawObservation {
  id: string;
  station_id: string;
  timestamp: string;
  temperature_c: number | null;
  pressure_hpa: number | null;
  humidity_pct: number | null;
  latitude: number;
  longitude: number;
  source: string;
  validation_status: string;
  issue_status: string;
  trust_score: number | null;
  sensor_health_score: number | null;
}

export interface AnalyticsResponse {
  scenario: string;
  hours: number;
  observation_count: number;
  normal_count: number;
  anomaly_count: number;
  anomalies_by_station: Array<{ station_id: string; name: string; anomalies: number; observations: number }>;
  anomalies_by_type: Array<{ type: string; count: number }>;
  trust_distribution: Array<{ range: string; label: string; count: number }>;
  observation_status: Array<{ status: string; count: number }>;
  anomaly_frequency: Array<{ time: string; normal: number; anomalies: number; health: number; trust: number }>;
  sensor_health_trend: Array<{ time: string; normal: number; anomalies: number; health: number; trust: number }>;
  alerts_by_severity: Array<{ severity: string; count: number }>;
  stations: Array<{ id: string; name: string; trust_score: number; sensor_health_score: number; anomaly_score: number; classification: string }>;
  generated_at: string;
}

export interface StationHealthResponse {
  station_id: string;
  score: number;
  status: string;
  recommendation: string;
  history_hours: number;
  history: Array<{ timestamp: string; score: number; trust_score: number; anomaly_status: string }>;
}

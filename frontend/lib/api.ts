import type { AlertsResponse, AnalyticsResponse, AnomalyItem, DashboardResponse, OpenMeteoConditions, RawObservation, StationHealthResponse, StationSummary } from "@/types/weather";

const DEFAULT_API_BASE_URL = import.meta.env.PROD ? "" : "http://localhost:8000";
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new Error("SkyGuard API is unavailable. Start the backend at http://localhost:8000.");
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {
      // Keep the HTTP error visible even when a response body is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return request<DashboardResponse>("/api/v1/dashboard");
}

export function fetchOpenMeteoConditions(): Promise<OpenMeteoConditions> {
  return request<OpenMeteoConditions>("/api/providers/open-meteo/current", { method: "POST" });
}

export function fetchAlerts(options: {
  includeHistory?: boolean;
  status?: string;
  severity?: string;
  stationId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AlertsResponse> {
  const query = new URLSearchParams();
  if (options.includeHistory) query.set("include_history", "true");
  if (options.status) query.set("status", options.status);
  if (options.severity) query.set("severity", options.severity);
  if (options.stationId) query.set("station_id", options.stationId);
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.offset !== undefined) query.set("offset", String(options.offset));
  return request(`/api/v1/alerts${query.size ? `?${query.toString()}` : ""}`);
}

export function simulateScenario(payload: { station_id?: string; scenario: string }): Promise<{
  scenario: string;
  station: StationSummary | null;
  dashboard: DashboardResponse;
}> {
  return request("/api/v1/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function resetScenario(): Promise<DashboardResponse> {
  return request("/api/scenarios/reset", { method: "POST" });
}

export function updateAlert(alertId: string, action: "acknowledge" | "resolve"): Promise<{ id: string; status: string }> {
  return request(`/api/v1/alerts/${encodeURIComponent(alertId)}/${action}`, { method: "POST" });
}

export function fetchAnomalies(): Promise<{ anomalies: AnomalyItem[]; count: number; scenario: string }> {
  return request("/api/anomalies");
}

export function fetchAnalytics(hours = 24): Promise<AnalyticsResponse> {
  return request(`/api/analytics?hours=${hours}`);
}

export function fetchStationHealth(stationId: string, hours = 24): Promise<StationHealthResponse> {
  return request(`/api/stations/${encodeURIComponent(stationId)}/health?hours=${hours}`);
}

export interface ObservationFilters {
  stationId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function fetchObservations(filters: ObservationFilters = {}): Promise<{ observations: RawObservation[]; count: number; total_count: number; scenario: string }> {
  const query = new URLSearchParams();
  query.set("limit", String(filters.limit ?? 50));
  query.set("offset", String(filters.offset ?? 0));
  if (filters.stationId) query.set("station_id", filters.stationId);
  if (filters.startDate) query.set("start_date", `${filters.startDate}T00:00:00Z`);
  if (filters.endDate) query.set("end_date", `${filters.endDate}T23:59:59.999Z`);
  return request(`/api/v1/observations?${query.toString()}`);
}

export function fetchSettings(): Promise<{ settings: Record<string, number>; prototype_defaults: Record<string, number>; using_prototype_defaults: boolean }> {
  return request("/api/settings");
}

export function fetchModelStatus(): Promise<{ model: string; status: string; random_state: number; training_window: string; calibrated_probability: false }> {
  return request("/api/model/status");
}

export function retrainModel(): Promise<{ status: string; message: string; random_state: number }> {
  return request("/api/model/retrain", { method: "POST" });
}

export function saveSettings(values: Record<string, number>): Promise<{ settings: Record<string, number>; message: string }> {
  return request("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export function monitoringAction(action: "start" | "pause" | "stop"): Promise<{ monitoring: Record<string, unknown> }> {
  return request(`/api/monitoring/${action}`, { method: "POST" });
}

export function rawExportUrl(filters: Pick<ObservationFilters, "stationId" | "startDate" | "endDate"> = {}): string {
  const query = new URLSearchParams();
  if (filters.stationId) query.set("station_id", filters.stationId);
  if (filters.startDate) query.set("start_date", `${filters.startDate}T00:00:00Z`);
  if (filters.endDate) query.set("end_date", `${filters.endDate}T23:59:59.999Z`);
  return `${API_BASE_URL}/api/observations/export/csv${query.size ? `?${query.toString()}` : ""}`;
}

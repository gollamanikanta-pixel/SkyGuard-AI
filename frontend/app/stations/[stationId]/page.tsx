"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchDashboard, fetchStationHealth } from "@/lib/api";
import { Link } from "@/lib/router-link";

const numericValue = (value: number | string | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function HistoryChart({
  title,
  field,
  data,
  color,
  unit,
  anomalyMarker,
}: {
  title: string;
  field: "temperature" | "pressure" | "humidity";
  data: Array<{ time: string; [key: string]: string | number | null }>;
  color: string;
  unit: string;
  anomalyMarker?: boolean;
}) {
  const latest = data.at(-1);
  return (
    <section className="panel rounded-2xl p-4 sm:p-5">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <div className="mt-4 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#64748b" />
            <YAxis width={54} stroke="#64748b" />
            <Tooltip formatter={(value) => [`${value} ${unit}`, title]} />
            <Line type="monotone" dataKey={field} name={title} stroke={color} strokeWidth={2} dot={false} connectNulls={false} />
            {anomalyMarker && latest && typeof latest[field] === "number" && (
              <ReferenceDot x={latest.time} y={latest[field] as number} r={5} fill="#dc2626" stroke="#fff" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function StationDetailPage() {
  const params = useParams();
  const stationId = params.stationId ?? "";
  const [hours, setHours] = useState(24);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const healthQuery = useQuery({
    queryKey: ["station-health", stationId, hours],
    queryFn: () => fetchStationHealth(stationId, hours),
    enabled: Boolean(stationId),
    refetchInterval: data?.monitoring?.running && !data.monitoring.paused ? 15_000 : false,
  });
  const station = data?.stations.find((item) => item.id === stationId);
  const chartData = useMemo(() => {
    if (!station) return [];
    const records = (station.history ?? []).flatMap((row) => {
      const timestamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : Number.NaN;
      if (!Number.isFinite(timestamp)) return [];
      return [{
        timestamp,
        time: new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        temperature: numericValue(row.temperature_c),
        pressure: numericValue(row.pressure_hpa),
        humidity: numericValue(row.humidity_pct),
      }];
    });
    if (records.length === 0) return [];
    const newest = records[records.length - 1].timestamp;
    const cutoff = newest - hours * 60 * 60 * 1000;
    return records.filter((row) => row.timestamp >= cutoff);
  }, [station, hours]);
  const scoreData = useMemo(() => {
    const records = healthQuery.data?.history ?? [];
    return records.map((row) => ({
      time: new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      health: row.score,
      trust: row.trust_score,
    }));
  }, [healthQuery.data]);

  if (isLoading || healthQuery.isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading station detail…</div>;
  if (isError || healthQuery.isError || !data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : healthQuery.error instanceof Error ? healthQuery.error.message : "Unable to load station details."}</div>;
  if (!station) return <div role="alert" className="panel rounded-2xl p-8 text-slate-700">Station not found.</div>;

  const activeAlerts = data.alerts.filter((alert) => alert.station_id === station.id && alert.status !== "resolved");
  const latest = chartData.at(-1);

  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <Link href="/stations" className="text-sm font-semibold text-sky-800 hover:underline">← All stations</Link>
            <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-sky-800">{station.id} · {station.state}</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">{station.name}</h1>
            <p className="mt-2 text-sm text-slate-600">Simulated station · {station.district} · {station.lat.toFixed(3)}, {station.lon.toFixed(3)}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${station.classification === "normal" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {station.classification.replaceAll("_", " ")}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Temperature</p><p className="mt-1 text-2xl font-bold text-slate-900">{station.metrics.temperature_c ?? "—"}°C</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Pressure</p><p className="mt-1 text-2xl font-bold text-slate-900">{station.metrics.pressure_hpa ?? "—"} hPa</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Humidity</p><p className="mt-1 text-2xl font-bold text-slate-900">{station.metrics.humidity_pct ?? "—"}%</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Last simulated update</p><p className="mt-1 text-sm font-bold text-slate-900">{new Date(station.last_updated).toLocaleString()}</p></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-sky-50 p-4"><p className="text-sm text-sky-900">Data trust · not a probability</p><p className="mt-1 text-2xl font-bold text-sky-900">{station.trust_score}<span className="text-sm font-medium"> / 100</span></p></div>
          <div className="rounded-xl bg-emerald-50 p-4"><p className="text-sm text-emerald-900">Longer-term sensor health</p><p className="mt-1 text-2xl font-bold text-emerald-900">{station.sensor_health_score}<span className="text-sm font-medium"> / 100</span></p></div>
        </div>
      </section>

      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h2 className="font-bold text-slate-900">Observation history</h2><p className="mt-1 text-sm text-slate-600">Original simulated readings; a red marker indicates the current flagged observation.</p></div>
          <label className="text-sm font-semibold text-slate-700">Time window
            <select value={hours} onChange={(event) => setHours(Number(event.target.value))} className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-3">
              <option value={1}>1 hour</option><option value={6}>6 hours</option><option value={24}>24 hours</option>
            </select>
          </label>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <HistoryChart title="Temperature" field="temperature" data={chartData} color="#0284c7" unit="°C" anomalyMarker={station.classification !== "normal" && latest?.temperature != null} />
        <HistoryChart title="Atmospheric pressure" field="pressure" data={chartData} color="#0f766e" unit="hPa" />
        <HistoryChart title="Relative humidity" field="humidity" data={chartData} color="#7c3aed" unit="%" />
      </section>

      <section className="panel rounded-2xl p-4 sm:p-5">
        <h2 className="font-bold text-slate-900">Trust and sensor-health history</h2>
        <p className="mt-1 text-sm text-slate-600">Score snapshots are stored when scenarios run and while monitoring is active.</p>
        {scoreData.length < 2 ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Only {scoreData.length} stored score snapshot{scoreData.length === 1 ? "" : "s"} available. Start simulated monitoring to build a score trend.</p>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip />
                <Line type="monotone" dataKey="trust" name="Data trust" stroke="#0284c7" dot={false} />
                <Line type="monotone" dataKey="health" name="Sensor health" stroke="#0f766e" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-2xl p-4 sm:p-5">
          <h2 className="font-bold text-slate-900">Why this result?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{station.data_quality.explanation}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold text-slate-900">Reading checks</h3><p className="mt-1 text-sm text-slate-600">Status: {String(station.analysis.validation.status)}. {station.analysis.validation.out_of_range ? "One or more values are outside the configured range." : "No latest range failure detected."}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold text-slate-900">Change over time</h3><p className="mt-1 text-sm text-slate-600">{station.analysis.temporal.temperature_difference_c == null ? "No current temperature to compare." : `${Math.abs(Number(station.analysis.temporal.temperature_difference_c)).toFixed(1)}°C from the recent station baseline.`}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold text-slate-900">Nearby station check</h3><p className="mt-1 text-sm text-slate-600">{station.analysis.spatial.explanation} {station.analysis.spatial.nearby_count} nearby stations considered.</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold text-slate-900">Reading consistency</h3><p className="mt-1 text-sm text-slate-600">{station.analysis.multivariate.reason}</p></div>
          </div>
          <details className="mt-4 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Technical evidence</summary>
            <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <dt>Isolation Forest flag</dt><dd>{String(station.analysis.ml.anomaly_flag)} · score is not a probability</dd>
              <dt>Model decision score</dt><dd>{String(station.analysis.ml.decision_score)}</dd>
              <dt>Nearby temperature median</dt><dd>{station.analysis.spatial.median_temperature_c ?? "Unavailable"}</dd>
              <dt>Suggested next step</dt><dd>{station.recommendation}</dd>
            </dl>
            <h3 className="mt-4 text-sm font-semibold text-slate-800">Sensor-health score contributions</h3>
            <ul className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              {Object.entries(station.analysis.sensor_health.penalties).map(([factor, penalty]) => (
                <li key={factor} className="rounded-lg bg-slate-50 p-3 capitalize">{factor}: {penalty} penalty × {station.analysis.sensor_health.weights[factor] ?? 0}% weight</li>
              ))}
            </ul>
          </details>
        </div>
        <div className="panel rounded-2xl p-4 sm:p-5">
          <h2 className="font-bold text-slate-900">Active alerts</h2>
          {activeAlerts.length ? (
            <ul className="mt-3 space-y-3">
              {activeAlerts.map((alert) => (
                <li key={alert.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-semibold text-amber-950">{alert.title}</p>
                  <p className="mt-1 text-sm text-amber-900">{alert.description}</p>
                  <p className="mt-2 text-xs font-medium text-amber-900">Suggested action: {alert.recommended_action}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">No active alerts for this station in the current scenario.</p>}
        </div>
      </section>
      <p className="text-xs leading-5 text-slate-500">All station data is simulated. Trust and health scores are prototype indicators, not scientifically certified diagnoses.</p>
    </div>
  );
}

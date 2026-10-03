"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchAnalytics } from "@/lib/api";

const COLORS = ["#0284c7", "#0f766e", "#d97706", "#dc2626", "#7c3aed"];
const tooltipStyle = { backgroundColor: "#fff", borderColor: "#cbd5e1", borderRadius: 12, color: "#0f172a" };

function ChartPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="panel rounded-2xl p-4 sm:p-5">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-4 h-64">{children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const [hours, setHours] = useState(24);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", hours],
    queryFn: () => fetchAnalytics(hours),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading stored analytics…</div>;
  if (isError || !data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : "Unable to load analytics."}</div>;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-800">Stored simulated analysis</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Network Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Explore stored station analysis for <span className="font-semibold">{data.scenario.replaceAll("-", " ")}</span>. Scores are prototype indicators, not calibrated probabilities.
          </p>
        </div>
        <label className="text-sm font-semibold text-slate-700">
          Time window
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value={1}>Last hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel rounded-xl p-4"><p className="text-sm text-slate-600">Stored evaluations</p><p className="mt-1 text-2xl font-bold text-slate-900">{data.observation_count}</p></div>
        <div className="panel rounded-xl p-4"><p className="text-sm text-slate-600">Consistent evaluations</p><p className="mt-1 text-2xl font-bold text-emerald-800">{data.normal_count}</p></div>
        <div className="panel rounded-xl p-4"><p className="text-sm text-slate-600">Needs review</p><p className="mt-1 text-2xl font-bold text-amber-800">{data.anomaly_count}</p></div>
      </section>

      {!data.observation_count && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          There are no stored evaluation snapshots in this time window yet. Start simulated monitoring to build a time series; scenario results will appear as new evaluations are stored.
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Evaluations by station" description="Stored non-normal evaluations in the selected time window.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.anomalies_by_station} margin={{ left: 8, right: 12 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="station_id" tick={{ fontSize: 10 }} stroke="#64748b" />
              <YAxis allowDecimals={false} stroke="#64748b" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="anomalies" name="Needs review" fill="#e87937" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Possible issue types" description="Classification counts from stored evaluations.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.anomalies_by_type} margin={{ bottom: 28 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="type" interval={0} angle={-15} textAnchor="end" tick={{ fontSize: 9 }} stroke="#64748b" />
              <YAxis allowDecimals={false} stroke="#64748b" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Evaluations" fill="#8b5cf6" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Trust Score distribution" description="Distribution of stored scores; a score is not a probability.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trust_distribution}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="range" stroke="#64748b" />
              <YAxis allowDecimals={false} stroke="#64748b" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Evaluations" radius={[5, 5, 0, 0]}>
                {data.trust_distribution.map((item, index) => <Cell key={item.range} fill={COLORS[index % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Sensor Health over time" description="Average stored sensor-health snapshots in each time bucket.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.sensor_health_trend}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="time" tickFormatter={(value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tick={{ fontSize: 10 }} stroke="#64748b" />
              <YAxis domain={[0, 100]} stroke="#64748b" />
              <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="health" name="Sensor health" stroke="#0f766e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Normal and review-needed" description="Stored analysis records in the selected window.">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.observation_status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={86} label={({ name, value }) => `${name}: ${value}`}>
                {data.observation_status.map((item, index) => <Cell key={item.status} fill={index === 0 ? "#16a34a" : "#e87937"} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Issue frequency over time" description="Hourly counts from persisted analysis snapshots.">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.anomaly_frequency}>
              <defs><linearGradient id="issue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#e87937" stopOpacity={0.45} /><stop offset="95%" stopColor="#e87937" stopOpacity={0.03} /></linearGradient></defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="time" tickFormatter={(value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tick={{ fontSize: 10 }} stroke="#64748b" />
              <YAxis allowDecimals={false} stroke="#64748b" />
              <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="anomalies" name="Needs review" stroke="#c2410c" fill="url(#issue-fill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Alerts by severity" description="Current scenario alerts, grouped by severity.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.alerts_by_severity}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="severity" tick={{ fontSize: 10 }} stroke="#64748b" />
              <YAxis allowDecimals={false} stroke="#64748b" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Alerts" fill="#e87937" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Station reliability comparison" description="Current prototype trust and sensor-health indicators by station.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.stations}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="id" tick={{ fontSize: 10 }} stroke="#64748b" />
              <YAxis domain={[0, 100]} stroke="#64748b" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="trust_score" name="Data trust" fill="#0284c7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sensor_health_score" name="Sensor health" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <p className="text-xs leading-5 text-slate-500">Data is simulated. Historical trend charts reflect persisted analysis snapshots; a longer time range becomes useful as simulated monitoring runs.</p>
    </div>
  );
}

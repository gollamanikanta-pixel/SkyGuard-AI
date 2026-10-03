"use client";

import { Link } from "@/lib/router-link";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, Gauge, HeartPulse, MapPinned, ShieldCheck, Thermometer } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { IndiaMap } from "@/components/india-map";
import { MonitoringControls } from "@/components/monitoring-controls";
import { OpenMeteoReference } from "@/components/open-meteo-reference";
import { fetchDashboard } from "@/lib/api";

function SummaryCard({ label, value, description, icon: Icon, tone }: { label: string; value: string | number; description: string; icon: typeof Activity; tone: string }) {
  return (
    <div className="metric-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
        </div>
        <span className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><Icon aria-hidden="true" className="h-5 w-5" /></span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function errorPanel(message: string) {
  return <div role="alert" className="panel rounded-2xl p-6 text-rose-700">{message}</div>;
}

export default function HomePage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });

  if (isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading station data…</div>;
  if (isError || !data) return errorPanel(error instanceof Error ? error.message : "Unable to load dashboard data.");

  const chartData = data.stations.map((station) => ({
    name: station.name.split(" ")[0],
    trust: station.trust_score,
    health: station.sensor_health_score,
  }));

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-sky-800">Demo network · India</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Weather Station Overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">Monitor station health, data quality, and unusual weather readings.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <MonitoringControls />
          <Link href="/simulation" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800">
            <Activity className="h-4 w-4" /> Run a demo scenario <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>Demo data mode.</strong> All observations are simulated for prototype demonstration; they are not live IMD data.</p>
      </div>

      <OpenMeteoReference />

      <section aria-label="Station network summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label="Total stations" value={data.summary.stations_monitored} description="Simulated stations in the network" icon={MapPinned} tone="text-sky-800" />
        <SummaryCard label="Working normally" value={data.summary.healthy ?? data.summary.online} description="Reporting without a current issue" icon={ShieldCheck} tone="text-emerald-800" />
        <SummaryCard label="Needs attention" value={data.summary.needs_attention ?? data.summary.alerts} description={`${data.summary.offline ?? 0} currently offline`} icon={AlertTriangle} tone="text-amber-800" />
        <SummaryCard label="Active alerts" value={data.summary.alerts} description={`${data.summary.critical} marked critical`} icon={Activity} tone="text-rose-800" />
        <SummaryCard label="Average data trust" value={`${Math.round(data.summary.avg_trust_score)} / 100`} description="How consistent observations appear" icon={Gauge} tone="text-sky-800" />
        <SummaryCard label="Average sensor health" value={`${Math.round(data.summary.avg_sensor_health_score ?? 0)} / 100`} description="Longer-term sensor reliability estimate" icon={HeartPulse} tone="text-emerald-800" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Station locations</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Network map</h2>
            </div>
            <Link href="/stations" className="text-sm font-semibold text-sky-800 hover:underline">View stations <ArrowRight className="inline h-4 w-4" /></Link>
          </div>
          <IndiaMap stations={data.stations} />
          <p className="mt-3 text-xs text-slate-500">Marker labels describe station state; data shown is simulated.</p>
        </div>

        <div className="panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Review queue</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Needs your attention</h2>
            </div>
            <Link href="/alerts" className="text-sm font-semibold text-sky-800 hover:underline">All alerts <ArrowRight className="inline h-4 w-4" /></Link>
          </div>
          {data.alerts.length ? (
            <div className="divide-y divide-slate-100">
              {data.alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-2.5">
                      <span className={`mt-0.5 rounded-lg p-1.5 ${alert.severity === "critical" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}><AlertTriangle className="h-4 w-4" /></span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{alert.station_name} · {alert.status}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">{alert.severity}</span>
                  </div>
                  <p className="mt-2 pl-9 text-xs leading-5 text-slate-600">{alert.recommended_action}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900">No active alerts. The network is in its normal demo state.</div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><Gauge className="h-5 w-5 text-sky-700" /><div><h2 className="font-bold text-slate-900">Data trust by station</h2><p className="text-xs text-slate-500">Higher scores mean readings align better with available evidence.</p></div></div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid stroke="#e5edf2" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#647b8e" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#647b8e" tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="trust" name="Data trust" stroke="#1676a8" fill="#b7e3f5" fillOpacity={0.75} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><Thermometer className="h-5 w-5 text-emerald-700" /><div><h2 className="font-bold text-slate-900">Sensor health by station</h2><p className="text-xs text-slate-500">A prototype estimate of longer-term sensor reliability.</p></div></div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid stroke="#e5edf2" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#647b8e" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#647b8e" tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="health" name="Sensor health" stroke="#238463" fill="#c5eadb" fillOpacity={0.8} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div><h2 className="font-bold text-slate-900">Station status</h2><p className="text-xs text-slate-500">Latest simulated measurements across the network.</p></div>
          <Link href="/stations" className="text-sm font-semibold text-sky-800 hover:underline">Open station list <ArrowRight className="inline h-4 w-4" /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>{["Station", "State", "Temperature", "Data trust", "Sensor health", "Next step"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {data.stations.slice(0, 8).map((station) => (
                <tr key={station.id} className="border-t border-slate-100">
                  <td className="px-4 py-3"><Link className="font-semibold text-sky-800 hover:underline" href={`/stations/${station.id}`}>{station.name}</Link><div className="text-xs text-slate-500">{station.id} · {station.district}</div></td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">{station.status === "normal" ? "Working normally" : station.status === "offline" ? "Data delayed" : "Needs attention"}</span></td>
                  <td className="px-4 py-3 text-slate-700">{station.metrics.temperature_c == null ? "No recent reading" : `${station.metrics.temperature_c.toFixed(1)}°C`}</td>
                  <td className="px-4 py-3 font-semibold text-sky-800">{station.trust_score}/100</td>
                  <td className="px-4 py-3 font-semibold text-emerald-800">{station.sensor_health_score}/100</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate-600">{station.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-center text-xs text-slate-500">Prototype scores are advisory indicators, not probabilities or official weather warnings.</p>
    </div>
  );
}

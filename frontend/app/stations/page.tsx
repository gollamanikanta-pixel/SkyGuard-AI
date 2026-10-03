"use client";

import { Link } from "@/lib/router-link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { fetchDashboard } from "@/lib/api";

export default function StationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const stations = useMemo(() => (data?.stations ?? [])
    .filter((station) => status === "all" || (status === "normal" ? station.status === "normal" : station.status !== "normal"))
    .filter((station) => `${station.id} ${station.name} ${station.district} ${station.state}`.toLowerCase().includes(search.toLowerCase())), [data, search, status]);

  if (isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading station readings…</div>;
  if (isError || !data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : "Unable to load station readings."}</div>;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-sky-800">Simulated station network</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Weather Stations</h1><p className="mt-2 text-sm text-slate-600">Search and inspect station readings, Data Trust, Sensor Health, and analysis details.</p></div>
        <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Demo data only · {data.stations.length} stations</span>
      </section>
      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 sm:max-w-lg"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search by station or location" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by station name, city, or state" className="w-full bg-transparent text-sm outline-none" /></label>
          <label className="text-sm font-medium text-slate-700">Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All stations</option><option value="normal">Working normally</option><option value="attention">Needs attention</option></select>
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">{stations.length} stations match these filters.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{["Station and location", "Status", "Temperature", "Pressure", "Humidity", "Data trust", "Sensor health", "Last observation", ""].map((label, index) => <th key={`${label}-${index}`} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id} className="border-t border-slate-100">
                  <td className="px-3 py-3"><Link href={`/stations/${station.id}`} className="font-semibold text-sky-800 hover:underline">{station.name}</Link><div className="text-xs text-slate-500">{station.id} · {station.district}, {station.state}</div></td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${station.status === "normal" ? "bg-emerald-50 text-emerald-900" : station.status === "offline" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>{station.status === "normal" ? "Working normally" : station.status === "offline" ? "Data delayed" : "Needs attention"}</span></td>
                  <td className="px-3 py-3">{station.metrics.temperature_c == null ? "Missing" : `${station.metrics.temperature_c.toFixed(1)}°C`}</td>
                  <td className="px-3 py-3">{station.metrics.pressure_hpa == null ? "Missing" : `${station.metrics.pressure_hpa.toFixed(1)} hPa`}</td>
                  <td className="px-3 py-3">{station.metrics.humidity_pct == null ? "Missing" : `${station.metrics.humidity_pct.toFixed(1)}%`}</td>
                  <td className="px-3 py-3 font-semibold text-sky-800">{station.trust_score}/100</td>
                  <td className="px-3 py-3 font-semibold text-emerald-800">{station.sensor_health_score}/100</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{new Date(station.last_updated).toLocaleString()}</td>
                  <td className="px-3 py-3"><Link href={`/stations/${station.id}`} className="font-semibold text-sky-800 hover:underline">Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!stations.length && <p className="p-8 text-center text-sm text-slate-600">No stations match these filters.</p>}
      </section>
    </div>
  );
}

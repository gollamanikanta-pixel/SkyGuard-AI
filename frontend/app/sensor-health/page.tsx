"use client";

import { Link } from "@/lib/router-link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { fetchDashboard } from "@/lib/api";

export default function SensorHealthPage() {
  const [inspectionOnly, setInspectionOnly] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const stations = useMemo(() => (data?.stations ?? [])
    .filter((station) => !inspectionOnly || station.sensor_health_score < 75 || station.status !== "normal")
    .filter((station) => `${station.name} ${station.id} ${station.state}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.sensor_health_score - b.sensor_health_score), [data, inspectionOnly, search]);

  if (isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading sensor health…</div>;
  if (isError || !data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : "Unable to load sensor health."}</div>;

  const chartData = stations.map((station) => ({ name: station.id, health: station.sensor_health_score }));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-800">Longer-term estimate</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Sensor Health</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Sensor health estimates how reliable a station appears over its available demo history. One unusual reading should not be treated as proof of a failed sensor.</p>
      </section>
      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-emerald-700" /><h2 className="font-bold text-slate-900">Health comparison</h2></div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid stroke="#e5edf2" strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} stroke="#647b8e" />
              <YAxis type="category" dataKey="name" width={90} stroke="#647b8e" />
              <Tooltip />
              <Bar dataKey="health" name="Sensor health" fill="#238463" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h2 className="font-bold text-slate-900">Station reliability list</h2><p className="text-xs text-slate-500">{stations.length} stations shown, lowest health first.</p></div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search stations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stations" className="w-36 bg-transparent outline-none" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={inspectionOnly} onChange={(event) => setInspectionOnly(event.target.checked)} />Needs inspection</label>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[800px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{["Station", "Health", "Health status", "Data state", "Recent concern", "Suggested next step"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id} className="border-t border-slate-100">
                  <td className="px-3 py-3"><Link href={`/stations/${station.id}`} className="font-semibold text-sky-800 hover:underline">{station.name}</Link><div className="text-xs text-slate-500">{station.id} · {station.state}</div></td>
                  <td className="px-3 py-3 font-bold text-slate-900">{station.sensor_health_score}/100</td>
                  <td className="px-3 py-3">{station.sensor_health_score < 50 ? "Needs inspection" : station.sensor_health_score < 75 ? "Watch" : "Good"}</td>
                  <td className="px-3 py-3 capitalize">{station.status.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 text-slate-600">{station.analysis.validation.frozen ? "Repeated readings" : station.analysis.validation.missing_latest_fields ? "Latest values missing" : station.classification === "normal" ? "No current concern" : station.classification.replaceAll("_", " ")}</td>
                  <td className="max-w-sm px-3 py-3 text-xs leading-5 text-slate-600">{station.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-slate-500">Health scores are prototype estimates computed from simulated evidence, not a certified maintenance diagnosis.</p>
    </div>
  );
}

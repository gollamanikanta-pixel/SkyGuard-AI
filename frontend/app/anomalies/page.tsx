"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";

import { fetchAnomalies, fetchDashboard } from "@/lib/api";
import { Link } from "@/lib/router-link";

const PAGE_SIZE = 25;

export default function AnomaliesPage() {
  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "trust-low" | "trust-high">("newest");
  const [page, setPage] = useState(1);
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const anomaliesQuery = useQuery({
    queryKey: ["anomalies"],
    queryFn: fetchAnomalies,
    refetchInterval: dashboardQuery.data?.monitoring?.running && !dashboardQuery.data.monitoring.paused ? 15_000 : false,
  });
  const filtered = useMemo(() => (anomaliesQuery.data?.anomalies ?? [])
    .filter((item) => stationFilter === "all" || item.station_id === stationFilter)
    .filter((item) => severity === "all" || item.severity === severity)
    .filter((item) => type === "all" || item.type === type)
    .filter((item) => status === "all" || item.status === status)
    .filter((item) => !startDate || item.timestamp.slice(0, 10) >= startDate)
    .filter((item) => !endDate || item.timestamp.slice(0, 10) <= endDate)
    .filter((item) => `${item.station_name} ${item.station_id} ${item.type}`.toLowerCase().includes(search.toLowerCase()))
    .sort((left, right) => sort === "newest" ? right.timestamp.localeCompare(left.timestamp)
      : sort === "oldest" ? left.timestamp.localeCompare(right.timestamp)
        : sort === "trust-low" ? left.trust_score - right.trust_score
          : right.trust_score - left.trust_score), [anomaliesQuery.data, stationFilter, severity, type, status, startDate, endDate, search, sort]);

  if (anomaliesQuery.isLoading || dashboardQuery.isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Checking current station results…</div>;
  if (anomaliesQuery.isError || dashboardQuery.isError || !anomaliesQuery.data || !dashboardQuery.data) {
    const error = anomaliesQuery.error ?? dashboardQuery.error;
    return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : "Unable to load detected issues."}</div>;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-800">Current scenario · {anomaliesQuery.data.scenario.replaceAll("-", " ")}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Detected Issues</h1>
        <p className="mt-2 text-sm text-slate-600">Possible problems in simulated data, not confirmed equipment faults. Alert status is retained when operators acknowledge or resolve alerts.</p>
      </section>
      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Search
            <span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="w-full bg-transparent text-sm outline-none" placeholder="Station or issue" /></span>
          </label>
          <label className="text-sm font-medium text-slate-700">Station
            <select value={stationFilter} onChange={(event) => { setStationFilter(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All stations</option>{dashboardQuery.data.stations.map((station) => <option key={station.id} value={station.id}>{station.id} · {station.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Severity
            <select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Issue type
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All types</option>{[...new Set(anomaliesQuery.data.anomalies.map((item) => item.type))].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Alert status
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All statuses</option><option value="active">Active</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">From date
            <input type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">To date
            <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">Sort results
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="trust-low">Lowest trust first</option><option value="trust-high">Highest trust first</option>
            </select>
          </label>
        </div>
        <p className="mt-4 text-xs text-slate-500">{filtered.length} matching issues in the current simulated scenario.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[1000px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{["Time", "Station", "Reading", "Nearby median", "Possible issue", "Trust", "Severity", "Alert status", "Details"].map((column) => <th key={column} className="px-3 py-3">{column}</th>)}</tr></thead>
            <tbody>
              {pageRows.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 text-xs text-slate-500">{new Date(item.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-3"><Link href={`/stations/${item.station_id}`} className="font-semibold text-sky-800 hover:underline">{item.station_name}</Link><div className="text-xs text-slate-500">{item.station_id}</div></td>
                  <td className="px-3 py-3 text-slate-700">{item.observed_value == null ? "Missing" : `${item.observed_value}°C`}</td>
                  <td className="px-3 py-3 text-slate-700">{item.nearby_median == null ? "Not available" : `${item.nearby_median}°C`}</td>
                  <td className="px-3 py-3 capitalize text-slate-700">{item.type.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 font-semibold text-sky-800">{item.trust_score}/100</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold capitalize text-amber-900">{item.severity}</span></td>
                  <td className="px-3 py-3 capitalize text-slate-700">{item.status}</td>
                  <td className="px-3 py-3"><details className="max-w-xs"><summary className="cursor-pointer font-semibold text-sky-800">Why flagged?</summary><p className="mt-2 text-xs leading-5 text-slate-600">{item.explanation}</p><p className="mt-2 text-xs text-slate-700"><strong>Next:</strong> {item.recommendation}</p></details></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <div className="mt-4 rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-900"><AlertTriangle className="mx-auto mb-2 h-5 w-5" />No issues match these filters.</div>}
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">Previous</button>
          <span className="text-xs text-slate-600">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">Next</button>
        </div>
      </section>
    </div>
  );
}

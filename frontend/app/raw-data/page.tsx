"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";

import { fetchDashboard, fetchObservations, rawExportUrl } from "@/lib/api";

const PAGE_SIZE = 50;

export default function RawDataPage() {
  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [validationFilter, setValidationFilter] = useState("all");
  const [issueFilter, setIssueFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortDirection, setSortDirection] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const dateRangeValid = !startDate || !endDate || startDate <= endDate;
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const observations = useQuery({
    queryKey: ["observations", stationFilter, startDate, endDate, page],
    queryFn: () => fetchObservations({
      stationId: stationFilter === "all" ? undefined : stationFilter,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    enabled: dateRangeValid,
    refetchInterval: dashboard.data?.monitoring?.running && !dashboard.data.monitoring.paused ? 15_000 : false,
  });

  const rows = useMemo(() => (observations.data?.observations ?? [])
    .filter((item) => `${item.station_id} ${item.timestamp}`.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => validationFilter === "all" || item.validation_status.toLowerCase().startsWith(validationFilter))
    .filter((item) => issueFilter === "all" || item.issue_status.toLowerCase().startsWith(issueFilter))
    .sort((left, right) => sortDirection === "newest"
      ? right.timestamp.localeCompare(left.timestamp)
      : left.timestamp.localeCompare(right.timestamp)), [observations.data, search, validationFilter, issueFilter, sortDirection]);

  if (dashboard.isLoading || observations.isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading stored observations…</div>;
  if (dashboard.isError || observations.isError) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{(observations.error ?? dashboard.error) instanceof Error ? (observations.error ?? dashboard.error)?.message : "Unable to load observations."}</div>;
  if (!dashboard.data || !observations.data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">Observation data is unavailable.</div>;

  const totalCount = observations.data.total_count;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstRow = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-800">Original values and calculated results</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Raw Weather Observations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Original simulated readings are kept separate from analysis results. Historical rows are not individually scored; the latest reading shows the station’s current analysis.</p>
      </section>

      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Search current page
            <span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search raw observations" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Station ID or timestamp" /></span>
          </label>
          <label className="text-sm font-medium text-slate-700">Station
            <select aria-label="Filter by station" value={stationFilter} onChange={(event) => { setStationFilter(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All stations</option>{dashboard.data.stations.map((station) => <option key={station.id} value={station.id}>{station.id} · {station.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Validation
            <select value={validationFilter} onChange={(event) => setValidationFilter(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All validation results</option><option value="normal">Normal</option><option value="warning">Warning</option><option value="anomaly">Anomaly</option><option value="offline">Offline</option><option value="historical">Historical</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Issue status
            <select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">All issue results</option><option value="normal">Normal</option><option value="sensor">Sensor issue</option><option value="data_quality">Data quality</option><option value="weather_event">Weather event</option><option value="historical">Historical</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">From date
            <input type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">To date
            <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">Sort time
            <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "newest" | "oldest")} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
            </select>
          </label>
          <div className="flex items-end">
            <a href={rawExportUrl({ stationId: stationFilter === "all" ? undefined : stationFilter, startDate: startDate || undefined, endDate: endDate || undefined })} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800"><Download className="h-4 w-4" />Export filtered CSV</a>
          </div>
        </div>
        {!dateRangeValid && <p role="alert" className="mt-3 text-sm text-rose-700">The start date must be before or equal to the end date.</p>}
      </section>

      <section className="panel overflow-hidden rounded-2xl">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center">
          <div><h2 className="font-bold text-slate-900">Stored demo readings</h2><p className="text-xs text-slate-500">{firstRow}–{lastRow} of {totalCount} observations · {observations.data.scenario.replaceAll("-", " ")}</p></div>
          <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Simulated data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full text-left text-xs">
            <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
              <tr>{["Observed at (UTC)", "Station", "Temperature", "Pressure", "Humidity", "Latitude", "Longitude", "Source", "Validation", "Issue status", "Data trust", "Sensor health"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{new Date(row.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{row.station_id}</td>
                  <td className="px-3 py-2.5 text-slate-700">{row.temperature_c == null ? "Missing" : `${row.temperature_c.toFixed(2)}°C`}</td>
                  <td className="px-3 py-2.5 text-slate-700">{row.pressure_hpa == null ? "Missing" : `${row.pressure_hpa.toFixed(2)} hPa`}</td>
                  <td className="px-3 py-2.5 text-slate-700">{row.humidity_pct == null ? "Missing" : `${row.humidity_pct.toFixed(2)}%`}</td>
                  <td className="px-3 py-2.5 text-slate-600">{row.latitude.toFixed(3)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{row.longitude.toFixed(3)}</td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">{row.source}</td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">{row.validation_status}</td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">{row.issue_status.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2.5 text-slate-700">{row.trust_score == null ? "—" : `${row.trust_score}/100`}</td>
                  <td className="px-3 py-2.5 text-slate-700">{row.sensor_health_score == null ? "—" : `${row.sensor_health_score}/100`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="p-8 text-center text-sm text-slate-600">No observations match this page and filter combination.</p>}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">Raw measurements are preserved separately from calculated analysis.</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">Previous</button>
            <span className="whitespace-nowrap text-xs text-slate-600">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCheck, CheckCircle2, Clock3 } from "lucide-react";

import { fetchAlerts, fetchDashboard, updateAlert } from "@/lib/api";

const ALERT_PAGE_SIZE = 25;

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [page, setPage] = useState(0);
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["alerts", { statusFilter, severityFilter, stationFilter, page }],
    queryFn: () => fetchAlerts({
      includeHistory: true,
      status: statusFilter === "all" ? undefined : statusFilter,
      severity: severityFilter === "all" ? undefined : severityFilter,
      stationId: stationFilter === "all" ? undefined : stationFilter,
      limit: ALERT_PAGE_SIZE,
      offset: page * ALERT_PAGE_SIZE,
    }),
    refetchInterval: dashboard.data?.monitoring?.running && !dashboard.data.monitoring.paused ? 15_000 : false,
  });
  const action = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "acknowledge" | "resolve" }) => updateAlert(id, next),
    onSuccess: async () => {
      setPage(0);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });
  const alerts = data?.alerts ?? [];

  if (isLoading || dashboard.isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading alerts…</div>;
  if (isError || dashboard.isError || !data || !dashboard.data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : dashboard.error instanceof Error ? dashboard.error.message : "Unable to load alerts."}</div>;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-sky-800">Review and follow up</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Alerts</h1>
        <p className="mt-2 text-sm text-slate-600">Alerts are advisory findings from simulated observations. Acknowledging or resolving one keeps its history.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Active", value: data.status_counts.active ?? 0, icon: AlertTriangle },
          { label: "Acknowledged", value: data.status_counts.acknowledged ?? 0, icon: CheckCheck },
          { label: "Resolved", value: data.status_counts.resolved ?? 0, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="metric-card flex items-center gap-3 rounded-2xl p-4"><span className="rounded-xl bg-sky-50 p-2 text-sky-800"><Icon className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div></div>)}
      </section>

      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h2 className="font-bold text-slate-900">Alert history</h2><p className="mt-1 text-xs text-slate-500">{data.total_count} matching alerts, active items shown first.</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs font-medium text-slate-600">Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value="all">All statuses</option><option value="active">Active</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Severity
              <select value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Station
              <select value={stationFilter} onChange={(event) => { setStationFilter(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value="all">All stations</option>{dashboard.data.stations.map((station) => <option key={station.id} value={station.id}>{station.id}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${alert.severity === "critical" ? "bg-rose-50 text-rose-800" : alert.severity === "high" ? "bg-orange-50 text-orange-800" : "bg-amber-50 text-amber-900"}`}>{alert.severity}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">{alert.status}</span>
                    <span className="text-xs text-slate-500">{alert.scenario?.replaceAll("-", " ")}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-900">{alert.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{alert.station_name} · <time dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleString()}</time></p>
                  <p className="mt-2 text-xs text-slate-600">Possible {alert.anomaly_type?.replaceAll("_", " ") ?? "issue"} · {alert.parameter ?? "observation"}: {alert.observed_value == null ? "missing" : `${alert.observed_value}°C`} · nearby median {alert.nearby_median == null ? "not available" : `${alert.nearby_median}°C`}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {alert.status === "active" && <button type="button" disabled={action.isPending} onClick={() => action.mutate({ id: alert.id, next: "acknowledge" })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Acknowledge</button>}
                  {alert.status !== "resolved" && <button type="button" disabled={action.isPending} onClick={() => { if (window.confirm("Resolve this alert? The record will remain in alert history.")) action.mutate({ id: alert.id, next: "resolve" }); }} className="min-h-10 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white hover:bg-sky-800">Resolve</button>}
                </div>
              </div>
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_auto]">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why was it flagged?</p><p className="mt-1 text-sm leading-6 text-slate-700">{alert.description}</p><p className="mt-2 text-sm text-slate-700"><strong>Suggested next step:</strong> {alert.recommended_action}</p></div>
                <div className="grid grid-cols-2 gap-2 md:w-52 md:grid-cols-1">
                  <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="text-xs text-slate-500">Data trust</p><p className="font-bold text-slate-900">{alert.trust_score ?? "—"} / 100</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="text-xs text-slate-500">Sensor health</p><p className="font-bold text-slate-900">{alert.sensor_health_score ?? "—"} / 100</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="text-xs text-slate-500">Confidence indicator</p><p className="font-bold text-slate-900">{alert.confidence == null ? "—" : `${Math.round(alert.confidence * 100)}%`}</p></div>
                </div>
              </div>
            </article>
          ))}
          {!alerts.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600"><Clock3 className="mx-auto mb-2 h-5 w-5" />No alerts match these filters.</div>}
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600" aria-live="polite">
            {data.total_count === 0 ? "No matching alerts" : `Showing ${data.offset + 1}–${data.offset + alerts.length} of ${data.total_count} alerts`}
            {data.total_count > 0 && ` · Page ${page + 1} of ${Math.ceil(data.total_count / ALERT_PAGE_SIZE)}`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || isLoading} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous page</button>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={data.offset + alerts.length >= data.total_count || isLoading} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next page</button>
          </div>
        </div>
        {action.error && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{action.error.message}</p>}
      </section>
    </div>
  );
}

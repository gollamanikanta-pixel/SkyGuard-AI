"use client";

import { RefreshCw, Radio } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchDashboard } from "@/lib/api";

const routeNames: Record<string, string> = {
  "/": "Weather Station Overview",
  "/stations": "Weather Stations",
  "/anomalies": "Detected Issues",
  "/sensor-health": "Sensor Health",
  "/alerts": "Alerts",
  "/analytics": "Network Analytics",
  "/raw-data": "Raw Weather Observations",
  "/simulation": "Simulation Lab",
  "/settings": "System Settings",
};

export function AppTopbar() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: (query) => query.state.data?.monitoring?.running && !query.state.data.monitoring.paused ? 15_000 : false,
  });

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div>
        <div className="text-xs font-medium text-slate-500">SkyGuard AI / Demo workspace</div>
        <div className="mt-0.5 text-base font-semibold text-slate-900">{routeNames[pathname] ?? "Station details"}</div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 sm:flex">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Simulated data
        </div>
        <div className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:flex ${data?.monitoring?.running && !data.monitoring.paused ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          <Radio className="h-3.5 w-3.5" />
          {data?.monitoring?.running ? (data.monitoring.paused ? "Monitoring paused" : "Simulated monitoring") : "Monitoring stopped"}
        </div>
        <span className="hidden text-xs text-slate-500 md:inline">
          Updated {data?.generated_at ? new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries()}
          aria-label="Refresh dashboard data"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
    </header>
  );
}

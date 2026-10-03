"use client";

import { useMutation } from "@tanstack/react-query";
import { CloudSun, RefreshCw } from "lucide-react";
import { fetchOpenMeteoConditions } from "@/lib/api";

function format(value: number | null, unit: string): string {
  return value == null ? "—" : `${value.toFixed(1)}${unit}`;
}

export function OpenMeteoReference() {
  const request = useMutation({ mutationFn: fetchOpenMeteoConditions });
  const data = request.data;

  return (
    <section className="panel space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-sky-50 p-2 text-sky-800"><CloudSun aria-hidden="true" className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold text-slate-900">External weather reference</h2>
            <p className="mt-1 text-sm text-slate-600">Fetch current Open-Meteo model conditions at the 12 demo station coordinates.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => request.mutate()}
          disabled={request.isPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${request.isPending ? "animate-spin" : ""}`} />
          {request.isPending ? "Fetching conditions…" : "Fetch current conditions"}
        </button>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Reference only:</strong> These are gridded weather-model estimates, not measurements from AWS sensors. They are stored separately and do not affect station trust, sensor-health scores, or alerts.
      </p>

      {request.error && <p role="alert" className="text-sm font-medium text-rose-700">{request.error.message}</p>}

      {data && (
        <>
          <p className="text-xs text-slate-500" aria-live="polite">
            Retrieved {new Date(data.fetched_at).toLocaleString()} · Observation times shown per location · Source:{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="font-semibold text-sky-800 underline">Open-Meteo</a>
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-3">Location</th>
                  <th scope="col" className="px-3 py-3">Observed (UTC)</th>
                  <th scope="col" className="px-3 py-3">Temperature</th>
                  <th scope="col" className="px-3 py-3">Humidity</th>
                  <th scope="col" className="px-3 py-3">Pressure</th>
                  <th scope="col" className="px-3 py-3">Wind</th>
                  <th scope="col" className="px-3 py-3">Precipitation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.stations.map((station) => (
                  <tr key={station.station_id}>
                    <th scope="row" className="px-3 py-3 font-semibold text-slate-900">{station.station_id} · {station.station_name}</th>
                    <td className="px-3 py-3 text-slate-600">{new Date(station.observed_at).toLocaleString("en-GB", { timeZone: "UTC", timeZoneName: "short" })}</td>
                    <td className="px-3 py-3 text-slate-700">{format(station.temperature_c, "°C")}</td>
                    <td className="px-3 py-3 text-slate-700">{format(station.humidity_pct, "%")}</td>
                    <td className="px-3 py-3 text-slate-700">{format(station.pressure_hpa, " hPa")}</td>
                    <td className="px-3 py-3 text-slate-700">{format(station.wind_kmh, " km/h")}</td>
                    <td className="px-3 py-3 text-slate-700">{format(station.precipitation_mm, " mm")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

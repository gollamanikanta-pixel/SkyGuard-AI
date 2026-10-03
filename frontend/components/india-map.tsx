"use client";

import { useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";

import { Link } from "@/lib/router-link";
import type { StationSummary } from "@/types/weather";

function markerColor(station: StationSummary): string {
  if (station.status === "offline") return "#b44242";
  if (station.status !== "normal") return "#b27616";
  return "#238463";
}

export function IndiaMap({ stations }: { stations: StationSummary[] }) {
  const [tilesFailed, setTilesFailed] = useState(false);

  return (
    <div>
      {tilesFailed && <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Map tiles could not load. Station summaries and location markers remain available.</p>}
      <MapContainer center={[22.5, 80.5]} zoom={5} scrollWheelZoom className="h-[340px] w-full rounded-2xl sm:h-[420px]">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTilesFailed(true), load: () => setTilesFailed(false) }}
        />
        {stations.map((station) => (
          <CircleMarker
            key={station.id}
            center={[station.lat, station.lon]}
            radius={8}
            pathOptions={{ color: "#fff", weight: 2, fillColor: markerColor(station), fillOpacity: 0.95 }}
          >
            <Tooltip direction="top">{station.id} · {station.status === "normal" ? "Working normally" : station.status === "offline" ? "Data delayed" : "Needs attention"}</Tooltip>
            <Popup>
              <div className="min-w-[200px] space-y-1 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{station.name} · {station.id}</div>
                <div>{station.district}, {station.state} · simulated</div>
                <div>Temperature: {station.metrics.temperature_c == null ? "No recent value" : `${station.metrics.temperature_c}°C`}</div>
                <div>Pressure: {station.metrics.pressure_hpa ?? "—"} hPa</div>
                <div>Humidity: {station.metrics.humidity_pct ?? "—"}%</div>
                <div>Data Trust: {station.trust_score}/100</div>
                <div>Sensor Health: {station.sensor_health_score}/100</div>
                <div>Status: {station.status === "normal" ? "Working normally" : station.status === "offline" ? "Data delayed" : "Needs attention"}</div>
                <Link className="mt-2 inline-block font-semibold text-sky-800" href={`/stations/${station.id}`}>View station details →</Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-700" />Working normally</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-600" />Needs attention</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-700" />Data delayed / offline</span>
      </div>
      {tilesFailed && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {stations.map((station) => (
            <li key={station.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <span className="min-w-0 truncate text-slate-700">{station.id} · {station.name} · {station.metrics.temperature_c ?? "—"}°C</span>
              <Link className="shrink-0 font-semibold text-sky-800" href={`/stations/${station.id}`}>Details</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

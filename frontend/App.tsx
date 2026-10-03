import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppTopbar } from "@/components/app-topbar";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
const AlertsPage = lazy(() => import("@/app/alerts/page"));
const AnalyticsPage = lazy(() => import("@/app/analytics/page"));
const AnomaliesPage = lazy(() => import("@/app/anomalies/page"));
const DashboardPage = lazy(() => import("@/app/page"));
const RawDataPage = lazy(() => import("@/app/raw-data/page"));
const SensorHealthPage = lazy(() => import("@/app/sensor-health/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));
const SimulationPage = lazy(() => import("@/app/simulation/page"));
const StationsPage = lazy(() => import("@/app/stations/page"));
const StationDetailPage = lazy(() => import("@/app/stations/[stationId]/page"));

function NotFoundPage() {
  return (
    <section className="panel rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">Choose a destination from the navigation menu.</p>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <SiteHeader />
          <div className="min-w-0 flex-1">
            <AppTopbar />
            <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7">
              <Suspense fallback={<div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading page…</div>}>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/stations" element={<StationsPage />} />
                  <Route path="/stations/:stationId" element={<StationDetailPage />} />
                  <Route path="/anomalies" element={<AnomaliesPage />} />
                  <Route path="/sensor-health" element={<SensorHealthPage />} />
                  <Route path="/alerts" element={<AlertsPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/raw-data" element={<RawDataPage />} />
                  <Route path="/simulation" element={<SimulationPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </div>
      </Providers>
    </BrowserRouter>
  );
}

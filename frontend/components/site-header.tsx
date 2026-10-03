"use client";

import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  HeartPulse,
  LayoutDashboard,
  MapPinned,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stations", label: "Weather stations", icon: MapPinned },
  { href: "/anomalies", label: "Detected issues", icon: AlertTriangle },
  { href: "/sensor-health", label: "Sensor health", icon: HeartPulse },
  { href: "/alerts", label: "Alerts", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/raw-data", label: "Raw data", icon: Database },
  { href: "/simulation", label: "Simulation lab", icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SiteHeader() {
  const { pathname } = useLocation();

  return (
    <aside className="sidebar-glow flex w-full shrink-0 flex-col border-b px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
      <NavLink to="/" className="flex items-center gap-3 px-2 pb-3 lg:pb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 ring-1 ring-sky-200">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">SkyGuard AI</div>
          <div className="text-xs text-slate-500">Weather station quality monitor</div>
        </div>
      </NavLink>

      <div className="mb-2 hidden px-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 lg:block">
        Workspace
      </div>
      <nav aria-label="Main navigation" className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:flex lg:flex-col lg:gap-1.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <NavLink
              key={href}
              to={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-2 py-2 text-xs font-medium transition sm:text-sm lg:gap-3 lg:px-3 ${
                isActive
                  ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      <section className="mt-auto hidden rounded-2xl border border-sky-100 bg-sky-50 p-4 lg:block">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-900">
          <Activity className="h-4 w-4" />
          How SkyGuard helps
        </div>
        <p className="text-xs leading-5 text-slate-600">
          It checks a reading against recent station history and nearby stations before recommending a review.
        </p>
        <p className="mt-3 text-[11px] font-medium text-amber-800">
          Demo mode: all observations are simulated.
        </p>
      </section>

      <div className="mt-3 hidden items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600 lg:flex">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">OP</div>
        <div>
          <div className="font-semibold text-slate-800">Demo workspace</div>
          <div className="text-xs text-slate-500">Local prototype</div>
        </div>
      </div>
    </aside>
  );
}

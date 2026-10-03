"use client";

import { useState } from "react";
import { Link } from "@/lib/router-link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, Check, CloudSun, RotateCcw, TriangleAlert } from "lucide-react";

import { fetchDashboard, resetScenario, simulateScenario } from "@/lib/api";

const scenarios = [
  { id: "normal-weather", name: "Normal Weather", target: "Baseline network", description: "A calm baseline. Station readings should remain consistent.", icon: CloudSun },
  { id: "faulty-sensor", name: "Faulty Sensor", target: "AWS-004 · Jaipur North", description: "One sensor jumps to 85°C while nearby stations remain close to normal.", icon: TriangleAlert },
  { id: "genuine-heatwave", name: "Genuine Heatwave", target: "AWS-001 to AWS-004", description: "Four nearby stations rise together to approximately 42–43°C.", icon: CloudSun },
  { id: "frozen-sensor", name: "Frozen Sensor", target: "AWS-008 · Bengaluru Urban", description: "Recent readings repeat exactly, which can indicate a stuck sensor.", icon: Activity },
  { id: "missing-data", name: "Missing Data", target: "AWS-010 · Guwahati East", description: "Recent measurements stop arriving from one simulated station.", icon: Activity },
  { id: "gradual-degradation", name: "Gradual Sensor Degradation", target: "AWS-009 · Hyderabad West", description: "Measurements drift while the simulated signal becomes weaker.", icon: TriangleAlert },
];

export default function SimulationPage() {
  const queryClient = useQueryClient();
  const { data: dashboard } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const [scenario, setScenario] = useState("faulty-sensor");
  const selectedScenario = scenarios.find((item) => item.id === scenario) ?? scenarios[0];
  const simulation = useMutation({
    mutationFn: () => simulateScenario({ scenario }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["observations"] }),
      ]);
    },
  });
  const reset = useMutation({
    mutationFn: resetScenario,
    onSuccess: async () => {
      simulation.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["observations"] }),
      ]);
    },
  });
  const result = simulation.data?.station
    ?? (simulation.data?.dashboard.stations.find((station) => station.id === selectedScenario.target.split(" · ")[0]) ?? null);
  const currentScenario = dashboard?.scenario ?? "normal-weather";

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-sky-800">Practice with safe sample events</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Simulation Lab</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">See how SkyGuard compares station history and nearby readings before suggesting a next step.</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">Current scenario: {scenarios.find((item) => item.id === currentScenario)?.name ?? currentScenario}</span>
      </section>

      <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Activity className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>This is a simulation.</strong> It changes demo observations only. It does not alter real stations or represent live IMD data.</p>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel rounded-2xl p-4 sm:p-5">
          <h2 className="text-lg font-bold text-slate-900">Choose a situation</h2>
          <p className="mt-1 text-sm text-slate-500">Each option updates the whole demo network and re-runs the analysis.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {scenarios.map(({ id, name, target, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={scenario === id}
                onClick={() => setScenario(id)}
                className={`rounded-xl border p-4 text-left transition focus-visible:outline-sky-700 ${scenario === id ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50"}`}
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900"><Icon className="h-4 w-4 text-sky-800" />{name}</span>
                <span className="mt-2 block text-xs font-medium text-slate-500">{target}</span>
                <span className="mt-2 block text-sm leading-5 text-slate-600">{description}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => simulation.mutate()}
              disabled={simulation.isPending}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
            >
              <Activity className="h-4 w-4" />{simulation.isPending ? "Running analysis…" : "Run scenario"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Return all demo stations to normal weather? Existing alerts will remain in scenario history.")) reset.mutate();
              }}
              disabled={reset.isPending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />{reset.isPending ? "Resetting…" : "Return to normal"}
            </button>
          </div>
          {(simulation.error || reset.error) && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{(simulation.error ?? reset.error)?.message}</p>}
          {reset.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-800">Demo data returned to normal. Prior scenario alerts remain available in history.</p>}
        </div>

        <div className="panel rounded-2xl p-4 sm:p-5">
          <h2 className="text-lg font-bold text-slate-900">What SkyGuard found</h2>
          {!result ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              Choose a scenario and run it to see the evidence and recommendations here.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What happened?</p>
                <p className="mt-1 text-lg font-bold capitalize text-slate-900">{result.classification.replaceAll("_", " ")}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{result.data_quality.explanation}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Data trust</p><p className="mt-1 text-2xl font-bold text-sky-800">{result.trust_score}<span className="text-xs font-medium text-slate-500"> / 100</span></p></div>
                <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Sensor health</p><p className="mt-1 text-2xl font-bold text-emerald-800">{result.sensor_health_score}<span className="text-xs font-medium text-slate-500"> / 100</span></p></div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">What should happen next?</p>
                <p className="mt-1 text-sm leading-5 text-amber-950">{result.recommendation}</p>
              </div>
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">Technical Details</summary>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <dt>ML model</dt><dd>{result.analysis.ml.model} · flag: {String(result.analysis.ml.anomaly_flag)}</dd>
                  <dt>Nearby stations</dt><dd>{result.analysis.spatial.nearby_count}</dd>
                  <dt>Nearby temperature median</dt><dd>{result.analysis.spatial.median_temperature_c ?? "Not available"}</dd>
                  <dt>Severity</dt><dd className="capitalize">{result.severity}</dd>
                  <dt>Confidence indicator</dt><dd>{result.confidence == null ? "Not available" : `${Math.round(result.confidence * 100)}% (not a calibrated probability)`}</dd>
                </dl>
              </details>
              <Link href={`/stations/${result.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:underline">Open station details <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </div>
      </section>

      <section className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2"><Check className="h-5 w-5 text-emerald-700" /><h2 className="font-bold text-slate-900">Suggested demo order</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-600">Run Faulty Sensor to show an isolated reading, return to Normal Weather, then run Genuine Heatwave. The first differs from nearby stations; the second shows a coordinated regional change.</p>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, RotateCcw, Save, Settings2 } from "lucide-react";

import { fetchModelStatus, fetchSettings, retrainModel, saveSettings } from "@/lib/api";

const fields: Array<{ key: string; label: string; description: string; min: number; max: number; step?: number }> = [
  { key: "temperature_min_c", label: "Temperature minimum (°C)", description: "Lower prototype range check.", min: -100, max: 0 },
  { key: "temperature_max_c", label: "Temperature maximum (°C)", description: "Upper prototype range check.", min: 1, max: 100 },
  { key: "pressure_min_hpa", label: "Pressure minimum (hPa)", description: "Lower pressure plausibility check.", min: 300, max: 1100 },
  { key: "pressure_max_hpa", label: "Pressure maximum (hPa)", description: "Upper pressure plausibility check.", min: 800, max: 1300 },
  { key: "humidity_min_pct", label: "Humidity minimum (%)", description: "Lower humidity range check.", min: 0, max: 99 },
  { key: "humidity_max_pct", label: "Humidity maximum (%)", description: "Upper humidity range check.", min: 1, max: 100 },
  { key: "nearby_radius_km", label: "Nearby station range (km)", description: "How far to look for comparable station readings.", min: 1, max: 2000 },
  { key: "minimum_nearby_stations", label: "Minimum nearby stations", description: "Minimum neighbour count before spatial evidence is used.", min: 0, max: 20 },
  { key: "max_reporting_delay_minutes", label: "Maximum reporting delay (minutes)", description: "Prototype freshness threshold.", min: 1, max: 1440 },
  { key: "history_window_hours", label: "History window (hours)", description: "Historical comparison window.", min: 1, max: 168 },
  { key: "frozen_window_readings", label: "Repeated readings for frozen warning", description: "How many similar readings trigger a frozen-value indicator.", min: 3, max: 288 },
  { key: "monitoring_interval_seconds", label: "Monitoring interval (seconds)", description: "How often the simulated monitor stores a data batch.", min: 10, max: 3600 },
  { key: "isolation_forest_contamination", label: "Isolation Forest contamination", description: "Model tuning value, not an anomaly probability.", min: 0.002, max: 0.2, step: 0.001 },
  { key: "trust_weight_validation", label: "Validation weight (%)", description: "Weight assigned to range and freshness evidence.", min: 0, max: 100 },
  { key: "trust_weight_temporal", label: "History comparison weight (%)", description: "Weight assigned to recent station history.", min: 0, max: 100 },
  { key: "trust_weight_spatial", label: "Nearby station weight (%)", description: "Weight assigned to neighbour agreement.", min: 0, max: 100 },
  { key: "trust_weight_multivariate", label: "Reading consistency weight (%)", description: "Weight assigned to combined weather parameters.", min: 0, max: 100 },
  { key: "trust_weight_ml", label: "ML signal weight (%)", description: "Weight assigned to Isolation Forest evidence.", min: 0, max: 100 },
  { key: "health_weight_anomaly", label: "Health · anomaly weight (%)", description: "How recent anomaly indicators reduce the longer-term health estimate.", min: 0, max: 100 },
  { key: "health_weight_quality", label: "Health · data quality weight (%)", description: "How missing or invalid observations affect estimated sensor health.", min: 0, max: 100 },
  { key: "health_weight_frozen", label: "Health · frozen value weight (%)", description: "How repeated identical readings affect estimated sensor health.", min: 0, max: 100 },
  { key: "health_weight_drift", label: "Health · drift weight (%)", description: "How unusual gradual changes affect estimated sensor health.", min: 0, max: 100 },
  { key: "severity_critical_anomaly_threshold", label: "Critical anomaly threshold", description: "Anomaly score above which a low-health pattern may become critical.", min: 40, max: 100 },
  { key: "severity_critical_health_threshold", label: "Critical health threshold", description: "Health score below which a severe anomaly may be classified as critical.", min: 0, max: 75 },
  { key: "severity_degradation_anomaly_threshold", label: "Degradation anomaly threshold", description: "Score threshold for possible sensor degradation.", min: 40, max: 100 },
  { key: "severity_weather_event_anomaly_threshold", label: "Regional-event threshold", description: "Score threshold for possible weather-event classification.", min: 40, max: 100 },
  { key: "severity_review_anomaly_threshold", label: "Manual-review threshold", description: "Score threshold for ambiguous readings that need human review.", min: 40, max: 100 },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const model = useQuery({ queryKey: ["model-status"], queryFn: fetchModelStatus });
  const [draftValues, setDraftValues] = useState<Record<string, number> | null>(null);
  const values = draftValues ?? data?.settings ?? {};
  const retrain = useMutation({
    mutationFn: retrainModel,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["model-status"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, number>) => saveSettings(payload),
    onSuccess: async () => {
      setDraftValues(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
      ]);
    },
  });
  if (isLoading) return <div aria-live="polite" className="panel rounded-2xl p-8 text-slate-600">Loading prototype settings…</div>;
  if (isError || !data) return <div role="alert" className="panel rounded-2xl p-8 text-rose-700">{error instanceof Error ? error.message : "Unable to load settings."}</div>;

  const weightTotal = ["trust_weight_validation", "trust_weight_temporal", "trust_weight_spatial", "trust_weight_multivariate", "trust_weight_ml"].reduce((sum, key) => sum + (values[key] ?? 0), 0);
  const healthWeightTotal = ["health_weight_anomaly", "health_weight_quality", "health_weight_frozen", "health_weight_drift"].reduce((sum, key) => sum + (values[key] ?? 0), 0);
  const severityThresholds = [
    values.severity_critical_anomaly_threshold,
    values.severity_degradation_anomaly_threshold,
    values.severity_weather_event_anomaly_threshold,
    values.severity_review_anomaly_threshold,
  ];
  const severityThresholdsValid = severityThresholds.every((value, index) => index === 0 || severityThresholds[index - 1] > value);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-800">Tune this local prototype</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">System Settings</h1>
        <p className="mt-2 text-sm text-slate-600">Changes are saved in the configured database and affect subsequent demo analysis.</p>
      </section>
      {data.using_prototype_defaults && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">Default prototype settings are currently in use. Save settings below to persist custom values.</p>}
      {!data.using_prototype_defaults && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">Saved custom settings are currently in use.</p>}
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <Settings2 className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>Prototype settings only.</strong> These thresholds are illustrative and should be reviewed by weather and sensor experts before any operational use.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); save.mutate(values); }} className="panel rounded-2xl p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <label key={field.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="block text-sm font-semibold text-slate-900">{field.label}</span>
              <span className="mt-1 block min-h-10 text-xs leading-5 text-slate-500">{field.description}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                required
                value={values[field.key] ?? ""}
                onChange={(event) => setDraftValues((current) => ({ ...(current ?? data.settings), [field.key]: Number(event.target.value) }))}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-900"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-col justify-between gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          <div className="space-y-1 text-sm font-semibold">
            <p className={weightTotal === 100 ? "text-emerald-800" : "text-rose-700"}>TrustFusion weights total: {weightTotal}% (must equal 100%)</p>
            <p className={healthWeightTotal === 100 ? "text-emerald-800" : "text-rose-700"}>Sensor Health weights total: {healthWeightTotal}% (must equal 100%)</p>
            <p className={severityThresholdsValid ? "text-emerald-800" : "text-rose-700"}>Severity thresholds: {severityThresholdsValid ? "valid descending order" : "must descend from critical to review"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={save.isPending} onClick={() => setDraftValues(data.prototype_defaults)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-4 w-4" />Restore defaults</button>
            <button type="submit" disabled={save.isPending || weightTotal !== 100 || healthWeightTotal !== 100 || !severityThresholdsValid} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save settings"}</button>
          </div>
        </div>
        {save.isSuccess && <p role="status" className="mt-4 text-sm text-emerald-800">{save.data.message}</p>}
        {save.error && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{save.error.message}</p>}
      </form>
      <section className="panel flex flex-col justify-between gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-sky-800" /><h2 className="font-bold text-slate-900">Anomaly model</h2></div>
          {model.isLoading ? <p className="mt-1 text-sm text-slate-600">Checking model status…</p>
            : model.isError ? <p role="alert" className="mt-1 text-sm text-rose-700">{model.error.message}</p>
              : model.data ? <p className="mt-1 text-sm text-slate-600">{model.data.model} · deterministic seed {model.data.random_state} · trained on simulated normal observations · scores are not probabilities</p> : <p className="mt-1 text-sm text-slate-600">Model status unavailable.</p>}
          {retrain.data && <p role="status" className="mt-2 text-sm text-emerald-800">{retrain.data.message}</p>}
          {retrain.error && <p role="alert" className="mt-2 text-sm text-rose-700">{retrain.error.message}</p>}
        </div>
        <button type="button" disabled={retrain.isPending} onClick={() => retrain.mutate()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-50">
          <Activity className="h-4 w-4" />{retrain.isPending ? "Training baseline…" : "Retrain on normal demo data"}
        </button>
      </section>
    </div>
  );
}

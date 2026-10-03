"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square } from "lucide-react";

import { fetchDashboard, monitoringAction } from "@/lib/api";

export function MonitoringControls() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const action = useMutation({
    mutationFn: (name: "start" | "pause" | "stop") => monitoringAction(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["observations"] }),
        queryClient.invalidateQueries({ queryKey: ["station-health"] }),
      ]);
    },
  });
  const monitoring = data?.monitoring;

  return (
    <div className="flex flex-wrap gap-2">
      {!monitoring?.running || monitoring.paused ? (
        <button type="button" disabled={action.isPending} onClick={() => action.mutate("start")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
          <Play className="h-4 w-4" />{monitoring?.running ? "Resume" : "Start"} simulated monitoring
        </button>
      ) : (
        <button type="button" disabled={action.isPending} onClick={() => action.mutate("pause")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"><Pause className="h-4 w-4" />Pause</button>
      )}
      {monitoring?.running && <button type="button" disabled={action.isPending} onClick={() => { if (window.confirm("Stop simulated monitoring?")) action.mutate("stop"); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Square className="h-4 w-4" />Stop</button>}
      {action.error && <p role="alert" className="self-center text-xs text-rose-700">{action.error.message}</p>}
    </div>
  );
}

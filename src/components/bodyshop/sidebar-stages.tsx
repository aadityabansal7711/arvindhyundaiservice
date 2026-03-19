"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { apiGet } from "@/lib/api";
import supabase from "@/lib/supabase";
import { STATUS_SECTION_ORDER } from "@/lib/bodyshop-seed";
import type { StatusSection } from "@/lib/bodyshop-types";

type CountsResponse = { all: number; stages: Record<string, number> };

export function SidebarStages() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam = searchParams.get("stage");
  const activeStage: StatusSection | "All" =
    stageParam && STATUS_SECTION_ORDER.includes(stageParam as StatusSection)
      ? (stageParam as StatusSection)
      : "All";

  const [counts, setCounts] = useState<CountsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCounts = () =>
      apiGet<CountsResponse>("/api/bodyshop-jobs?openOnly=1&countsOnly=1")
        .then((data) => {
          if (!cancelled) setCounts(data);
        })
        .catch(() => {
          if (!cancelled) setCounts({ all: 0, stages: {} });
        });

    // Initial load
    void fetchCounts();

    // Realtime updates (instant refresh when jobs change)
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (cancelled) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void fetchCounts();
      }, 150);
    };

    const channel = supabase
      .channel("bodyshop_jobs_counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bodyshop_jobs" },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bodyshop_job_stages" },
        () => scheduleRefresh()
      )
      .subscribe();

    const onLocalRefresh = () => {
      scheduleRefresh();
    };
    window.addEventListener("bodyshop:counts-refresh", onLocalRefresh);

    // Fallback polling in case realtime is not enabled.
    const poll = setInterval(() => scheduleRefresh(), 15000);

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(poll);
      window.removeEventListener("bodyshop:counts-refresh", onLocalRefresh);
      void supabase.removeChannel(channel);
    };
  }, []);

  const selectStage = (stage: StatusSection | "All") => {
    if (stage === "All") {
      router.push("/bodyshop");
    } else {
      router.push(`/bodyshop?stage=${encodeURIComponent(stage)}`);
    }
  };

  const stagesToList = STATUS_SECTION_ORDER.filter((s) => s !== "Delivered");
  const allCount = counts?.all ?? 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <LayoutGrid className="w-4 h-4 text-slate-500 shrink-0" />
          Stages
        </div>
      </div>
      <div className="p-2 max-h-[min(60vh,400px)] overflow-y-auto">
        <button
          type="button"
          onClick={() => selectStage("All")}
          className={
            "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors " +
            (activeStage === "All"
              ? "bg-blue-50 text-blue-700 font-semibold"
              : "hover:bg-slate-50 text-slate-700")
          }
        >
          <span>All Vehicles</span>
          <span
            className={
              "text-xs tabular-nums " +
              (activeStage === "All" ? "text-blue-600" : "text-slate-500")
            }
          >
            {allCount}
          </span>
        </button>
        <div className="mt-1 space-y-0.5">
          {stagesToList.map((s) => {
            const count = counts?.stages[s] ?? 0;
            const isActive = activeStage === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => selectStage(s)}
                className={
                  "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors " +
                  (isActive
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "hover:bg-slate-50 text-slate-700")
                }
              >
                <span className="truncate">{s}</span>
                <span
                  className={
                    "text-xs tabular-nums shrink-0 ml-2 " +
                    (isActive ? "text-blue-600" : "text-slate-500")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

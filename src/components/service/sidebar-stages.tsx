"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { apiGet } from "@/lib/api";
import { SERVICE_STATUS_SECTION_ORDER } from "@/lib/service-seed";
import type { ServiceStatusSection } from "@/lib/bodyshop-types";

type CountsResponse = { all: number; stages: Record<string, number> };

export function ServiceSidebarStages() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam = searchParams.get("stage");
  const activeStage: ServiceStatusSection | "All" =
    stageParam && SERVICE_STATUS_SECTION_ORDER.includes(stageParam as ServiceStatusSection)
      ? (stageParam as ServiceStatusSection)
      : "All";

  const [counts, setCounts] = useState<CountsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastFetchAt = 0;
    const fetchCounts = () =>
      apiGet<CountsResponse>("/api/bodyshop-jobs?openOnly=1&countsOnly=1&category=service", { cacheMs: 15_000 })
        .then((data) => {
          if (!cancelled) setCounts(data);
        })
        .catch(() => {
          if (!cancelled) setCounts({ all: 0, stages: {} });
        });

    const doFetch = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (inFlight) return;
      if (now - lastFetchAt < 1200) return;
      inFlight = true;
      lastFetchAt = now;
      try {
        await fetchCounts();
      } finally {
        inFlight = false;
      }
    };
    void doFetch();

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (cancelled) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void doFetch();
      }, 600);
    };

    const onLocalRefresh = () => {
      scheduleRefresh();
    };
    window.addEventListener("service:counts-refresh", onLocalRefresh);

    const poll = setInterval(() => scheduleRefresh(), 15000);

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(poll);
      window.removeEventListener("service:counts-refresh", onLocalRefresh);
    };
  }, []);

  const selectStage = (stage: ServiceStatusSection | "All") => {
    if (stage === "All") {
      router.push("/service");
    } else {
      router.push(`/service?stage=${encodeURIComponent(stage)}`);
    }
  };

  const stagesToList = SERVICE_STATUS_SECTION_ORDER.filter((s) => s !== "Delivered");
  const allCount = counts?.all ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.06] shadow-inner overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <LayoutGrid className="w-4 h-4 text-sky-300 shrink-0" />
          Stages
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-scroll overscroll-contain p-1.5 custom-scrollbar">
        <button
          type="button"
          onClick={() => selectStage("All")}
          className={
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] leading-5 transition-colors " +
            (activeStage === "All"
              ? "bg-sky-400/15 text-white font-semibold ring-1 ring-sky-300/20"
              : "hover:bg-white/[0.07] text-slate-300")
          }
        >
          <span>All Vehicles</span>
          <span
            className={
              "text-xs tabular-nums " +
              (activeStage === "All" ? "text-sky-200" : "text-slate-500")
            }
          >
            {allCount}
          </span>
        </button>
        <div className="mt-0.5 space-y-0">
          {stagesToList.map((s) => {
            const count = counts?.stages[s] ?? 0;
            const isActive = activeStage === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => selectStage(s)}
                className={
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] leading-5 transition-colors " +
                  (isActive
                    ? "bg-sky-400/15 text-white font-semibold ring-1 ring-sky-300/20"
                    : "hover:bg-white/[0.07] text-slate-300")
                }
              >
                <span className="truncate">{s}</span>
                <span
                  className={
                    "text-xs tabular-nums shrink-0 ml-2 " +
                    (isActive ? "text-sky-200" : "text-slate-500")
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

"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";
import {
  Shield,
  ArrowLeft,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  Wrench,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { format } from "date-fns";

export default function RODetailPage() {
  const { id } = useParams();
  const [ro, setRo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRO = async () => {
      try {
        const data = await apiGet<any>(`/api/ro/${id}`);
        setRo(data);
      } catch (err) {
        if ((err as Error)?.message !== "Unauthorized") console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRO();
  }, [id]);

  if (isLoading)
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full text-slate-400">
          Loading RO details...
        </div>
      </DashboardLayout>
    );
  if (!ro)
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-slate-500 font-bold">
          RO Not Found
        </div>
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-blue-600 mb-2 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Back to Register
            </button>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Combined Details
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
              RO & Vehicle
            </h2>
          </div>
          <div className="p-4 sm:p-6 space-y-8">
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    RO No
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.roNo}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Status
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.currentStatus}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Vehicle In
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {format(new Date(ro.vehicleInDate), "dd MMM yyyy")}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Reg No / Model
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.vehicle?.registrationNo} / {ro.vehicle?.model}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-1 sm:col-span-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Customer
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.vehicle?.customer?.name} —{" "}
                    {ro.vehicle?.customer?.mobile}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-1 sm:col-span-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Service Advisor
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.serviceAdvisorName ?? ro.advisor?.name ?? "—"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Claim Register
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Claim No
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.insuranceClaim?.claimNo ?? "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Claim Date
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.insuranceClaim?.claimIntimationDate
                      ? format(
                          new Date(ro.insuranceClaim.claimIntimationDate),
                          "dd MMM yyyy",
                        )
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    HAP/NHAP
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.insuranceClaim?.hapFlag === true
                      ? "HAP"
                      : ro.insuranceClaim?.hapFlag === false
                      ? "NHAP"
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Insurance Co
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.insuranceClaim?.insuranceCompany ?? "—"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Approval Register
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Surveyor Name
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.survey?.surveyorName ?? "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Survey Date
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.survey?.surveyDate
                      ? format(new Date(ro.survey.surveyDate), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Approval Date
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.survey?.approvalDate
                      ? format(new Date(ro.survey.approvalDate), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Wrench className="w-4 h-4" /> Work Register
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Start Date
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.workStartDate
                      ? format(new Date(ro.workStartDate), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Tentative Completion
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.tentativeCompletionDate
                      ? format(
                          new Date(ro.tentativeCompletionDate),
                          "dd MMM yyyy",
                        )
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Panels New (Replace)
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.panelsNewReplace ?? "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                    Panels Dent
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {ro.panelsDent ?? "—"}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

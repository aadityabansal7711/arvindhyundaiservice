"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Upload, FileUp, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";

export default function ImportPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError("");
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        setError("");
        setResult(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const data = await apiPost("/api/import", formData);
            setResult(data);
        } catch (err: any) {
            setError(err?.message || "Failed to upload file");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Import Center</h1>
                    <p className="text-slate-500 mt-1">Sync your operational data from "BODYSHOP N3259.xlsx".</p>
                </div>

                <div className="space-y-6">
                        <div className="bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors group">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <FileUp className="w-8 h-8" />
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-semibold text-slate-900">
                                        {file ? file.name : "Select Excel File"}
                                    </p>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Supports .xlsx, .xls formats
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    id="excel-upload"
                                    className="hidden"
                                    accept=".xlsx, .xls"
                                    onChange={handleFileChange}
                                />
                                <label
                                    htmlFor="excel-upload"
                                    className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer transition-colors"
                                >
                                    Browse Files
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex gap-3 text-rose-700">
                                <AlertTriangle className="w-5 h-5 shrink-0" />
                                <p className="text-sm font-medium">{error}</p>
                            </div>
                        )}

                        {result && (
                            <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl space-y-4">
                                <div className="flex items-center gap-3 text-emerald-700">
                                    <CheckCircle2 className="w-6 h-6" />
                                    <h3 className="font-bold text-lg">Import Successful</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/50 p-4 rounded-xl">
                                        <p className="text-xs text-emerald-600 uppercase font-bold tracking-wider">Rows Processed</p>
                                        <p className="text-2xl font-bold text-emerald-900">{result.imported}</p>
                                    </div>
                                    <div className="bg-white/50 p-4 rounded-xl">
                                        <p className="text-xs text-amber-600 uppercase font-bold tracking-wider">Errors/Skipped</p>
                                        <p className="text-2xl font-bold text-amber-900">{result.errorCount}</p>
                                    </div>
                                </div>
                                {result.errorCount > 0 && (
                                    <p className="text-sm text-emerald-700 italic">Check the audit log for details on skipped rows.</p>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleUpload}
                            disabled={!file || isUploading}
                            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    Processing Import...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-6 h-6" />
                                    Sync Database Now
                                </>
                            )}
                        </button>
                </div>
            </div>
        </DashboardLayout>
    );
}

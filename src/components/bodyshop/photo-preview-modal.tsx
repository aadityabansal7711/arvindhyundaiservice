"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, X } from "lucide-react";

import { bodyshopPhotoUrl } from "@/lib/bodyshop-photo-url";

export type PhotoPreviewState = {
  jobId: string;
  title: string;
  photos: string[];
  loading: boolean;
  error: string | null;
  visibleCount: number;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
};

type Props = {
  preview: PhotoPreviewState;
  onClose: () => void;
  onLoadMore: () => void;
  onAddPhotos: (files: File[]) => Promise<{ skipped: number }>;
  onDeletePhoto: (index: number) => Promise<void>;
};

export function PhotoPreviewModal({
  preview,
  onClose,
  onLoadMore,
  onAddPhotos,
  onDeletePhoto,
}: Props) {
  const previewKey = `${preview.jobId}:${preview.photos.length}:${preview.photos[0] ?? ""}:${
    preview.photos[preview.photos.length - 1] ?? ""
  }`;
  const [failedPhotos, setFailedPhotos] = useState<{
    key: string;
    indexes: Set<number>;
  }>(() => ({ key: previewKey, indexes: new Set() }));
  const failedPhotoIndexes =
    failedPhotos.key === previewKey ? failedPhotos.indexes : new Set<number>();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileIdentity = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) return;
    setPendingFiles((prev) => {
      const seen = new Set(prev.map(fileIdentity));
      const deduped: File[] = [];
      let skipped = 0;
      for (const f of files) {
        const key = fileIdentity(f);
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        seen.add(key);
        deduped.push(f);
      }
      setUploadNotice(
        skipped > 0
          ? `Skipped ${skipped} photo${skipped !== 1 ? "s" : ""} already selected.`
          : null
      );
      setUploadError(null);
      return [...prev, ...deduped];
    });
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0 || uploading) return;
    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const { skipped } = await onAddPhotos(pendingFiles);
      setPendingFiles([]);
      setUploadNotice(
        skipped > 0
          ? `Uploaded. Skipped ${skipped} photo${skipped !== 1 ? "s" : ""} already on this RO.`
          : null
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload photos. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (idx: number) => {
    if (deletingIndex !== null) return;
    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
    setDeletingIndex(idx);
    setDeleteError(null);
    try {
      await onDeletePhoto(idx);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete photo. Please try again."
      );
    } finally {
      setDeletingIndex(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{preview.title}</div>
              <div className="text-sm text-slate-500">
                {preview.loading
                  ? "Loading photos..."
                  : `${preview.photos.length} photo${preview.photos.length !== 1 ? "s" : ""}`}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {preview.error && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              {preview.error}
            </div>
          )}

          {deleteError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
              {deleteError}
            </div>
          )}

          {preview.loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading photos...</div>
          ) : preview.photos.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No photos available.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {preview.photos.slice(0, preview.visibleCount).map((src, idx) => {
                  const fullSizeUrl = bodyshopPhotoUrl(preview.jobId, idx);
                  const failed = failedPhotoIndexes.has(idx);

                  return (
                    <a
                      key={`${idx}-${src.slice(0, 40)}`}
                      href={fullSizeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block h-40 rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
                      title="Open full size"
                    >
                      {failed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
                          <span className="text-xs font-semibold text-slate-700">
                            Photo preview unavailable
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Open full size
                          </span>
                        </div>
                      ) : (
                        <Image
                          src={src}
                          alt={`Photo ${idx + 1}`}
                          className="object-cover group-hover:opacity-95"
                          fill
                          sizes="(min-width: 640px) 33vw, 50vw"
                          unoptimized
                          onError={() => {
                            setFailedPhotos((prev) => {
                              const next = new Set(
                                prev.key === previewKey ? prev.indexes : undefined
                              );
                              next.add(idx);
                              return { key: previewKey, indexes: next };
                            });
                          }}
                        />
                      )}
                      {preview.canDeletePhotos && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleDelete(idx);
                          }}
                          disabled={deletingIndex !== null}
                          aria-label="Delete photo"
                          title="Delete photo"
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
                        >
                          {deletingIndex === idx ? (
                            <span className="block w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </a>
                  );
                })}
              </div>
              {preview.visibleCount < preview.photos.length && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    Load more photos
                  </button>
                </div>
              )}
            </>
          )}

          {!preview.loading && preview.canAddPhotos && (
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesSelected(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />

              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((file, idx) => (
                    <span
                      key={`${file.name}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium max-w-[220px]"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`Remove ${file.name}`}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                  {uploadError}
                </div>
              )}

              {uploadNotice && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  {uploadNotice}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add photos
                </button>
                {pendingFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleUpload()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {uploading
                      ? "Uploading..."
                      : `Upload ${pendingFiles.length} photo${pendingFiles.length !== 1 ? "s" : ""}`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

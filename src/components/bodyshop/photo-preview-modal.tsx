"use client";

import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { bodyshopPhotoUrl } from "@/lib/bodyshop-photo-url";

export type PhotoPreviewState = {
  jobId: string;
  title: string;
  photos: string[];
  loading: boolean;
  error: string | null;
  visibleCount: number;
};

type Props = {
  preview: PhotoPreviewState;
  onClose: () => void;
  onLoadMore: () => void;
};

export function PhotoPreviewModal({ preview, onClose, onLoadMore }: Props) {
  const previewKey = `${preview.jobId}:${preview.photos.length}:${preview.photos[0] ?? ""}:${
    preview.photos[preview.photos.length - 1] ?? ""
  }`;
  const [failedPhotos, setFailedPhotos] = useState<{
    key: string;
    indexes: Set<number>;
  }>(() => ({ key: previewKey, indexes: new Set() }));
  const failedPhotoIndexes =
    failedPhotos.key === previewKey ? failedPhotos.indexes : new Set<number>();

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
        </div>
      </div>
    </div>
  );
}

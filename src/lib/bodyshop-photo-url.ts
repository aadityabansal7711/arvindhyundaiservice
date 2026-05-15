export function bodyshopPhotoUrl(jobId: string, index: number) {
  return `/api/bodyshop-jobs/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(
    String(index)
  )}`;
}

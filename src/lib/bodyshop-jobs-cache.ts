/**
 * Shared in-process cache for the /api/bodyshop-jobs list/counts response.
 * Lives outside route.ts so non-route modules (e.g. the GDMS import) can
 * invalidate it after a bulk write without violating Next.js's rule that
 * route files may only export HTTP method handlers + a few config fields.
 */

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearBodyshopJobsCache() {
  cache.clear();
}

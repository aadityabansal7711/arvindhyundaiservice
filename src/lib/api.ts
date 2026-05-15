/** Lightweight API client using fetch (no axios bundle). */

type ApiError = { error?: string; message?: string };
type ApiGetOptions = {
  cacheMs?: number;
  signal?: AbortSignal;
};

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const getCache = new Map<string, CacheEntry>();
const inflightGets = new Map<string, Promise<unknown>>();

function invalidateApiCache(url: string) {
  const [path] = url.split("?");
  const parentPath = path.split("/").slice(0, -1).join("/");
  for (const key of getCache.keys()) {
    if (
      key === url ||
      key === path ||
      key.startsWith(`${path}?`) ||
      key.startsWith(`${path}/`) ||
      (parentPath && (key === parentPath || key.startsWith(`${parentPath}?`)))
      || (parentPath && key.startsWith(`${parentPath}/`))
    ) {
      getCache.delete(key);
    }
  }
}

export function clearApiCache(urlPrefix?: string) {
  if (!urlPrefix) {
    getCache.clear();
    inflightGets.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key === urlPrefix || key.startsWith(urlPrefix)) getCache.delete(key);
  }
  for (const key of inflightGets.keys()) {
    if (key === urlPrefix || key.startsWith(urlPrefix)) inflightGets.delete(key);
  }
}

async function handleRes<T>(res: Response): Promise<T> {
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const err = data as ApiError;
    throw new Error(err?.error ?? err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function apiGet<T = unknown>(url: string, options: ApiGetOptions = {}): Promise<T> {
  const { cacheMs = 0, signal } = options;
  const now = Date.now();

  if (cacheMs > 0) {
    const cached = getCache.get(url);
    if (cached && cached.expiresAt > now) return cached.data as T;

    const inflight = signal ? undefined : inflightGets.get(url);
    if (inflight) return inflight as Promise<T>;
  }

  const request = fetch(url, {
    credentials: "include",
    cache: "no-store",
    signal,
  })
    .then((res) => handleRes<T>(res))
    .then((data) => {
      if (cacheMs > 0) {
        getCache.set(url, { data, expiresAt: Date.now() + cacheMs });
      }
      return data;
    })
    .finally(() => {
      inflightGets.delete(url);
    });

  if (cacheMs > 0 && !signal) inflightGets.set(url, request);
  return request;
}

export async function apiPost<T = unknown>(url: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: isForm ? undefined : { "Content-Type": "application/json", ...headers },
    body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });
  const data = await handleRes<T>(res);
  invalidateApiCache(url);
  return data;
}

export async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await handleRes<T>(res);
  invalidateApiCache(url);
  return data;
}

export async function apiDelete<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE", credentials: "include" });
  const data = await handleRes<T>(res);
  invalidateApiCache(url);
  return data;
}

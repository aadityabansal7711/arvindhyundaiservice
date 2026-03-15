/** Lightweight API client using fetch (no axios bundle). */

type ApiError = { error?: string; message?: string };

async function handleRes<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const err = data as ApiError;
    throw new Error(err?.error ?? err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  return handleRes<T>(res);
}

export async function apiPost<T = unknown>(url: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: isForm ? undefined : { "Content-Type": "application/json", ...headers },
    body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });
  return handleRes<T>(res);
}

export async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleRes<T>(res);
}

export async function apiDelete<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE", credentials: "include" });
  return handleRes<T>(res);
}

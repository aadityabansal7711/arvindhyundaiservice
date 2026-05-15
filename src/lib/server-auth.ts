import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { getBranchScopeForSessionUser } from "@/lib/bypass-only-user";
import { isOwnerUser } from "@/lib/owner-access";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type SessionUser = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
  permissions?: string[];
  branchId?: string | null;
  branchIds?: string[];
  mustChangePassword?: boolean;
};

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export function getPermissions(user: unknown): string[] {
  const permissions = (user as { permissions?: unknown } | null | undefined)?.permissions;
  return Array.isArray(permissions) ? permissions.filter((p): p is string => typeof p === "string") : [];
}

export function hasAnyPermission(user: unknown, keys: string[]): boolean {
  const permissions = getPermissions(user);
  return keys.some((key) => permissions.includes(key));
}

export async function requireSession(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, user: session.user as SessionUser };
}

export async function requireAnyPermission(keys: string[]): Promise<AuthResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  if (!hasAnyPermission(auth.user, keys)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}

export async function requireOwnerAdmin(keys: string[] = ["users.manage"]): Promise<AuthResult> {
  const auth = await requireAnyPermission(keys);
  if (!auth.ok) return auth;
  if (!isOwnerUser(auth.user)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}

export async function requireBodyshopAccess(): Promise<AuthResult> {
  return requireAnyPermission(["ro.view", "users.manage"]);
}

export async function canAccessBranch(user: SessionUser, branchId: string | null): Promise<boolean> {
  const scope = await getBranchScopeForSessionUser(user);
  if (scope.kind === "all") return true;
  return branchId != null && scope.ids.includes(branchId);
}

export function rejectCrossSiteMutation(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }
  return null;
}

export function rejectUnsupportedJson(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(method)) return null;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  return null;
}

export function validateMutationRequest(request: NextRequest): NextResponse | null {
  return rejectCrossSiteMutation(request) ?? rejectUnsupportedJson(request);
}

export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
    }
    return value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

export function enforceRateLimit(
  request: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
  identity?: string | null
): NextResponse | null {
  const ip = getClientIp(request.headers);
  const key = `${bucket}:${identity || "anonymous"}:${ip}`;
  const result = checkRateLimit({ key, limit, windowMs });
  if (result.allowed) return null;

  const response = NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 }
  );
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  return response;
}

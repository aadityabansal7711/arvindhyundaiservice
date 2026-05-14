export const OWNER_EMAIL = "mayank.arvind.bansal@gmail.com";

export function isOwnerUser(user: unknown): boolean {
  const maybeUser = user as { email?: unknown; role?: unknown } | null | undefined;
  const email = typeof maybeUser?.email === "string" ? maybeUser.email.trim().toLowerCase() : "";
  const role = typeof maybeUser?.role === "string" ? maybeUser.role.trim().toLowerCase() : "";

  return email === OWNER_EMAIL || role === "owner/admin" || role === "owner";
}

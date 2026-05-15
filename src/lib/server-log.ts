type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "newPassword",
  "token",
  "secret",
  "serviceRoleKey",
]);

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const safe: LogFields = {};
  for (const [key, item] of Object.entries(value as LogFields)) {
    safe[key] = REDACTED_KEYS.has(key) ? "[redacted]" : sanitize(item);
  }
  return safe;
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const safeFields = sanitize(fields) as LogFields;
  const payload = {
    level,
    event,
    at: new Date().toISOString(),
    ...safeFields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

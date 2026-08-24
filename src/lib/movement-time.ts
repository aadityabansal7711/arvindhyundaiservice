import { format, isValid, parse } from "date-fns";

const INDIA_OFFSET_MINUTES = 5 * 60 + 30;
const REMARK_TIME_RE = /\bon\s+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\b/;

export function movementLocalInputToIso(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const utcMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) -
    INDIA_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export function formatMovementTime(changedAt: string | null | undefined, remark?: string | null): string {
  const remarkMatch = remark?.match(REMARK_TIME_RE);
  if (remarkMatch) {
    const parsed = parse(`${remarkMatch[1]} ${remarkMatch[2]}`, "yyyy-MM-dd HH:mm", new Date());
    if (isValid(parsed)) return format(parsed, "dd MMM yyyy, HH:mm");
  }

  if (!changedAt) return "—";
  const parsed = new Date(changedAt);
  return Number.isNaN(parsed.getTime()) ? "—" : format(parsed, "dd MMM yyyy, HH:mm");
}

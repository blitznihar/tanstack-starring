/**
 * Date coercion helpers. Persisted timestamps may come back as a Date, an ISO
 * string (profile import / string-stored), or an epoch number — and, defensively,
 * we must never crash on a malformed value (e.g. an empty object from a broken
 * serialization path). These coerce safely and never throw.
 */

/** Best-effort Date, or null if the value can't be interpreted as a real time. */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** ISO string, or null if the value can't be interpreted as a real time. */
export function toIso(v: unknown): string | null {
  return toDate(v)?.toISOString() ?? null;
}

/** Current time as an ISO string — the serialization-safe way to persist a timestamp. */
export function nowIso(): string {
  return new Date().toISOString();
}

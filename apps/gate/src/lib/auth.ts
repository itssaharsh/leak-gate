import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of a presented secret with the configured one. Empty config never matches. */
export function secretMatches(presented: string | null, expected: string): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

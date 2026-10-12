import type { DrillReport, Field, Hit } from "@leakgate/drill";

export const FIELD_LABEL: Record<Field, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  password: "Password",
  address: "Address",
};

export const FIELD_ORDER: Field[] = ["name", "email", "phone", "password", "address"];
export const DEST_ORDER = ["database", "app-logs", "error-tracker", "analytics", "email-vendor", "shipping-vendor"];

/** All leaks into one destination: the fields that reached it and the captures that prove it. */
export interface Leak {
  key: string;
  destination: string;
  fields: Field[];
  hits: Hit[];
}

export function leaksOf(report?: DrillReport | null): Leak[] {
  if (!report) return [];
  const byDest = new Map<string, Leak>();
  for (const h of report.hits) {
    if (h.allowed) continue;
    const l = byDest.get(h.destination) ?? { key: h.destination, destination: h.destination, fields: [], hits: [] };
    if (!l.fields.includes(h.field)) {
      l.fields.push(h.field);
      l.hits.push(h);
    }
    byDest.set(h.destination, l);
  }
  for (const l of byDest.values()) l.fields.sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b));
  return [...byDest.values()].sort((a, b) => DEST_ORDER.indexOf(a.destination) - DEST_ORDER.indexOf(b.destination));
}

/** Number of (field, destination) pairs outside the data map. */
export function leakCount(report?: DrillReport | null): number {
  return leaksOf(report).reduce((n, l) => n + l.fields.length, 0);
}

export interface Edge {
  key: string;
  field: Field;
  destination: string;
  allowed: boolean;
}

export function edgesOf(report?: DrillReport | null): Edge[] {
  if (!report) return [];
  const seen = new Map<string, Edge>();
  for (const h of report.hits) {
    const key = `${h.field}->${h.destination}`;
    if (!seen.has(key)) seen.set(key, { key, field: h.field, destination: h.destination, allowed: h.allowed });
  }
  return [...seen.values()];
}

export type Piece = { text: string; mark: boolean };

/** Splits text into plain and marked pieces for every needle that occurs in it. */
export function markNeedles(text: string, needles: string[]): Piece[] {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const n of needles) {
    if (!n) continue;
    let i = lower.indexOf(n.toLowerCase());
    while (i >= 0) {
      ranges.push([i, i + n.length]);
      i = lower.indexOf(n.toLowerCase(), i + n.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out: Piece[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push({ text: text.slice(at, s), mark: false });
    out.push({ text: text.slice(s, e), mark: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

/** The capture that shows the most planted values for a destination. */
export function bestCapture(l: Leak): Hit {
  const needles = l.hits.map((h) => h.needle.toLowerCase());
  let best = l.hits[0];
  let score = -1;
  for (const h of l.hits) {
    const t = h.excerpt.toLowerCase();
    const s = needles.filter((n) => t.includes(n)).length;
    if (s > score) {
      best = h;
      score = s;
    }
  }
  return best;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function when(ms: number): string {
  return (
    new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
  );
}

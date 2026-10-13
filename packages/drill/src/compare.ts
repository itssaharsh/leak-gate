import { findMarkers, type Canary } from "./canary";
import { isAllowed, type DataMap } from "./datamap";
import type { AccessWindow, Capture, DestinationSummary, Hit, JourneyResult } from "./types";

const EXCERPT = 240;

export function excerptAround(text: string, index: number, length: number): string {
  const flat = text.replace(/\s+/g, " ");
  if (flat.length <= EXCERPT) return flat;
  const start = Math.max(0, Math.min(index - 80, flat.length - EXCERPT));
  const end = Math.min(flat.length, start + EXCERPT);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}

function journeyAt(at: number, journeys: JourneyResult[]): JourneyResult | undefined {
  // A record written while a request was in flight belongs to that request; otherwise to the
  // request that finished most recently, since some records are written just after the response.
  const SLACK = 1500;
  const inside = journeys.filter((j) => at >= j.startedAt - 50 && at <= j.endedAt + 50);
  if (inside.length) return inside[inside.length - 1];
  let best: JourneyResult | undefined;
  for (const j of journeys) if (at > j.endedAt && at <= j.endedAt + SLACK && (!best || j.endedAt > best.endedAt)) best = j;
  return best;
}

/**
 * Journeys are timed on the drill's clock and captures on the shop's. Each journey takes its window
 * from the shop's own access line for it (matched in order by route), so both are on one clock.
 */
export function onShopClock(journeys: JourneyResult[], windows: AccessWindow[]): JourneyResult[] {
  const used = new Set<number>();
  return journeys.map((j) => {
    const k = windows.findIndex((w, i) => !used.has(i) && w.path === j.route);
    if (k < 0) return j;
    used.add(k);
    return { ...j, startedAt: windows[k].start, endedAt: windows[k].end };
  });
}

/** Turns raw captures into hits: one per (capture, field), labelled allowed or leak. */
export function matchCaptures(captures: Capture[], canary: Canary, map: DataMap, journeys: JourneyResult[] = []): Hit[] {
  const hits: Hit[] = [];
  const known = new Set(map.destinations.map((d) => d.id));
  for (const capture of captures) {
    const flat = capture.text.replace(/\s+/g, " ");
    for (const { marker, needle, index } of findMarkers(flat, canary.markers)) {
      const journey = journeyAt(capture.at, journeys);
      hits.push({
        field: marker.field,
        destination: capture.destination,
        allowed: isAllowed(map, marker.field, capture.destination),
        needle,
        excerpt: excerptAround(flat, index, needle.length),
        source: capture.source,
        at: capture.at,
        ref: capture.ref,
        journey: journey?.id,
        file: journey?.file,
        ...(known.has(capture.destination) ? {} : { unknownDestination: true }),
      });
    }
  }
  return dedupe(hits);
}

/** Keeps one hit per (field, destination, excerpt) so a retried request is not counted twice. */
function dedupe(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.field}|${h.destination}|${h.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A leak is a distinct (field, destination) pair outside the data map. */
export function countLeaks(hits: Hit[]): number {
  return new Set(hits.filter((h) => !h.allowed).map((h) => `${h.field}->${h.destination}`)).size;
}

export function summarize(hits: Hit[], map: DataMap): DestinationSummary[] {
  const declared: DestinationSummary[] = map.destinations.map((d) => {
    const mine = hits.filter((h) => h.destination === d.id);
    return {
      id: d.id,
      label: d.label,
      kind: d.kind,
      simulated: Boolean(d.simulated),
      leaks: new Set(mine.filter((h) => !h.allowed).map((h) => h.field)).size,
      allowedHits: new Set(mine.filter((h) => h.allowed).map((h) => h.field)).size,
    };
  });
  // Destinations the data map has never heard of still show up, so a new recipient is never invisible.
  const unknown = [...new Set(hits.filter((h) => h.unknownDestination).map((h) => h.destination))].map((id) => ({
    id,
    label: id,
    kind: "unknown" as const,
    simulated: true,
    leaks: new Set(hits.filter((h) => h.destination === id).map((h) => h.field)).size,
    allowedHits: 0,
  }));
  return [...declared, ...unknown];
}

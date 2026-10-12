import { findMarkers, type Canary } from "./canary";
import { isAllowed, type DataMap } from "./datamap";
import type { Capture, DestinationSummary, Hit, JourneyResult } from "./types";

const EXCERPT = 240;

export function excerptAround(text: string, index: number, length: number): string {
  const flat = text.replace(/\s+/g, " ");
  if (flat.length <= EXCERPT) return flat;
  const start = Math.max(0, Math.min(index - 80, flat.length - EXCERPT));
  const end = Math.min(flat.length, start + EXCERPT);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}

function journeyAt(at: number, journeys: JourneyResult[]): JourneyResult | undefined {
  // Records are written during, or shortly after, the request that caused them.
  const SLACK = 1500;
  let best: JourneyResult | undefined;
  for (const j of journeys) {
    if (at >= j.startedAt - 50 && at <= j.endedAt + SLACK) best = j;
  }
  return best;
}

/** Turns raw captures into hits: one per (capture, field), labelled allowed or leak. */
export function matchCaptures(captures: Capture[], canary: Canary, map: DataMap, journeys: JourneyResult[] = []): Hit[] {
  const hits: Hit[] = [];
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
  return map.destinations.map((d) => {
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
}

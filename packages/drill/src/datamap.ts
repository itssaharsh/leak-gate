import { parse } from "yaml";
import { FIELDS, type Field } from "./canary";

export type DestinationKind = "internal" | "vendor";

export interface Destination {
  id: string;
  label: string;
  kind: DestinationKind;
  /** Shown on vendor rows: these vendors are stubs that record what they receive. */
  simulated?: boolean;
}

export interface DataMap {
  destinations: Destination[];
  /** For each field, the destinations it may reach. Anything else is a leak. */
  allowed: Record<Field, string[]>;
}

/** Parses privacy/datamap.yml. Throws with a readable message on a bad file. */
export function parseDataMap(source: string): DataMap {
  const doc = parse(source) as {
    destinations?: Record<string, { label?: string; kind?: string; simulated?: boolean }>;
    fields?: Record<string, { allowed?: string[] } | string[] | null>;
  };
  if (!doc || typeof doc !== "object") throw new Error("datamap: empty or not a mapping");
  if (!doc.destinations) throw new Error("datamap: missing 'destinations'");
  if (!doc.fields) throw new Error("datamap: missing 'fields'");

  const destinations: Destination[] = Object.entries(doc.destinations).map(([id, d]) => {
    const kind = d?.kind === "vendor" ? "vendor" : d?.kind === "internal" ? "internal" : null;
    if (!kind) throw new Error(`datamap: destination '${id}' needs kind: internal or vendor`);
    return { id, label: d.label ?? id, kind, simulated: Boolean(d.simulated) };
  });
  const known = new Set(destinations.map((d) => d.id));

  const allowed = {} as Record<Field, string[]>;
  for (const field of FIELDS) {
    const entry = doc.fields[field];
    const list = Array.isArray(entry) ? entry : entry?.allowed ?? [];
    for (const dest of list) {
      if (!known.has(dest)) throw new Error(`datamap: field '${field}' allows unknown destination '${dest}'`);
    }
    allowed[field] = list;
  }
  return { destinations, allowed };
}

export function isAllowed(map: DataMap, field: Field, destination: string): boolean {
  return map.allowed[field]?.includes(destination) ?? false;
}

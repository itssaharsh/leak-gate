import type { Canary, Field } from "./canary";
import type { DataMap } from "./datamap";

/** One record read from a sink: a log line, a vendor request body, a database item. */
export interface Capture {
  destination: string;
  /** Where it was read from, e.g. "/aws/lambda/leakgate-shop-leaky" or "vendor:analytics". */
  source: string;
  text: string;
  /** Epoch milliseconds. */
  at: number;
  /** A stable reference to the record (log stream + event id, vendor capture id). */
  ref?: string;
}

export interface Hit {
  field: Field;
  destination: string;
  allowed: boolean;
  /** The planted substring as it appeared in the capture. */
  needle: string;
  /** Up to ~240 characters of the capture around the needle. */
  excerpt: string;
  source: string;
  at: number;
  ref?: string;
  /** The journey that was running when the record was written, if known. */
  journey?: string;
  /** The shop file that handles that journey's request. */
  file?: string;
  /** The destination is not listed in the data map at all: a new recipient that needs privacy review. */
  unknownDestination?: boolean;
}

/** One drill request as the shop logged it, on the shop's (AWS) clock. */
export interface AccessWindow {
  path: string;
  start: number;
  end: number;
}

export interface JourneyResult {
  id: string;
  label: string;
  route: string;
  file: string;
  status: number;
  ok: boolean;
  startedAt: number;
  endedAt: number;
  error?: string;
}

export type StepId =
  | "plant"
  | "journeys"
  | "settle"
  | "search-logs"
  | "search-vendors"
  | "search-database"
  | "compare";

export interface DrillEvent {
  at: number;
  step: StepId;
  label: string;
  /** 1-based step index and total, for "Running 3/9" style labels. */
  index: number;
  total: number;
  state: "running" | "done" | "error";
  detail?: string;
}

export interface DestinationSummary {
  id: string;
  label: string;
  /** "unknown": the data reached a destination the data map does not list. */
  kind: "internal" | "vendor" | "unknown";
  simulated: boolean;
  leaks: number;
  allowedHits: number;
}

export interface DrillReport {
  schema: "leak-gate/drill-report@1";
  runId: string;
  build: string;
  env: string;
  shopUrl: string;
  startedAt: number;
  endedAt: number;
  canary: Omit<Canary, "markers"> & { markers: { field: Field; value: string }[] };
  journeys: JourneyResult[];
  destinations: DestinationSummary[];
  hits: Hit[];
  leaks: number;
  status: "passed" | "blocked" | "error";
  error?: string;
  events: DrillEvent[];
  /** Set when the report comes from CI. */
  ci?: { pipelineUrl?: string; jobUrl?: string; mergeRequest?: string; commit?: string; project?: string };
}

export interface SinkReader {
  destination: string;
  read(window: { start: number; end: number }): Promise<Capture[]>;
}

export interface DrillContext {
  canary: Canary;
  datamap: DataMap;
}

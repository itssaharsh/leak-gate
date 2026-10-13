import { makeCanary, type Canary } from "./canary";
import { countLeaks, matchCaptures, onShopClock, summarize } from "./compare";
import type { DataMap } from "./datamap";
import { JOURNEYS, runHttpJourneys } from "./journeys";
import {
  cloudWatchReader,
  databaseReader,
  seenVendors,
  vendorReader,
  VENDORS,
  waitForAccessLines,
  type AwsSinkConfig,
} from "./sinks";
import type { AccessWindow, Capture, DrillEvent, DrillReport, JourneyResult, StepId } from "./types";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "plant", label: "Planting synthetic customer" },
  { id: "journeys", label: "Running the customer's journeys" },
  { id: "settle", label: "Waiting for the shop's logs to land" },
  { id: "search-logs", label: "Searching app logs" },
  { id: "search-vendors", label: "Searching vendor captures" },
  { id: "search-database", label: "Searching the shop database" },
  { id: "compare", label: "Comparing with the data map" },
];

export interface DrillOptions {
  shopUrl: string;
  build: string;
  sinks: AwsSinkConfig;
  datamap: DataMap;
  firstName?: string;
  canary?: Canary;
  onEvent?: (e: DrillEvent) => void | Promise<void>;
  /** Journeys run over HTTP by default; CI may pass a browser runner. */
  journeys?: (shopUrl: string, canary: Canary, onJourney: (j: JourneyResult) => void) => Promise<JourneyResult[]>;
  settleTimeoutMs?: number;
}

export async function runDrill(opts: DrillOptions): Promise<DrillReport> {
  const events: DrillEvent[] = [];
  const emit = async (step: StepId, state: DrillEvent["state"], detail?: string) => {
    const index = STEPS.findIndex((s) => s.id === step) + 1;
    const e: DrillEvent = { at: Date.now(), step, label: STEPS[index - 1].label, index, total: STEPS.length, state, detail };
    events.push(e);
    await opts.onEvent?.(e);
  };

  const canary = opts.canary ?? makeCanary(opts.firstName);
  const startedAt = Date.now();
  const base: Omit<DrillReport, "endedAt" | "destinations" | "hits" | "leaks" | "status"> = {
    schema: "leak-gate/drill-report@1",
    runId: canary.runId,
    build: opts.build,
    env: opts.sinks.env,
    shopUrl: opts.shopUrl,
    startedAt,
    canary: { ...canary, markers: canary.markers.map((m) => ({ field: m.field, value: m.value })) },
    journeys: [],
    events,
  };
  let journeys: JourneyResult[] = [];

  const fail = async (step: StepId, message: string): Promise<DrillReport> => {
    await emit(step, "error", message);
    return {
      ...base,
      journeys,
      endedAt: Date.now(),
      destinations: summarize([], opts.datamap),
      hits: [],
      leaks: 0,
      status: "error",
      error: `${STEPS.find((s) => s.id === step)?.label}: ${message}`,
    };
  };

  await emit("plant", "running");
  await emit("plant", "done", `${canary.name} · ${canary.email}`);

  await emit("journeys", "running");
  const runner = opts.journeys ?? ((url, c, on) => runHttpJourneys(url, c, on));
  try {
    journeys = await runner(opts.shopUrl, canary, (j) => {
      void emit("journeys", "running", `${j.label}: ${j.ok ? j.status : j.error}`);
    });
  } catch (e) {
    return fail("journeys", String(e));
  }
  const broken = journeys.find((j) => !j.ok);
  if (broken) return fail("journeys", `${broken.label} stopped: ${broken.error}`);
  await emit("journeys", "done", `${journeys.length}/${JOURNEYS.length} journeys`);

  await emit("settle", "running");
  let windows: AccessWindow[] = [];
  try {
    windows = await waitForAccessLines(opts.sinks, canary.runId, journeys.length, { start: startedAt - 2_000 }, opts.settleTimeoutMs);
    await emit("settle", "done", `${windows.length}/${journeys.length} access lines in CloudWatch`);
  } catch (e) {
    return fail("settle", String(e));
  }

  const window = { start: startedAt - 2_000, end: Date.now() + 5_000 };
  const needles = canary.markers.flatMap((m) => m.needles);
  const captures: Capture[] = [];

  await emit("search-logs", "running");
  try {
    const logs = await cloudWatchReader(opts.sinks, needles).read(window);
    captures.push(...logs);
    await emit("search-logs", "done", `${logs.length} matching log events`);
  } catch (e) {
    return fail("search-logs", String(e));
  }

  await emit("search-vendors", "running");
  try {
    let n = 0;
    const declared = opts.datamap.destinations.filter((d) => d.kind === "vendor").map((d) => d.id);
    const vendors = [...new Set<string>([...VENDORS, ...declared, ...(await seenVendors(opts.sinks))])];
    for (const v of vendors) {
      const got = await vendorReader(opts.sinks, v).read(window);
      n += got.length;
      captures.push(...got);
    }
    await emit("search-vendors", "done", `${n} vendor requests read`);
  } catch (e) {
    return fail("search-vendors", String(e));
  }

  await emit("search-database", "running");
  try {
    const rows = await databaseReader(opts.sinks).read(window);
    captures.push(...rows);
    await emit("search-database", "done", `${rows.length} records read`);
  } catch (e) {
    return fail("search-database", String(e));
  }

  await emit("compare", "running");
  const hits = matchCaptures(captures, canary, opts.datamap, onShopClock(journeys, windows));
  const leaks = countLeaks(hits);
  await emit("compare", "done", leaks === 0 ? "no planted value outside the data map" : `${leaks} leak${leaks === 1 ? "" : "s"}`);

  return {
    ...base,
    journeys,
    endedAt: Date.now(),
    destinations: summarize(hits, opts.datamap),
    hits,
    leaks,
    status: leaks === 0 ? "passed" : "blocked",
  };
}

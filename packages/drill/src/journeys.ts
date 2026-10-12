import type { Canary } from "./canary";
import type { JourneyResult } from "./types";

export interface JourneySpec {
  id: string;
  label: string;
  route: string;
  /** The shop file that handles the route, used to point findings at code. */
  file: string;
  expect: number[];
  body: (canary: Canary, state: Record<string, string>) => Record<string, unknown>;
  after?: (json: Record<string, unknown>, state: Record<string, string>) => void;
}

/** The customer's path through the shop, in order. Each request is one access line. */
export const JOURNEYS: JourneySpec[] = [
  {
    id: "signup-weak",
    label: "Signing up (a too-short password first)",
    route: "/api/signup",
    file: "apps/shop/src/app/api/signup/route.ts",
    expect: [400],
    body: (c) => ({ name: c.name, email: c.email, phone: c.phone, password: c.password.slice(0, 6), newsletter: true }),
  },
  {
    id: "signup",
    label: "Signing up",
    route: "/api/signup",
    file: "apps/shop/src/app/api/signup/route.ts",
    expect: [200, 201],
    body: (c) => ({ name: c.name, email: c.email, phone: c.phone, password: c.password, newsletter: true }),
    after: (json, state) => {
      if (typeof json.userId === "string") state.userId = json.userId;
    },
  },
  {
    id: "checkout",
    label: "Checking out",
    route: "/api/checkout",
    file: "apps/shop/src/app/api/checkout/route.ts",
    expect: [200, 201],
    body: (c, s) => ({ userId: s.userId, name: c.name, email: c.email, address: c.address, plan: "monthly-fern" }),
  },
  {
    id: "support",
    label: "Sending a support message",
    route: "/api/support",
    file: "apps/shop/src/app/api/support/route.ts",
    expect: [200, 202],
    body: (c) => ({ email: c.email, message: "Can I pause my plant box for one month while I travel?" }),
  },
];

/** Runs every journey over HTTP. Stops at the first request that fails outright. */
export async function runHttpJourneys(
  shopUrl: string,
  canary: Canary,
  onJourney?: (j: JourneyResult) => void,
  timeoutMs = 10_000,
): Promise<JourneyResult[]> {
  const results: JourneyResult[] = [];
  const state: Record<string, string> = {};
  for (const spec of JOURNEYS) {
    const startedAt = Date.now();
    let status = 0;
    let error: string | undefined;
    try {
      const res = await fetch(new URL(spec.route, shopUrl), {
        method: "POST",
        headers: { "content-type": "application/json", "x-drill-run": canary.runId, "user-agent": "leak-gate-drill/0.1" },
        body: JSON.stringify(spec.body(canary, state)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      spec.after?.(json, state);
      if (!spec.expect.includes(status)) error = `expected ${spec.expect.join(" or ")}, got ${status}`;
    } catch (e) {
      error = e instanceof Error && e.name === "TimeoutError" ? `the shop did not answer in ${timeoutMs / 1000} s` : String(e);
    }
    const result: JourneyResult = {
      id: spec.id,
      label: spec.label,
      route: spec.route,
      file: spec.file,
      status,
      ok: !error,
      startedAt,
      endedAt: Date.now(),
      error,
    };
    results.push(result);
    onJourney?.(result);
    if (!result.ok) break;
  }
  return results;
}

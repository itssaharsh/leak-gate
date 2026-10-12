import { makeCanary, runDrill } from "@leakgate/drill";
import { config, dataMap, shopBuilds } from "@/lib/config";
import { appendEvent, finishRun, startRun, takeDrillSlot } from "@/lib/store";

export const maxDuration = 60;

/**
 * Runs a live drill against one of the kept shop builds. The client picks the run id
 * (a UUID) so it can poll GET /api/runs/<id> for steps while this request is open.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { build?: string; name?: string; id?: string };
  const build = shopBuilds().find((b) => b.id === body.build);
  if (!build) return Response.json({ error: "Pick a build: leaky or fixed." }, { status: 400 });
  if (!body.id || !/^[0-9a-f-]{36}$/.test(body.id)) return Response.json({ error: "Send a UUID as id." }, { status: 400 });

  const wait = await takeDrillSlot();
  if (wait > 0) return Response.json({ error: `Next drill in ${wait} s. Drills are limited to keep this demo free.`, retryAfter: wait }, { status: 429 });

  const canary = makeCanary(body.name);
  canary.runId = `live_${body.id}`;
  await startRun({ id: canary.runId, kind: "live", build: build.id, startedAt: Date.now(), label: build.label });

  const report = await runDrill({
    shopUrl: build.url,
    build: build.id,
    canary,
    datamap: dataMap(),
    sinks: { region: config.region, env: build.env, logGroup: build.logGroup, capturesTable: config.capturesTable, usersTable: config.usersTable },
    onEvent: (e) => appendEvent(canary.runId, e).catch(() => undefined),
    settleTimeoutMs: 25_000,
  });
  await finishRun(canary.runId, report);
  return Response.json(report, { status: 200, headers: { "cache-control": "no-store" } });
}

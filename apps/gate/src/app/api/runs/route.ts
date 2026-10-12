import type { DrillReport } from "@leakgate/drill";
import { bearer, secretMatches } from "@/lib/auth";
import { config } from "@/lib/config";
import { listRuns, putCiRun, type RunKind } from "@/lib/store";

/** Recent runs without their full reports, newest first. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as RunKind | null;
  const mr = url.searchParams.get("mr") ?? undefined;
  const runs = await listRuns({ kind: kind ?? undefined, mr }, 30);
  return Response.json(
    runs.map(({ report, ...r }) => ({ ...r, leaks: report?.leaks ?? null, events: undefined })),
    { headers: { "cache-control": "no-store" } },
  );
}

/** The CI drill job posts its finished report here (bearer token). */
export async function POST(req: Request) {
  if (!secretMatches(bearer(req), config.drillToken)) return Response.json({ error: "Missing or wrong token" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { report?: DrillReport; mr?: string; label?: string } | null;
  const report = body?.report;
  if (!report || report.schema !== "leak-gate/drill-report@1" || typeof report.runId !== "string") {
    return Response.json({ error: "Send { report } with a leak-gate/drill-report@1 body" }, { status: 400 });
  }
  if (JSON.stringify(report).length > 300_000) return Response.json({ error: "Report too large" }, { status: 413 });
  await putCiRun(report, { mr: body?.mr?.slice(0, 20), label: body?.label?.slice(0, 200) });
  return Response.json({ stored: report.runId }, { status: 201 });
}

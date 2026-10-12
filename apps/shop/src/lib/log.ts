/** Structured log line to stdout; on Lambda this lands in CloudWatch Logs. */
export function log(msg: string, fields: Record<string, unknown> = {}, level: "info" | "warn" | "error" = "info") {
  console.log(JSON.stringify({ level, msg, ...fields, at: new Date().toISOString() }));
}

/**
 * One access line per API request. Requests from the Leak Gate drill carry its run id,
 * so the drill can tell when its requests' logs have reached CloudWatch.
 */
export function accessLine(req: Request, path: string, status: number, startedAt: number) {
  const run = req.headers.get("x-drill-run");
  log(run ? "drill-request" : "request", {
    run: run ?? undefined,
    path,
    status,
    ms: Date.now() - startedAt,
  });
}

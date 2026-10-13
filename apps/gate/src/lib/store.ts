import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { captureSortKey, seenVendorsKey, VENDORS, type DrillEvent, type DrillReport } from "@leakgate/drill";
import { config } from "./config";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const DAY = 24 * 3600;

export async function putCapture(vendor: string, env: string, body: string, id: string) {
  const at = Date.now();
  await db.send(
    new PutCommand({
      TableName: config.capturesTable,
      Item: { vendor, sk: captureSortKey(at, id), env, body, at, ttl: Math.floor(at / 1000) + 7 * DAY },
    }),
  );
  // Note vendors outside the known four, so the drill reads destinations nobody declared.
  if (!(VENDORS as readonly string[]).includes(vendor)) {
    await db.send(new PutCommand({ TableName: config.capturesTable, Item: { vendor: seenVendorsKey(env), sk: vendor, env, at, ttl: Math.floor(at / 1000) + 7 * DAY } }));
  }
}

export type RunKind = "ci" | "live";

export interface RunRecord {
  id: string;
  kind: RunKind;
  build: string;
  status: "running" | DrillReport["status"];
  startedAt: number;
  updatedAt: number;
  mr?: string;
  label?: string;
  events: DrillEvent[];
  report?: DrillReport;
}

export async function startRun(r: Omit<RunRecord, "events" | "updatedAt" | "status">) {
  await db.send(
    new PutCommand({
      TableName: config.runsTable,
      Item: {
        ...r,
        status: "running",
        events: [],
        updatedAt: Date.now(),
        ttl: r.kind === "live" ? Math.floor(Date.now() / 1000) + 30 * DAY : undefined,
      },
      ConditionExpression: "attribute_not_exists(id)",
    }),
  );
}

export async function appendEvent(id: string, e: DrillEvent) {
  await db.send(
    new UpdateCommand({
      TableName: config.runsTable,
      Key: { id },
      UpdateExpression: "SET events = list_append(if_not_exists(events, :empty), :e), updatedAt = :now",
      ExpressionAttributeValues: { ":e": [e], ":empty": [], ":now": Date.now() },
    }),
  );
}

export async function finishRun(id: string, report: DrillReport) {
  await db.send(
    new UpdateCommand({
      TableName: config.runsTable,
      Key: { id },
      UpdateExpression: "SET #s = :s, report = :r, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": report.status, ":r": JSON.stringify(report), ":now": Date.now() },
    }),
  );
}

/** Stores a finished report sent by the CI drill job. */
export async function putCiRun(report: DrillReport, extra: { mr?: string; label?: string }) {
  await db.send(
    new PutCommand({
      TableName: config.runsTable,
      Item: {
        id: report.runId,
        kind: "ci",
        build: report.build,
        status: report.status,
        startedAt: report.startedAt,
        updatedAt: Date.now(),
        mr: extra.mr,
        label: extra.label,
        events: [],
        report: JSON.stringify(report),
      },
    }),
  );
}

function fromItem(item: Record<string, unknown>): RunRecord {
  return {
    ...(item as unknown as RunRecord),
    report: typeof item.report === "string" ? (JSON.parse(item.report) as DrillReport) : undefined,
  };
}

export async function getRun(id: string): Promise<RunRecord | null> {
  const res = await db.send(new GetCommand({ TableName: config.runsTable, Key: { id } }));
  return res.Item ? fromItem(res.Item) : null;
}

/** Recent runs, newest first. The table holds hundreds of rows at most, so a scan is fine. */
export async function listRuns(filter: { kind?: RunKind; mr?: string } = {}, limit = 30): Promise<RunRecord[]> {
  const items: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await db.send(new ScanCommand({ TableName: config.runsTable, ExclusiveStartKey: start }));
    items.push(...(res.Items ?? []));
    start = res.LastEvaluatedKey;
  } while (start && items.length < 2000);
  return items
    .map(fromItem)
    .filter((r) => Boolean(r.kind) && (!filter.kind || r.kind === filter.kind) && (!filter.mr || r.mr === filter.mr))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

const MIN_GAP_MS = 20_000;
const DAILY_CAP = 300;

/**
 * Global limit on live drills: one every 20 seconds and 300 a day, so a public
 * button cannot run up the bill. Returns the seconds to wait, or 0 when allowed.
 */
export async function takeDrillSlot(now = Date.now()): Promise<number> {
  const day = new Date(now).toISOString().slice(0, 10);
  const res = await db.send(new GetCommand({ TableName: config.runsTable, Key: { id: "_ratelimit" } }));
  const prev = res.Item as { lastAt?: number; day?: string; count?: number } | undefined;
  const lastAt = prev?.lastAt ?? 0;
  const count = prev?.day === day ? prev.count ?? 0 : 0;
  if (now - lastAt < MIN_GAP_MS) return Math.ceil((MIN_GAP_MS - (now - lastAt)) / 1000);
  if (count >= DAILY_CAP) return Math.ceil((Date.parse(`${day}T23:59:59Z`) - now) / 1000);
  try {
    await db.send(
      new PutCommand({
        TableName: config.runsTable,
        Item: { id: "_ratelimit", lastAt: now, day, count: count + 1 },
        ConditionExpression: "attribute_not_exists(id) OR lastAt = :prev",
        ExpressionAttributeValues: { ":prev": lastAt },
      }),
    );
    return 0;
  } catch {
    // Someone else took the slot between our read and write.
    return Math.ceil(MIN_GAP_MS / 1000);
  }
}

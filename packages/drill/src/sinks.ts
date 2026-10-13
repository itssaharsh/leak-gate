import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { AccessWindow, Capture, SinkReader } from "./types";

export const VENDORS = ["error-tracker", "analytics", "email-vendor", "shipping-vendor"] as const;
export type Vendor = (typeof VENDORS)[number];

/** Vendor names the gate accepts: the known four, or any lowercase slug for a destination the shop adds later. */
export const VENDOR_SLUG = /^[a-z][a-z0-9-]{1,39}$/;

/** Partition where the gate notes each vendor name an environment has sent data to. */
export function seenVendorsKey(env: string): string {
  return `_seen#${env}`;
}

/** Capture sort keys: zero-padded epoch ms, so a time window is a string range. */
export function captureSortKey(at: number, id: string): string {
  return `${String(at).padStart(13, "0")}#${id}`;
}

/** CloudWatch filter pattern matching any of the terms (OR), each quoted. */
export function anyTermPattern(terms: string[]): string {
  return terms
    .filter((t) => t.length > 0)
    .map((t) => `?"${t.replace(/"/g, "")}"`)
    .join(" ");
}

export interface AwsSinkConfig {
  region?: string;
  /** Shop environment name, e.g. "leaky", "main", "mr-4". */
  env: string;
  logGroup: string;
  capturesTable: string;
  usersTable: string;
}

function docClient(region?: string) {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
}

/** App logs in CloudWatch. Only events containing a planted needle are fetched. */
export function cloudWatchReader(cfg: AwsSinkConfig, needles: string[]): SinkReader {
  const client = new CloudWatchLogsClient({ region: cfg.region });
  return {
    destination: "app-logs",
    async read({ start, end }) {
      const out: Capture[] = [];
      let nextToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const res = await client.send(
          new FilterLogEventsCommand({
            logGroupName: cfg.logGroup,
            startTime: start,
            endTime: end,
            filterPattern: anyTermPattern(needles),
            nextToken,
          }),
        );
        for (const e of res.events ?? []) {
          out.push({
            destination: "app-logs",
            source: cfg.logGroup,
            text: e.message ?? "",
            at: e.timestamp ?? start,
            ref: `${e.logStreamName}/${e.eventId}`,
          });
        }
        nextToken = res.nextToken;
        if (!nextToken) break;
      }
      return out;
    },
  };
}

/** The shop's "drill-request" access lines as time windows. A runtime may put a prefix before the JSON. */
export function parseAccessLines(events: { message?: string; timestamp?: number }[]): AccessWindow[] {
  const out: AccessWindow[] = [];
  for (const e of events) {
    const text = e.message ?? "";
    const i = text.indexOf("{");
    if (i < 0) continue;
    try {
      const o = JSON.parse(text.slice(i)) as { msg?: string; path?: unknown; ms?: unknown };
      if (o.msg !== "drill-request" || typeof o.path !== "string") continue;
      const end = e.timestamp ?? 0;
      out.push({ path: o.path, start: end - (Number(o.ms) || 0), end });
    } catch {
      // not a JSON line
    }
  }
  return out.sort((a, b) => a.end - b.end);
}

/**
 * Waits until the shop's access lines for this run have reached CloudWatch, so the search does
 * not run before the logs it needs exist. Returns them as windows on the shop's clock.
 */
export async function waitForAccessLines(
  cfg: AwsSinkConfig,
  runId: string,
  expected: number,
  window: { start: number },
  timeoutMs = 30_000,
): Promise<AccessWindow[]> {
  const client = new CloudWatchLogsClient({ region: cfg.region });
  const deadline = Date.now() + timeoutMs;
  let seen: AccessWindow[] = [];
  while (Date.now() < deadline) {
    const res = await client.send(
      new FilterLogEventsCommand({
        logGroupName: cfg.logGroup,
        startTime: window.start,
        filterPattern: `"drill-request" "${runId}"`,
      }),
    );
    seen = parseAccessLines(res.events ?? []);
    if (seen.length >= expected) return seen;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return seen;
}

/** Every vendor name this environment has sent data to, including ones the data map does not list. */
export async function seenVendors(cfg: AwsSinkConfig): Promise<string[]> {
  const db = docClient(cfg.region);
  const res = await db.send(
    new QueryCommand({
      TableName: cfg.capturesTable,
      KeyConditionExpression: "vendor = :v",
      ExpressionAttributeValues: { ":v": seenVendorsKey(cfg.env) },
    }),
  );
  return (res.Items ?? []).map((i) => String(i.sk)).filter((v) => VENDOR_SLUG.test(v));
}

/** Requests received by the simulated vendors, recorded by the gate app. */
export function vendorReader(cfg: AwsSinkConfig, vendor: string): SinkReader {
  const db = docClient(cfg.region);
  return {
    destination: vendor,
    async read({ start, end }) {
      const res = await db.send(
        new QueryCommand({
          TableName: cfg.capturesTable,
          KeyConditionExpression: "vendor = :v AND sk BETWEEN :a AND :b",
          FilterExpression: "#env = :env",
          ExpressionAttributeNames: { "#env": "env" },
          ExpressionAttributeValues: {
            ":v": vendor,
            ":a": captureSortKey(start, ""),
            ":b": captureSortKey(end, "~"),
            ":env": cfg.env,
          },
        }),
      );
      return (res.Items ?? []).map((item) => ({
        destination: vendor,
        source: `vendor:${vendor}`,
        text: String(item.body ?? ""),
        at: Number(item.at ?? start),
        ref: String(item.sk),
      }));
    },
  };
}

/** The shop's own user records for this environment (an allowed destination for most fields). */
export function databaseReader(cfg: AwsSinkConfig): SinkReader {
  const db = docClient(cfg.region);
  return {
    destination: "database",
    async read({ start }) {
      const res = await db.send(
        new QueryCommand({
          TableName: cfg.usersTable,
          KeyConditionExpression: "env = :e",
          FilterExpression: "createdAt >= :t",
          ExpressionAttributeValues: { ":e": cfg.env, ":t": start - 5_000 },
        }),
      );
      return (res.Items ?? []).map((item) => ({
        destination: "database",
        source: `${cfg.usersTable}/${cfg.env}`,
        text: JSON.stringify(item),
        at: Number(item.createdAt ?? start),
        ref: String(item.userId),
      }));
    },
  };
}

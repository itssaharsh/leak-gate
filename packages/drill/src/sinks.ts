import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Capture, SinkReader } from "./types";

export const VENDORS = ["error-tracker", "analytics", "email-vendor", "shipping-vendor"] as const;
export type Vendor = (typeof VENDORS)[number];

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

/**
 * Waits until the shop's access lines for this run have reached CloudWatch,
 * so the search does not run before the logs it needs exist.
 */
export async function waitForAccessLines(
  cfg: AwsSinkConfig,
  runId: string,
  expected: number,
  window: { start: number },
  timeoutMs = 30_000,
): Promise<number> {
  const client = new CloudWatchLogsClient({ region: cfg.region });
  const deadline = Date.now() + timeoutMs;
  let seen = 0;
  while (Date.now() < deadline) {
    const res = await client.send(
      new FilterLogEventsCommand({
        logGroupName: cfg.logGroup,
        startTime: window.start,
        filterPattern: `"drill-request" "${runId}"`,
      }),
    );
    seen = res.events?.length ?? 0;
    if (seen >= expected) return seen;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return seen;
}

/** Requests received by the simulated vendors, recorded by the gate app. */
export function vendorReader(cfg: AwsSinkConfig, vendor: Vendor): SinkReader {
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

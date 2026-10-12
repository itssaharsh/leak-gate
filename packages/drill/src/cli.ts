#!/usr/bin/env -S npx tsx
/**
 * leak-drill: plants a synthetic customer in a deployed shop build and reports where her data went.
 *
 *   leak-drill --shop-url https://... --env mr-4 [--build mr-4@abc123] [--datamap privacy/datamap.yml]
 *              [--out reports] [--name Ada] [--post https://gate/] [--mr 4] [--label "..."]
 *
 * Exit codes: 0 no leaks, 1 leaks found, 2 the drill could not finish.
 * Environment: AWS credentials and AWS_REGION; DRILL_TOKEN to post the report to the gate;
 * GitLab's CI_* variables are attached to the report when present.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseDataMap } from "./datamap";
import { toGitLabSecurityReport, toJUnit, toMarkdown } from "./report";
import { runDrill } from "./run";

const { values: a } = parseArgs({
  options: {
    "shop-url": { type: "string", default: process.env.SHOP_URL },
    env: { type: "string", default: process.env.LEAKGATE_ENV },
    build: { type: "string" },
    "log-group": { type: "string" },
    datamap: { type: "string", default: "privacy/datamap.yml" },
    out: { type: "string", default: "reports" },
    name: { type: "string" },
    post: { type: "string", default: process.env.GATE_URL },
    mr: { type: "string", default: process.env.CI_MERGE_REQUEST_IID },
    label: { type: "string" },
    region: { type: "string", default: process.env.AWS_REGION ?? "us-east-1" },
    "captures-table": { type: "string", default: process.env.CAPTURES_TABLE ?? "leakgate-captures" },
    "users-table": { type: "string", default: process.env.USERS_TABLE ?? "leakgate-shop-users" },
  },
});

function need(v: string | undefined, flag: string): string {
  if (!v) {
    console.error(`leak-drill: ${flag} is required`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const shopUrl = need(a["shop-url"], "--shop-url");
  const env = need(a.env, "--env");
  const repoRoot = process.env.CI_PROJECT_DIR ?? process.cwd();
  const datamapPath = path.resolve(repoRoot, a.datamap!);
  const datamap = parseDataMap(readFileSync(datamapPath, "utf8"));
  const build = a.build ?? (process.env.CI_COMMIT_SHORT_SHA ? `${env}@${process.env.CI_COMMIT_SHORT_SHA}` : env);

  console.log(`Leak Gate drill against ${shopUrl} (env ${env}, build ${build})`);
  const report = await runDrill({
    shopUrl,
    build,
    firstName: a.name,
    datamap,
    sinks: {
      region: a.region,
      env,
      logGroup: a["log-group"] ?? `/aws/lambda/leakgate-shop-${env}`,
      capturesTable: a["captures-table"]!,
      usersTable: a["users-table"]!,
    },
    onEvent: (e) => {
      if (e.state !== "running" || e.detail) console.log(`  [${e.index}/${e.total}] ${e.label}${e.detail ? `: ${e.detail}` : ""}`);
    },
  });
  if (process.env.CI) {
    report.ci = {
      pipelineUrl: process.env.CI_PIPELINE_URL,
      jobUrl: process.env.CI_JOB_URL,
      mergeRequest: process.env.CI_MERGE_REQUEST_IID,
      commit: process.env.CI_COMMIT_SHORT_SHA,
      project: process.env.CI_PROJECT_URL,
    };
  }

  const out = path.resolve(repoRoot, a.out!);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "leak-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(path.join(out, "junit.xml"), toJUnit(report, datamap));
  writeFileSync(path.join(out, "gl-sast-report.json"), JSON.stringify(toGitLabSecurityReport(report, datamap), null, 2));
  const md = toMarkdown(report, datamap);
  writeFileSync(path.join(out, "summary.md"), md);
  console.log("\n" + md);

  if (a.post && process.env.DRILL_TOKEN) {
    const res = await fetch(new URL("/api/runs", a.post), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DRILL_TOKEN}` },
      body: JSON.stringify({ report, mr: a.mr, label: a.label }),
    }).catch((e: unknown) => ({ ok: false, status: 0, text: async () => String(e) }));
    console.log(res.ok ? `Posted run ${report.runId} to the console.` : `Could not post the run (${res.status}).`);
  }

  process.exit(report.status === "passed" ? 0 : report.status === "blocked" ? 1 : 2);
}

main().catch((e) => {
  console.error(`leak-drill: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});

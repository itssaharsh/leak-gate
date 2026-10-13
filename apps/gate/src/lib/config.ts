import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDataMap, type DataMap } from "@leakgate/drill";

export interface ShopBuild {
  id: "leaky" | "fixed";
  label: string;
  url: string;
  env: string;
  logGroup: string;
}

export const config = {
  region: process.env.AWS_REGION ?? "us-east-1",
  capturesTable: process.env.CAPTURES_TABLE ?? "leakgate-captures",
  runsTable: process.env.RUNS_TABLE ?? "leakgate-runs",
  usersTable: process.env.USERS_TABLE ?? "leakgate-shop-users",
  vendorKey: process.env.VENDOR_KEY ?? "",
  drillToken: process.env.DRILL_TOKEN ?? "",
  featuredMr: process.env.FEATURED_MR ?? "",
  gitlabProjectUrl: process.env.GITLAB_PROJECT_URL ?? "",
};

/** The two shop builds a visitor can drill: the kept leaky build and the fixed build. */
export function shopBuilds(): ShopBuild[] {
  const builds: ShopBuild[] = [];
  if (process.env.SHOP_LEAKY_URL)
    builds.push({ id: "leaky", label: "Leaky build (before the fix)", url: process.env.SHOP_LEAKY_URL, env: "leaky", logGroup: "/aws/lambda/leakgate-shop-leaky" });
  if (process.env.SHOP_FIXED_URL)
    builds.push({ id: "fixed", label: "Fixed build (main)", url: process.env.SHOP_FIXED_URL, env: "main", logGroup: "/aws/lambda/leakgate-shop-main" });
  return builds;
}

/** One step of what happened on a featured merge request, linked to the GitLab object that proves it. */
export interface StoryStep {
  text: string;
  href?: string;
  /** "hold": the flow stopped for a person; "person": a person decided; "fix": the flow changed code; "pass": the drill passed. */
  kind?: "fail" | "hold" | "person" | "fix" | "pass";
}

export interface FeaturedCase {
  mr: string;
  title: string;
  /** Short label for the switcher, e.g. "Newsletter opt-in: fixed by the flow". */
  label: string;
  story: StoryStep[];
  /** Lifecycle stage links for this merge request, overriding LIFECYCLE. */
  lifecycle?: Record<string, string>;
}

/** Featured merge requests from CASES (JSON), or the single FEATURED_MR. */
export function featuredCases(): FeaturedCase[] {
  try {
    const parsed = JSON.parse(process.env.CASES ?? "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed as FeaturedCase[];
  } catch {
    // fall through to FEATURED_MR
  }
  return config.featuredMr ? [{ mr: config.featuredMr, title: process.env.FEATURED_MR_TITLE ?? "Merge request", label: "", story: [] }] : [];
}

let cached: DataMap | null = null;
export function dataMap(): DataMap {
  if (!cached) cached = parseDataMap(readFileSync(path.join(process.cwd(), "../../privacy/datamap.yml"), "utf8"));
  return cached;
}

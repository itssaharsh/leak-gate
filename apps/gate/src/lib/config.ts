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

let cached: DataMap | null = null;
export function dataMap(): DataMap {
  if (!cached) cached = parseDataMap(readFileSync(path.join(process.cwd(), "../../privacy/datamap.yml"), "utf8"));
  return cached;
}

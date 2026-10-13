import type { DrillReport } from "@leakgate/drill";
import type { RunView, Stage } from "@/components/Console";
import replayRun from "@/fixtures/replay-run.json";
import { config } from "./config";
import { listRuns, type RunRecord } from "./store";

export const replay: RunView = { report: replayRun as unknown as DrillReport, source: "replay", label: "Replay" };

function view(r: RunRecord | undefined, label: string): RunView | null {
  return r?.report ? { report: r.report, source: r.kind === "live" ? "live" : "ci", label: r.label ?? label } : null;
}

/**
 * The featured merge request's first blocked run (before the fix) and its latest passing
 * run (after the fix). Without a featured merge request yet, the latest drill of the leaky build.
 */
export async function featuredRuns(mr: string = config.featuredMr): Promise<{ before: RunView | null; after: RunView | null; error?: string }> {
  try {
    if (mr) {
      const runs = (await listRuns({ kind: "ci", mr }, 50)).filter((r) => r.report);
      const chronological = runs.slice().reverse();
      const firstBlocked = chronological.find((r) => r.status === "blocked");
      const lastPassed = runs.find((r) => r.status === "passed" && (!firstBlocked || r.startedAt > firstBlocked.startedAt));
      return { before: view(firstBlocked, "Merge request pipeline"), after: view(lastPassed, "After the fix") };
    }
    const runs = await listRuns({}, 50);
    const pick = (kind?: string) => runs.find((r) => r.report && r.build.startsWith("leaky") && r.status === "blocked" && (!kind || r.kind === kind));
    return { before: view(pick("ci") ?? pick(), "Drill of the leaky build"), after: null };
  } catch (e) {
    return { before: null, after: null, error: e instanceof Error ? e.name : "error" };
  }
}

/** Lifecycle stages, lit only by real objects. LIFECYCLE is JSON {stage: url} set by the pipeline. */
export function stages(before: RunView | null, after: RunView | null): Stage[] {
  let links: Record<string, string> = {};
  try {
    links = JSON.parse(process.env.LIFECYCLE ?? "{}");
  } catch {
    links = {};
  }
  const repo = config.gitlabProjectUrl.replace(/\/$/, "");
  const def = (id: string, label: string, done: boolean, what: string, href?: string): Stage => ({ id, label, done, what, href: links[id] ?? href });
  return [
    def("plan", "Plan", Boolean(links.plan), "The feature starts as an issue that the merge request closes; the production canary opens incidents."),
    def("create", "Create", Boolean(after) || Boolean(links.create), "The GitLab Duo flow commits the fix to the merge request branch."),
    def("verify", "Verify", Boolean(before), "The drill job plants a synthetic customer and runs her journeys.", before?.report.ci?.jobUrl),
    def("package", "Package", Boolean(links.package), "The shop build is published to the project's package registry."),
    def(
      "secure",
      "Secure",
      Boolean(before && before.report.leaks > 0),
      "Leaks are published as a GitLab security report on the merge request.",
      before?.report.ci?.pipelineUrl ? `${before.report.ci.pipelineUrl}/security` : undefined,
    ),
    def("release", "Release", Boolean(links.release), "The merge deploys to production and the release carries the record of processing."),
    def("configure", "Configure", true, "privacy/datamap.yml declares where each field may go.", repo ? `${repo}/-/blob/main/privacy/datamap.yml` : undefined),
    def("monitor", "Monitor", Boolean(links.monitor), "A scheduled pipeline drills production every hour."),
    def("govern", "Govern", Boolean(links.govern), "Any leak fails the merge request pipeline; production deploys only when a person runs the job."),
  ];
}

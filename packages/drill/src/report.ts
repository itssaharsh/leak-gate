import { createHash } from "node:crypto";
import { FIELDS, type Field } from "./canary";
import type { DataMap } from "./datamap";
import type { DrillReport, Hit } from "./types";

const FIELD_WORDS: Record<Field, string> = {
  name: "name",
  email: "email address",
  phone: "phone number",
  password: "password",
  address: "postal address",
};

export function destinationLabel(map: DataMap, id: string): string {
  return map.destinations.find((d) => d.id === id)?.label ?? id;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One test case per (field, destination) pair: a leak is a failure. Shown in GitLab's merge request test widget. */
export function toJUnit(report: DrillReport, map: DataMap): string {
  const cases: string[] = [];
  let failures = 0;
  for (const field of FIELDS) {
    for (const dest of map.destinations) {
      const leak = report.hits.find((h) => h.field === field && h.destination === dest.id && !h.allowed);
      const name = `${field} stays out of ${dest.label}`;
      const allowed = map.allowed[field].includes(dest.id);
      if (allowed) continue;
      if (leak) {
        failures++;
        cases.push(
          `    <testcase classname="leak-gate.${field}" name="${esc(name)}" file="${esc(leak.file ?? "")}">\n` +
            `      <failure message="${esc(`${FIELD_WORDS[field]} reached ${dest.label}`)}">${esc(
              `Captured from ${leak.source} during "${leak.journey ?? "unknown journey"}":\n${leak.excerpt}`,
            )}</failure>\n    </testcase>`,
        );
      } else {
        cases.push(`    <testcase classname="leak-gate.${field}" name="${esc(name)}"/>`);
      }
    }
  }
  const time = ((report.endedAt - report.startedAt) / 1000).toFixed(1);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n  <testsuite name="Leak Gate drill ${esc(report.runId)}" tests="${cases.length}" failures="${failures}" time="${time}">\n` +
    cases.join("\n") +
    `\n  </testsuite>\n</testsuites>\n`
  );
}

function uuidFrom(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/**
 * GitLab security report (SAST schema 15.x) so each leak appears in the merge request
 * security widget and the vulnerability report. The location is the route file that
 * handled the journey; the fix flow narrows it to the exact line.
 */
export function toGitLabSecurityReport(report: DrillReport, map: DataMap): object {
  const leaks = new Map<string, Hit>();
  for (const h of report.hits) if (!h.allowed && !leaks.has(`${h.field}|${h.destination}`)) leaks.set(`${h.field}|${h.destination}`, h);
  const analyzer = { id: "leak-gate", name: "Leak Gate", version: "0.1.0", vendor: { name: "Leak Gate" } };
  return {
    version: "15.2.1",
    scan: {
      analyzer,
      scanner: analyzer,
      type: "sast",
      start_time: iso(report.startedAt),
      end_time: iso(report.endedAt),
      status: report.status === "error" ? "failure" : "success",
    },
    vulnerabilities: [...leaks.values()].map((h) => {
      const dest = destinationLabel(map, h.destination);
      return {
        id: uuidFrom(`${h.field}|${h.destination}|${h.file ?? ""}`),
        name: `Customer ${FIELD_WORDS[h.field]} reaches ${dest}`,
        description:
          `Leak Gate planted a synthetic customer and found her ${FIELD_WORDS[h.field]} in ${dest} ` +
          `(${h.source}) during the "${h.journey ?? "unknown"}" journey. The data map (privacy/datamap.yml) does not allow ` +
          `${h.field} to reach ${h.destination}. Captured: ${h.excerpt}`,
        severity: h.field === "password" ? "Critical" : "High",
        solution: "Stop sending this field to the destination, or update privacy/datamap.yml if the flow is intended and approved.",
        location: { file: h.file ?? "privacy/datamap.yml", start_line: 1 },
        identifiers: [
          { type: "leak_gate", name: `Leak Gate ${h.field} to ${h.destination}`, value: `${h.field}:${h.destination}` },
          h.destination === "app-logs"
            ? { type: "cwe", name: "CWE-532", value: "532", url: "https://cwe.mitre.org/data/definitions/532.html" }
            : { type: "cwe", name: "CWE-359", value: "359", url: "https://cwe.mitre.org/data/definitions/359.html" },
        ],
      };
    }),
  };
}

/** A short markdown summary for job logs and merge request notes. */
export function toMarkdown(report: DrillReport, map: DataMap): string {
  const lines = [
    `### Leak Gate drill ${report.runId}: ${report.status === "passed" ? "passed, 0 leaks" : report.status === "blocked" ? `blocked, ${report.leaks} leak${report.leaks === 1 ? "" : "s"}` : "error"}`,
    "",
    `Synthetic customer: \`${report.canary.name}\` · \`${report.canary.email}\` · build \`${report.build}\``,
    "",
  ];
  const leaks = report.hits.filter((h) => !h.allowed);
  if (leaks.length) {
    lines.push("| Field | Reached | During | Captured |", "|---|---|---|---|");
    for (const h of leaks) {
      lines.push(`| ${h.field} | ${destinationLabel(map, h.destination)} | ${h.journey ?? ""} | \`${h.excerpt.replace(/\|/g, "\\|").slice(0, 160)}\` |`);
    }
  } else if (report.status === "passed") {
    lines.push("No planted value reached a destination outside `privacy/datamap.yml`.");
  } else if (report.error) {
    lines.push(`The drill stopped: ${report.error}`);
  }
  return lines.join("\n") + "\n";
}

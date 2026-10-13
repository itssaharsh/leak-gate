import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanFirstName, findMarkers, makeCanary } from "../src/canary";
import { countLeaks, matchCaptures, summarize } from "../src/compare";
import { isAllowed, parseDataMap } from "../src/datamap";
import { aroundNeedle, toGitLabSecurityReport, toJUnit, toMarkdown } from "../src/report";
import { anyTermPattern, captureSortKey, seenVendorsKey, VENDOR_SLUG } from "../src/sinks";
import type { Capture, DrillReport, JourneyResult } from "../src/types";

const datamap = parseDataMap(readFileSync(new URL("../../../privacy/datamap.yml", import.meta.url), "utf8"));

describe("canary", () => {
  it("gives every run and every field its own tag", () => {
    const a = makeCanary();
    const b = makeCanary();
    expect(a.runId).not.toEqual(b.runId);
    expect(a.email).not.toEqual(b.email);
    const needles = a.markers.flatMap((m) => m.needles.map((n) => `${m.field}:${n}`));
    // No needle of one field occurs inside another field's value.
    for (const m of a.markers) {
      for (const other of a.markers) {
        if (other.field === m.field) continue;
        for (const n of m.needles) expect(other.value.toLowerCase()).not.toContain(n.toLowerCase());
      }
    }
    expect(needles.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps a judge-supplied first name to letters", () => {
    expect(cleanFirstName("  mira<script>")).toBe("Mirascript");
    expect(cleanFirstName("x")).toBe("Ada");
    expect(cleanFirstName(undefined)).toBe("Ada");
  });

  it("finds a phone number however it was formatted", () => {
    const c = makeCanary("Ada");
    const tail = c.phone.slice(-3);
    expect(findMarkers(`{"tel":"447700900${tail}"}`, c.markers).map((f) => f.marker.field)).toEqual(["phone"]);
    expect(findMarkers(`call 07700900${tail} please`, c.markers).map((f) => f.marker.field)).toEqual(["phone"]);
  });

  it("matches case-insensitively and reports the text as it appeared", () => {
    const c = makeCanary("Ada");
    const found = findMarkers(`user=${c.email.toUpperCase()}`, c.markers);
    expect(found[0].marker.field).toBe("email");
    expect(found[0].needle).toBe(found[0].needle.toUpperCase());
  });
});

describe("data map", () => {
  it("allows only what the file lists", () => {
    expect(isAllowed(datamap, "email", "database")).toBe(true);
    expect(isAllowed(datamap, "email", "app-logs")).toBe(false);
    expect(isAllowed(datamap, "password", "database")).toBe(false);
  });

  it("rejects an unknown destination with a readable message", () => {
    expect(() => parseDataMap("destinations:\n  db: {kind: internal}\nfields:\n  email: [nowhere]\n")).toThrow(/unknown destination 'nowhere'/);
  });

  it("rejects a destination without a kind", () => {
    expect(() => parseDataMap("destinations:\n  db: {}\nfields: {}\n")).toThrow(/needs kind/);
  });
});

function journeys(at: number): JourneyResult[] {
  return [
    { id: "signup", label: "Signing up", route: "/api/signup", file: "apps/shop/src/app/api/signup/route.ts", status: 201, ok: true, startedAt: at, endedAt: at + 200 },
  ];
}

describe("matching captures", () => {
  const c = makeCanary("Ada");
  const now = Date.now();
  const captures: Capture[] = [
    { destination: "app-logs", source: "/aws/lambda/shop", text: JSON.stringify({ msg: "newsletter opt-in", body: { email: c.email, password: c.password } }), at: now + 50 },
    { destination: "database", source: "users", text: JSON.stringify({ email: c.email, name: c.name, passwordHash: "scrypt$abc" }), at: now + 60 },
    { destination: "analytics", source: "vendor:analytics", text: JSON.stringify({ traits: { phone: c.phone } }), at: now + 70 },
    { destination: "app-logs", source: "/aws/lambda/shop", text: '{"msg":"drill-request","path":"/api/signup"}', at: now + 80 },
  ];

  it("labels allowed destinations and leaks", () => {
    const hits = matchCaptures(captures, c, datamap, journeys(now));
    const leaks = hits.filter((h) => !h.allowed).map((h) => `${h.field}->${h.destination}`).sort();
    expect(leaks).toEqual(["email->app-logs", "password->app-logs", "phone->analytics"]);
    expect(hits.filter((h) => h.allowed).map((h) => h.field).sort()).toEqual(["email", "name"]);
    expect(countLeaks(hits)).toBe(3);
  });

  it("points each hit at the journey and file running at the time", () => {
    const hits = matchCaptures(captures, c, datamap, journeys(now));
    expect(hits.every((h) => h.file === "apps/shop/src/app/api/signup/route.ts")).toBe(true);
  });

  it("counts a field reaching the same place twice as one leak", () => {
    const twice = [...captures, { ...captures[0], text: captures[0].text + " retry", at: now + 90 }];
    expect(countLeaks(matchCaptures(twice, c, datamap))).toBe(3);
  });

  it("finds nothing in a clean run", () => {
    const clean: Capture[] = [{ destination: "app-logs", source: "x", text: '{"msg":"newsletter opt-in","userId":"u_1"}', at: now }];
    expect(matchCaptures(clean, c, datamap)).toEqual([]);
  });

  it("summarises per destination", () => {
    const s = summarize(matchCaptures(captures, c, datamap), datamap);
    expect(s.find((d) => d.id === "app-logs")?.leaks).toBe(2);
    expect(s.find((d) => d.id === "database")?.allowedHits).toBe(2);
    expect(s.find((d) => d.id === "analytics")?.simulated).toBe(true);
  });
});

function report(): DrillReport {
  const c = makeCanary("Ada");
  const now = Date.now();
  const hits = matchCaptures(
    [{ destination: "error-tracker", source: "vendor:error-tracker", text: JSON.stringify({ request: { body: { password: c.password } } }), at: now + 10 }],
    c,
    datamap,
    journeys(now),
  );
  return {
    schema: "leak-gate/drill-report@1",
    runId: c.runId,
    build: "test",
    env: "test",
    shopUrl: "http://shop",
    startedAt: now,
    endedAt: now + 1000,
    canary: { ...c, markers: c.markers.map((m) => ({ field: m.field, value: m.value })) },
    journeys: journeys(now),
    destinations: summarize(hits, datamap),
    hits,
    leaks: countLeaks(hits),
    status: "blocked",
    events: [],
  };
}

describe("reports", () => {
  it("writes one failing JUnit case per leak", () => {
    const xml = toJUnit(report(), datamap);
    expect(xml).toContain('failures="1"');
    expect(xml).toContain("password stays out of Error tracker");
    expect(xml).not.toContain("stays out of Shop database\"/>\n    <failure");
  });

  it("writes a GitLab security finding with severity and location", () => {
    const sec = toGitLabSecurityReport(report(), datamap) as { vulnerabilities: { severity: string; location: { file: string }; identifiers: { type: string }[] }[] };
    expect(sec.vulnerabilities).toHaveLength(1);
    expect(sec.vulnerabilities[0].severity).toBe("Critical");
    expect(sec.vulnerabilities[0].location.file).toBe("apps/shop/src/app/api/signup/route.ts");
    expect(sec.vulnerabilities[0].identifiers.map((i) => i.type)).toContain("cwe");
  });

  it("summarises for a merge request note", () => {
    expect(toMarkdown(report(), datamap)).toContain("blocked, 1 leak");
  });

  it("centres a long excerpt on the planted value", () => {
    const text = "a".repeat(300) + "NEEDLE" + "b".repeat(300);
    const w = aroundNeedle(text, "needle", 40);
    expect(w).toContain("NEEDLE");
    expect(w.startsWith("…") && w.endsWith("…")).toBe(true);
  });
});

describe("a destination the data map has never seen", () => {
  const c = makeCanary("Ada");
  const now = Date.now();
  const crm: Capture = {
    destination: "crm",
    source: "vendor:crm",
    text: JSON.stringify({ contact: { name: c.name, email: c.email, phone: c.phone } }),
    at: now + 40,
  };
  const hits = matchCaptures([crm], c, datamap, journeys(now));
  const r: DrillReport = { ...report(), hits, destinations: summarize(hits, datamap), leaks: countLeaks(hits) };

  it("counts every field that reached it as a leak and flags it as unknown", () => {
    expect(hits.map((h) => h.field).sort()).toEqual(["email", "name", "phone"]);
    expect(hits.every((h) => !h.allowed && h.unknownDestination)).toBe(true);
    expect(countLeaks(hits)).toBe(3);
  });

  it("lists it after the declared destinations", () => {
    const s = summarize(hits, datamap);
    expect(s.at(-1)).toMatchObject({ id: "crm", kind: "unknown", leaks: 3 });
    expect(s.filter((d) => d.kind !== "unknown")).toHaveLength(datamap.destinations.length);
  });

  it("asks for the privacy lead in every report", () => {
    expect(toJUnit(r, datamap)).toContain("phone stays out of crm, a destination not in the data map");
    expect(toMarkdown(r, datamap)).toContain("**New destination:** `crm` is not listed in privacy/datamap.yml");
    const sec = toGitLabSecurityReport(r, datamap) as { vulnerabilities: { solution: string }[] };
    expect(sec.vulnerabilities[0].solution).toMatch(/privacy lead/);
  });

  it("does not flag a declared destination as unknown", () => {
    expect(matchCaptures([{ ...crm, destination: "analytics" }], c, datamap).some((h) => h.unknownDestination)).toBe(false);
  });
});

describe("sink helpers", () => {
  it("builds an OR filter pattern with quoted terms", () => {
    expect(anyTermPattern(["a@b.test", 'x"y', ""])).toBe('?"a@b.test" ?"xy"');
  });

  it("sorts capture keys by time as strings", () => {
    expect(captureSortKey(5, "a") < captureSortKey(40, "a")).toBe(true);
  });

  it("accepts a new vendor name but never the gate's own bookkeeping keys", () => {
    expect(VENDOR_SLUG.test("crm")).toBe(true);
    expect(VENDOR_SLUG.test(seenVendorsKey("mr-2"))).toBe(false);
    expect(VENDOR_SLUG.test("../analytics")).toBe(false);
  });
});

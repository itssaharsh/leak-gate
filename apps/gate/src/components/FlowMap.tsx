"use client";

import type { DestinationSummary, DrillReport, Field } from "@leakgate/drill";
import { useLayoutEffect, useRef, useState } from "react";
import { FIELD_LABEL, FIELD_ORDER, destRank, edgesOf, type Edge } from "@/lib/view";

const DEST_ORDER = ["database", "app-logs", "error-tracker", "analytics", "email-vendor", "shipping-vendor"];

interface Anchor {
  x: number;
  y: number;
}

export function FlowMap({
  report,
  retracted,
  running,
  onSelectDestination,
}: {
  /** The run shown on the map. */
  report: DrillReport | null;
  /** Edges from an earlier run that this run no longer has; drawn retracting. */
  retracted: Edge[];
  running: boolean;
  onSelectDestination: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const destRefs = useRef<Record<string, HTMLElement | null>>({});
  const [anchors, setAnchors] = useState<{ fields: Partial<Record<Field, Anchor>>; dests: Record<string, Anchor>; w: number; h: number }>({
    fields: {},
    dests: {},
    w: 0,
    h: 0,
  });
  const [hover, setHover] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const fields: Partial<Record<Field, Anchor>> = {};
      for (const f of FIELD_ORDER) {
        const r = fieldRefs.current[f]?.getBoundingClientRect();
        if (r) fields[f] = { x: r.right - box.left, y: r.top + r.height / 2 - box.top };
      }
      const dests: Record<string, Anchor> = {};
      for (const [id, node] of Object.entries(destRefs.current)) {
        const r = node?.getBoundingClientRect();
        if (r) dests[id] = { x: r.left - box.left, y: r.top + r.height / 2 - box.top };
      }
      setAnchors({ fields, dests, w: box.width, h: box.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [report]);

  const destinations: DestinationSummary[] = (report?.destinations ?? []).slice().sort((a, b) => destRank(a.id) - destRank(b.id));
  const edges = edgesOf(report);
  const shown = [...edges, ...retracted.map((e) => ({ ...e, gone: true }))] as (Edge & { gone?: boolean })[];
  const canary = report?.canary;
  const value = (f: Field) => canary?.markers.find((m) => m.field === f)?.value ?? "";
  const leakCount = new Set(edges.filter((e) => !e.allowed).map((e) => e.key)).size;

  const path = (e: Edge) => {
    const a = anchors.fields[e.field];
    const b = anchors.dests[e.destination];
    if (!a || !b) return "";
    const dx = Math.max(40, (b.x - a.x) * 0.45);
    return `M ${a.x + 6} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x - 8} ${b.y}`;
  };

  return (
    <div
      ref={wrap}
      className="relative grid grid-cols-1 gap-6 md:grid-cols-[288px_minmax(96px,1fr)_248px] md:gap-0"
      role="img"
      aria-label={
        report
          ? `${leakCount} planted ${leakCount === 1 ? "value reached a destination" : "values reached destinations"} outside the data map`
          : "No drill has run yet"
      }
    >
      {/* The synthetic customer's identity card. */}
      <div className="relative z-10 self-center rounded-lg bg-canary p-4 text-canary-ink shadow-[inset_0_0_0_1px_rgb(17_20_24/0.18)]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[13px] font-extrabold whitespace-nowrap uppercase tracking-[0.08em]" style={{ fontVariationSettings: "'wdth' 100" }}>
            Synthetic customer
          </span>
          <span className="font-mono text-[12px] whitespace-nowrap">run {canary?.code ?? "····"}</span>
        </div>
        <dl className="mt-3 flex flex-col gap-2">
          {FIELD_ORDER.map((f) => (
            <div key={f} ref={(n) => { fieldRefs.current[f] = n; }} className="flex flex-col">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] opacity-80">{FIELD_LABEL[f]}</dt>
              <dd className="truncate font-mono text-[13px] leading-5" title={value(f)}>
                {value(f) || "—"}
              </dd>
            </div>
          ))}
        </dl>
        <div aria-hidden className="mt-3 border-t border-[rgb(17_20_24/0.25)] pt-2 font-mono text-[12px] leading-4 tracking-[0.12em] break-all">
          {`P<LKG${(canary?.name ?? "").toUpperCase().replace(/[^A-Z]/g, "<")}<<<<`.slice(0, 44)}
          <br />
          {`${canary?.code ?? "0000"}<<${(report?.runId ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "<")}`.slice(0, 44)}
        </div>
        <p className="mt-2 text-[12px] opacity-80">Synthetic: every value is planted for this run.</p>
      </div>

      {/* Edge layer (desktop). */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 hidden md:block" width={anchors.w} height={anchors.h}>
        {shown.map((e) => {
          const d = path(e);
          if (!d) return null;
          const leak = !e.allowed;
          const dim = hover && hover !== e.destination;
          return (
            <g key={`${e.key}${e.gone ? "-gone" : ""}`} opacity={dim ? 0.15 : 1}>
              <path
                d={d}
                pathLength={1}
                className="edge"
                data-hidden={e.gone ? "true" : "false"}
                fill="none"
                stroke={leak ? "var(--danger)" : "var(--ink)"}
                strokeOpacity={leak ? 1 : 0.32}
                strokeWidth={leak ? 2.5 : 1.25}
              />
              {leak && !e.gone && anchors.dests[e.destination] && (
                <circle
                  cx={anchors.dests[e.destination].x - 8}
                  cy={anchors.dests[e.destination].y}
                  r={4}
                  fill="var(--canary)"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div aria-hidden className="hidden md:block" />

      {/* Destinations. */}
      <ul className="relative z-10 order-first flex flex-col gap-2 self-center md:order-none">
        {(destinations.length ? destinations : placeholderDestinations()).map((d) => {
          const leaking = d.leaks > 0;
          const unknown = d.kind === "unknown";
          return (
            <li key={d.id} ref={(n) => { destRefs.current[d.id] = n; }}>
              <button
                type="button"
                onClick={() => onSelectDestination(d.id)}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.id)}
                onBlur={() => setHover(null)}
                disabled={!report}
                className={`flex h-12 w-full items-center justify-between gap-3 rounded-md border px-3 text-left transition-colors md:h-14 ${
                  unknown ? "border-2 border-dashed border-warning bg-[#fff6db]" : leaking ? "border-danger bg-danger-container" : "border-line bg-canvas hover:bg-surface-1"
                } ${running ? "opacity-70" : ""}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">{d.label}</span>
                  <span className={`text-[12px] ${unknown ? "font-semibold text-warning" : "text-ink-muted"}`}>
                    {unknown ? "Not in the data map" : d.simulated ? "Simulated vendor" : d.kind === "internal" ? "Inside the shop" : "Vendor"}
                  </span>
                </span>
                {leaking ? (
                  <span className="tabular flex h-8 min-w-8 items-center justify-center rounded-sm bg-danger px-2 font-display text-lg font-extrabold text-white" aria-label={`${d.leaks} leaked fields`}>
                    {d.leaks}
                  </span>
                ) : d.allowedHits > 0 ? (
                  <span className="text-[12px] text-ink-muted">{d.allowedHits} allowed</span>
                ) : (
                  <span className="text-[12px] text-ink-muted">0</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function placeholderDestinations(): DestinationSummary[] {
  const labels: Record<string, [string, boolean, "internal" | "vendor"]> = {
    database: ["Shop database", false, "internal"],
    "app-logs": ["App logs", false, "internal"],
    "error-tracker": ["Error tracker", true, "vendor"],
    analytics: ["Analytics", true, "vendor"],
    "email-vendor": ["Email vendor", true, "vendor"],
    "shipping-vendor": ["Shipping vendor", true, "vendor"],
  };
  return DEST_ORDER.map((id) => ({ id, label: labels[id][0], simulated: labels[id][1], kind: labels[id][2], leaks: 0, allowedHits: 0 }));
}

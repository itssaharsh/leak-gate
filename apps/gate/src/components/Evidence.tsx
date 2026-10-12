"use client";

import type { DrillReport } from "@leakgate/drill";
import { useEffect, useRef } from "react";
import { FIELD_LABEL, bestCapture, markNeedles, when, type Leak } from "@/lib/view";

export function Captured({ text, needles, redacted, delay = 0 }: { text: string; needles: string[]; redacted?: boolean; delay?: number }) {
  return (
    <code className="font-mono text-[12.5px] leading-5 break-all text-ink">
      {markNeedles(text, needles).map((p, i) =>
        !p.mark ? (
          <span key={i}>{p.text}</span>
        ) : redacted ? (
          <span key={i} className="redacted" style={{ ["--delay" as string]: `${delay + i * 40}ms` }} aria-label="value removed by the fix">
            {p.text}
          </span>
        ) : (
          <mark key={i} className="tracer">
            {p.text}
          </mark>
        ),
      )}
    </code>
  );
}

export function EvidenceList({
  leaks,
  fixed,
  destLabel,
  onOpen,
  emptyText,
}: {
  leaks: Leak[];
  /** When true the rows are shown as removed by the fix. */
  fixed: boolean;
  destLabel: (id: string) => string;
  onOpen: (leak: Leak) => void;
  emptyText: string;
}) {
  if (leaks.length === 0) {
    return <p className="rounded-md bg-surface-1 px-4 py-6 text-[14px] text-ink-muted">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {leaks.map((l, i) => {
        const cap = bestCapture(l);
        return (
          <li key={l.key}>
            <button type="button" onClick={() => onOpen(l)} className="flex w-full flex-col gap-1.5 px-1 py-3 text-left hover:bg-surface-1 focus-visible:bg-surface-1">
              <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                {fixed ? <span aria-hidden className="text-success">✓</span> : <span aria-hidden className="inline-block size-2 rounded-full bg-danger" />}
                <span className={fixed ? "text-ink-muted line-through decoration-1" : ""}>{destLabel(l.destination)}</span>
                <span className="text-[13px] font-normal text-ink-muted">
                  {fixed ? "no longer receives " : "received "}
                  {l.fields.map((f) => FIELD_LABEL[f].toLowerCase()).join(", ")}
                </span>
              </span>
              <span className="line-clamp-3 pl-4">
                <Captured text={cap.excerpt} needles={l.hits.map((h) => h.needle)} redacted={fixed} delay={i * 80} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function EvidenceDrawer({
  leak,
  report,
  fixed,
  destLabel,
  repoUrl,
  onClose,
}: {
  leak: Leak;
  report: DrillReport;
  fixed: boolean;
  destLabel: (id: string) => string;
  repoUrl?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const needles = leak.hits.map((h) => h.needle);
  // One block per captured record (a log event, a vendor request), showing the window with the most planted values.
  const byRecord = new Map<string, (typeof leak.hits)[number]>();
  for (const h of leak.hits) {
    const key = h.ref ?? h.excerpt;
    const prev = byRecord.get(key);
    const count = (x: typeof h) => needles.filter((n) => x.excerpt.toLowerCase().includes(n.toLowerCase())).length;
    if (!prev || count(h) > count(prev)) byRecord.set(key, h);
  }
  const captures = [...byRecord.values()];
  const first = leak.hits[0];
  const journey = report.journeys.find((j) => j.id === first.journey);
  const fileUrl = repoUrl && first.file ? `${repoUrl.replace(/\/$/, "")}/-/blob/${report.ci?.commit ?? "main"}/${first.file}` : undefined;
  const credential = leak.fields.includes("password");

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgb(17_20_24/0.32)]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
        className="drawer flex h-full w-full max-w-[600px] flex-col gap-5 overflow-y-auto bg-canvas p-6 shadow-[var(--shadow-overlay)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{credential ? "Personal data and a credential" : "Personal data"}</p>
            <h2 id="evidence-title" className="font-display text-2xl font-extrabold" style={{ fontVariationSettings: "'wdth' 112" }}>
              {destLabel(leak.destination)} received {leak.fields.map((f) => FIELD_LABEL[f].toLowerCase()).join(", ")}
            </h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="h-9 shrink-0 rounded-md px-3 text-[14px] hover:bg-surface-2">
            Close
          </button>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold">{fixed ? "Captured before the fix" : captures.length > 1 ? "Captured lines" : "Captured line"}</h3>
          {captures.map((h) => (
            <div key={h.excerpt} className="rounded-md bg-surface-sunken p-4">
              <Captured text={h.excerpt} needles={needles} />
              <p className="mt-2 text-[12px] text-ink-muted">
                {h.source} · {when(h.at)} · during {report.journeys.find((j) => j.id === h.journey)?.label ?? h.journey ?? "unknown"}
              </p>
            </div>
          ))}
          {fixed && (
            <>
              <h3 className="mt-2 text-[13px] font-semibold text-success">After the fix: the same drill found none of these values here</h3>
              <div className="rounded-md bg-surface-sunken p-4">
                <Captured text={captures[0].excerpt} needles={needles} redacted />
              </div>
            </>
          )}
        </section>

        <section className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-[14px]">
          {leak.fields.map((f) => (
            <div key={f} className="contents">
              <span className="text-ink-muted">Planted {FIELD_LABEL[f].toLowerCase()}</span>
              <span className="font-mono text-[13px] break-all">{report.canary.markers.find((m) => m.field === f)?.value}</span>
            </div>
          ))}
          <span className="text-ink-muted">Journey</span>
          <span>{journey?.label ?? first.journey ?? "unknown"}</span>
          <span className="text-ink-muted">Handled by</span>
          <span className="font-mono text-[13px] break-all">
            {fileUrl ? (
              <a className="underline" href={fileUrl} target="_blank" rel="noreferrer">
                {first.file}
              </a>
            ) : (
              first.file ?? "unknown"
            )}
          </span>
          <span className="text-ink-muted">Matched by</span>
          <span>Exact match of planted values. No model decides whether this is a leak.</span>
          <span className="text-ink-muted">Run</span>
          <span className="font-mono text-[13px]">{report.runId}</span>
        </section>
      </aside>
    </div>
  );
}

export function destLabeller(report: DrillReport | null) {
  return (id: string) => report?.destinations.find((d) => d.id === id)?.label ?? id;
}

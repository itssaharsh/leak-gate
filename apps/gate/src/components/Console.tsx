"use client";

import type { DrillEvent, DrillReport } from "@leakgate/drill";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EvidenceDrawer, EvidenceList, destLabeller } from "@/components/Evidence";
import { FlowMap } from "@/components/FlowMap";
import { edgesOf, leakCount as countLeaks, leaksOf, plural, when, type Leak } from "@/lib/view";

export interface RunView {
  report: DrillReport;
  source: "ci" | "live" | "replay";
  label: string;
}

export interface Stage {
  id: string;
  label: string;
  done: boolean;
  href?: string;
  what: string;
}

export interface ConsoleProps {
  mr: { title: string; ref: string; url?: string };
  before: RunView | null;
  after: RunView | null;
  replay: RunView;
  builds: { id: "leaky" | "fixed"; label: string }[];
  stages: Stage[];
  repoUrl?: string;
  fixCommit?: { sha: string; url?: string; by: string };
  forcedState?: string;
}

type Mode = "before" | "after" | "live";
type Live =
  | { state: "idle" }
  | { state: "running"; events: DrillEvent[]; build: string }
  | { state: "done"; report: DrillReport }
  | { state: "error"; message: string; events: DrillEvent[] }
  | { state: "blocked"; seconds: number };

const STEP_TOTAL = 7;

export function Console(props: ConsoleProps) {
  const forced = props.forcedState;
  const [replayOn, setReplayOn] = useState(forced === "replay" || (!props.before && forced !== "first-run"));
  const before = forced === "first-run" ? null : replayOn ? props.replay : props.before;
  const after = forced === "first-run" ? null : props.after;
  const [mode, setMode] = useState<Mode>(forced === "after" && props.after ? "after" : "before");
  const [live, setLive] = useState<Live>(
    forced === "running"
      ? { state: "running", events: props.replay.report.events.slice(0, 4), build: "leaky" }
      : forced === "error"
        ? { state: "error", message: "The drill stopped at Running the customer's journeys: the shop did not answer in 10 s.", events: props.replay.report.events.slice(0, 3) }
        : { state: "idle" },
  );
  const [build, setBuild] = useState<string>(props.builds[0]?.id ?? "leaky");
  const [name, setName] = useState("");
  const [open, setOpen] = useState<Leak | null>(null);

  const shown: RunView | null = mode === "live" && live.state === "done" ? { report: live.report, source: "live", label: "Your live drill" } : mode === "after" ? after : before;
  const report = shown?.report ?? null;
  const beforeLeaks = useMemo(() => leaksOf(before?.report), [before]);
  const afterLeaks = useMemo(() => leaksOf(after?.report), [after]);
  const retracted = useMemo(() => {
    if (mode !== "after" || !after || !before) return [];
    const now = new Set(edgesOf(after.report).map((e) => e.key));
    return edgesOf(before.report).filter((e) => !e.allowed && !now.has(e.key));
  }, [mode, after, before]);
  const destLabel = destLabeller(report ?? before?.report ?? null);

  // After the fix: the leaks of the first run that the later run no longer has.
  const removed = useMemo(
    () =>
      beforeLeaks
        .map((l) => {
          const still = afterLeaks.find((a) => a.destination === l.destination);
          const fields = l.fields.filter((f) => !still?.fields.includes(f));
          return { ...l, fields, hits: l.hits.filter((h) => fields.includes(h.field)) };
        })
        .filter((l) => l.fields.length > 0),
    [beforeLeaks, afterLeaks],
  );
  const listLeaks = mode === "after" ? removed : leaksOf(report);
  const leakCount = mode === "after" ? countLeaks(after?.report) : countLeaks(report);

  const runDrill = useCallback(async () => {
    if (live.state === "running") return;
    const id = crypto.randomUUID();
    setLive({ state: "running", events: [], build });
    setMode("live");
    let finished = false;
    const poll = async () => {
      while (!finished) {
        await new Promise((r) => setTimeout(r, 900));
        if (finished) break;
        const res = await fetch(`/api/runs/live_${id}`, { cache: "no-store" }).catch(() => null);
        if (res?.ok) {
          const run = (await res.json()) as { events: DrillEvent[] };
          if (!finished) setLive((l) => (l.state === "running" ? { ...l, events: run.events } : l));
        }
      }
    };
    void poll();
    try {
      const res = await fetch("/api/drill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ build, id, name: name || undefined }),
      });
      finished = true;
      const json = await res.json();
      if (res.status === 429) {
        setLive({ state: "blocked", seconds: Number(json.retryAfter ?? 20) });
        setMode("before");
      } else if (!res.ok) {
        setLive({ state: "error", message: String(json.error ?? "The drill could not start."), events: [] });
      } else if ((json as DrillReport).status === "error") {
        setLive({ state: "error", message: (json as DrillReport).error ?? "The drill stopped.", events: (json as DrillReport).events });
      } else {
        setLive({ state: "done", report: json as DrillReport });
      }
    } catch {
      finished = true;
      setLive({ state: "error", message: "Lost the connection to the drill. Your run may still finish; try the replay meanwhile.", events: [] });
    }
  }, [build, live.state, name]);

  // Rate-limit countdown.
  useEffect(() => {
    if (live.state !== "blocked") return;
    const t = setTimeout(
      () => setLive((l) => (l.state !== "blocked" ? l : l.seconds <= 1 ? { state: "idle" } : { state: "blocked", seconds: l.seconds - 1 })),
      1000,
    );
    return () => clearTimeout(t);
  }, [live]);

  // Alt+Shift+P: replay of a recorded run. Alt+Shift+R: reset the demo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        setReplayOn((r) => !r);
        setMode("before");
      } else if (e.code === "KeyR") {
        e.preventDefault();
        setReplayOn(!props.before);
        setMode("before");
        setLive({ state: "idle" });
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.before]);

  const status =
    live.state === "running" && mode === "live"
      ? { tone: "neutral", text: `Running ${Math.max(1, live.events.at(-1)?.index ?? 1)}/${STEP_TOTAL}` }
      : !report
        ? { tone: "neutral", text: "No drill yet" }
        : leakCount > 0
          ? { tone: "danger", text: `Blocked: ${plural(leakCount, "leak")}` }
          : { tone: "success", text: "Passed: 0 leaks" };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pb-10 sm:px-6">
      {/* Run header */}
      <section className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px] text-ink-muted">
            Merge request{" "}
            {props.mr.url ? (
              <a className="underline" href={props.mr.url} target="_blank" rel="noreferrer">
                {props.mr.ref}
              </a>
            ) : (
              <span className="font-mono">{props.mr.ref}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[30px]" style={{ fontVariationSettings: "'wdth' 112" }}>
              {props.mr.title}
            </h1>
            <span
              role="status"
              className={`inline-flex h-8 items-center gap-2 rounded-sm px-3 text-[14px] font-semibold ${
                status.tone === "danger" ? "bg-danger text-white" : status.tone === "success" ? "bg-success text-white" : "bg-surface-2 text-ink"
              }`}
            >
              {status.tone === "danger" ? "■" : status.tone === "success" ? "✓" : "●"} {status.text}
            </span>
          </div>
          <RunCaption shown={shown} />
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div role="group" aria-label="Which run to show" className="inline-flex h-10 rounded-md bg-surface-2 p-1">
            {(["before", "after"] as const).map((m) => {
              const disabled = m === "after" && !after;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  aria-disabled={disabled || undefined}
                  title={disabled ? "The fix flow has not run on this merge request yet." : undefined}
                  onClick={() => !disabled && setMode(m)}
                  className={`rounded-sm px-4 text-[14px] font-semibold transition-colors ${active ? "bg-canvas text-ink shadow-sm" : "text-ink-muted"} ${disabled ? "cursor-not-allowed opacity-50" : "hover:text-ink"}`}
                >
                  {m === "before" ? "Before fix" : "After fix"}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
              Build
              <select value={build} onChange={(e) => setBuild(e.target.value)} className="h-10 rounded-md border border-line-input bg-canvas px-2 text-[14px] text-ink">
                {props.builds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
              First name to plant
              <input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 20))}
                placeholder="Ada"
                className="h-10 w-28 rounded-md border border-line-input bg-canvas px-2 text-[14px] text-ink"
              />
            </label>
            <button
              type="button"
              onClick={runDrill}
              aria-disabled={live.state === "running" || live.state === "blocked" || props.builds.length === 0 || undefined}
              className="h-11 w-full rounded-md bg-ink px-4 text-[15px] font-semibold text-white hover:bg-[#2a2f36] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:h-10 sm:w-auto sm:min-w-[168px] sm:text-[14px]"
            >
              {live.state === "running" ? `Running ${Math.max(1, live.events.at(-1)?.index ?? 1)}/${STEP_TOTAL}` : live.state === "done" ? "Run again" : live.state === "error" ? "Retry drill" : "Run a live drill"}
            </button>
          </div>
        </div>
      </section>
      {!after && mode !== "live" && (
        <p className="-mt-3 text-[13px] text-ink-muted">After fix appears once the GitLab Duo leak-fix flow has committed a fix to this merge request and the drill has passed.</p>
      )}
      {live.state === "blocked" && <p className="-mt-3 text-[14px] text-warning">Next drill in {live.seconds} s. Drills are limited to keep this demo free.</p>}
      {live.state === "error" && <p className="-mt-3 text-[14px] text-danger">{live.message}</p>}

      {/* Map + evidence */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {(live.state === "running" || live.state === "error") && mode === "live" ? (
            <Steps events={live.state === "running" ? live.events : live.events} failed={live.state === "error"} />
          ) : (
            <FlowMap
              report={report}
              retracted={retracted}
              running={false}
              onSelectDestination={(id) => {
                const pool = mode === "after" ? listLeaks : leaksOf(report);
                const l = pool.find((x) => x.destination === id);
                if (l) setOpen(l);
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 lg:col-span-4">
          <h2 className="text-[15px] font-semibold">
            {mode === "after" ? "What the fix removed" : "Each leak, with the line that proves it"}
          </h2>
          {mode === "after" && props.fixCommit && (
            <p className="text-[13px] text-ink-muted">
              Fixed by {props.fixCommit.by} in{" "}
              {props.fixCommit.url ? (
                <a className="font-mono underline" href={props.fixCommit.url} target="_blank" rel="noreferrer">
                  {props.fixCommit.sha}
                </a>
              ) : (
                <span className="font-mono">{props.fixCommit.sha}</span>
              )}
              , then proven by the same drill.
            </p>
          )}
          {mode === "live" && live.state !== "done" ? (
            <p className="rounded-md bg-surface-1 px-4 py-6 text-[14px] text-ink-muted">
              {live.state === "error" ? "This drill did not finish, so there is nothing to show yet." : "Results appear here when the drill finishes."}
            </p>
          ) : (
            <EvidenceList
              leaks={listLeaks}
              fixed={mode === "after"}
              destLabel={destLabel}
              onOpen={setOpen}
              emptyText={
                report ? "No planted value reached a destination outside the data map." : "No drill yet. Run one against the leaky build."
              }
            />
          )}
        </div>
      </section>

      <Trail stages={props.stages} />

      {open && (mode === "after" ? before : shown) && (
        <EvidenceDrawer
          leak={open}
          report={(mode === "after" ? before : shown)!.report}
          fixed={mode === "after"}
          destLabel={destLabel}
          repoUrl={props.repoUrl}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function RunCaption({ shown }: { shown: RunView | null }) {
  if (!shown) return <p className="text-[13px] text-ink-muted">No run recorded for this merge request yet.</p>;
  const r = shown.report;
  const prefix = shown.source === "replay" ? `Replay · run of ${when(r.startedAt)}` : `${shown.label} · ${when(r.startedAt)}`;
  return (
    <p className="text-[13px] text-ink-muted">
      {prefix} · {r.journeys.length} journeys · {((r.endedAt - r.startedAt) / 1000).toFixed(1)} s
      {r.ci?.pipelineUrl && (
        <>
          {" · "}
          <a className="underline" href={r.ci.pipelineUrl} target="_blank" rel="noreferrer">
            pipeline
          </a>
        </>
      )}
    </p>
  );
}

function Steps({ events, failed }: { events: DrillEvent[]; failed: boolean }) {
  const labels = [
    "Planting synthetic customer",
    "Running the customer's journeys",
    "Waiting for the shop's logs to land",
    "Searching app logs",
    "Searching vendor captures",
    "Searching the shop database",
    "Comparing with the data map",
  ];
  const last = new Map<number, DrillEvent>();
  for (const e of events) last.set(e.index, e);
  const current = events.at(-1)?.index ?? 1;
  return (
    <ol className="flex flex-col gap-3 rounded-lg bg-surface-1 p-6" aria-live="polite">
      {labels.map((label, i) => {
        const e = last.get(i + 1);
        const state = e?.state === "error" ? "error" : e?.state === "done" ? "done" : i + 1 === current && !failed ? "running" : "pending";
        return (
          <li key={label} className="flex items-start gap-3">
            <span
              className={`step-dot mt-1.5 inline-block size-2.5 rounded-full ${
                state === "done" ? "bg-success" : state === "error" ? "bg-danger" : state === "running" ? "bg-ink" : "bg-line"
              }`}
              data-state={state}
            />
            <span className="flex flex-col">
              <span className={`text-[15px] ${state === "pending" ? "text-ink-muted" : "font-semibold"}`}>{label}</span>
              {e?.detail && <span className={`font-mono text-[12.5px] ${state === "error" ? "text-danger" : "text-ink-muted"}`}>{e.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Trail({ stages }: { stages: Stage[] }) {
  return (
    <section aria-labelledby="trail-title" className="border-t border-line pt-5">
      <h2 id="trail-title" className="mb-3 text-[13px] font-semibold text-ink-muted">
        This merge request across the lifecycle
      </h2>
      <ol className="flex flex-wrap gap-2">
        {stages.map((s) => {
          const inner = (
            <>
              <span aria-hidden>{s.done ? "✓" : "○"}</span> {s.label}
            </>
          );
          return (
            <li key={s.id} title={s.what}>
              {s.done && s.href ? (
                <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ink px-3 text-[13px] font-semibold hover:bg-surface-1">
                  {inner}
                </a>
              ) : (
                <span className={`inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-[13px] ${s.done ? "border border-ink font-semibold" : "border border-dashed border-line-input text-ink-muted"}`}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[12px] text-ink-muted">Each lit stage links to the real GitLab object for this merge request. Hover a stage to see what lights it.</p>
    </section>
  );
}

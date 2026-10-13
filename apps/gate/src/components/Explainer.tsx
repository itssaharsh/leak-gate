import type { ReactNode } from "react";

/** The console in plain words, for a reader who has never met a merge request or a data map. */

const DESTINATIONS = ["App logs", "Error tracker", "Analytics", "Email vendor", "Shipping vendor", "Shop database"];

const STEPS: { title: string; body: string; visual: ReactNode }[] = [
  {
    title: "A fake customer tries the change",
    body: "Each proposed change to the app gets its own test copy. A made-up customer signs up, orders and asks for help, and every detail she types carries a unique tag.",
    visual: (
      <div className="rounded-md bg-canary p-3 font-mono text-[12.5px] leading-5 text-canary-ink shadow-[inset_0_0_0_1px_rgb(17_20_24/0.18)]">
        <div>Ada Canary-VPAN</div>
        <div className="break-all">ada.vfy2f8@canary.leakgate.test</div>
        <div className="mt-1 font-sans text-[11.5px] opacity-80">The customer planted on merge request !1</div>
      </div>
    ),
  },
  {
    title: "Every place her details could go is searched",
    body: "The app’s logs, each outside company it sends data to, and its own database. A tagged detail is easy to find wherever it lands.",
    visual: (
      <ul className="flex flex-wrap gap-1.5">
        {DESTINATIONS.map((d) => (
          <li key={d} className="rounded-sm border border-line bg-canvas px-2 py-1 text-[12.5px]">
            {d}
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "A rule list says what is allowed",
    body: "The team writes down who may receive each detail. A password in the logs breaks the rules, so the change fails and the exact line is shown as proof.",
    visual: (
      <ul className="flex flex-col gap-1.5 text-[13px]">
        <li className="flex items-center justify-between gap-3 rounded-sm bg-canvas px-2.5 py-1.5">
          <span>
            <span className="font-mono">email</span> to the shop database
          </span>
          <span className="font-semibold text-success">✓ allowed</span>
        </li>
        <li className="flex items-center justify-between gap-3 rounded-sm bg-danger-container px-2.5 py-1.5">
          <span>
            <span className="font-mono">password</span> to the app logs
          </span>
          <span className="font-semibold text-danger">✕ leak</span>
        </li>
      </ul>
    ),
  },
  {
    title: "An AI agent fixes it, a person ships it",
    body: "A GitLab Duo agent reads that proof, changes the code that leaked and explains why. If the data went somewhere the list has never heard of, it does not guess: it asks the privacy lead. A person approves the release.",
    visual: (
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-danger px-2.5 text-white">■ Blocked: 11 leaks</span>
        <span aria-hidden className="text-ink-muted">→</span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-success px-2.5 text-white">✓ Passed: 0 leaks</span>
      </div>
    ),
  },
];

export function Explainer() {
  return (
    <section id="what-it-does" aria-labelledby="what-title" className="scroll-mt-4 border-t border-line pt-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-ink-muted uppercase">In plain words</p>
          <h2 id="what-title" className="font-display text-[24px] leading-tight font-extrabold sm:text-[28px]" style={{ fontVariationSettings: "'wdth' 112" }}>
            Leak Gate checks where customers&rsquo; personal details end up, before a code change goes live.
          </h2>
          <p className="text-[15px] leading-7 text-ink-muted">
            Apps leak personal data by accident. A developer adds a debug log, and every new customer&rsquo;s password is saved in the log files. An
            error report attaches the whole signup form. Nobody reading the code change can see it, so it ships.
          </p>
          <dl className="flex flex-col gap-3 text-[14px] leading-6">
            <div>
              <dt className="font-semibold">Who it is for</dt>
              <dd className="text-ink-muted">Teams that build apps holding customer data, and the person accountable for where that data goes.</dd>
            </div>
            <div>
              <dt className="font-semibold">What it never uses</dt>
              <dd className="text-ink-muted">
                Real customer data. Every customer in a test is invented, and the outside companies in this demo are simulated.
              </dd>
            </div>
          </dl>
        </div>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-5">
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-md bg-canary font-display text-[15px] font-extrabold text-canary-ink shadow-[inset_0_0_0_1.5px_#111418]"
              >
                {i + 1}
              </span>
              <h3 className="text-[16px] font-semibold">{s.title}</h3>
              <p className="text-[14px] leading-6 text-ink-muted">{s.body}</p>
              <div className="mt-auto pt-1">{s.visual}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

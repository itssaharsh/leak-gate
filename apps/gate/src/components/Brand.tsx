import Link from "next/link";

/** The mark: the canary identity card crossed by one redaction bar. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Leak Gate">
      <title>Leak Gate</title>
      <rect x="4" y="10" width="40" height="28" rx="4" fill="#FFD000" stroke="#111418" strokeWidth="2" />
      <rect x="10" y="21" width="28" height="7" fill="#111418" />
    </svg>
  );
}

export function TopBar({ projectUrl }: { projectUrl?: string }) {
  return (
    <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Mark />
          <span className="font-display text-[20px] font-extrabold tracking-[-0.02em]" style={{ fontVariationSettings: "'wdth' 112" }}>
            Leak Gate
          </span>
        </Link>
        <span className="hidden text-[14px] text-ink-muted md:inline">Shows where a merge request sends customer data, and stops it.</span>
      </div>
      <nav className="flex flex-wrap items-center gap-1 text-[14px]">
        <Link href="/#what-it-does" className="rounded-md px-3 py-2 text-ink-muted hover:bg-surface-2 hover:text-ink">
          What it does
        </Link>
        <Link href="/how" className="rounded-md px-3 py-2 text-ink-muted hover:bg-surface-2 hover:text-ink">
          How it works
        </Link>
        {projectUrl && (
          <a href={projectUrl} target="_blank" rel="noreferrer" className="rounded-md px-3 py-2 text-ink-muted hover:bg-surface-2 hover:text-ink">
            Project on GitLab ↗
          </a>
        )}
      </nav>
    </header>
  );
}

export function JudgeCard() {
  return (
    <details open className="group order-2 mx-auto mt-6 w-full max-w-[1440px] px-4 sm:px-6 lg:order-1 lg:mt-0">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <span aria-hidden className="transition-transform group-open:rotate-90">▸</span> How to judge this in 90 seconds
      </summary>
      <ol className="mt-2 grid gap-x-6 gap-y-1 rounded-md bg-surface-1 p-4 text-[13.5px] leading-6 sm:grid-cols-2 lg:grid-cols-5">
        <li>1. The red lines show where a synthetic customer&rsquo;s data went that the data map does not allow.</li>
        <li>2. Click a red destination to see the exact captured line, with her planted value marked.</li>
        <li>3. Switch to After fix: a GitLab Duo flow committed the fix and the same drill found nothing.</li>
        <li>4. Run a live drill on the leaky build, with a first name of your choosing, and watch it happen.</li>
        <li>5. Open the project on GitLab to see the merge request, its pipeline and the flow session.</li>
      </ol>
    </details>
  );
}

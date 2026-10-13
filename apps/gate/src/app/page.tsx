import { JudgeCard, TopBar } from "@/components/Brand";
import { Console } from "@/components/Console";
import { config, featuredCases, shopBuilds } from "@/lib/config";
import { featuredRuns, replay, stages } from "@/lib/featured";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const forced = typeof sp.state === "string" ? sp.state : undefined;
  const cases = featuredCases();
  const chosen = cases.find((c) => c.mr === sp.mr) ?? cases[0];
  const { before, after } = await featuredRuns(chosen?.mr);
  const builds = shopBuilds().map((b) => ({ id: b.id, label: b.id === "leaky" ? "Leaky build (before the fix)" : "Main build (fixed)" }));
  const repo = config.gitlabProjectUrl || undefined;
  const mrRef = chosen ? `!${chosen.mr}` : "newsletter-optin";
  const mrUrl = repo && chosen ? `${repo.replace(/\/$/, "")}/-/merge_requests/${chosen.mr}` : undefined;
  const fixSha = chosen?.story.length ? undefined : process.env.FIX_COMMIT;

  return (
    <>
      <TopBar projectUrl={repo} />
      <div className="flex flex-col">
      <JudgeCard />
      <main className="order-1 mt-5 lg:order-2">
        <Console
          mr={{ title: chosen?.title ?? process.env.FEATURED_MR_TITLE ?? "Add newsletter opt-in to signup", ref: mrRef, url: mrUrl }}
          cases={cases.length > 1 ? cases.map((c) => ({ mr: c.mr, label: c.label, active: c.mr === chosen?.mr })) : undefined}
          story={chosen?.story.map((s) => ({ ...s, href: s.href?.startsWith("/-/") && repo ? `${repo.replace(/\/$/, "")}${s.href}` : s.href }))}
          before={before}
          after={after}
          replay={replay}
          builds={builds}
          stages={stages(before, after)}
          repoUrl={repo}
          fixCommit={fixSha ? { sha: fixSha.slice(0, 8), url: repo ? `${repo.replace(/\/$/, "")}/-/commit/${fixSha}` : undefined, by: "the GitLab Duo leak-fix flow" } : undefined}
          forcedState={forced}
        />
      </main>
      </div>
      <footer className="mx-auto max-w-[1440px] border-t border-line px-4 py-6 text-[12.5px] text-ink-muted sm:px-6">
        Checks the shop&apos;s server logs, its vendor calls and its user table. Browser storage and other databases are out of scope in this
        version. The shop is a fictional app built to be tested; its vendors are simulated endpoints that record what they receive; every
        customer is synthetic.
      </footer>
    </>
  );
}

import type { Metadata } from "next";
import { TopBar } from "@/components/Brand";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "How Leak Gate works" };

const STEPS: { title: string; body: string; file?: string; where: string }[] = [
  {
    title: "A merge request is pushed",
    body: "GitLab CI builds the shop from the merge request and deploys a review copy to its own AWS Lambda function, with its own log group.",
    file: ".gitlab-ci.yml",
    where: "GitLab CI · AWS Lambda",
  },
  {
    title: "The drill plants a synthetic customer",
    body: "Every field gets its own unique tag: name, email, phone, password and address. A hit in any sink names exactly one field.",
    file: "packages/drill/src/canary.ts",
    where: "drill job",
  },
  {
    title: "She signs up, checks out and asks for help",
    body: "Four real requests to the review shop. Each one writes an access line, so the drill knows when the logs it needs have landed.",
    file: "packages/drill/src/journeys.ts",
    where: "drill job → review shop",
  },
  {
    title: "Every sink is read",
    body: "CloudWatch Logs for the shop's runtime logs, the captures of every vendor call, and the shop's user table.",
    file: "packages/drill/src/sinks.ts",
    where: "CloudWatch Logs · DynamoDB",
  },
  {
    title: "Exact match against the data map",
    body: "privacy/datamap.yml says where each field may go. A planted value anywhere else is a leak. No model decides this step.",
    file: "packages/drill/src/compare.ts",
    where: "drill job",
  },
  {
    title: "The merge request is blocked with evidence",
    body: "The job fails and publishes a JUnit report, a GitLab security report and a summary with the captured lines.",
    file: "packages/drill/src/report.ts",
    where: "GitLab merge request",
  },
  {
    title: "A GitLab Duo flow fixes it, or holds it",
    body: "The failed pipeline triggers a custom flow. It reads the leak report, traces each captured line to the code that wrote it, commits the smallest change that stops the leak, and the pipeline runs the same drill again. If the data reached a destination the data map does not list, it changes no code and holds the merge request for the privacy lead, as on !2.",
    file: ".gitlab/duo/flows/leak-fix.yaml",
    where: "GitLab Duo Agent Platform",
  },
  {
    title: "A person approves the outcome",
    body: "Green pipeline, then the privacy lead runs the manual production job. The release carries the updated record of processing.",
    file: ".gitlab-ci.yml",
    where: "GitLab environments · releases",
  },
  {
    title: "Production keeps being drilled",
    body: "A scheduled pipeline drills production every hour and opens an issue if a planted value shows up where it should not.",
    file: ".gitlab-ci.yml",
    where: "GitLab schedules · issues",
  },
];

export default function HowPage() {
  const repo = config.gitlabProjectUrl.replace(/\/$/, "");
  return (
    <>
      <TopBar projectUrl={repo || undefined} />
      <main className="mx-auto max-w-[960px] px-4 pb-16 sm:px-6">
        <h1 className="mt-6 font-display text-[32px] font-extrabold" style={{ fontVariationSettings: "'wdth' 112" }}>
          How it works
        </h1>
        <p className="mt-2 max-w-2xl text-[16px] text-ink-muted">
          The detection is plain code you can read in this repository. The model does one job: turning a captured line into the code
          change that stops it, inside the merge request, where the same drill then checks its work.
        </p>
        <ol className="mt-8 flex flex-col">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[40px_1fr] gap-4 border-l border-line pb-8 pl-0">
              <span className="-ml-[17px] flex size-8 items-center justify-center rounded-full border border-ink bg-canvas font-mono text-[13px]">{i + 1}</span>
              <div className="-mt-1">
                <h2 className="text-[18px] font-semibold">{s.title}</h2>
                <p className="mt-1 text-[15px] leading-6 text-ink">{s.body}</p>
                <p className="mt-2 text-[13px] text-ink-muted">
                  {s.where}
                  {s.file && (
                    <>
                      {" · "}
                      {repo ? (
                        <a className="font-mono underline" href={`${repo}/-/blob/main/${s.file}`} target="_blank" rel="noreferrer">
                          {s.file}
                        </a>
                      ) : (
                        <span className="font-mono">{s.file}</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}

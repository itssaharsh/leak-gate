# Implementation contract - leak-gate
mode: hackathon | channel: direct | created: 2026-10-12
Upstream read: the idea package and UI spec kept beside this repository (not committed); event pages listed in §12.

## 1. Intent
- User and moment of use: a backend engineer opens a merge request that touches signup or checkout code at a company that sells into the EU; the privacy lead approves the release.
- What they can do: see, for this exact merge request, every place a synthetic customer's planted data landed while the change ran, and receive a fix commit for each leak inside the same merge request.
- Before -> after: before, personal data reaching logs or third parties is found in an audit or a breach report; after, the merge request is blocked with the captured line as proof, a GitLab Duo flow commits the fix, the same drill proves it, and the release carries an updated record of processing.

## 2. Scope
MUST:
- Drill: plant a synthetic customer, run her journeys through the shop, read app logs (CloudWatch), vendor captures and the shop database, compare with privacy/datamap.yml, report leaks (JSON, JUnit, GitLab security report, markdown).
- Shop: a believable app under test with signup, checkout and support routes, an access line per request, vendor clients and a user table with hashed passwords.
- Gate: simulated vendor endpoints that record what they receive; runs API; a console that shows the featured merge request's runs (before and after the fix) with evidence, and a rate-limited live drill.
- GitLab: a pipeline that deploys a review copy of the shop per merge request, runs the drill, fails on leaks, publishes the reports; a Duo custom flow triggered by the failed pipeline that commits a fix to the merge request; a manual production deploy; a release that carries the record of processing; a scheduled production canary.
- Deploy: AWS (Lambda + function URLs, DynamoDB, CloudWatch Logs), GitLab CI authenticated through OIDC.
SHOULD: merge request approval rule on open leak findings; incident issue from the production canary; /how architecture page; replay fallback.
COULD: browser-based journeys with screenshots in CI; database and browser storage as sinks beyond the user table.
WON'T now: multi-repo scanning, mobile apps, a real vendor integration, user accounts on the console.

## 3. Core journeys
J1 (hero): merge request pushed -> review shop deployed -> drill finds leaks -> pipeline fails with findings in the merge request -> Duo flow commits fixes -> drill reruns -> 0 leaks -> privacy lead runs the production job -> release with record of processing.
J2: a visitor opens the console -> sees the featured merge request before and after the fix -> opens the captured line for any leak.
J3: a visitor runs a live drill against the kept leaky build or the fixed build -> named steps stream -> the map fills from that run.

## 4. Surfaces
Shop (app under test), Gate console (/, /how, /record), GitLab merge request, pipeline, Duo flow session, release.

## 5. States per journey
| Journey | initial | loading | success | error | empty | partial | retry | disabled | permission-denied | offline/degraded |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | MR open | pipeline running | green, 0 leaks | drill error stops the job with the step and reason | n/a: every run plants a customer | some journeys ran: report what ran, status error | rerun pipeline | production job manual | flow cannot push: note on MR | AWS unreachable: job fails with the AWS error |
| J2 | featured MR loaded | skeleton map | runs shown | API error: replay fixture | no runs yet: first-run state | one run only: toggle disabled with reason | reload | n/a | n/a | replay fixture labelled with its date |
| J3 | idle button | named steps 1/7 | map fills | failed step marked with reason | n/a | partial map kept | Retry drill | rate limited with seconds left | n/a | replay |

## 6. Data
| Entity | Key fields | Relationships | Owner | Persistence | Source of truth | PII/retention |
|---|---|---|---|---|---|---|
| Synthetic customer | runId, name, email, phone, password, address | one per run | drill | inside the run record | drill | synthetic only |
| Vendor capture | vendor, sk (time#id), env, body | per shop env | gate | DynamoDB leakgate-captures | gate | synthetic in practice; TTL 7 days; body capped at 16 KB |
| Shop user | env, userId, name, email, phone, passwordHash | per env | shop | DynamoDB leakgate-shop-users | shop | synthetic in practice; TTL 7 days |
| Run | pk RUN, sk time#runId, report, events | per MR or live | gate / CI | DynamoDB leakgate-runs | drill report | holds synthetic values only |
| Data map | fields -> allowed destinations | repo | privacy lead | privacy/datamap.yml | git | none |

## 7. Interfaces
| Interface | Purpose | Contract file | Failure mode | Fallback |
|---|---|---|---|---|
| Shop HTTP | journeys | packages/drill/src/journeys.ts | timeout, 5xx | drill reports error with the step |
| CloudWatch FilterLogEvents | app-log sink | packages/drill/src/sinks.ts | ingestion delay | wait for access lines (30 s), then search |
| DynamoDB | captures, users, runs | packages/drill/src/sinks.ts, apps/gate/src/lib | throttling | retry by SDK; drill error |
| Gate vendor endpoint | record vendor calls | apps/gate/src/app/api/vendors/[vendor]/route.ts | bad key, oversized body | 401 / 413; shop logs the vendor failure without the body |
| GitLab Duo flow | fix commit | .gitlab/duo/flows/leak-fix.yaml | no credits, no trigger | merge request stays blocked; note explains |
| GitLab CI to AWS | deploy, drill | .gitlab-ci.yml | OIDC trust error | job fails with the AWS message |

## 8. Constraints
- Security: no real personal data anywhere; vendor endpoint needs a shared key; live drill rate-limited (one per 20 s, 300 per day); secrets only in CI variables and Lambda env; no AWS keys in GitLab (OIDC).
- Budget: AWS credits; Lambda, DynamoDB on-demand and CloudWatch stay near free-tier volumes.
- Deadline: see §12.
- Sponsor rule, verbatim: "Every project must use GitLab Duo Agent Platform features, such as agents, flows, or MCP clients."
- Judging criteria: see §12.

## 9. Acceptance criteria
AC-1: WHEN the drill runs against the leaky build THE SYSTEM SHALL report each (field, destination) pair outside the data map with the captured excerpt. Verify: npm test; live run evidence.
AC-2: WHEN the drill runs against a build with no leaks THE SYSTEM SHALL report status passed and 0 leaks. Verify: live run evidence against main.
AC-3: WHEN a leak is found in a merge request pipeline THE SYSTEM SHALL fail the drill job and publish JUnit and security reports. Verify: pipeline evidence.
AC-4: WHEN the drill job fails THE SYSTEM SHALL start the Duo flow, which commits a fix to the merge request branch. Verify: flow session and commit evidence.
AC-5: WHEN a visitor opens the console with no input THE SYSTEM SHALL show the featured merge request's leaks and the primary action on the first screen at 1440x900 and 390x844. Verify: foldcheck.
AC-6: WHEN a visitor runs a live drill THE SYSTEM SHALL stream named steps and show the result within 45 s, or say which step failed. Verify: observed on the live URL.
AC-7: WHEN the vendor endpoint receives a request without the shared key THE SYSTEM SHALL answer 401 and store nothing. Verify: smoke.
AC-8: WHEN live drills arrive faster than one per 20 s THE SYSTEM SHALL refuse with the seconds left. Verify: smoke.
AC-9: WHEN a judge opens the GitLab project THE SYSTEM SHALL show an MIT license in the About section and a README whose first screen has the one-line description, a screenshot, the video link and the live link. Verify: observed on gitlab.com.
AC-10: WHEN the final video is checked THE SYSTEM SHALL be under 180 s, at least 30 fps, with no third-party trademarks or music. Verify: product-demo-video QC.
AC-11: WHEN the submission is checked THE SYSTEM SHALL pass pb.py window and pb.py submit check. Verify: pb.py output.

## 10. Assumptions
A-1 [reversible]: CloudWatch ingestion completes within 30 s for Lambda logs - validate in the first live run.
A-2 [reversible]: GitLab-hosted runners can reach AWS and run Node 22 jobs - validate in the first pipeline.
A-3 [blocking for J1 only]: the event's GitLab group provides Duo credits for flow service accounts - validate after approval with one triggered flow.
A-4 [reversible]: GitLab security report widgets need Ultimate in the event group; JUnit test reports work on every tier and carry the same findings.

## 11. Demo script
0:00 console Before fix, three red lines from the synthetic customer. 0:08 the merge request in GitLab, pipeline red, drill job failed, findings listed. 0:35 one captured log line with her planted email. 0:55 the Duo flow session on the failed pipeline, its fix commit. 1:30 pipeline green, console After fix, 3 -> 0. 1:50 privacy lead runs the production job, release with the record of processing. 2:10 live drill on the kept leaky build. 2:30 lifecycle trail across nine stages. 2:45 what is real and what is simulated.

## 12. Event and judged path
- Window (read 2026-10-12 from https://gitlab-transcend.devpost.com/rules): "Submission Period: October 5, 2026 (10:00 am UTC) - October 27, 2026 (1:00 pm UTC)". Freeze from 2026-10-26T13:00Z. Rule on earlier work, verbatim: "Projects must be either newly created on or after October 5, 2026 by the Entrant in Path A". This repository's first commit is 2026-10-12T13:46Z.
- How an entry is judged: the rules say judges "may choose to judge based solely on the text description, images, and video provided in the Submission" and "are not required to test the Project". Minutes per project: not published. Order of surfaces: not published.
- Criteria, equally weighted (rules page, read 2026-10-12): Technological Implementation ("How thoroughly and skillfully does the project use GitLab to automate the post-code DevSecOps lifecycle? Does the code and pipeline config reflect genuine effort and a working, non-trivial implementation?"); Design ("Does the project deliver a complete, coherent end-to-end workflow, not just a technical proof of concept?"); Potential Impact ("Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?"); Innovation / Idea ("How creative and novel is the concept and how inventively does it apply agentic automation compared to existing concepts?"); Presentation ("Does the video clearly demonstrate the automation running end-to-end? Does it communicate what problem is solved, who it's for, and why it matters? Is the overall presentation easy to follow?").
- Criteria coverage: Technological Implementation: the failed drill job starts the Duo flow, which commits the fix, and the pipeline config and flow YAML are in the repo (planned: met). Design: one merge request from push to production with the release record (planned: met). Potential Impact: public enforcement and incidents of personal data in logs, then the same class of bug caught live (planned: met). Innovation: exact-match proof in a running app plus a fix loop inside the merge request (planned: met). Presentation: before and after on the console and in GitLab (planned: met).
- Capability coverage: Path A Supervised ("You approve the outcome, not the individual steps"): the flow fixes and re-proves without step approvals; a person runs the manual production job. Most Stages Covered: plan (issue per leak), create (fix commit), verify (drill job), package (build artifacts in the package registry), secure (security report), release (release with record of processing), configure (privacy/datamap.yml), monitor (scheduled production canary), govern (merge blocked on leaks; manual production job).
- Main result: the merge request pipeline turns from red to green as the leak count drops from 3 to 0, on the real default behaviour of logging and error-reporting code. Staged failure: a destination the data map has never seen is held for the privacy lead instead of auto-fixed.
- Promise coverage: "Leak" -> the leak count and the destinations reached on the console's first screen; "Gate" -> the merge request shown as blocked until the count is zero.
- Before the clock: nothing. Planning (idea research, UI spec) happened on 2026-10-12, after the start, outside this repository. README sentence: "Built during the Life After Code hackathon, starting 12 October 2026."
- Hosting: AWS. The Google Cloud bonus (up to 0.2) is not targeted unless hosting moves to Google Cloud.

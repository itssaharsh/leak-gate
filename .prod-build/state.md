# Build state - leak-gate
Updated: 2026-10-13 | mode: hackathon | channel: direct | phase: submission material ready; waiting on the YouTube upload and the Devpost form

## Now
- Tasks: T01-T16 and T18 (plain-language explainer under the map) done; T17 (submission) waits on the YouTube link and the Devpost form, both the user's.
- Last good deploy: gate + shop-main + shop-leaky on AWS. GitLab main at 480677a1 deployed to production by the manual job (pipeline 2939776831), release v1.0.10.

## What worked (with evidence IDs)
- Drill core, 18 unit tests (E0019-E0020); shop and gate build and lint (E0005-E0006, E0022)
- AWS bootstrap and smoke checks, 9/9 (E0012)
- Merge request 1: pipeline 2939717833 failed with 11 leaks; Duo flow session 9341291 committed d50f0d4e as the "Leak Gate fix" service account; rerun 2939736357 passed with 0; merged, deployed, production drilled, released
- Hourly canary schedule passes on production; a one-off canary aimed at the leaky build opened incident #2 (closed), and the flow it triggered made no change (job 17121288417)
- Foldcheck PASS at 1440 and 390; secret scan clean; no secrets in job logs or client bundles; npm audit 0 (evidence on T13-T15)

## What failed - do not retry without a new root cause
- Windows Python cannot read AppData\Roaming (sandboxed); run Python inside WSL.
- `python3 -` in Git Bash hangs (Windows Python waits on stdin); never use it from the Bash tool.
- `set -o pipefail` + `git log | head` kills scripts; use `git log -1`.
- wsl.exe expands `$VAR` in passed commands; escape as `\$VAR` or put commands in a script file.
- Video kit: an offscreen `goto` to another site loses the 1px heartbeat, so recording crawls at 4 s per frame. The working copy of run.py in ../video/kit re-injects it after every goto.
- Video kit: two `camera` actions with no page time between them share a timestamp and the composer stacks both moves. Put a `pause` between them.
- GitLab's merge request page sits behind Cloudflare's bot check for headless browsers; the video uses pipeline, job, commit, release and incident pages instead.

## Not tried yet / open questions
- Unknown destinations: the flow's instructions hold them for the privacy lead, but the gate only accepts the four known vendors, so this path has never run.
- "Pipelines must succeed" needs a Maintainer; the user is a Developer on the event project.

## Changes that need care
- AWS (account ...6889, us-east-1): tables leakgate-captures, leakgate-runs, leakgate-shop-users; roles leakgate-shop-role, leakgate-gate-role; functions leakgate-gate, leakgate-shop-main, leakgate-shop-leaky; role leakgate-gitlab-ci for GitLab OIDC.
- Secrets live only in ../.env.local (VENDOR_KEY, DRILL_TOKEN, GITLAB_TOKEN), Lambda env and masked GitLab CI variables.

## Exact next step
The user uploads ../video/build/final.mp4 to YouTube (public or unlisted), then runs
`bash ~/contri/gitlab-transcend/.tools/add-video-link.sh <youtube link>`, then pastes ../submission/submission.md into Devpost and submits.
After that: `python3 .prod-build/pb.py submit check --video ../video/build/final.mp4 --video-url <link> --readme README.md` and close T17.

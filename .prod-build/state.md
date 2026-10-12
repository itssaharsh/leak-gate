# Build state - leak-gate
Updated: 2026-10-12 | mode: hackathon | channel: direct | phase: M2 waiting on GitLab group approval

## Now
- Phase / current task: T09 doing (pipeline written, not yet run: no GitLab project until approval)
- Last good commit: see `git log -1` (main)      Last good deploy: gate + shop-main + shop-leaky on AWS, 2026-10-12

## What worked (with evidence IDs)
- Drill core, 18 unit tests (E0019-E0020)
- Shop and gate build and lint (E0005-E0006, E0022)
- AWS bootstrap and smoke checks, 9/9 (E0012)
- Live drill: leaky build 11 leaks across app logs, error tracker, analytics; main 0 (E0021)
- Console at 1440 and 390, drawer, live drill from the browser 11.6 s (E0025); foldcheck PASS (warning: After fix disabled until the flow runs)

## What failed - do not retry without a new root cause
- Windows Python cannot read AppData\Roaming (sandboxed); run Python inside WSL.
- `python3 -` in Git Bash hangs (Windows Python waits on stdin); never use it from the Bash tool.
- `set -o pipefail` + `git log | head` kills scripts; use `git log -1`.
- wsl.exe expands `$VAR` in passed commands; escape as `\$VAR` or put commands in a script file.

## Not tried yet / open questions
- GitLab: project path, Ultimate features (security widget), Duo credits for the flow service account, hosted runner pulling public.ecr.aws/sam image.
- Flow YAML only validated against the spec, not the AI Catalog.

## Changes that need care
- AWS (account ...6889, us-east-1): tables leakgate-captures, leakgate-runs, leakgate-shop-users; roles leakgate-shop-role, leakgate-gate-role; functions leakgate-gate, leakgate-shop-main, leakgate-shop-leaky.
- Secrets live only in ../.env.local (VENDOR_KEY, DRILL_TOKEN, GITLAB_TOKEN) and Lambda env.

## Exact next step
When the group exists: `bash ../.tools/gitlab-setup.sh <project path>`, then create the leak-fix flow from
`.gitlab/duo/flows/leak-fix.yaml` in the AI Catalog, enable it in the project, add a pipeline-failed trigger,
then `bash ../.tools/open-mr.sh`, watch the pipeline, set FEATURED_MR on the gate and redeploy.

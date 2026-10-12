#!/usr/bin/env bash
# Opens an incident issue with the drill summary when the production canary finds a leak.
# Usage: scripts/open-incident.sh <summary.md>   (needs LEAKGATE_BOT_TOKEN with api scope)
set -euo pipefail
SUMMARY="$1"
TITLE="Production leak: synthetic customer data reached a destination outside the data map"
BODY="$(cat "$SUMMARY")

Found by the hourly production canary in $CI_JOB_URL.
The data map is \`privacy/datamap.yml\`."
node -e '
  const [title, body] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({ title, description: body, issue_type: "incident", labels: "leak-gate,privacy" }));
' "$TITLE" "$BODY" > /tmp/issue.json
curl --fail --silent --show-error -X POST \
  --header "PRIVATE-TOKEN: $LEAKGATE_BOT_TOKEN" --header "Content-Type: application/json" \
  --data @/tmp/issue.json "$CI_API_V4_URL/projects/$CI_PROJECT_ID/issues" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("opened", JSON.parse(s).web_url))'

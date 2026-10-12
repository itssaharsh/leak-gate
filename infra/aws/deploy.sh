#!/usr/bin/env bash
# Packages a built Next.js app (output: standalone) and deploys it to AWS Lambda behind a
# public function URL, using the AWS Lambda Web Adapter layer.
# Usage: infra/aws/deploy.sh <shop|gate> <function-name> [KEY=VALUE ...]
# Prints the function URL on the last line.
set -euo pipefail
APP="$1"; FN="$2"; shift 2
REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_PAGER=""
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
LAYER="arn:aws:lambda:$REGION:753240598075:layer:LambdaAdapterLayerX86:30"
ROLE="arn:aws:iam::$ACCOUNT:role/leakgate-$APP-role"
SRC="$ROOT/apps/$APP"
[ -f "$SRC/.next/standalone/apps/$APP/server.js" ] || { echo "build apps/$APP first (npm run build -w apps/$APP)" >&2; exit 1; }

# 1. Assemble: standalone server + static assets + public files + start script.
WORK="$(mktemp -d)"; PKG="$WORK/pkg"; mkdir -p "$PKG"
cp -rL "$SRC/.next/standalone/." "$PKG/"
mkdir -p "$PKG/apps/$APP/.next"
cp -r "$SRC/.next/static" "$PKG/apps/$APP/.next/static"
[ -d "$SRC/public" ] && cp -r "$SRC/public" "$PKG/apps/$APP/public"
printf '#!/bin/bash\nexec node apps/%s/server.js\n' "$APP" > "$PKG/run.sh"
chmod +x "$PKG/run.sh"
(cd "$PKG" && zip -qr "$WORK/app.zip" .)
echo "package: $(du -h "$WORK/app.zip" | cut -f1)"

# 2. Environment: the adapter's settings plus the caller's KEY=VALUE pairs.
ENV_JSON="$(node -e '
  const vars = { AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap", PORT: "8080", HOSTNAME: "0.0.0.0", AWS_LWA_READINESS_CHECK_PATH: "/" };
  for (const kv of process.argv.slice(1)) { const i = kv.indexOf("="); if (i > 0) vars[kv.slice(0, i)] = kv.slice(i + 1); }
  process.stdout.write(JSON.stringify({ Variables: vars }));
' "$@")"

# 3. Create or update the function.
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$WORK/app.zip" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENV_JSON" --layers "$LAYER" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN"
  echo "function $FN: updated"
else
  aws lambda create-function --function-name "$FN" --runtime nodejs22.x --handler run.sh \
    --role "$ROLE" --layers "$LAYER" --zip-file "fileb://$WORK/app.zip" \
    --memory-size 1024 --timeout "$([ "$APP" = gate ] && echo 60 || echo 15)" \
    --environment "$ENV_JSON" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FN"
  echo "function $FN: created"
  aws logs create-log-group --log-group-name "/aws/lambda/$FN" >/dev/null 2>&1 || true
  aws logs put-retention-policy --log-group-name "/aws/lambda/$FN" --retention-in-days 14
fi

# 4. Public function URL (both permissions are needed for unauthenticated access).
if ! aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FN" --auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-invoke \
    --action lambda:InvokeFunction --principal "*" --invoked-via-function-url >/dev/null
fi
rm -rf "$WORK"
aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text

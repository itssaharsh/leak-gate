#!/usr/bin/env bash
# Deploys a Next.js app to AWS Lambda behind a public function URL, using the AWS Lambda Web Adapter layer.
# Usage: infra/aws/deploy.sh <shop|gate> <function-name> [KEY=VALUE ...]
#   ZIP_FILE=path  deploy an existing package (from infra/aws/package.sh) instead of packaging now.
# Credentials: an AWS profile locally, or GitLab's OIDC web identity in CI (AWS_ROLE_ARN + AWS_WEB_IDENTITY_TOKEN_FILE).
# Prints the function URL on the last line.
set -euo pipefail
APP="$1"; FN="$2"; shift 2
REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_PAGER=""
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
LAYER="arn:aws:lambda:$REGION:753240598075:layer:LambdaAdapterLayerX86:30"
ROLE="arn:aws:iam::$ACCOUNT:role/leakgate-$APP-role"

ZIP="${ZIP_FILE:-}"
if [ -z "$ZIP" ]; then
  ZIP="$(mktemp -d)/app.zip"
  bash "$ROOT/infra/aws/package.sh" "$APP" "$ZIP"
fi

# Environment: the adapter's settings plus the caller's KEY=VALUE pairs.
ENV_JSON="$(node -e '
  const vars = { AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap", PORT: "8080", HOSTNAME: "0.0.0.0", AWS_LWA_READINESS_CHECK_PATH: "/" };
  for (const kv of process.argv.slice(1)) { const i = kv.indexOf("="); if (i > 0) vars[kv.slice(0, i)] = kv.slice(i + 1); }
  process.stdout.write(JSON.stringify({ Variables: vars }));
' "$@")"

if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$ZIP" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENV_JSON" --layers "$LAYER" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN"
  echo "function $FN: updated"
else
  aws lambda create-function --function-name "$FN" --runtime nodejs22.x --handler run.sh \
    --role "$ROLE" --layers "$LAYER" --zip-file "fileb://$ZIP" \
    --memory-size 1024 --timeout "$([ "$APP" = gate ] && echo 60 || echo 15)" \
    --environment "$ENV_JSON" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FN"
  echo "function $FN: created"
  aws logs create-log-group --log-group-name "/aws/lambda/$FN" >/dev/null 2>&1 || true
  aws logs put-retention-policy --log-group-name "/aws/lambda/$FN" --retention-in-days 14
fi

# Public function URL (both permissions are needed for unauthenticated access).
if ! aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FN" --auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-invoke \
    --action lambda:InvokeFunction --principal "*" --invoked-via-function-url >/dev/null
fi
aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text

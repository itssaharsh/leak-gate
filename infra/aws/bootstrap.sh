#!/usr/bin/env bash
# One-time, idempotent AWS setup for Leak Gate: DynamoDB tables and Lambda execution roles.
# Usage: AWS_REGION=us-east-1 [AWS_PROFILE=...] infra/aws/bootstrap.sh
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_PAGER=""
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
echo "account ${ACCOUNT: -4} (last 4) · region $REGION"

table() { # name, key schema json, attribute definitions json
  if aws dynamodb describe-table --table-name "$1" >/dev/null 2>&1; then
    echo "table $1: exists"
  else
    aws dynamodb create-table --table-name "$1" --billing-mode PAY_PER_REQUEST \
      --key-schema "$2" --attribute-definitions "$3" >/dev/null
    aws dynamodb wait table-exists --table-name "$1"
    echo "table $1: created"
  fi
  aws dynamodb update-time-to-live --table-name "$1" \
    --time-to-live-specification "Enabled=true,AttributeName=ttl" >/dev/null 2>&1 || true
}

table leakgate-captures \
  '[{"AttributeName":"vendor","KeyType":"HASH"},{"AttributeName":"sk","KeyType":"RANGE"}]' \
  '[{"AttributeName":"vendor","AttributeType":"S"},{"AttributeName":"sk","AttributeType":"S"}]'
table leakgate-runs \
  '[{"AttributeName":"id","KeyType":"HASH"}]' \
  '[{"AttributeName":"id","AttributeType":"S"}]'
table leakgate-shop-users \
  '[{"AttributeName":"env","KeyType":"HASH"},{"AttributeName":"userId","KeyType":"RANGE"}]' \
  '[{"AttributeName":"env","AttributeType":"S"},{"AttributeName":"userId","AttributeType":"S"}]'

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
T="arn:aws:dynamodb:$REGION:$ACCOUNT:table"

role() { # name, inline policy json
  if ! aws iam get-role --role-name "$1" >/dev/null 2>&1; then
    aws iam create-role --role-name "$1" --assume-role-policy-document "$TRUST" >/dev/null
    echo "role $1: created"
  else
    echo "role $1: exists"
  fi
  aws iam attach-role-policy --role-name "$1" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  aws iam put-role-policy --role-name "$1" --policy-name leakgate --policy-document "$2"
}

# The shop writes its own users table and nothing else.
role leakgate-shop-role "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"dynamodb:PutItem\"],\"Resource\":\"$T/leakgate-shop-users\"}]}"

# The gate records vendor captures and runs, and reads the shop's logs and users for live drills.
role leakgate-gate-role "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"dynamodb:PutItem\",\"dynamodb:GetItem\",\"dynamodb:UpdateItem\",\"dynamodb:Query\",\"dynamodb:Scan\"],
   \"Resource\":[\"$T/leakgate-captures\",\"$T/leakgate-runs\",\"$T/leakgate-shop-users\"]},
  {\"Effect\":\"Allow\",\"Action\":[\"logs:FilterLogEvents\"],
   \"Resource\":\"arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/lambda/leakgate-shop-*\"}]}"

echo "bootstrap done"

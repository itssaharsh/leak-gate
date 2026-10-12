#!/usr/bin/env bash
# Lets GitLab CI jobs of one project assume an AWS role with their OIDC ID token, so no AWS keys
# are stored in GitLab. Usage: infra/aws/gitlab-oidc.sh <gitlab project path, e.g. group/sub/leak-gate>
# Prints the role ARN to set as the CI variable LEAKGATE_CI_ROLE.
set -euo pipefail
PROJECT="$1"
REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_PAGER=""
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
PROVIDER="arn:aws:iam::$ACCOUNT:oidc-provider/gitlab.com"

if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER" >/dev/null 2>&1; then
  aws iam create-open-id-connect-provider --url https://gitlab.com --client-id-list sts.amazonaws.com >/dev/null
  echo "OIDC provider gitlab.com: created"
fi

TRUST=$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Federated":"$PROVIDER"},
 "Action":"sts:AssumeRoleWithWebIdentity",
 "Condition":{"StringEquals":{"gitlab.com:aud":"sts.amazonaws.com"},
              "StringLike":{"gitlab.com:sub":"project_path:$PROJECT:ref_type:branch:ref:*"}}}]}
EOF
)
ROLE=leakgate-gitlab-ci
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "$TRUST"
else
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document "$TRUST" --max-session-duration 3600 >/dev/null
fi

FN="arn:aws:lambda:$REGION:$ACCOUNT:function"
LG="arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/lambda/leakgate-*"
T="arn:aws:dynamodb:$REGION:$ACCOUNT:table"
POLICY=$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["lambda:GetFunction","lambda:CreateFunction","lambda:UpdateFunctionCode","lambda:UpdateFunctionConfiguration",
   "lambda:DeleteFunction","lambda:GetFunctionConfiguration","lambda:GetFunctionUrlConfig","lambda:CreateFunctionUrlConfig",
   "lambda:DeleteFunctionUrlConfig","lambda:AddPermission"],
  "Resource":["$FN:leakgate-shop-*","$FN:leakgate-gate"]},
 {"Effect":"Allow","Action":["lambda:GetLayerVersion"],"Resource":"arn:aws:lambda:$REGION:753240598075:layer:LambdaAdapterLayerX86:*"},
 {"Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::$ACCOUNT:role/leakgate-shop-role","arn:aws:iam::$ACCOUNT:role/leakgate-gate-role"]},
 {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:PutRetentionPolicy","logs:FilterLogEvents","logs:DeleteLogGroup"],"Resource":["$LG","$LG:*"]},
 {"Effect":"Allow","Action":["dynamodb:Query"],"Resource":["$T/leakgate-captures","$T/leakgate-shop-users"]},
 {"Effect":"Allow","Action":["sts:GetCallerIdentity"],"Resource":"*"}]}
EOF
)
aws iam put-role-policy --role-name "$ROLE" --policy-name leakgate-ci --policy-document "$POLICY"
aws iam get-role --role-name "$ROLE" --query Role.Arn --output text

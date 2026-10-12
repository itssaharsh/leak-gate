#!/usr/bin/env bash
# Removes a merge request's review shop: its Lambda function and log group.
# Usage: infra/aws/destroy-review.sh <function-name>
set -uo pipefail
export AWS_PAGER=""
FN="$1"
case "$FN" in leakgate-shop-mr-*) ;; *) echo "refusing to delete $FN: only review functions" >&2; exit 2 ;; esac
aws lambda delete-function --function-name "$FN" && echo "function $FN: deleted"
aws logs delete-log-group --log-group-name "/aws/lambda/$FN" 2>/dev/null && echo "log group deleted"
exit 0

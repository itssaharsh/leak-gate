#!/usr/bin/env bash
# Smoke checks for the deployed functions. Needs SHOP_FIXED_URL, SHOP_LEAKY_URL and GATE_URL.
set -uo pipefail
fail=0
check() { # name, expected status, curl args...
  local name="$1" want="$2"; shift 2
  local got
  got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@")"
  if [ "$got" = "$want" ]; then echo "ok   $name ($got)"; else echo "FAIL $name: expected $want, got $got"; fail=1; fi
}
check "shop main home" 200 "${SHOP_FIXED_URL}"
check "shop leaky home" 200 "${SHOP_LEAKY_URL}"
check "gate home" 200 "${GATE_URL}"
check "gate runs list" 200 "${GATE_URL}api/runs"
check "vendor without key is refused" 401 -X POST -H 'content-type: application/json' -d '{}' "${GATE_URL}api/vendors/analytics"
check "unknown vendor is refused" 404 -X POST -H 'content-type: application/json' -d '{}' "${GATE_URL}api/vendors/nobody"
check "CI upload without token is refused" 401 -X POST -H 'content-type: application/json' -d '{}' "${GATE_URL}api/runs"
check "drill without a build is refused" 400 -X POST -H 'content-type: application/json' -d '{}' "${GATE_URL}api/drill"
check "signup with a short password is refused" 400 -X POST -H 'content-type: application/json' \
  -d '{"name":"Smoke Test","email":"smoke@leakgate.test","phone":"07700900000","password":"short"}' "${SHOP_FIXED_URL}api/signup"
exit $fail

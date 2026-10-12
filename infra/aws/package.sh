#!/usr/bin/env bash
# Packages a built Next.js app (output: standalone) as a Lambda zip for the AWS Lambda Web Adapter.
# Usage: infra/aws/package.sh <shop|gate> <out.zip>
set -euo pipefail
APP="$1"; OUT="$(realpath -m "$2")"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/apps/$APP"
[ -f "$SRC/.next/standalone/apps/$APP/server.js" ] || { echo "build apps/$APP first (npm run build -w apps/$APP)" >&2; exit 1; }
WORK="$(mktemp -d)"; PKG="$WORK/pkg"; mkdir -p "$PKG"
cp -rL "$SRC/.next/standalone/." "$PKG/"
mkdir -p "$PKG/apps/$APP/.next"
cp -r "$SRC/.next/static" "$PKG/apps/$APP/.next/static"
[ -d "$SRC/public" ] && cp -r "$SRC/public" "$PKG/apps/$APP/public"
printf '#!/bin/bash\nexec node apps/%s/server.js\n' "$APP" > "$PKG/run.sh"
chmod +x "$PKG/run.sh"
rm -f "$OUT"
(cd "$PKG" && zip -qr "$OUT" .)
rm -rf "$WORK"
echo "packaged $APP: $(du -h "$OUT" | cut -f1) -> $OUT"

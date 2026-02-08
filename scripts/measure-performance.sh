#!/usr/bin/env bash
set -euo pipefail

# Lighthouse Performance Baseline Measurement Script
# Usage: ./scripts/measure-performance.sh [BASE_URL]
# Default: http://localhost:3000
#
# Prerequisites:
#   - Chrome/Chromium installed
#   - Production server running (npm run build && npm start)
#   - npx available (Node.js installed)

BASE_URL="${1:-http://localhost:3000}"
OUTDIR=".planning/baselines"
mkdir -p "$OUTDIR"

echo "=== Lighthouse Performance Baselines ==="
echo "Target: $BASE_URL"
echo "Output: $OUTDIR"
echo ""

# Check if server is reachable
if ! curl -sf "$BASE_URL" > /dev/null 2>&1; then
  echo "ERROR: Server not reachable at $BASE_URL"
  echo "Start the server first: npm run build && npm start"
  exit 1
fi

PAGES=("/" "/albums")
NAMES=("home" "albums")

for i in "${!PAGES[@]}"; do
  PAGE="${PAGES[$i]}"
  NAME="${NAMES[$i]}"
  echo "Auditing $BASE_URL$PAGE..."
  npx lighthouse "$BASE_URL$PAGE" \
    --output=json --output=html \
    --output-path="$OUTDIR/$NAME.report" \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance \
    --quiet
  echo "  Saved: $OUTDIR/$NAME.report.json, $OUTDIR/$NAME.report.html"
done

echo ""
echo "=== Lighthouse Baselines ==="
for i in "${!NAMES[@]}"; do
  NAME="${NAMES[$i]}"
  JSON_FILE="$OUTDIR/$NAME.report.json"
  if [ ! -f "$JSON_FILE" ]; then
    echo "$NAME: MISSING (report not generated)"
    continue
  fi
  node -e "
    const r = require('./$JSON_FILE');
    const a = r.audits;
    console.log('$NAME:');
    console.log('  Performance: ' + Math.round(r.categories.performance.score * 100));
    console.log('  FCP: ' + a['first-contentful-paint'].displayValue);
    console.log('  LCP: ' + a['largest-contentful-paint'].displayValue);
    console.log('  TBT: ' + a['total-blocking-time'].displayValue);
    console.log('  CLS: ' + a['cumulative-layout-shift'].displayValue);
  "
done

echo ""
echo "Done. Update .planning/baselines/lighthouse.md with the results above."

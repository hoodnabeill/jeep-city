#!/usr/bin/env bash
# Restore drill (D-88): proves the backups can be restored, without touching the live data.
# Takes a fresh backup, restores it into a scratch database "jeepcity_drill", compares row counts of the main
# tables with the live database, then drops the scratch database. Run before go-live and then monthly:
#   ./scripts/restore-drill.sh            (from deploy/; the result is appended to deploy/restore-drill.log)
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose"
TABLES="customers vehicles work_orders doc_lines statements payments items item_variants stock_movements customer_ledger users"

echo "1/4 Fresh backup…"
$DC exec -T backup backup.sh now
DUMP=$($DC exec -T backup sh -c "ls -1t /backups/jeepcity-*.dump | head -1")
echo "2/4 Restoring $DUMP into jeepcity_drill…"
$DC exec -T backup sh -c "dropdb --if-exists jeepcity_drill && createdb jeepcity_drill && pg_restore --no-owner --dbname=jeepcity_drill $DUMP"

echo "3/4 Comparing row counts…"
fail=0; report=""
for t in $TABLES; do
  live=$($DC exec -T backup psql -tA -d jeepcity -c "select count(*) from $t")
  drill=$($DC exec -T backup psql -tA -d jeepcity_drill -c "select count(*) from $t")
  mark="OK"; [ "$live" = "$drill" ] || { mark="DIFF"; fail=1; }
  report+=$(printf '%-18s live %8s  restored %8s  %s\n' "$t" "$live" "$drill" "$mark")$'\n'
done
echo "$report"

echo "4/4 Cleaning up…"
$DC exec -T backup dropdb jeepcity_drill
result=$([ $fail -eq 0 ] && echo PASSED || echo "FAILED (counts differ: someone may have saved during the drill; run it again)")
{ echo "== $(date -Iseconds) $DUMP: $result"; echo "$report"; } >> restore-drill.log
echo "Restore drill $result. Logged in deploy/restore-drill.log"
[ $fail -eq 0 ]

#!/bin/sh
# Daily backup loop (D-88). Each run writes:
#   /backups/jeepcity-YYYY-MM-DD_HHMM.dump    database (pg_dump custom format, restore with pg_restore)
#   /backups/files-YYYY-MM-DD_HHMM.tar.gz     signatures and photos
#   /backups/last-ok                          time of the last good backup (read by /health)
# Keeps KEEP_DAYS days here and copies each new file to RCLONE_REMOTE (e.g. "gdrive:jeepcity-backups") when set.
# "backup.sh now" runs one backup immediately (used by the README and the restore drill).
set -eu
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_HOUR="${BACKUP_HOUR:-02}"

run_once() {
  stamp="$(date +%Y-%m-%d_%H%M)"
  db="/backups/jeepcity-$stamp.dump"
  files="/backups/files-$stamp.tar.gz"
  echo "[backup] $(date -Iseconds) start $stamp"
  pg_dump --format=custom --no-owner --file="$db.part"
  mv "$db.part" "$db"
  tar -czf "$files.part" -C /data files
  mv "$files.part" "$files"
  find /backups -maxdepth 1 \( -name 'jeepcity-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
  if [ -n "${RCLONE_REMOTE:-}" ]; then
    rclone copy "$db" "$RCLONE_REMOTE" && rclone copy "$files" "$RCLONE_REMOTE" \
      && rclone delete --min-age "${KEEP_DAYS}d" "$RCLONE_REMOTE" \
      || { echo "[backup] cloud copy FAILED (local copy is fine)"; date -Iseconds > /backups/cloud-failed; }
  fi
  date -Iseconds > /backups/last-ok
  echo "[backup] done $(ls -lh "$db" | awk '{print $5}')"
}

if [ "${1:-}" = "now" ]; then run_once; exit 0; fi

# Wait for the next BACKUP_HOUR:00 (container TZ = Africa/Cairo), then run every day.
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) ${BACKUP_HOUR}:00:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  run_once || echo "[backup] FAILED $(date -Iseconds)"
done

#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

retention_days="${BACKUP_RETENTION_DAYS:-7}"
case "$retention_days" in
  ''|*[!0-9]*)
    echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/routine-${timestamp}.dump"

pg_dump \
  --format=custom \
  --no-owner \
  --dbname="$DATABASE_URL" \
  --file="$backup_file"

sha256sum "$backup_file" > "${backup_file}.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'routine-*.dump' -o -name 'routine-*.dump.sha256' \) \
  -mtime "+$retention_days" -delete

test -s "$backup_file"
echo "Created database backup: $backup_file"

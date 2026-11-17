#!/bin/sh
# Runs ON THE SERVER (called by deploy.ps1 after "git pull"):
#   1. back up the database (~/backups, the 10 newest are kept)
#   2. rebuild and restart the backend (Django) and Caddy
#   3. wait until Django is running, then apply the database changes (migrations)
# The database container (db) keeps running the whole time.
set -eu

cd "$(dirname "$0")/.."            # the project folder, ~/sougna
BACKUPS="$HOME/backups"

echo "== 1/3 Database backup"
mkdir -p "$BACKUPS"
if docker compose ps --status running --services | grep -qx db; then
    FILE="$BACKUPS/db-$(date +%Y-%m-%d-%H%M%S).sql.gz"
    docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$FILE"
    echo "   saved $FILE ($(du -h "$FILE" | cut -f1))"
    ls -1t "$BACKUPS"/db-*.sql.gz | tail -n +11 | xargs -r rm -f
else
    echo "   database not running yet - no backup"
fi

echo "== 2/3 Rebuild and restart backend + Caddy"
# The web app folder must exist (and belong to us) before Caddy mounts it.
mkdir -p web/releases
START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose up -d --build --remove-orphans --force-recreate backend caddy
docker compose up -d   # make sure db is up too (it is not restarted)

echo "== 3/3 Migrations"
# At start-up the backend applies the migrations itself; wait until gunicorn runs.
i=0
until docker compose logs --since "$START" backend 2>&1 | grep -q "Booting worker"; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then
        echo "   ERROR: Django did not start. Last lines of its log:"
        docker compose logs --tail 30 backend
        exit 1
    fi
    sleep 2
done
docker compose exec -T backend python manage.py migrate --noinput
docker compose exec -T backend python manage.py migrate --check >/dev/null
echo "   all migrations applied"

docker compose ps --format "table {{.Service}}\t{{.Status}}"
echo "SERVER UPDATE OK"

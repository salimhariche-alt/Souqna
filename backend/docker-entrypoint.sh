#!/bin/sh
# Runs every time the backend container starts, before gunicorn.
set -e

echo "Updating the database tables..."
python manage.py migrate --noinput

echo "Creating the cache table (login limits)..."
python manage.py createcachetable

echo "Copying the admin's CSS/JS for Caddy..."
python manage.py collectstatic --noinput --verbosity 0

echo "Starting Django: $*"
exec "$@"

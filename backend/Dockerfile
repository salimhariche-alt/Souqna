# The Sougna backend (Django + gunicorn) as a Docker image.
# Built by docker-compose.yml in the folder above; see DEPLOY.md.

FROM python:3.15-slim

# Print logs straight away (SMS codes appear in "docker compose logs"), no .pyc files.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Packages first: Docker reuses this layer while requirements.txt doesn't change.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as a normal user, not "root". The media and staticfiles folders are where the
# Docker volumes are attached (uploaded photos/voice, admin CSS).
# "sed" removes Windows line endings from the start-up script, just in case.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
    && chmod +x docker-entrypoint.sh \
    && useradd --create-home --uid 1000 sougna \
    && mkdir -p /app/media /app/staticfiles \
    && chown -R sougna:sougna /app/media /app/staticfiles

USER sougna
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
# 2 worker processes x 4 threads: fits in a 1 GB server.
# --max-requests restarts a worker now and then, so memory use stays low.
CMD ["gunicorn", "souqna_api.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", "--threads", "4", "--worker-class", "gthread", \
     "--timeout", "30", \
     "--max-requests", "1000", "--max-requests-jitter", "100", \
     "--access-logfile", "-"]

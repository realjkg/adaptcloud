FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Unprivileged runtime user with no shell (same pattern as homeschool-api's "sage").
RUN useradd --no-create-home --shell /bin/false aidigest

WORKDIR /app
COPY requirements.txt .
# Exact versions, hash-checked (requirements.txt is pip-compile --generate-hashes output).
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

# Application code stays root-owned and read-only for the runtime user.
COPY aidigest ./aidigest
COPY main.py schema.sql ./

USER aidigest

EXPOSE 8000

# No curl in the image: probe /health (public, non-sensitive) with the stdlib.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

# One worker: the in-process scheduler runs once per process (duplicate runs are
# still prevented in Postgres if this is ever scaled out).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header"]

# Piano Lo-Key as a single container: the web app and the song analyzer.
#   docker build -t lo-key .
#   docker run -p 7860:7860 lo-key     then open http://localhost:7860

# 1. Build the web app.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. Python server that also serves the built web app.
FROM python:3.11-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Some hosts (e.g. Hugging Face Spaces) run as a non-root user with a
# read-only home, so keep every cache in /tmp.
ENV PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/tmp/cache \
    NUMBA_CACHE_DIR=/tmp/numba \
    MPLCONFIGDIR=/tmp/matplotlib \
    LOKEY_STATIC_DIR=/app/static \
    PORT=7860

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=web /web/dist ./static

EXPOSE 7860
# Hosting services pass the port to listen on in $PORT.
CMD ["sh", "-c", "exec uvicorn lokey.app:app --app-dir backend --host 0.0.0.0 --port ${PORT}"]

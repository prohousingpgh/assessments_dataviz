# syntax=docker/dockerfile:1

FROM node:20-alpine AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/web/dist \
    PORT=8080

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ api/
COPY data/ data/
COPY --from=web /build/web/dist web/dist

RUN test -f data/parcels.db || (echo "ERROR: data/parcels.db missing. Build the DB or download a data release before docker build." && exit 1)

EXPOSE 8080
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]

#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-lhu-zbot-phase2-db-$(date +%s)-$$}"
export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

pick_free_port() {
  python - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
}

export POSTGRES_PORT="${POSTGRES_PORT:-$(pick_free_port)}"
POSTGRES_DB_NAME="${POSTGRES_DB:-lhu_zbot}"
POSTGRES_USERNAME="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD_VALUE="${POSTGRES_PASSWORD:-postgres}"
DATABASE_URL_VALUE="postgresql://${POSTGRES_USERNAME}:${POSTGRES_PASSWORD_VALUE}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB_NAME}?schema=public"

cleanup() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_postgres_healthy() {
  local deadline=$((SECONDS + 120))

  until docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Health}}' | grep -q 'postgres healthy'; do
    if (( SECONDS >= deadline )); then
      echo 'Timed out waiting for postgres health' >&2
      docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps >&2 || true
      docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color --tail=200 postgres >&2 || true
      exit 1
    fi
    sleep 2
  done
}

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d postgres
wait_for_postgres_healthy

pnpm db:prisma:generate
DATABASE_URL="$DATABASE_URL_VALUE" pnpm db:migrate:deploy
DATABASE_URL="$DATABASE_URL_VALUE" pnpm db:seed
DATABASE_URL="$DATABASE_URL_VALUE" pnpm db:verify

echo 'Phase 2 fresh database verification passed'

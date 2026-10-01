#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" up --build -d

for _ in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Health}}' | grep -q 'postgres healthy'; then
    break
  fi
  sleep 2
done

if ! docker compose -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Health}}' | grep -q 'postgres healthy'; then
  echo 'Postgres did not become healthy' >&2
  docker compose -f "$COMPOSE_FILE" ps >&2
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Health}}' | grep -q 'redis healthy'; then
  echo 'Redis did not become healthy' >&2
  docker compose -f "$COMPOSE_FILE" ps >&2
  exit 1
fi

curl -fsS http://localhost:3001/health/live
curl -fsS http://localhost:3001/health/ready
curl -fsS http://localhost:3000/health

worker_container=$(docker compose -f "$COMPOSE_FILE" ps -q bot-worker)
if [[ -n "$worker_container" ]]; then
  docker inspect "$worker_container" --format '{{.State.Running}}' | grep -q 'true'
  if docker exec "$worker_container" sh -lc 'ss -lnt | grep -q :3001' >/dev/null 2>&1; then
    echo 'worker unexpectedly bound HTTP port 3001' >&2
    exit 1
  fi
fi

# readiness should fail when required dependencies are absent. This is validated by the API service itself.
# The compose runtime keeps postgres and redis available, so the ready endpoint should succeed.

docker compose -f "$COMPOSE_FILE" down

echo 'compose smoke verification passed'

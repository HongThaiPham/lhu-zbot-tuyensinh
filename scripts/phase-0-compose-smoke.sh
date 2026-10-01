#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-lhu-zbot-phase0-smoke-$(date +%s)-$$}"
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

export ADMIN_PORT="${ADMIN_PORT:-$(pick_free_port)}"
export BOT_API_PORT="${BOT_API_PORT:-$(pick_free_port)}"
export POSTGRES_PORT="${POSTGRES_PORT:-$(pick_free_port)}"
export REDIS_PORT="${REDIS_PORT:-$(pick_free_port)}"

cleanup() {
  echo "Cleaning up Compose project ${PROJECT_NAME}"
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'print_diag' ERR

print_diag() {
  echo "--- docker compose ps ---"
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps || true
  for service in bot-api bot-worker postgres redis; do
    echo "--- docker compose logs --no-color ${service} ---"
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color --tail=200 "$service" || true
  done

  for service in bot-api bot-worker postgres redis; do
    container_id=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps -q "$service" || true)
    if [[ -n "$container_id" ]]; then
      echo "--- docker inspect ${service} ---"
      docker inspect "$container_id" || true
    fi
  done
}

wait_for_healthy() {
  local service="$1"
  local timeout_seconds="$2"
  local deadline=$((SECONDS + timeout_seconds))

  until docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Health}}' | grep -q "${service} healthy"; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for ${service} to become healthy" >&2
      print_diag
      exit 1
    fi
    sleep 2
  done
}

wait_for_http_status() {
  local url="$1"
  local expected="$2"
  local timeout_seconds="$3"
  local deadline=$((SECONDS + timeout_seconds))

  while true; do
    status=$(curl --connect-timeout 2 --max-time 5 -sS -o /tmp/phase0-smoke-body.txt -w '%{http_code}' "$url" || true)
    if [[ "$status" == "$expected" ]]; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for ${url} to return ${expected}; got ${status:-unknown}" >&2
      print_diag
      exit 1
    fi
    sleep 2
  done
}

wait_for_http_success() {
  local url="$1"
  local timeout_seconds="$2"
  local deadline=$((SECONDS + timeout_seconds))

  until curl --connect-timeout 2 --max-time 5 -fsS "$url" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for ${url} to respond successfully" >&2
      print_diag
      exit 1
    fi
    sleep 2
  done
}

assert_worker_has_no_host_bindings() {
  local worker_id="$1"
  local host_bindings
  host_bindings=$(docker inspect "$worker_id" --format '{{json .HostConfig.PortBindings}}')

  if [[ "$host_bindings" == *'"3001/tcp"'* ]]; then
    echo "bot-worker unexpectedly has a host binding for 3001/tcp" >&2
    echo "HostConfig.PortBindings: ${host_bindings}" >&2
    print_diag
    exit 1
  fi

  local compose_port_output
  compose_port_output=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" port bot-worker 3001 2>/dev/null || true)
  if [[ -n "$compose_port_output" ]]; then
    echo "bot-worker unexpectedly exposes host port mapping for 3001: ${compose_port_output}" >&2
    print_diag
    exit 1
  fi
}

API_BASE_URL="http://127.0.0.1:${BOT_API_PORT:-4201}"
ADMIN_BASE_URL="http://127.0.0.1:${ADMIN_PORT:-4100}"

echo "Project: ${PROJECT_NAME}"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up --build -d

wait_for_healthy postgres 120
wait_for_healthy redis 120
wait_for_http_success "${API_BASE_URL}/health/live" 120
wait_for_http_status "${API_BASE_URL}/health/ready" 200 120
wait_for_http_status "${ADMIN_BASE_URL}/health" 200 120

worker_id=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps -q bot-worker)
if [[ -z "$worker_id" ]]; then
  echo "bot-worker container did not start" >&2
  print_diag
  exit 1
fi

docker inspect "$worker_id" --format '{{.State.Status}}' | grep -q running || {
  echo "bot-worker is not running" >&2
  print_diag
  exit 1
}

docker logs "$worker_id" 2>&1 | grep -q "worker mode" || {
  echo "bot-worker did not log worker mode startup" >&2
  docker logs "$worker_id" 2>&1 || true
  exit 1
}

assert_worker_has_no_host_bindings "$worker_id"

if docker inspect "$worker_id" --format '{{json .NetworkSettings.Ports}}' | grep -q '3001'; then
  echo "bot-worker unexpectedly exposes port 3001 in container network metadata" >&2
  docker inspect "$worker_id" --format '{{json .NetworkSettings.Ports}}' >&2 || true
  print_diag
  exit 1
fi

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" stop postgres >/dev/null
sleep 5
status=$(curl -sS -o /tmp/phase0-readiness-fail.txt -w '%{http_code}' "${API_BASE_URL}/health/ready" || true)
if [[ "$status" =~ ^2 ]]; then
  echo "Readiness unexpectedly succeeded while PostgreSQL was stopped" >&2
  print_diag
  exit 1
fi

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d postgres >/dev/null
wait_for_healthy postgres 120
wait_for_http_status "${API_BASE_URL}/health/ready" 200 120

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null

if docker ps -aq --filter "label=com.docker.compose.project=${PROJECT_NAME}" | grep -q .; then
  echo "Smoke test cleanup left containers behind for ${PROJECT_NAME}" >&2
  exit 1
fi

echo "Phase 0 Compose smoke verification passed"

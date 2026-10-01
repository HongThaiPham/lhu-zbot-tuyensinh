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
  for service in admin bot-api bot-worker postgres redis; do
    echo "--- docker compose logs --no-color ${service} ---"
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color --tail=200 "$service" || true
  done

  for service in admin bot-api bot-worker postgres redis; do
    container_id=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps -q "$service" || true)
    if [[ -n "$container_id" ]]; then
      echo "--- docker inspect ${service} ---"
      docker inspect "$container_id" || true
      echo "--- docker inspect HostConfig.PortBindings ${service} ---"
      docker inspect --format '{{json .HostConfig.PortBindings}}' "$container_id" || true
      echo "--- docker inspect NetworkSettings.Ports ${service} ---"
      docker inspect --format '{{json .NetworkSettings.Ports}}' "$container_id" || true
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

  while true; do
    if curl --connect-timeout 2 --max-time 5 -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

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

  if python - "$worker_id" <<'PY'
import json
import subprocess
import sys
worker_id = sys.argv[1]

def parse_binding_json(field):
    raw = subprocess.check_output(["docker", "inspect", "--format", field, worker_id], text=True)
    try:
        return json.loads(raw or '{}')
    except json.JSONDecodeError:
        return {}

for label, field in [
    ("HostConfig.PortBindings", '{{json .HostConfig.PortBindings}}'),
    ("NetworkSettings.Ports", '{{json .NetworkSettings.Ports}}'),
]:
    ports = parse_binding_json(field)
    mappings = ports.get("3001/tcp") or []
    for entry in mappings:
        if isinstance(entry, dict):
            host_port = entry.get("HostPort")
            if host_port not in (None, "", "0"):
                print(f"bot-worker unexpectedly has a host binding for 3001/tcp in {label}: {json.dumps(ports)}", file=sys.stderr)
                raise SystemExit(1)
print("worker 3001 binding check passed", file=sys.stderr)
PY
  then
    return 0
  fi

  echo "bot-worker unexpectedly has a host binding for 3001/tcp" >&2
  print_diag
  exit 1
}

API_BASE_URL="http://127.0.0.1:${BOT_API_PORT:-4201}"
ADMIN_BASE_URL="http://127.0.0.1:${ADMIN_PORT:-4100}"

echo "Project: ${PROJECT_NAME}"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up --build -d

wait_for_healthy postgres 120
wait_for_healthy redis 120
wait_for_http_success "${API_BASE_URL}/health/live" 120
wait_for_http_status "${API_BASE_URL}/health/ready" 200 120
wait_for_http_success "${ADMIN_BASE_URL}/health" 120

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

if python - "$worker_id" <<'PY'
import json
import subprocess
import sys
worker_id = sys.argv[1]
raw = subprocess.check_output(["docker", "inspect", "--format", '{{json .NetworkSettings.Ports}}', worker_id], text=True)
ports = json.loads(raw or '{}')
port_bindings = ports.get('3001/tcp') or []
for entry in port_bindings:
    if isinstance(entry, dict) and entry.get('HostPort') not in (None, '', '0'):
        print(json.dumps({"3001/tcp": port_bindings}), file=sys.stderr)
        raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  echo "bot-worker unexpectedly exposes port 3001 in container network metadata" >&2
  docker inspect --format '{{json .NetworkSettings.Ports}}' "$worker_id" >&2 || true
  print_diag
  exit 1
fi

if curl -fsS "${API_BASE_URL}/health/live" >/dev/null 2>&1; then
  :
else
  echo "bot-api live endpoint not available after startup" >&2
  print_diag
  exit 1
fi

if curl -fsS "${ADMIN_BASE_URL}/health" >/dev/null 2>&1; then
  :
else
  echo "admin health endpoint not available after startup" >&2
  print_diag
  exit 1
fi

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" stop redis >/dev/null
sleep 5
status=$(curl -sS -o /tmp/phase0-readiness-fail.txt -w '%{http_code}' "${API_BASE_URL}/health/ready" || true)
if [[ "$status" =~ ^2 ]]; then
  echo "Readiness unexpectedly succeeded while Redis was stopped" >&2
  print_diag
  exit 1
fi

if curl -fsS "${API_BASE_URL}/health/live" >/dev/null 2>&1; then
  :
else
  echo "bot-api live endpoint should remain available while Redis is down" >&2
  print_diag
  exit 1
fi

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d redis >/dev/null
wait_for_healthy redis 120
wait_for_http_status "${API_BASE_URL}/health/ready" 200 120

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null

if docker ps -aq --filter "label=com.docker.compose.project=${PROJECT_NAME}" | grep -q .; then
  echo "Smoke test cleanup left containers behind for ${PROJECT_NAME}" >&2
  exit 1
fi

echo "Phase 0 Compose smoke verification passed"

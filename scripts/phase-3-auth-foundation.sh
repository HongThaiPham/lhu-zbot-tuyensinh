#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-lhu-zbot-phase3-auth-$(date +%s)-$$}"
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

export BOT_API_PORT="${BOT_API_PORT:-$(pick_free_port)}"
export POSTGRES_PORT="${POSTGRES_PORT:-$(pick_free_port)}"
export REDIS_PORT="${REDIS_PORT:-$(pick_free_port)}"

POSTGRES_DB_NAME="${POSTGRES_DB:-lhu_zbot}"
POSTGRES_USERNAME="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD_VALUE="${POSTGRES_PASSWORD:-postgres}"
DATABASE_URL_VALUE="postgresql://${POSTGRES_USERNAME}:${POSTGRES_PASSWORD_VALUE}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB_NAME}?schema=public"

ADMIN_EMAIL="admin.phase3@example.com"
ADMIN_PASSWORD="AdminStrongPass!123"
ADMIN_PASSWORD_RERUN="AdminStrongPass!456"
LIMITED_EMAIL="limited.phase3@example.com"
LIMITED_PASSWORD="LimitedStrongPass!123"
TARGET_EMAIL="target.phase3@example.com"
TARGET_PASSWORD="TargetStrongPass!123"
ADMIN_ORIGIN="http://127.0.0.1:4100"
API_BASE_URL="http://127.0.0.1:${BOT_API_PORT}"

cleanup() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_healthy() {
  local service="$1"
  local timeout_seconds="$2"
  local deadline=$((SECONDS + timeout_seconds))

  until docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Health}}' | grep -q "${service} healthy"; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for ${service} to become healthy" >&2
      docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps >&2 || true
      docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color --tail=200 "$service" >&2 || true
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
    status=$(curl --connect-timeout 2 --max-time 5 -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' "$url" || true)
    if [[ "$status" == "$expected" ]]; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for ${url} to return ${expected}; got ${status:-unknown}" >&2
      docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color --tail=200 bot-api >&2 || true
      exit 1
    fi
    sleep 2
  done
}

json_field() {
  local field="$1"
  node -e "const fs=require('node:fs'); const body=JSON.parse(fs.readFileSync(0,'utf8')); const value=body${field}; if (typeof value === 'undefined') { process.exit(2); } process.stdout.write(String(value));"
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "$message (expected ${expected}, got ${actual})" >&2
    exit 1
  fi
}

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d postgres redis
wait_for_healthy postgres 120
wait_for_healthy redis 120

pnpm db:prisma:generate
DATABASE_URL="$DATABASE_URL_VALUE" pnpm db:migrate:deploy
DATABASE_URL="$DATABASE_URL_VALUE" pnpm db:seed
DATABASE_URL="$DATABASE_URL_VALUE" pnpm db:verify

DATABASE_URL="$DATABASE_URL_VALUE" \
ADMIN_BOOTSTRAP_EMAIL="$ADMIN_EMAIL" \
ADMIN_BOOTSTRAP_PASSWORD="$ADMIN_PASSWORD" \
pnpm --filter @lhu/bot-service auth:bootstrap-admin

# rerun bootstrap: should remain idempotent and not reset password
DATABASE_URL="$DATABASE_URL_VALUE" \
ADMIN_BOOTSTRAP_EMAIL="$ADMIN_EMAIL" \
ADMIN_BOOTSTRAP_PASSWORD="$ADMIN_PASSWORD_RERUN" \
pnpm --filter @lhu/bot-service auth:bootstrap-admin

DATABASE_URL="$DATABASE_URL_VALUE" \
LIMITED_EMAIL="$LIMITED_EMAIL" \
LIMITED_PASSWORD="$LIMITED_PASSWORD" \
TARGET_EMAIL="$TARGET_EMAIL" \
TARGET_PASSWORD="$TARGET_PASSWORD" \
pnpm --filter @lhu/bot-service exec node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

(async () => {
  const ensureUser = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { normalizedEmail } });
    if (existing) {
      return existing;
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    return await prisma.user.create({
      data: {
        email,
        normalizedEmail,
        passwordHash,
      },
    });
  };

  const limited = await ensureUser(process.env.LIMITED_EMAIL, process.env.LIMITED_PASSWORD);
  const target = await ensureUser(process.env.TARGET_EMAIL, process.env.TARGET_PASSWORD);
  const admin = await prisma.user.findUnique({ where: { normalizedEmail: 'admin.phase3@example.com' } });

  if (!admin) {
    throw new Error('bootstrap admin missing');
  }

  process.stdout.write(JSON.stringify({ adminId: admin.id, limitedId: limited.id, targetId: target.id }));
})().finally(async () => {
  await prisma.$disconnect();
});
NODE

IDENTIFIERS=$(DATABASE_URL="$DATABASE_URL_VALUE" \
LIMITED_EMAIL="$LIMITED_EMAIL" LIMITED_PASSWORD="$LIMITED_PASSWORD" \
TARGET_EMAIL="$TARGET_EMAIL" TARGET_PASSWORD="$TARGET_PASSWORD" \
pnpm --filter @lhu/bot-service exec node <<'NODE'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  const admin = await prisma.user.findUnique({ where: { normalizedEmail: 'admin.phase3@example.com' } });
  const limited = await prisma.user.findUnique({ where: { normalizedEmail: 'limited.phase3@example.com' } });
  const target = await prisma.user.findUnique({ where: { normalizedEmail: 'target.phase3@example.com' } });

  if (!admin || !limited || !target) {
    throw new Error('required users missing');
  }

  process.stdout.write(JSON.stringify({ adminId: admin.id, limitedId: limited.id, targetId: target.id }));
})().finally(async () => {
  await prisma.$disconnect();
});
NODE
)

ADMIN_ID=$(printf '%s' "$IDENTIFIERS" | json_field "['adminId']")
LIMITED_ID=$(printf '%s' "$IDENTIFIERS" | json_field "['limitedId']")
TARGET_ID=$(printf '%s' "$IDENTIFIERS" | json_field "['targetId']")

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d bot-api
wait_for_http_status "${API_BASE_URL}/health/ready" 200 120

assert_status 401 "$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' "${API_BASE_URL}/auth/me")" "Unauthenticated /auth/me must be rejected"

INVALID_PASSWORD_RESPONSE=$(curl -sS -X POST "${API_BASE_URL}/auth/login" -H 'content-type: application/json' \
  --data '{"email":"admin.phase3@example.com","password":"wrong-password"}')
INVALID_PASSWORD_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X POST "${API_BASE_URL}/auth/login" -H 'content-type: application/json' \
  --data '{"email":"admin.phase3@example.com","password":"wrong-password"}')
NONEXISTENT_RESPONSE=$(curl -sS -X POST "${API_BASE_URL}/auth/login" -H 'content-type: application/json' \
  --data '{"email":"none.phase3@example.com","password":"wrong-password"}')
NONEXISTENT_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X POST "${API_BASE_URL}/auth/login" -H 'content-type: application/json' \
  --data '{"email":"none.phase3@example.com","password":"wrong-password"}')
assert_status 401 "$INVALID_PASSWORD_STATUS" "Invalid password should return 401"
assert_status 401 "$NONEXISTENT_STATUS" "Nonexistent user should return 401"
[[ "$INVALID_PASSWORD_RESPONSE" == "$NONEXISTENT_RESPONSE" ]] || { echo "Login failure responses must be equivalent" >&2; exit 1; }

rm -f /tmp/phase3-admin.cookie /tmp/phase3-limited.cookie

ADMIN_LOGIN_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X POST "${API_BASE_URL}/auth/login" \
  -H 'content-type: application/json' \
  -c /tmp/phase3-admin.cookie \
  --data "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")
assert_status 200 "$ADMIN_LOGIN_STATUS" "Admin login should succeed"

ME_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -b /tmp/phase3-admin.cookie "${API_BASE_URL}/auth/me")
assert_status 200 "$ME_STATUS" "Authenticated /auth/me should succeed"
if grep -Eq 'passwordHash|tokenHash' /tmp/phase3-auth-body.txt; then
  echo "/auth/me leaked sensitive hash fields" >&2
  exit 1
fi

LIMITED_LOGIN_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X POST "${API_BASE_URL}/auth/login" \
  -H 'content-type: application/json' \
  -c /tmp/phase3-limited.cookie \
  --data "{\"email\":\"${LIMITED_EMAIL}\",\"password\":\"${LIMITED_PASSWORD}\"}")
assert_status 200 "$LIMITED_LOGIN_STATUS" "Limited login should succeed"

LIMITED_MUTATION_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X PATCH "${API_BASE_URL}/admin/users/${TARGET_ID}/status" \
  -H "Origin: ${ADMIN_ORIGIN}" \
  -H 'content-type: application/json' \
  -b /tmp/phase3-limited.cookie \
  --data '{"active":false}')
assert_status 403 "$LIMITED_MUTATION_STATUS" "Insufficient role must return 403"

UNAUTH_MUTATION_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X PATCH "${API_BASE_URL}/admin/users/${TARGET_ID}/status" \
  -H "Origin: ${ADMIN_ORIGIN}" \
  -H 'content-type: application/json' \
  --data '{"active":false}')
assert_status 401 "$UNAUTH_MUTATION_STATUS" "Unauthenticated protected mutation must return 401"

BAD_ORIGIN_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X PATCH "${API_BASE_URL}/admin/users/${TARGET_ID}/status" \
  -H 'Origin: http://evil.example.com' \
  -H 'content-type: application/json' \
  -b /tmp/phase3-admin.cookie \
  --data '{"active":false}')
assert_status 400 "$BAD_ORIGIN_STATUS" "Invalid origin must be rejected"

ADMIN_MUTATION_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X PATCH "${API_BASE_URL}/admin/users/${TARGET_ID}/status" \
  -H "Origin: ${ADMIN_ORIGIN}" \
  -H 'content-type: application/json' \
  -b /tmp/phase3-admin.cookie \
  --data '{"active":false}')
assert_status 200 "$ADMIN_MUTATION_STATUS" "Admin mutation should succeed"

DATABASE_URL="$DATABASE_URL_VALUE" ADMIN_ID="$ADMIN_ID" TARGET_ID="$TARGET_ID" pnpm --filter @lhu/bot-service exec node <<'NODE'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  const user = await prisma.user.findUnique({ where: { id: process.env.TARGET_ID } });
  if (!user || user.status !== 'INACTIVE') {
    throw new Error('Target user status was not updated');
  }

  const audit = await prisma.auditLog.findFirst({
    where: {
      actorUserId: process.env.ADMIN_ID,
      action: 'ADMIN_USER_STATUS_UPDATED',
      entityId: process.env.TARGET_ID,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!audit) {
    throw new Error('Expected audit log missing');
  }

  const auditText = JSON.stringify(audit.metadata || {});
  for (const forbidden of ['password', 'token', 'Authorization', 'Cookie']) {
    if (auditText.includes(forbidden)) {
      throw new Error('Audit metadata contains forbidden secret-like fields');
    }
  }
})().finally(async () => {
  await prisma.$disconnect();
});
NODE

# Password should not be replaced on bootstrap rerun
RERUN_PASSWORD_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X POST "${API_BASE_URL}/auth/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD_RERUN}\"}")
assert_status 401 "$RERUN_PASSWORD_STATUS" "Bootstrap rerun must not silently reset password"

LOGOUT_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -X POST "${API_BASE_URL}/auth/logout" \
  -H "Origin: ${ADMIN_ORIGIN}" \
  -b /tmp/phase3-admin.cookie)
assert_status 204 "$LOGOUT_STATUS" "Logout should succeed"

POST_LOGOUT_STATUS=$(curl -sS -o /tmp/phase3-auth-body.txt -w '%{http_code}' -b /tmp/phase3-admin.cookie "${API_BASE_URL}/auth/me")
assert_status 401 "$POST_LOGOUT_STATUS" "Session should be invalid after logout"

echo 'Phase 3 authentication foundation verification passed'

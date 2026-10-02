#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV="${NODE_ENV:-test}"
export DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/lhu_zbot?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export BOT_SERVICE_ROLE="${BOT_SERVICE_ROLE:-api}"
export ZALO_UPDATE_MODE="${ZALO_UPDATE_MODE:-webhook}"
export ZALO_BOT_TOKEN="${ZALO_BOT_TOKEN:-phase6-test-token}"
export ZALO_POLL_TIMEOUT_SECONDS="${ZALO_POLL_TIMEOUT_SECONDS:-30}"
export ZALO_WEBHOOK_URL="${ZALO_WEBHOOK_URL:-https://bot.example.com/webhooks/zalo}"
export ZALO_WEBHOOK_SECRET_TOKEN="${ZALO_WEBHOOK_SECRET_TOKEN:-phase6-test-secret-token}"
export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-development-only-app-encryption-key-not-for-production}"
export SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-lhu_admin_session}"
export SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-1200}"
export ADMIN_ORIGIN="${ADMIN_ORIGIN:-http://127.0.0.1:4100}"
export SESSION_COOKIE_SAME_SITE="${SESSION_COOKIE_SAME_SITE:-lax}"
export LOGIN_RATE_LIMIT_WINDOW_SECONDS="${LOGIN_RATE_LIMIT_WINDOW_SECONDS:-300}"
export LOGIN_RATE_LIMIT_MAX_ATTEMPTS="${LOGIN_RATE_LIMIT_MAX_ATTEMPTS:-5}"
export TRUST_PROXY="${TRUST_PROXY:-false}"

assert_contains() {
  local pattern="$1"
  local target="$2"
  if ! grep -R -qE "$pattern" "$target"; then
    echo "Expected pattern '$pattern' not found in $target" >&2
    exit 1
  fi
}

assert_not_contains() {
  local pattern="$1"
  local target="$2"
  if grep -R -qE "$pattern" "$target"; then
    echo "Unexpected pattern '$pattern' found in $target" >&2
    exit 1
  fi
}

assert_contains "secret_token" "apps/bot-service/src/zalo/http/zalo-http.client.ts"
assert_contains "ZALO_WEBHOOK_SECRET_TOKEN" "packages/config/src/index.ts"
assert_contains "x-bot-api-secret-token" "apps/bot-service/src/zalo/zalo-webhook.controller.ts"
assert_contains "timingSafeEqual" "apps/bot-service/src/zalo/zalo.service.ts"
assert_contains "result\\.updated_at" "apps/bot-service/src/zalo/zalo.adapter.ts"
assert_contains "extractRawWebhookEvents" "apps/bot-service/src/zalo/zalo-update.validator.ts"
assert_contains "message\\.unsupported\\.received" "apps/bot-service/src/zalo/zalo.types.ts"
assert_not_contains "X-ZEvent-Signature" "apps/bot-service/src"

corepack pnpm --filter @lhu/config test
corepack pnpm --filter @lhu/bot-service build
corepack pnpm --filter @lhu/bot-service test

echo "Phase 6 Zalo webhook foundation verification passed"

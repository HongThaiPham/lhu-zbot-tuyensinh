#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV="${NODE_ENV:-test}"
export DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/lhu_zbot?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export BOT_SERVICE_ROLE="${BOT_SERVICE_ROLE:-worker}"
export ZALO_UPDATE_MODE="${ZALO_UPDATE_MODE:-polling}"
export ZALO_BOT_TOKEN="${ZALO_BOT_TOKEN:-phase5-test-token}"
export ZALO_POLL_TIMEOUT_SECONDS="${ZALO_POLL_TIMEOUT_SECONDS:-30}"
export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-development-only-app-encryption-key-not-for-production}"
export SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-lhu_admin_session}"
export SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-1200}"
export ADMIN_ORIGIN="${ADMIN_ORIGIN:-http://127.0.0.1:4100}"
export SESSION_COOKIE_SAME_SITE="${SESSION_COOKIE_SAME_SITE:-lax}"
export LOGIN_RATE_LIMIT_WINDOW_SECONDS="${LOGIN_RATE_LIMIT_WINDOW_SECONDS:-300}"
export LOGIN_RATE_LIMIT_MAX_ATTEMPTS="${LOGIN_RATE_LIMIT_MAX_ATTEMPTS:-5}"
export TRUST_PROXY="${TRUST_PROXY:-false}"

corepack pnpm --filter @lhu/config test
corepack pnpm --filter @lhu/bot-service build
corepack pnpm --filter @lhu/bot-service test

echo "Phase 5 Zalo polling foundation verification passed"

import { loadAdminConfig } from '@lhu/config';

const botApiPort = process.env.BOT_API_PORT?.trim() || '4201';
const localApiBaseUrlFallback =
  process.env.NODE_ENV !== 'production'
    ? `http://127.0.0.1:${botApiPort}`
    : undefined;

const adminConfig = loadAdminConfig({
  ...process.env,
  NEXT_PUBLIC_API_BASE_URL:
    process.env.NEXT_PUBLIC_API_BASE_URL ?? localApiBaseUrlFallback,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: adminConfig.nextPublicApiBaseUrl,
  },
};

export default nextConfig;

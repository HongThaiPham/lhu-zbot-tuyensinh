import { loadAdminConfig } from '@lhu/config';

const localApiBaseUrlFallback =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
    ? 'http://127.0.0.1:4201'
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

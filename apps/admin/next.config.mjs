import { loadAdminConfig } from '@lhu/config';

const adminConfig = loadAdminConfig(process.env);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: adminConfig.nextPublicApiBaseUrl
  },
};

export default nextConfig;

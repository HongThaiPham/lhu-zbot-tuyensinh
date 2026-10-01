import { loadAdminConfig } from '@lhu/config';

const nodeEnv = process.env.NODE_ENV;
const localApiBaseUrlFallback =
  nodeEnv === 'development' || nodeEnv === 'test'
    ? 'http://127.0.0.1:4201'
    : undefined;

export const adminRuntimeConfig = loadAdminConfig({
  ...process.env,
  NEXT_PUBLIC_API_BASE_URL:
    process.env.NEXT_PUBLIC_API_BASE_URL ?? localApiBaseUrlFallback,
});

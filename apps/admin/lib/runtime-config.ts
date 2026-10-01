import { loadAdminConfig } from '@lhu/config';

export const adminRuntimeConfig = loadAdminConfig({
  ...process.env,
  NEXT_PUBLIC_API_BASE_URL:
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4201',
});

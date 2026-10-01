import { adminRuntimeConfig } from '../lib/runtime-config';

export default function HomePage() {
  return (
    <main>
      Welcome to the LHU Zalo Admissions Admin (API: {adminRuntimeConfig.nextPublicApiBaseUrl})
    </main>
  );
}

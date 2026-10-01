'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton({ apiBaseUrl }: { apiBaseUrl: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Origin: window.location.origin,
        },
      });
    } finally {
      router.replace('/login');
      router.refresh();
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={onLogout} disabled={pending}>
      {pending ? 'Logging out...' : 'Logout'}
    </button>
  );
}

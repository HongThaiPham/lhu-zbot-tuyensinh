import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogoutButton } from './components/logout-button';

interface MeResponse {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly roles: readonly string[];
  };
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL as string;

async function getCurrentUser(cookieHeader: string): Promise<MeResponse['user'] | null> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      cookie: cookieHeader,
    },
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as MeResponse;
  return body.user;
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  const currentUser = await getCurrentUser(cookieHeader);
  if (!currentUser) {
    redirect('/login');
  }

  return (
    <main>
      <h1>Authenticated Admin Area</h1>
      <p>Signed in as {currentUser.email}</p>
      <p>Roles: {currentUser.roles.join(', ')}</p>
      <LogoutButton apiBaseUrl={apiBaseUrl} />
    </main>
  );
}

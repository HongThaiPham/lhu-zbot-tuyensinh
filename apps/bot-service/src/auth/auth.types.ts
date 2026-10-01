import type { RoleName, UserStatus } from '@prisma/client';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly roles: readonly RoleName[];
  readonly sessionId: string;
}

import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@prisma/client';
import { ROLE_METADATA_KEY } from './constants';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLE_METADATA_KEY, roles);

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleName } from '@prisma/client';
import { ROLE_METADATA_KEY, REQUEST_USER_KEY } from './constants';
import type { AuthenticatedUser } from './auth.types';

interface RequestWithUser {
  readonly [REQUEST_USER_KEY]?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLE_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request[REQUEST_USER_KEY];

    if (!user) {
      return false;
    }

    const hasRole = requiredRoles.some((requiredRole) => user.roles.includes(requiredRole));
    if (!hasRole) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}

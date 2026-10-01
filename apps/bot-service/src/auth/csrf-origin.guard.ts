import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    const shouldCheck = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

    if (!shouldCheck) {
      return true;
    }

    const originHeader = request.headers.origin;
    if (!originHeader || typeof originHeader !== 'string') {
      throw new BadRequestException('Invalid request origin');
    }

    if (originHeader !== this.authService.getAdminOrigin()) {
      throw new BadRequestException('Invalid request origin');
    }

    return true;
  }
}

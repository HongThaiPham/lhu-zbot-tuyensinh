import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { REQUEST_USER_KEY } from './constants';
import { AuthService } from './auth.service';

interface RequestWithAuth extends Request {
  [key: string]: unknown;
  authUser?: unknown;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = request.cookies?.[this.authService.getCookieName()] as string | undefined;

    const user = await this.authService.authenticateSession(token);
    request[REQUEST_USER_KEY] = user;
    request.authUser = user;
    return true;
  }
}

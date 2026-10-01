import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { REQUEST_USER_KEY } from './constants';
import type { AuthenticatedUser } from './auth.types';

interface RequestWithUser {
  readonly [REQUEST_USER_KEY]?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  return request[REQUEST_USER_KEY];
});

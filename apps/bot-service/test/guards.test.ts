import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../src/auth/roles.guard';
import { CsrfOriginGuard } from '../src/auth/csrf-origin.guard';
import { REQUEST_USER_KEY } from '../src/auth/constants';

test('roles guard throws 403 when required role is missing', () => {
  const reflector = {
    getAllAndOverride: () => ['ADMIN'],
  };

  const guard = new RolesGuard(reflector as never);
  const context = {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({
        [REQUEST_USER_KEY]: {
          id: 'user-1',
          email: 'user@example.com',
          status: 'ACTIVE',
          roles: ['VIEWER'],
          sessionId: 'session-1',
        },
      }),
    }),
  };

  assert.throws(() => guard.canActivate(context as never), ForbiddenException);
});

test('roles guard allows required role', () => {
  const reflector = {
    getAllAndOverride: () => ['ADMIN'],
  };

  const guard = new RolesGuard(reflector as never);
  const context = {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({
        [REQUEST_USER_KEY]: {
          id: 'user-1',
          email: 'admin@example.com',
          status: 'ACTIVE',
          roles: ['ADMIN'],
          sessionId: 'session-1',
        },
      }),
    }),
  };

  assert.equal(guard.canActivate(context as never), true);
});

test('csrf origin guard rejects invalid origin for state change', () => {
  const authService = {
    getAdminOrigin: () => 'http://127.0.0.1:4100',
  };

  const guard = new CsrfOriginGuard(authService as never);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'PATCH',
        headers: {
          origin: 'http://evil.example.com',
        },
      }),
    }),
  };

  assert.throws(() => guard.canActivate(context as never), BadRequestException);
});

test('csrf origin guard allows configured origin for state change', () => {
  const authService = {
    getAdminOrigin: () => 'http://127.0.0.1:4100',
  };

  const guard = new CsrfOriginGuard(authService as never);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        headers: {
          origin: 'http://127.0.0.1:4100',
        },
      }),
    }),
  };

  assert.equal(guard.canActivate(context as never), true);
});

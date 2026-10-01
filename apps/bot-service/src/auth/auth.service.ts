import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { RoleName } from '@prisma/client';
import { loadBotServiceConfig } from '@lhu/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { LoginAbuseService } from './login-abuse.service';
import type { AuthenticatedUser } from './auth.types';

interface LoginContext {
  readonly ipAddress: string;
}

const AUTH_FAILURE_MESSAGE = 'Invalid credentials';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly config = loadBotServiceConfig(process.env);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly loginAbuseService: LoginAbuseService,
  ) {}

  public getCookieName(): string {
    return this.config.sessionCookieName;
  }

  public getSessionTtlSeconds(): number {
    return this.config.sessionTtlSeconds;
  }

  public getCookieSameSite(): 'lax' | 'strict' {
    return this.config.sessionCookieSameSite;
  }

  public getAdminOrigin(): string {
    return this.config.adminOrigin;
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  public getSessionCookieOptions(): {
    readonly httpOnly: true;
    readonly secure: boolean;
    readonly sameSite: 'lax' | 'strict';
    readonly path: '/';
    readonly maxAge: number;
  } {
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: this.getCookieSameSite(),
      path: '/',
      maxAge: this.getSessionTtlSeconds() * 1000,
    };
  }

  public async login(email: string, password: string, context: LoginContext) {
    const normalizedEmail = normalizeEmail(email);
    const ipKey = `ip:${context.ipAddress}`;
    const identityKey = `id:${normalizedEmail}`;

    this.loginAbuseService.checkAllowed(ipKey);
    this.loginAbuseService.checkAllowed(identityKey);

    const user = await this.prisma.client.user.findUnique({
      where: { normalizedEmail },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    const valid =
      user &&
      user.status === 'ACTIVE' &&
      (await this.passwordService.verifyPassword(user.passwordHash, password));

    if (!valid || !user) {
      this.loginAbuseService.recordFailure(
        ipKey,
        this.config.loginRateLimitWindowSeconds,
        this.config.loginRateLimitMaxAttempts,
      );
      this.loginAbuseService.recordFailure(
        identityKey,
        this.config.loginRateLimitWindowSeconds,
        this.config.loginRateLimitMaxAttempts,
      );
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE);
    }

    this.loginAbuseService.clear(ipKey);
    this.loginAbuseService.clear(identityKey);

    const token = this.sessionService.createToken();
    await this.sessionService.createSession(user.id, token, this.getSessionTtlSeconds());

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        roles: user.roles.map((assignment) => assignment.role.name),
      },
    };
  }

  public async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.sessionService.revokeByToken(sessionToken);
  }

  public async authenticateSession(sessionToken: string | undefined): Promise<AuthenticatedUser> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const tokenHash = this.sessionService.hashToken(sessionToken);
    const now = new Date();

    const session = await this.prisma.client.session.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new UnauthorizedException('Authentication required');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication required');
    }

    await this.sessionService.touchSession(session.id);

    return {
      id: session.user.id,
      email: session.user.email,
      status: session.user.status,
      roles: session.user.roles.map((role) => role.role.name as RoleName),
      sessionId: session.id,
    };
  }

  public getSafeUserDto(user: AuthenticatedUser | { id: string; email: string; status: string; roles: readonly string[] }) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles,
    };
  }

  public getClientIp(forwardedForHeader: string | string[] | undefined, remoteAddress: string | undefined): string {
    if (typeof forwardedForHeader === 'string' && forwardedForHeader.trim().length > 0) {
      return forwardedForHeader.split(',')[0]?.trim() || 'unknown';
    }

    if (Array.isArray(forwardedForHeader) && forwardedForHeader.length > 0) {
      return forwardedForHeader[0] || 'unknown';
    }

    return remoteAddress || 'unknown';
  }

  public logBootstrapResult(email: string, created: boolean): void {
    if (created) {
      this.logger.log(`Bootstrap admin ensured for ${email}`);
    } else {
      this.logger.log('Bootstrap skipped because administrator already exists');
    }
  }
}

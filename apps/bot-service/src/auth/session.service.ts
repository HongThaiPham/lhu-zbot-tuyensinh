import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionService {
  public constructor(private readonly prisma: PrismaService) {}

  public createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  public hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  public async createSession(userId: string, token: string, sessionTtlSeconds: number): Promise<Session> {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000);

    return await this.prisma.client.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        lastUsedAt: now,
      },
    });
  }

  public async revokeByToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    await this.prisma.client.session.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async touchSession(sessionId: string): Promise<void> {
    await this.prisma.client.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AdminUsersService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  public async setUserStatus(params: {
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly active: boolean;
  }) {
    if (params.actorUserId === params.targetUserId && !params.active) {
      throw new BadRequestException('Cannot deactivate the current account');
    }

    const status: UserStatus = params.active ? 'ACTIVE' : 'INACTIVE';

    try {
      const user = await this.prisma.client.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: params.targetUserId },
          data: {
            status,
          },
          select: {
            id: true,
            email: true,
            status: true,
          },
        });

        await this.auditService.record(tx, {
          actorUserId: params.actorUserId,
          action: 'ADMIN_USER_STATUS_UPDATED',
          entityType: 'user',
          entityId: updated.id,
          metadata: {
            status: updated.status,
          },
        });

        return updated;
      });

      return {
        id: user.id,
        email: user.email,
        status: user.status,
      };
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }

      throw error;
    }
  }
}

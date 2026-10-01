import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

interface AuditInput {
  readonly actorUserId?: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  public async record(client: Prisma.TransactionClient | PrismaClient, input: AuditInput) {
    return await client.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
      },
    });
  }
}

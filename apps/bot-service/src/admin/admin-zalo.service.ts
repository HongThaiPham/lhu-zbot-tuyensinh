import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ZaloService } from '../zalo/zalo.service';
import type { ZaloConnectionTestResult } from '../zalo/zalo.types';

@Injectable()
export class AdminZaloService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly zaloService: ZaloService,
  ) {}

  public async testConnection(actorUserId: string): Promise<ZaloConnectionTestResult> {
    const result = await this.zaloService.testConnection();

    await this.auditService.record(this.prisma.client, {
      actorUserId,
      action: 'ADMIN_ZALO_TEST_CONNECTION',
      entityType: 'zalo_connection',
      metadata: {
        status: result.status,
        ok: result.ok,
      },
    });

    return result;
  }
}

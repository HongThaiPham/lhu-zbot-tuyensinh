import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ZaloService } from '../zalo/zalo.service';
import type {
  ZaloConnectionTestResult,
  ZaloWebhookInfoResult,
  ZaloWebhookMutationResult,
} from '../zalo/zalo.types';

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

  public async getWebhookInfo(actorUserId: string): Promise<ZaloWebhookInfoResult> {
    const result = await this.zaloService.getWebhookInfo();
    await this.auditService.record(this.prisma.client, {
      actorUserId,
      action: 'ADMIN_ZALO_GET_WEBHOOK_INFO',
      entityType: 'zalo_webhook',
      metadata: {
        ok: result.ok,
        status: result.status,
        isConfigured: result.ok ? result.webhook.isConfigured : false,
      },
    });

    return result;
  }

  public async setWebhook(input: {
    readonly actorUserId: string;
    readonly url: string;
  }): Promise<ZaloWebhookMutationResult> {
    const result = await this.zaloService.setWebhook(input.url);
    await this.auditService.record(this.prisma.client, {
      actorUserId: input.actorUserId,
      action: 'ADMIN_ZALO_SET_WEBHOOK',
      entityType: 'zalo_webhook',
      metadata: {
        ok: result.ok,
        status: result.status,
        configured: true,
      },
    });
    return result;
  }

  public async testWebhook(actorUserId: string): Promise<ZaloWebhookMutationResult> {
    const result = await this.zaloService.testWebhook();
    await this.auditService.record(this.prisma.client, {
      actorUserId,
      action: 'ADMIN_ZALO_TEST_WEBHOOK',
      entityType: 'zalo_webhook',
      metadata: {
        ok: result.ok,
        status: result.status,
      },
    });
    return result;
  }

  public async deleteWebhook(actorUserId: string): Promise<ZaloWebhookMutationResult> {
    const result = await this.zaloService.deleteWebhook();
    await this.auditService.record(this.prisma.client, {
      actorUserId,
      action: 'ADMIN_ZALO_DELETE_WEBHOOK',
      entityType: 'zalo_webhook',
      metadata: {
        ok: result.ok,
        status: result.status,
        configured: false,
      },
    });
    return result;
  }
}

import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminZaloService } from './admin-zalo.service';
import { SetZaloWebhookDto } from './dto/set-zalo-webhook.dto';

@Controller('admin/zalo')
@UseGuards(SessionAuthGuard, RolesGuard, CsrfOriginGuard)
export class AdminZaloController {
  public constructor(private readonly adminZaloService: AdminZaloService) {}

  @Post('test-connection')
  @HttpCode(200)
  @Roles('ADMIN')
  public async testConnection(@CurrentUser() actor: AuthenticatedUser) {
    return await this.adminZaloService.testConnection(actor.id);
  }

  @Get('webhook')
  @HttpCode(200)
  @Roles('ADMIN')
  public async getWebhookInfo(@CurrentUser() actor: AuthenticatedUser) {
    return await this.adminZaloService.getWebhookInfo(actor.id);
  }

  @Post('webhook')
  @HttpCode(200)
  @Roles('ADMIN')
  public async setWebhook(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: SetZaloWebhookDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return await this.adminZaloService.setWebhook({
      actorUserId: actor.id,
      url: body.url,
    });
  }

  @Post('webhook/test')
  @HttpCode(200)
  @Roles('ADMIN')
  public async testWebhook(@CurrentUser() actor: AuthenticatedUser) {
    return await this.adminZaloService.testWebhook(actor.id);
  }

  @Delete('webhook')
  @HttpCode(200)
  @Roles('ADMIN')
  public async deleteWebhook(@CurrentUser() actor: AuthenticatedUser) {
    return await this.adminZaloService.deleteWebhook(actor.id);
  }
}

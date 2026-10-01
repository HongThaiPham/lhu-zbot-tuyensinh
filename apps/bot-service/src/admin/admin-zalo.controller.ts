import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminZaloService } from './admin-zalo.service';

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
}

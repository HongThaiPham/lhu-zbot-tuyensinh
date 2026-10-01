import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CsrfOriginGuard } from '../auth/csrf-origin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminUsersService } from './admin-users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin/users')
@UseGuards(SessionAuthGuard, RolesGuard, CsrfOriginGuard)
export class AdminUsersController {
  public constructor(private readonly adminUsersService: AdminUsersService) {}

  @Patch(':id/status')
  @HttpCode(200)
  @Roles('ADMIN')
  public async updateStatus(
    @Param('id') userId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return await this.adminUsersService.setUserStatus({
      actorUserId: actor.id,
      targetUserId: userId,
      active: body.active,
    });
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminZaloController } from './admin-zalo.controller';
import { AdminZaloService } from './admin-zalo.service';
import { ZaloModule } from '../zalo/zalo.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, ZaloModule],
  controllers: [AdminUsersController, AdminZaloController],
  providers: [AdminUsersService, AdminZaloService],
})
export class AdminModule {}

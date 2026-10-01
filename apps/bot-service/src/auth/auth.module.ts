import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SessionAuthGuard } from './session-auth.guard';
import { RolesGuard } from './roles.guard';
import { LoginAbuseService } from './login-abuse.service';
import { CsrfOriginGuard } from './csrf-origin.guard';
import { BOT_SERVICE_CONFIG, loadAuthConfig } from './auth.config';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    {
      provide: BOT_SERVICE_CONFIG,
      useFactory: loadAuthConfig,
    },
    AuthService,
    PasswordService,
    SessionService,
    SessionAuthGuard,
    RolesGuard,
    LoginAbuseService,
    CsrfOriginGuard,
  ],
  exports: [AuthService, PasswordService, SessionService, SessionAuthGuard, RolesGuard, CsrfOriginGuard],
})
export class AuthModule {}

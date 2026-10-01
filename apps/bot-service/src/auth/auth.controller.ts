import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from './current-user.decorator';
import { SessionAuthGuard } from './session-auth.guard';
import { CsrfOriginGuard } from './csrf-origin.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  public async login(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ipAddress = this.authService.getClientIp(request.ip, request.socket.remoteAddress);

    const result = await this.authService.login(loginDto.email, loginDto.password, {
      ipAddress,
    });

    response.cookie(this.authService.getCookieName(), result.token, this.authService.getSessionCookieOptions());

    return {
      user: this.authService.getSafeUserDto(result.user),
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  public async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const token = request.cookies?.[this.authService.getCookieName()] as string | undefined;
    await this.authService.logout(token);
    response.clearCookie(this.authService.getCookieName(), {
      ...this.authService.getSessionCookieOptions(),
      maxAge: 0,
    });
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  public me(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return {
      user: this.authService.getSafeUserDto(user),
    };
  }
}

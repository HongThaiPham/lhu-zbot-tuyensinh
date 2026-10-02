import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ZaloIntegrationError } from './zalo.errors';
import { ZaloService } from './zalo.service';

@Controller('webhooks/zalo')
export class ZaloWebhookController {
  public constructor(private readonly zaloService: ZaloService) {}

  @Post()
  @HttpCode(202)
  public async receive(
    @Body() payload: unknown,
    @Headers('content-type') contentType?: string,
    @Headers('x-bot-api-secret-token') secretTokenHeader?: string,
  ) {
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      throw new UnsupportedMediaTypeException('Webhook payload must be application/json');
    }

    try {
      return await this.zaloService.processWebhookPayload(payload, secretTokenHeader);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof ZaloIntegrationError && error.status === 'INVALID_RESPONSE') {
        throw new BadRequestException('Invalid webhook payload');
      }

      return {
        accepted: false,
        mode: 'webhook',
        processed: 0,
      } as const;
    }
  }
}

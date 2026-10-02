import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  PayloadTooLargeException,
  Post,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ZaloIntegrationError } from './zalo.errors';
import { ZaloService } from './zalo.service';

const WEBHOOK_MAX_CONTENT_LENGTH_BYTES = 256 * 1024;

@Controller('webhooks/zalo')
export class ZaloWebhookController {
  public constructor(private readonly zaloService: ZaloService) {}

  @Post()
  @HttpCode(202)
  public async receive(
    @Body() payload: unknown,
    @Headers('content-type') contentType?: string,
    @Headers('content-length') contentLength?: string,
  ) {
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      throw new UnsupportedMediaTypeException('Webhook payload must be application/json');
    }

    const contentLengthValue = Number.parseInt(contentLength ?? '0', 10);
    if (Number.isFinite(contentLengthValue) && contentLengthValue > WEBHOOK_MAX_CONTENT_LENGTH_BYTES) {
      throw new PayloadTooLargeException('Webhook payload exceeds allowed size');
    }

    try {
      return await this.zaloService.processWebhookPayload(payload);
    } catch (error) {
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

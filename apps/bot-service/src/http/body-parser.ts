import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';

export const WEBHOOK_JSON_PAYLOAD_LIMIT_BYTES = 256 * 1024;
const DEFAULT_JSON_PAYLOAD_LIMIT = '1mb';

function isEntityTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  return record.type === 'entity.too.large';
}

function isWebhookPath(request: Request): boolean {
  return request.path === '/webhooks/zalo' || request.originalUrl.startsWith('/webhooks/zalo');
}

export function configureRequestBodyParsers(app: Express): void {
  app.use('/webhooks/zalo', express.json({ limit: WEBHOOK_JSON_PAYLOAD_LIMIT_BYTES }));
  app.use(express.json({ limit: DEFAULT_JSON_PAYLOAD_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: DEFAULT_JSON_PAYLOAD_LIMIT }));

  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (isWebhookPath(request) && isEntityTooLargeError(error)) {
      response.status(413).json({
        statusCode: 413,
        message: 'Webhook payload exceeds allowed size',
        error: 'Payload Too Large',
      });
      return;
    }

    next(error);
  });
}

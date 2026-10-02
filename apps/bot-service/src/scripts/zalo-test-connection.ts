import { loadBotServiceConfig } from '@lhu/config';
import { ZaloAdapter } from '../zalo/zalo.adapter';
import { OfficialZaloHttpClient } from '../zalo/http/zalo-http.client';
import { ZaloInboundEventProcessor } from '../zalo/zalo-inbound-event.processor';
import { ZaloService } from '../zalo/zalo.service';
import { ZaloUpdateNormalizer } from '../zalo/zalo-update.normalizer';
import { ZaloUpdateValidator } from '../zalo/zalo-update.validator';

async function main(): Promise<void> {
  const config = loadBotServiceConfig(process.env);
  if (!config.zaloBotToken) {
    throw new Error('ZALO_BOT_TOKEN is required for manual test connection');
  }

  const adapter = new ZaloAdapter(config, new OfficialZaloHttpClient());
  const service = new ZaloService(
    config,
    adapter,
    new ZaloUpdateValidator(),
    new ZaloUpdateNormalizer(),
    new ZaloInboundEventProcessor(),
  );
  const result = await service.testConnection();

  if (!result.ok) {
    console.error(
      JSON.stringify(
        {
          ok: result.ok,
          status: result.status,
          retryable: result.retryable,
          statusCode: result.statusCode,
          upstreamCode: result.upstreamCode,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        status: result.status,
        identity: result.identity,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(message);
  process.exit(1);
});

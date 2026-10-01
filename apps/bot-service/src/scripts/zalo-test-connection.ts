import { loadBotServiceConfig } from '@lhu/config';
import { ZaloAdapter } from '../zalo/zalo.adapter';
import { NodeZaloSdkFactory } from '../zalo/sdk/zalo-sdk.factory';
import { ZaloService } from '../zalo/zalo.service';

async function main(): Promise<void> {
  const config = loadBotServiceConfig(process.env);
  if (!config.zaloBotToken) {
    throw new Error('ZALO_BOT_TOKEN is required for manual test connection');
  }

  const adapter = new ZaloAdapter(config, new NodeZaloSdkFactory());
  const service = new ZaloService(adapter);
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

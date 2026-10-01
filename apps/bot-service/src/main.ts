import * as net from 'node:net';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const ROLE = (process.env.BOT_SERVICE_ROLE ?? 'api').toLowerCase();

function parseSocketTarget(rawValue: string | undefined, fallbackPort: number) {
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue);
    const port = Number(url.port || fallbackPort);
    return {
      host: url.hostname,
      port,
    };
  } catch {
    return null;
  }
}

async function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

async function getReadinessState() {
  const dbTarget = parseSocketTarget(process.env.DATABASE_URL, 5432);
  const redisTarget = parseSocketTarget(process.env.REDIS_URL, 6379);

  if (!dbTarget || !redisTarget) {
    return {
      ready: false,
      dependencies: {
        postgres: dbTarget ? { host: dbTarget.host, port: dbTarget.port, ready: false } : { ready: false },
        redis: redisTarget ? { host: redisTarget.host, port: redisTarget.port, ready: false } : { ready: false },
      },
    };
  }

  const dbReady = await probeTcp(dbTarget.host, dbTarget.port);
  const redisReady = await probeTcp(redisTarget.host, redisTarget.port);

  return {
    ready: dbReady && redisReady,
    dependencies: {
      postgres: { host: dbTarget.host, port: dbTarget.port, ready: dbReady },
      redis: { host: redisTarget.host, port: redisTarget.port, ready: redisReady },
    },
  };
}

async function bootstrap() {
  if (ROLE === 'worker') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    const shutdown = async (signal: string) => {
      console.log(`[worker] received ${signal}, shutting down`);
      await app.close();
      process.exit(0);
    };

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });

    console.log('[worker] service started in worker mode without binding the API port');

    await new Promise<void>(() => {
      setInterval(() => undefined, 1000);
    });
    return;
  }

  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'bot-api' });
  });

  app.getHttpAdapter().get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive', service: 'bot-api' });
  });

  app.getHttpAdapter().get('/health/ready', async (_req, res) => {
    const readiness = await getReadinessState();

    if (!readiness.ready) {
      res.status(503).json({
        status: 'not_ready',
        service: 'bot-api',
        dependencies: readiness.dependencies,
      });
      return;
    }

    res.status(200).json({
      status: 'ready',
      service: 'bot-api',
      dependencies: readiness.dependencies,
    });
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap().catch((error) => {
  console.error('Bot service bootstrap failed', error);
  process.exit(1);
});

import * as net from 'node:net';
import { NestFactory } from '@nestjs/core';
import { DatabaseHealthProbe, PrismaClientManager } from '@lhu/database';
import { loadBotServiceConfig } from '@lhu/config';
import { AppModule } from './app.module';

const config = loadBotServiceConfig(process.env);
const ROLE = config.botServiceRole;

const databaseClientManager = new PrismaClientManager();
const databaseHealthProbe = new DatabaseHealthProbe(databaseClientManager.client);

interface RedisDependencyState {
  readonly host?: string;
  readonly port?: number;
  readonly ready: boolean;
}

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

async function getRedisState(): Promise<RedisDependencyState> {
  const redisTarget = parseSocketTarget(config.redisUrl, 6379);
  if (!redisTarget) {
    return { ready: false };
  }

  const ready = await probeTcp(redisTarget.host, redisTarget.port);
  return {
    host: redisTarget.host,
    port: redisTarget.port,
    ready,
  };
}

async function getReadinessState() {
  const database = await databaseHealthProbe.checkReadiness();
  const redis = await getRedisState();

  return {
    ready: database.ready && redis.ready,
    dependencies: {
      postgres: {
        ready: database.ready,
        connectionReady: database.details.connectionReady,
        schemaReady: database.details.schemaReady,
        reason: database.details.reason,
      },
      redis,
    },
  };
}

async function bootstrap() {
  await databaseClientManager.connect();

  if (ROLE === 'worker') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    const shutdown = async (signal: string) => {
      console.log(`[worker] received ${signal}, shutting down`);
      await app.close();
      await databaseClientManager.disconnect();
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

  const shutdown = async (signal: string) => {
    console.log(`[api] received ${signal}, shutting down`);
    await app.close();
    await databaseClientManager.disconnect();
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await app.listen(config.port);
}

bootstrap().catch(async (error) => {
  console.error('Bot service bootstrap failed', error);
  await databaseClientManager.disconnect();
  process.exit(1);
});

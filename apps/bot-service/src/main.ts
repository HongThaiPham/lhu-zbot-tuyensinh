import * as net from 'node:net';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseHealthProbe } from '@lhu/database';
import { loadBotServiceConfig } from '@lhu/config';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { configureRequestBodyParsers } from './http/body-parser';
import { PrismaService } from './prisma/prisma.service';
import { getTrustProxySetting } from './http/trust-proxy';

const config = loadBotServiceConfig(process.env);
const ROLE = config.botServiceRole;

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

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', getTrustProxySetting(config.trustProxy));
  configureRequestBodyParsers(expressApp);
  app.use(cookieParser());
  app.enableCors({
    origin: config.adminOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const prismaService = app.get(PrismaService);
  const databaseHealthProbe = new DatabaseHealthProbe(prismaService.client);

  app.getHttpAdapter().get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'bot-api' });
  });

  app.getHttpAdapter().get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive', service: 'bot-api' });
  });

  app.getHttpAdapter().get('/health/ready', async (_req, res) => {
    const database = await databaseHealthProbe.checkReadiness();
    const redis = await getRedisState();
    const readiness = {
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

bootstrap().catch((error) => {
  console.error('Bot service bootstrap failed', error);
  process.exit(1);
});

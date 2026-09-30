import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'bot-api' });
  });

  app.getHttpAdapter().get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive', service: 'bot-api' });
  });

  app.getHttpAdapter().get('/health/ready', (_req, res) => {
    res.status(200).json({ status: 'ready', service: 'bot-api' });
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap();

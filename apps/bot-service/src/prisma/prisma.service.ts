import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClientManager } from '@lhu/database';
import type { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly manager = new PrismaClientManager();

  public get client(): PrismaClient {
    return this.manager.client;
  }

  public async onModuleInit(): Promise<void> {
    await this.manager.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.manager.disconnect();
  }
}

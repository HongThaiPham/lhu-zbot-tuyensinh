import { PrismaClient } from '@prisma/client';

export class PrismaClientManager {
  private readonly prismaClient: PrismaClient;

  public constructor(prismaClient?: PrismaClient) {
    this.prismaClient = prismaClient ?? new PrismaClient();
  }

  public get client(): PrismaClient {
    return this.prismaClient;
  }

  public async connect(): Promise<void> {
    await this.prismaClient.$connect();
  }

  public async disconnect(): Promise<void> {
    await this.prismaClient.$disconnect();
  }
}

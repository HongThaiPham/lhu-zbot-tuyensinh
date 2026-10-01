import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOUNDATION_SEED_KEY = 'phase2.foundation.seed';
const FOUNDATION_SEED_VALUE = 'v1';

async function main() {
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO system_metadata (key, value, created_at, updated_at)
      VALUES (${FOUNDATION_SEED_KEY}, ${FOUNDATION_SEED_VALUE}, NOW(), NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
  );
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error('Database seed failed', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();

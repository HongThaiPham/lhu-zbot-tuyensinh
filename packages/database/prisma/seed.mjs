import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOUNDATION_SEED_KEY = 'phase2.foundation.seed';
const FOUNDATION_SEED_VALUE = 'v1';

async function main() {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO system_metadata (key, value, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    FOUNDATION_SEED_KEY,
    FOUNDATION_SEED_VALUE,
  );
}

main()
  .catch((error) => {
    console.error('Database seed failed', error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

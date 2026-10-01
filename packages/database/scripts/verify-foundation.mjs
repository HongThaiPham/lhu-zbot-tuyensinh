import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOUNDATION_SEED_KEY = 'phase2.foundation.seed';

async function ensureSelectOne() {
  await prisma.$queryRawUnsafe('SELECT 1');
}

async function ensureVectorExtension() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT extname FROM pg_extension WHERE extname = 'vector' LIMIT 1",
  );

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('pgvector extension is not available');
  }
}

async function ensureSchemaExists() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT to_regclass('public.system_metadata')::text AS table_name",
  );

  if (!Array.isArray(rows) || rows[0]?.table_name !== 'system_metadata') {
    throw new Error('system_metadata table is missing');
  }
}

async function ensureSeedExists() {
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT value
      FROM system_metadata
      WHERE key = $1
      LIMIT 1
    `,
    FOUNDATION_SEED_KEY,
  );

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('foundation seed record is missing');
  }
}

async function main() {
  await ensureSelectOne();
  await ensureVectorExtension();
  await ensureSchemaExists();
  await ensureSeedExists();
  console.log('Database foundation verification passed');
}

main()
  .catch((error) => {
    console.error('Database foundation verification failed', error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

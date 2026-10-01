import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOUNDATION_SEED_KEY = 'phase2.foundation.seed';

async function ensureSelectOne() {
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
}

async function ensureVectorExtension() {
  const rows = await prisma.$queryRaw(
    Prisma.sql`SELECT extname FROM pg_extension WHERE extname = 'vector' LIMIT 1`,
  );

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('pgvector extension is not available');
  }
}

async function ensureSchemaExists() {
  const rows = await prisma.$queryRaw(
    Prisma.sql`SELECT to_regclass('public.system_metadata')::text AS table_name`,
  );

  if (!Array.isArray(rows) || rows[0]?.table_name !== 'system_metadata') {
    throw new Error('system_metadata table is missing');
  }
}

async function ensureSeedExists() {
  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT value
      FROM system_metadata
      WHERE key = ${FOUNDATION_SEED_KEY}
      LIMIT 1
    `,
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

async function run() {
  try {
    await main();
  } catch (error) {
    console.error('Database foundation verification failed', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();

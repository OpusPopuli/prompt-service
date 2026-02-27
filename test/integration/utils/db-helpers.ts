import { PrismaClient } from '@prisma/client';
import { DATABASE_URL } from './config';

let prisma: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
  }
  return prisma;
}

export async function cleanTestData() {
  const db = getDb();
  await db.promptRequestLog.deleteMany({});
  await db.experimentVariant.deleteMany({});
  await db.experiment.deleteMany({});
}

export async function disconnectDb() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

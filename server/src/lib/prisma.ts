import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Usar adapter LibSQL para SQLite (compatível com Prisma 7.x)
const adapter = new PrismaLibSql({
  url: env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

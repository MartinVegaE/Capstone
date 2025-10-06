// backend/src/prisma.ts
import { PrismaClient } from '@prisma/client';

// Usamos globalThis para evitar depender de "global" (Node) y de los tipos de @types/node.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'], // opcional: logs útiles sin contaminar la consola
  });

// Siempre reasignamos para asegurar singleton en dev/hot-reload
globalForPrisma.prisma = prisma;

export default prisma;

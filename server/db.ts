import { PrismaClient } from '@prisma/client'

/**
 * Single Prisma client for the API process.
 *
 * Cached on globalThis so `tsx watch` reloads don't leak a new connection pool
 * on every file save.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

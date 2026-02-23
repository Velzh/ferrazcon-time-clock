import { FastifyInstance } from 'fastify';
import { TimeRecordType } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { getStartOfToday, getEndOfToday } from '../../lib/time-entry-logic';
import { requireEmpresaScope, requireRole } from '../../lib/tenant';

const manualEntrySchema = z.object({
  employeeId: z.string().min(1),
  type: z.nativeEnum(TimeRecordType),
  timestamp: z.coerce.date().optional(),
  deviceId: z.string().optional(),
});

const ENTRY_ROLES = ['ADMIN', 'GESTOR', 'ATENDENTE', 'BALCAO'] as const;

export async function timeEntryRoutes(app: FastifyInstance) {
  app.get('/api/time-entries/today', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...ENTRY_ROLES]);
    if (reply.sent) return;

    const entries = await prisma.timeEntry.findMany({
      where: {
        employee: { empresaId },
        timestamp: {
          gte: getStartOfToday(),
          lte: getEndOfToday(),
        },
      },
      include: {
        employee: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    return entries;
  });

  app.get('/api/time-entries/recent', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...ENTRY_ROLES]);
    if (reply.sent) return;

    const { limit = '20' } = request.query as { limit?: string };
    const parsedLimit = Math.min(Number(limit) || 20, 200);

    const entries = await prisma.timeEntry.findMany({
      where: { employee: { empresaId } },
      include: { employee: true },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit,
    });

    return entries;
  });

  /** Relação de pontos por período (para gestor/admin) */
  app.get('/api/time-entries', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...ENTRY_ROLES]);
    if (reply.sent) return;

    const { from, to, limit = '500' } = request.query as { from?: string; to?: string; limit?: string };
    const parsedLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);

    const where: { employee: { empresaId: string }; timestamp?: { gte?: Date; lte?: Date } } = {
      employee: { empresaId },
    };

    if (from || to) {
      where.timestamp = {};
      if (from) {
        const d = new Date(from);
        d.setHours(0, 0, 0, 0);
        where.timestamp.gte = d;
      }
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        where.timestamp.lte = d;
      }
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: { employee: true },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit,
    });

    return entries;
  });

  app.post('/api/time-entries/manual', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...ENTRY_ROLES]);
    if (reply.sent) return;

    const payload = manualEntrySchema.parse(request.body);

    const employee = await prisma.employee.findFirst({
      where: { id: payload.employeeId, empresaId },
    });
    if (!employee) {
      return reply.code(404).send({ message: 'Colaborador não encontrado' });
    }

    const entry = await prisma.timeEntry.create({
      data: {
        employeeId: payload.employeeId,
        type: payload.type,
        deviceId: payload.deviceId,
        timestamp: payload.timestamp ?? new Date(),
      },
      include: { employee: true },
    });

    return reply.code(201).send(entry);
  });
}

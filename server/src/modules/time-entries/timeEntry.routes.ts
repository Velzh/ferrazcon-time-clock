import { FastifyInstance } from 'fastify';
import { TimeRecordType } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { getStartOfToday, getEndOfToday } from '../../lib/time-entry-logic';

const manualEntrySchema = z.object({
  employeeId: z.string().min(1),
  type: z.nativeEnum(TimeRecordType),
  timestamp: z.coerce.date().optional(),
  deviceId: z.string().optional(),
});

export async function timeEntryRoutes(app: FastifyInstance) {
  app.get('/api/time-entries/today', async () => {
    const entries = await prisma.timeEntry.findMany({
      where: {
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

  app.get('/api/time-entries/recent', async (request) => {
    const { limit = '20' } = request.query as { limit?: string };
    const parsedLimit = Math.min(Number(limit) || 20, 200);

    const entries = await prisma.timeEntry.findMany({
      include: { employee: true },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit,
    });

    return entries;
  });

  app.post('/api/time-entries/manual', async (request, reply) => {
    const payload = manualEntrySchema.parse(request.body);

    const employee = await prisma.employee.findUnique({ where: { id: payload.employeeId } });
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

import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';

const createEmployeeSchema = z.object({
  identifier: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email().optional(),
});

const enrollSchema = z.object({
  embeddings: z.array(z.array(z.number())).min(1),
  algorithm: z.string().default('face-api.js'),
  version: z.string().optional(),
  sourcePhotoUrl: z.string().url().optional(),
});

export async function employeeRoutes(app: FastifyInstance) {
  app.get('/api/employees', async () => {
    const employees = await prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        identifier: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        faceEmbeddings: {
          select: { id: true },
        },
      },
    });

    return employees.map(({ faceEmbeddings, ...rest }) => ({
      ...rest,
      embeddingsCount: faceEmbeddings.length,
    }));
  });

  app.post('/api/employees', async (request, reply) => {
    const payload = createEmployeeSchema.parse(request.body);

    const employee = await prisma.employee.create({
      data: payload,
    });

    return reply.code(201).send(employee);
  });

  app.post('/api/employees/:employeeId/enrollments', async (request, reply) => {
    const { employeeId } = request.params as { employeeId: string };
    const payload = enrollSchema.parse(request.body);

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return reply.code(404).send({ message: 'Colaborador não encontrado' });
    }

    await prisma.faceEmbedding.createMany({
      data: payload.embeddings.map((embedding) => ({
        employeeId,
        embedding,
        algorithm: payload.algorithm,
        version: payload.version,
        sourcePhotoUrl: payload.sourcePhotoUrl,
      })),
    });

    return reply.code(201).send({ message: 'Biometria cadastrada com sucesso' });
  });

  app.delete('/api/employees/:employeeId', async (request, reply) => {
    const { employeeId } = request.params as { employeeId: string };

    try {
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) {
        return reply.code(404).send({ message: 'Colaborador não encontrado' });
      }

      await prisma.employee.delete({ where: { id: employeeId } });
      return reply.code(204).send();
    } catch (error) {
      app.log.error({ error, employeeId }, 'Erro ao deletar colaborador');
      return reply.code(500).send({ message: 'Erro ao deletar colaborador' });
    }
  });

  app.delete('/api/employees/:employeeId/enrollments', async (request, reply) => {
    const { employeeId } = request.params as { employeeId: string };

    await prisma.faceEmbedding.deleteMany({ where: { employeeId } });
    return reply.code(204).send();
  });

  app.get('/api/employees/:employeeId/export', async (request, reply) => {
    const { employeeId } = request.params as { employeeId: string };

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        faceEmbeddings: true,
        timeEntries: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!employee) {
      return reply.code(404).send({ message: 'Colaborador não encontrado' });
    }

    return employee;
  });
}

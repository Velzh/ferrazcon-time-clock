import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { requireEmpresaScope, requireRole } from '../../lib/tenant';
import { env } from '../../config/env';
import { recogPyClient } from '../../services/recogPyClient';
import { normalizeEmbedding } from '../../lib/similarity';

const createEmployeeSchema = z.object({
  identifier: z.string().trim().min(1, 'Informe a matrícula / ID interno'),
  name: z.string().trim().min(2, 'Informe o nome completo'),
  email: z
    .string()
    .trim()
    .email('E-mail inválido')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
});

const enrollSchema = z
  .object({
    embeddings: z.array(z.array(z.number())).min(1).optional(),
    imagesBase64: z.array(z.string().min(32)).min(1).max(5).optional(),
    algorithm: z.string().optional(),
    version: z.string().optional(),
    sourcePhotoUrl: z.string().url().optional(),
    replace: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.embeddings?.length || v.imagesBase64?.length), {
    message: 'Informe imagesBase64 ou embeddings',
  });

const EMPRESA_SCOPED_ROLES = ['ADMIN', 'GESTOR'] as const;

export async function employeeRoutes(app: FastifyInstance) {
  app.get('/api/employees', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const employees = await prisma.employee.findMany({
      where: { active: true, empresaId },
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
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const parsed = createEmployeeSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({
        message: first?.message ?? 'Dados inválidos',
        issues: parsed.error.issues,
      });
    }

    const employee = await prisma.employee.create({
      data: {
        ...parsed.data,
        empresaId,
      },
    });

    return reply.code(201).send(employee);
  });

  app.post('/api/employees/:employeeId/enrollments', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { employeeId } = request.params as { employeeId: string };
    const parsed = enrollSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const payload = parsed.data;

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, empresaId },
    });
    if (!employee) {
      return reply.code(404).send({ message: 'Colaborador não encontrado' });
    }

    let embeddings = payload.embeddings ?? [];
    let algorithm = payload.algorithm ?? (env.RECOG_ENGINE === 'python' ? env.RECOG_ALGORITHM : 'face-api.js');

    if (payload.imagesBase64?.length) {
      if (env.RECOG_ENGINE !== 'python') {
        return reply.code(400).send({
          message: 'Envio de imagem exige RECOG_ENGINE=python',
        });
      }
      const generated: number[][] = [];
      for (const imageBase64 of payload.imagesBase64) {
        try {
          const result = await recogPyClient.embed(imageBase64, { requireAligned: false });
          generated.push(normalizeEmbedding(result.embedding));
          algorithm = result.algorithm || env.RECOG_ALGORITHM;
        } catch (error) {
          const err = error as Error & { payload?: { message?: string; alignStatus?: string } };
          const alignMsg =
            err.payload && typeof err.payload === 'object' ? err.payload.message : undefined;
          return reply.code(400).send({
            message: alignMsg ?? err.message ?? 'Falha ao processar uma das fotos',
            alignStatus: err.payload?.alignStatus,
          });
        }
      }
      embeddings = generated;
    }

    if (payload.replace) {
      await prisma.faceEmbedding.deleteMany({ where: { employeeId: employee.id } });
    } else if (env.RECOG_ENGINE === 'python') {
      // Remove biometrias legadas face-api ao cadastrar Python (dimensões incompatíveis)
      await prisma.faceEmbedding.deleteMany({
        where: {
          employeeId: employee.id,
          NOT: { algorithm: env.RECOG_ALGORITHM },
        },
      });
    }

    await prisma.faceEmbedding.createMany({
      data: embeddings.map((embedding) => ({
        employeeId: employee.id,
        embedding,
        algorithm,
        version: payload.version,
        sourcePhotoUrl: payload.sourcePhotoUrl,
      })),
    });

    return reply.code(201).send({
      message: 'Biometria cadastrada com sucesso',
      count: embeddings.length,
      algorithm,
    });
  });

  app.delete('/api/employees/:employeeId', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { employeeId } = request.params as { employeeId: string };

    try {
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, empresaId },
      });
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
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { employeeId } = request.params as { employeeId: string };

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, empresaId },
    });
    if (!employee) {
      return reply.code(404).send({ message: 'Colaborador não encontrado' });
    }

    await prisma.faceEmbedding.deleteMany({ where: { employeeId } });
    return reply.code(204).send();
  });

  app.get('/api/employees/:employeeId/export', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { employeeId } = request.params as { employeeId: string };

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, empresaId },
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

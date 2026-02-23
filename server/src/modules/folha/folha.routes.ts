import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireEmpresaScope, requireRole } from '../../lib/tenant';

const EMPRESA_SCOPED_ROLES = ['ADMIN', 'GESTOR'] as const;

const updateFolhaSchema = z.object({
  status: z.enum(['RASCUNHO', 'REVISADO', 'FECHADO']).optional(),
  horas60: z.string().optional(),
  horas100: z.string().optional(),
  noturno: z.string().optional(),
  interjornada: z.string().optional(),
  desconto: z.string().optional(),
  alocado: z.string().optional(),
  planoDeSaude: z.string().optional(),
  observacao: z.string().optional(),
});

export async function folhaRoutes(app: FastifyInstance) {
  /** Lista folha consolidada por empresa e mês/ano */
  app.get('/api/folha', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { ano, mes } = request.query as { ano?: string; mes?: string };
    const anoNum = ano ? parseInt(ano, 10) : new Date().getFullYear();
    const mesNum = mes ? parseInt(mes, 10) : new Date().getMonth() + 1;

    const list = await prisma.folhaConsolidadaMensal.findMany({
      where: { empresaId, ano: anoNum, mes: mesNum },
      include: { employee: { select: { id: true, identifier: true, name: true } } },
      orderBy: { colaborador: 'asc' },
    });

    return list;
  });

  /** Cria ou atualiza linha da folha (por employeeId, ano, mes) */
  app.put('/api/folha', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const body = updateFolhaSchema.merge(
      z.object({
        employeeId: z.string().min(1),
        ano: z.number().int(),
        mes: z.number().int().min(1).max(12),
        colaborador: z.string().min(1),
      })
    ).parse(request.body);

    const employee = await prisma.employee.findFirst({
      where: { id: body.employeeId, empresaId },
    });
    if (!employee) {
      return reply.code(404).send({ message: 'Colaborador não encontrado' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.horas60 !== undefined) updateData.horas60 = body.horas60;
    if (body.horas100 !== undefined) updateData.horas100 = body.horas100;
    if (body.noturno !== undefined) updateData.noturno = body.noturno;
    if (body.interjornada !== undefined) updateData.interjornada = body.interjornada;
    if (body.desconto !== undefined) updateData.desconto = body.desconto;
    if (body.alocado !== undefined) updateData.alocado = body.alocado;
    if (body.planoDeSaude !== undefined) updateData.planoDeSaude = body.planoDeSaude;
    if (body.observacao !== undefined) updateData.observacao = body.observacao;
    if (body.status !== undefined) updateData.status = body.status;

    const folha = await prisma.folhaConsolidadaMensal.upsert({
      where: {
        empresaId_employeeId_ano_mes: {
          empresaId,
          employeeId: body.employeeId,
          ano: body.ano,
          mes: body.mes,
        },
      },
      create: {
        empresaId,
        employeeId: body.employeeId,
        ano: body.ano,
        mes: body.mes,
        colaborador: body.colaborador,
        horas60: body.horas60,
        horas100: body.horas100,
        noturno: body.noturno,
        interjornada: body.interjornada,
        desconto: body.desconto,
        alocado: body.alocado,
        planoDeSaude: body.planoDeSaude,
        observacao: body.observacao,
        status: body.status ?? 'RASCUNHO',
      },
      update: updateData,
      include: { employee: { select: { id: true, name: true, identifier: true } } },
    });

    return reply.send(folha);
  });

  /** Exportação JSON da folha do mês */
  app.get('/api/folha/export', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { ano, mes, format = 'json' } = request.query as {
      ano?: string;
      mes?: string;
      format?: 'json' | 'csv';
    };
    const anoNum = ano ? parseInt(ano, 10) : new Date().getFullYear();
    const mesNum = mes ? parseInt(mes, 10) : new Date().getMonth() + 1;

    const list = await prisma.folhaConsolidadaMensal.findMany({
      where: { empresaId, ano: anoNum, mes: mesNum },
      orderBy: { colaborador: 'asc' },
    });

    const rows = list.map((f) => ({
      COLABORADOR: f.colaborador,
      'HORAS 60%': f.horas60 ?? '',
      'HORAS 100%': f.horas100 ?? '',
      NOTURNO: f.noturno ?? '',
      INTERJORNADA: f.interjornada ?? '',
      DESCONTO: f.desconto ?? '',
      ALOCADO: f.alocado ?? '',
      'PLANO DE SAUDE': f.planoDeSaude ?? '',
      OBSERVACAO: f.observacao ?? '',
      STATUS: f.status,
    }));

    if (format === 'csv') {
      const header = Object.keys(rows[0] ?? {}).join(';');
      const lines = [header, ...rows.map((r) => Object.values(r).join(';'))];
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="folha-${anoNum}-${String(mesNum).padStart(2, '0')}.csv"`);
      return reply.send(lines.join('\n'));
    }

    return reply.send({ ano: anoNum, mes: mesNum, linhas: rows });
  });
}

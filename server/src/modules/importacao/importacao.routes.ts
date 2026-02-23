import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../lib/prisma';
import { requireEmpresaScope, requireRole, getAuthUser } from '../../lib/tenant';
import { env } from '../../config/env';
import {
  getTipoFromFilename,
  extractTextFromFile,
  normalizeWithAI,
  mapRowsToLinhas,
  type FolhaLinhaParsed,
} from '../../services/importacaoProcessor';
import { ImportacaoStatus } from '@prisma/client';

const EMPRESA_SCOPED_ROLES = ['ADMIN', 'GESTOR'] as const;

const MES_REFERENCIA_REGEX = /^\d{4}-\d{2}$/;

function ensureUploadDir() {
  const dir = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function importacaoRoutes(app: FastifyInstance) {
  ensureUploadDir();

  app.post('/api/importacao', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const user = getAuthUser(request);
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ message: 'Envie um arquivo (campo "file")' });
    }

    let mesReferencia: string;
    const mesRef = data.fields?.mesReferencia;
    const mesField = typeof mesRef === 'object' && mesRef !== null && 'value' in mesRef ? (mesRef as { value: string }).value : undefined;
    if (typeof mesField === 'string' && MES_REFERENCIA_REGEX.test(mesField)) {
      mesReferencia = mesField;
    } else {
      const now = new Date();
      mesReferencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const fileBuffer = await data.toBuffer();
    if (!fileBuffer.length) {
      return reply.code(400).send({ message: 'Arquivo vazio' });
    }

    const tipo = getTipoFromFilename(data.filename);
    const uploadDir = ensureUploadDir();
    const safeName = `${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, fileBuffer);

    const importacao = await prisma.importacaoArquivo.create({
      data: {
        empresaId,
        mesReferencia,
        tipo,
        arquivoUrl: safeName,
        status: ImportacaoStatus.PROCESSING,
        criadoPor: user?.userId ?? undefined,
      },
    });

    const logs: string[] = [];
    try {
      const { text, rows } = await extractTextFromFile(filePath, tipo, logs);

      let linhas: FolhaLinhaParsed[] = [];
      if (rows && rows.length > 0) {
        linhas = mapRowsToLinhas(rows);
        logs.push(`Mapeamento heurístico: ${linhas.length} linhas`);
      }
      if (linhas.length === 0 && text.trim()) {
        const aiLinhas = await normalizeWithAI(text, logs);
        if (aiLinhas.length > 0) linhas = aiLinhas;
        else {
          linhas = [{ colaborador: '(texto bruto)', observacao: text.slice(0, 500) }];
        }
      }

      await prisma.importacaoLinha.createMany({
        data: linhas.map((l) => ({
          importacaoArquivoId: importacao.id,
          colaborador: l.colaborador,
          horas60: l.horas60,
          horas100: l.horas100,
          noturno: l.noturno,
          interjornada: l.interjornada,
          desconto: l.desconto,
          alocado: l.alocado,
          planoDeSaude: l.planoDeSaude,
          observacao: l.observacao,
          rawLine: l as unknown as object,
          validado: false,
        })),
      });

      await prisma.importacaoArquivo.update({
        where: { id: importacao.id },
        data: {
          status: ImportacaoStatus.REVISAO,
          logs: logs as unknown as object,
          payloadBruto: { textLength: text.length, rowCount: rows?.length } as unknown as object,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logs.push(`Erro: ${msg}`);
      await prisma.importacaoArquivo.update({
        where: { id: importacao.id },
        data: {
          status: ImportacaoStatus.FAILED,
          logs: logs as unknown as object,
        },
      });
      return reply.code(500).send({ message: 'Falha ao processar arquivo', logs });
    }

    const updated = await prisma.importacaoArquivo.findUnique({
      where: { id: importacao.id },
      include: { linhas: true },
    });
    return reply.code(201).send(updated);
  });

  app.get('/api/importacao', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { mesReferencia } = request.query as { mesReferencia?: string };
    const where: { empresaId: string; mesReferencia?: string } = { empresaId };
    if (mesReferencia && MES_REFERENCIA_REGEX.test(mesReferencia)) {
      where.mesReferencia = mesReferencia;
    }

    const list = await prisma.importacaoArquivo.findMany({
      where,
      include: { linhas: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((i) => ({
      ...i,
      linhasCount: i.linhas.length,
      linhas: undefined,
    }));
  });

  app.get('/api/importacao/:id', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const imp = await prisma.importacaoArquivo.findFirst({
      where: { id, empresaId },
      include: { linhas: true },
    });
    if (!imp) return reply.code(404).send({ message: 'Importação não encontrada' });
    return imp;
  });

  const linhaUpdateSchema = z.object({
    colaborador: z.string().optional(),
    horas60: z.string().optional(),
    horas100: z.string().optional(),
    noturno: z.string().optional(),
    interjornada: z.string().optional(),
    desconto: z.string().optional(),
    alocado: z.string().optional(),
    planoDeSaude: z.string().optional(),
    observacao: z.string().optional(),
  });

  app.patch('/api/importacao/:id/linhas/:linhaId', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (reply.sent) return;

    const { id, linhaId } = request.params as { id: string; linhaId: string };
    const imp = await prisma.importacaoArquivo.findFirst({ where: { id, empresaId } });
    if (!imp) return reply.code(404).send({ message: 'Importação não encontrada' });

    const body = linhaUpdateSchema.parse(request.body);
    const linha = await prisma.importacaoLinha.findFirst({
      where: { id: linhaId, importacaoArquivoId: id },
    });
    if (!linha) return reply.code(404).send({ message: 'Linha não encontrada' });

    const updated = await prisma.importacaoLinha.update({
      where: { id: linhaId },
      data: body,
    });
    return updated;
  });

  app.post('/api/importacao/:id/confirmar', async (request, reply) => {
    const empresaId = requireEmpresaScope(request, reply);
    if (!empresaId) return;
    const user = requireRole(request, reply, [...EMPRESA_SCOPED_ROLES]);
    if (!user || reply.sent) return;

    const { id } = request.params as { id: string };
    const imp = await prisma.importacaoArquivo.findFirst({
      where: { id, empresaId },
      include: { linhas: true },
    });
    if (!imp) return reply.code(404).send({ message: 'Importação não encontrada' });
    if (imp.status !== ImportacaoStatus.REVISAO) {
      return reply.code(400).send({ message: 'Só é possível confirmar importações em revisão' });
    }

    const [ano, mes] = imp.mesReferencia.split('-').map(Number);

    for (const linha of imp.linhas) {
      if (!linha.colaborador.trim()) continue;

      const employee = await prisma.employee.findFirst({
        where: { empresaId, name: { contains: linha.colaborador.trim() } },
      });
      const employeeId = employee?.id ?? null;

      if (employeeId) {
        await prisma.folhaConsolidadaMensal.upsert({
          where: {
            empresaId_employeeId_ano_mes: { empresaId, employeeId, ano, mes },
          },
          create: {
            empresaId,
            employeeId,
            ano,
            mes,
            colaborador: linha.colaborador,
            horas60: linha.horas60,
            horas100: linha.horas100,
            noturno: linha.noturno,
            interjornada: linha.interjornada,
            desconto: linha.desconto,
            alocado: linha.alocado,
            planoDeSaude: linha.planoDeSaude,
            observacao: linha.observacao,
            status: 'REVISADO',
            revisadoPor: user.userId,
            revisadoEm: new Date(),
          },
          update: {
            horas60: linha.horas60,
            horas100: linha.horas100,
            noturno: linha.noturno,
            interjornada: linha.interjornada,
            desconto: linha.desconto,
            alocado: linha.alocado,
            planoDeSaude: linha.planoDeSaude,
            observacao: linha.observacao,
            status: 'REVISADO',
            revisadoPor: user.userId,
            revisadoEm: new Date(),
          },
        });
      }
    }

    await prisma.importacaoArquivo.update({
      where: { id },
      data: {
        status: ImportacaoStatus.DONE,
        revisadoPor: user.userId,
        revisadoEm: new Date(),
      },
    });

    return reply.send({ message: 'Importação confirmada e folha consolidada atualizada.' });
  });
}

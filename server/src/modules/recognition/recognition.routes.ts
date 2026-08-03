import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { parseEmbedding, cosineSimilarity, normalizeEmbedding } from '../../lib/similarity';
import { appendTimeEntryToSheet } from '../../services/googleSheetsService';
import { recogPyClient } from '../../services/recogPyClient';
import { env } from '../../config/env';
import { getEndOfToday, getNextRecordType, getRecordLabel, getStartOfToday } from '../../lib/time-entry-logic';

const recognitionSchema = z
  .object({
    embedding: z.array(z.number()).min(10).optional(),
    imageBase64: z.string().min(32).optional(),
    deviceId: z.string().optional(),
    photoUrl: z.string().optional(),
    previewOnly: z.boolean().optional(),
    detectOnly: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.embedding?.length || v.imageBase64), {
    message: 'Informe imageBase64 ou embedding',
  });

/** Resolve token: Device cadastrado (com empresaId) ou token legado (env). Define request.recognitionEmpresaId. */
async function ensureAuthorizedDevice(
  request: FastifyRequest & { recognitionEmpresaId?: string | null },
  reply: FastifyReply
) {
  const header = request.headers['x-device-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    reply.code(401).send({ message: 'Dispositivo não autorizado' });
    return;
  }
  const device = await prisma.device.findFirst({
    where: { secret: token, active: true },
    select: { empresaId: true },
  });
  if (device) {
    request.recognitionEmpresaId = device.empresaId;
    return;
  }
  if (token === env.DEVICE_TOKEN) {
    request.recognitionEmpresaId = null;
    return;
  }
  reply.code(401).send({ message: 'Dispositivo não autorizado' });
}

type EmployeeRow = {
  id: string;
  name: string;
  identifier: string;
  email: string | null;
  active: boolean;
  empresaId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function matchAgainstGallery(params: {
  candidate: number[];
  empresaId: string | null;
  algorithmFilter?: string | null;
  request: FastifyRequest;
  deviceId?: string;
}): Promise<
  | { ok: true; bestEmployee: EmployeeRow; bestSimilarity: number; bestEmbeddingId: string | null }
  | { ok: false; bestSimilarity: number; message: string; bestEmployeeName?: string }
> {
  const { candidate, empresaId, algorithmFilter, request, deviceId } = params;

  const embeddings = await prisma.faceEmbedding.findMany({
    where: {
      ...(empresaId ? { employee: { empresaId } } : {}),
      ...(algorithmFilter ? { algorithm: algorithmFilter } : {}),
    },
    include: { employee: true },
  });

  // Se filtrou por algoritmo Python e não achou nada, tenta embeddings com o mesmo tamanho do candidato
  // (evita “sumiço” por string de algorithm diferente).
  let gallery = embeddings;
  if (!gallery.length && algorithmFilter) {
    const all = await prisma.faceEmbedding.findMany({
      where: empresaId ? { employee: { empresaId } } : undefined,
      include: { employee: true },
    });
    gallery = all.filter((e) => {
      try {
        return parseEmbedding(e.embedding).length === candidate.length;
      } catch {
        return false;
      }
    });
    request.log.warn(
      {
        algorithmFilter,
        totalEmbeddings: all.length,
        compatible: gallery.length,
        algorithms: [...new Set(all.map((e) => e.algorithm))],
      },
      'No embeddings for algorithm filter; falling back to same-dimension vectors'
    );
  }

  if (!gallery.length) {
    return {
      ok: false,
      bestSimilarity: -1,
      message: algorithmFilter
        ? 'Nenhuma biometria Python cadastrada. No admin, use Capturar rosto de novo (1 foto nítida).'
        : 'Nenhuma biometria cadastrada',
    };
  }

  let bestSimilarity = -1;
  let bestEmployee: EmployeeRow | null = null;
  let bestEmbeddingId: string | null = null;
  const allSimilarities: Array<{ employeeId: string; employeeName: string; similarity: number }> = [];

  for (const embedding of gallery) {
    try {
      let storedEmbedding = parseEmbedding(embedding.embedding);
      if (candidate.length !== storedEmbedding.length) {
        continue;
      }
      storedEmbedding = normalizeEmbedding(storedEmbedding);
      const similarity = cosineSimilarity(candidate, storedEmbedding);
      allSimilarities.push({
        employeeId: embedding.employee.id,
        employeeName: embedding.employee.name,
        similarity,
      });
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestEmployee = embedding.employee;
        bestEmbeddingId = embedding.id;
      }
    } catch (error) {
      request.log.warn({ error, embeddingId: embedding.id }, 'Error comparing embeddings');
    }
  }

  const similarityByEmployee = new Map<string, { name: string; bestSimilarity: number }>();
  for (const sim of allSimilarities) {
    const current = similarityByEmployee.get(sim.employeeId);
    if (!current || sim.similarity > current.bestSimilarity) {
      similarityByEmployee.set(sim.employeeId, {
        name: sim.employeeName,
        bestSimilarity: sim.similarity,
      });
    }
  }

  const ranked = Array.from(similarityByEmployee.values()).sort(
    (a, b) => b.bestSimilarity - a.bestSimilarity
  );

  request.log.info(
    {
      threshold: env.FACIAL_THRESHOLD,
      margin: env.FACIAL_MARGIN,
      topMatches: ranked.slice(0, 3),
      empresaId: empresaId ?? 'legacy-all',
      algorithmFilter: algorithmFilter ?? 'any',
    },
    'Recognition gallery scored'
  );

  if (ranked.length > 1 && ranked[0].bestSimilarity - ranked[1].bestSimilarity < env.FACIAL_MARGIN) {
    await prisma.auditLog.create({
      data: {
        action: 'RECOGNITION_AMBIGUOUS',
        actor: deviceId ?? 'totem',
        payload: {
          bestSimilarity,
          topMatches: ranked.slice(0, 3),
          margin: env.FACIAL_MARGIN,
        },
      },
    });
    return {
      ok: false,
      bestSimilarity,
      message: 'Reconhecimento ambíguo. Centralize melhor o rosto ou procure o RH.',
      bestEmployeeName: ranked[0]?.name,
    };
  }

  if (!bestEmployee || bestSimilarity < env.FACIAL_THRESHOLD) {
    await prisma.auditLog.create({
      data: {
        action: 'RECOGNITION_FAILED',
        actor: deviceId ?? 'totem',
        payload: {
          similarity: bestSimilarity,
          threshold: env.FACIAL_THRESHOLD,
          bestEmployeeId: bestEmployee?.id,
          topMatches: ranked.slice(0, 3),
        },
      },
    });

    let message: string;
    if (bestSimilarity < 0) {
      message = 'Nenhum rosto detectado. Encaixe o rosto no oval.';
    } else if (bestSimilarity < 0.4) {
      message = 'Rosto não reconhecido. Verifique se você está cadastrado ou procure o RH.';
    } else {
      message = `Rosto não reconhecido. Similaridade: ${(bestSimilarity * 100).toFixed(1)}% (mínimo ${(env.FACIAL_THRESHOLD * 100).toFixed(1)}%). Recadastre a biometria se necessário.`;
    }

    return {
      ok: false,
      bestSimilarity,
      message,
      bestEmployeeName: bestEmployee?.name,
    };
  }

  return { ok: true, bestEmployee, bestSimilarity, bestEmbeddingId };
}

export async function recognitionRoutes(app: FastifyInstance) {
  app.post('/api/recognitions', { preHandler: ensureAuthorizedDevice }, async (request, reply) => {
    const rawBody = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const parsed = recognitionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? 'Payload inválido' });
    }
    const payload = parsed.data;
    const req = request as typeof request & { recognitionEmpresaId?: string | null };
    const empresaId = req.recognitionEmpresaId ?? null;

    if (!empresaId) {
      request.log.warn('Recognition with legacy DEVICE_TOKEN (no empresa scope)');
    }

    // --- Modo Python: imagem -> detect/embed no recog-py ---
    if (env.RECOG_ENGINE === 'python' || payload.imageBase64) {
      if (!payload.imageBase64) {
        return reply.code(400).send({
          matched: false,
          message: 'Modo Python ativo: envie imageBase64',
        });
      }

      try {
        const detect = await recogPyClient.detect(payload.imageBase64);

        if (payload.detectOnly || detect.alignStatus !== 'ALIGNED') {
          return reply.send({
            matched: false,
            hasFace: detect.hasFace,
            alignStatus: detect.alignStatus,
            message: detect.message,
            faceRatio: detect.faceRatio,
          });
        }

        const embedded = await recogPyClient.embed(payload.imageBase64);
        let candidate = normalizeEmbedding(embedded.embedding);

        const match = await matchAgainstGallery({
          candidate,
          empresaId,
          algorithmFilter: env.RECOG_ALGORITHM,
          request,
          deviceId: payload.deviceId,
        });

        if (!match.ok) {
          return reply.send({
            matched: false,
            hasFace: true,
            alignStatus: 'ALIGNED',
            similarity: match.bestSimilarity,
            message: match.message,
          });
        }

        return finalizeMatch({
          request,
          reply,
          bestEmployee: match.bestEmployee,
          bestSimilarity: match.bestSimilarity,
          bestEmbeddingId: match.bestEmbeddingId,
          payload,
        });
      } catch (error) {
        const err = error as Error & { status?: number; payload?: unknown };
        request.log.error({ error: err.message, payload: err.payload }, 'recog-py failed');

        if (err.status === 422 && err.payload && typeof err.payload === 'object') {
          const p = err.payload as {
            message?: string;
            alignStatus?: string;
            hasFace?: boolean;
          };
          return reply.send({
            matched: false,
            hasFace: p.hasFace ?? true,
            alignStatus: p.alignStatus ?? 'MISALIGNED',
            message: p.message ?? err.message,
          });
        }

        return reply.code(503).send({
          matched: false,
          message: 'Serviço de reconhecimento indisponível. Tente novamente em instantes.',
        });
      }
    }

    // --- Modo legado JS: embedding do browser ---
    if (!payload.embedding) {
      return reply.code(400).send({ matched: false, message: 'Embedding obrigatório no modo js' });
    }

    let candidate = parseEmbedding(payload.embedding);
    try {
      candidate = normalizeEmbedding(candidate);
    } catch {
      return reply.code(400).send({ matched: false, message: 'Embedding inválido: magnitude zero' });
    }

    const match = await matchAgainstGallery({
      candidate,
      empresaId,
      algorithmFilter: null,
      request,
      deviceId: payload.deviceId,
    });

    if (!match.ok) {
      return reply.send({
        matched: false,
        similarity: match.bestSimilarity,
        message: match.message,
      });
    }

    return finalizeMatch({
      request,
      reply,
      bestEmployee: match.bestEmployee,
      bestSimilarity: match.bestSimilarity,
      bestEmbeddingId: match.bestEmbeddingId,
      payload,
    });
  });
}

async function finalizeMatch(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  bestEmployee: EmployeeRow;
  bestSimilarity: number;
  bestEmbeddingId: string | null;
  payload: z.infer<typeof recognitionSchema>;
}) {
  const { request, reply, bestEmployee, bestSimilarity, bestEmbeddingId, payload } = params;

  request.log.info(
    {
      employeeId: bestEmployee.id,
      employeeName: bestEmployee.name,
      similarity: bestSimilarity,
      threshold: env.FACIAL_THRESHOLD,
      embeddingId: bestEmbeddingId,
      engine: env.RECOG_ENGINE,
    },
    'Facial recognition successful'
  );

  const todayRecords = await prisma.timeEntry.findMany({
    where: {
      employeeId: bestEmployee.id,
      timestamp: {
        gte: getStartOfToday(),
        lte: getEndOfToday(),
      },
    },
    orderBy: { timestamp: 'asc' },
  });

  const nextType = getNextRecordType(todayRecords);
  if (!nextType) {
    return reply.send({
      matched: true,
      hasFace: true,
      alignStatus: 'ALIGNED',
      employee: bestEmployee,
      canRegister: false,
      message: 'Todos os registros do dia já foram feitos',
      similarity: bestSimilarity,
    });
  }

  if (payload.previewOnly) {
    return reply.send({
      matched: true,
      hasFace: true,
      alignStatus: 'ALIGNED',
      employee: bestEmployee,
      canRegister: true,
      nextType,
      nextTypeLabel: getRecordLabel(nextType),
      similarity: bestSimilarity,
    });
  }

  const timeEntry = await prisma.timeEntry.create({
    data: {
      employeeId: bestEmployee.id,
      type: nextType,
      timestamp: new Date(),
      confidence: bestSimilarity,
      deviceId: payload.deviceId ?? 'totem-local',
      photoUrl: payload.photoUrl,
    },
    include: { employee: true },
  });

  await prisma.auditLog.create({
    data: {
      action: 'RECOGNITION_SUCCESS',
      actor: payload.deviceId ?? 'totem',
      payload: {
        employeeId: bestEmployee.id,
        timeEntryId: timeEntry.id,
        similarity: bestSimilarity,
        engine: env.RECOG_ENGINE,
      },
    },
  });

  try {
    await appendTimeEntryToSheet({
      employeeId: bestEmployee.id,
      employeeName: bestEmployee.name,
      type: getRecordLabel(nextType),
      deviceId: payload.deviceId,
      timestamp: timeEntry.timestamp,
    });
  } catch (error) {
    request.log.error({ error }, 'Failed to append entry to Google Sheets');
  }

  return reply.send({
    matched: true,
    hasFace: true,
    alignStatus: 'ALIGNED',
    employee: {
      id: timeEntry.employee.id,
      name: timeEntry.employee.name,
      identifier: timeEntry.employee.identifier,
    },
    timeEntry,
    nextType,
    nextTypeLabel: getRecordLabel(nextType),
    similarity: bestSimilarity,
  });
}

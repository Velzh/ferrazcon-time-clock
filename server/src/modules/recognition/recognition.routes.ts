import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { parseEmbedding, cosineSimilarity, normalizeEmbedding } from '../../lib/similarity';
import { appendTimeEntryToSheet } from '../../services/googleSheetsService';
import { env } from '../../config/env';
import { getEndOfToday, getNextRecordType, getRecordLabel, getStartOfToday } from '../../lib/time-entry-logic';

const recognitionSchema = z.object({
  embedding: z.array(z.number()).min(10),
  deviceId: z.string().optional(),
  photoUrl: z.string().optional(),
  previewOnly: z.boolean().optional(),
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

export async function recognitionRoutes(app: FastifyInstance) {
  app.post('/api/recognitions', { preHandler: ensureAuthorizedDevice }, async (request, reply) => {
    const rawBody = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const payload = recognitionSchema.parse(rawBody);
    const req = request as typeof request & { recognitionEmpresaId?: string | null };
    const empresaId = req.recognitionEmpresaId ?? null;

    let candidate = parseEmbedding(payload.embedding);

    // Normaliza o embedding do candidato para garantir consistência
    try {
      candidate = normalizeEmbedding(candidate);
    } catch (error) {
      request.log.error({ error }, 'Failed to normalize candidate embedding');
      return reply.code(400).send({ 
        matched: false, 
        message: 'Embedding inválido: magnitude zero' 
      });
    }

    // Log do threshold atual para debug
    request.log.info({ 
      threshold: env.FACIAL_THRESHOLD,
      candidateLength: candidate.length,
      empresaId: empresaId ?? 'legacy-all',
    }, 'Recognition request received');

    const embeddings = await prisma.faceEmbedding.findMany({
      where: empresaId ? { employee: { empresaId } } : undefined,
      include: { employee: true },
    });

    if (!embeddings.length) {
      return reply.code(400).send({ matched: false, message: 'Nenhuma biometria cadastrada' });
    }

    let bestSimilarity = -1;
    let bestEmployee: (typeof embeddings)[number]['employee'] | null = null;
    let bestEmbeddingId: string | null = null;
    const allSimilarities: Array<{ employeeId: string; employeeName: string; similarity: number }> = [];

    // Compara com TODOS os embeddings e encontra o melhor match
    for (const embedding of embeddings) {
      try {
        let storedEmbedding = parseEmbedding(embedding.embedding);
        
        // Valida se os embeddings têm o mesmo tamanho
        if (candidate.length !== storedEmbedding.length) {
          request.log.warn({
            candidateLength: candidate.length,
            storedLength: storedEmbedding.length,
            embeddingId: embedding.id,
          }, 'Embedding size mismatch');
          continue;
        }

        // Normaliza o embedding armazenado (se ainda não estiver normalizado)
        try {
          storedEmbedding = normalizeEmbedding(storedEmbedding);
        } catch (error) {
          request.log.warn({ error, embeddingId: embedding.id }, 'Failed to normalize stored embedding');
          continue;
        }

        const similarity = cosineSimilarity(candidate, storedEmbedding);
        
        // Armazena todas as similaridades para análise
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
        request.log.error({ error, embeddingId: embedding.id }, 'Error comparing embeddings');
        continue;
      }
    }

    // Validação adicional: verifica se há múltiplos COLABORADORES DIFERENTES com similaridade alta
    // Agrupa por colaborador e pega a melhor similaridade de cada um
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

    // Filtra apenas colaboradores diferentes com similaridade acima do threshold - 0.05
    const closeEmployeeMatches = Array.from(similarityByEmployee.values())
      .filter((emp) => emp.bestSimilarity >= env.FACIAL_THRESHOLD - 0.05)
      .sort((a, b) => b.bestSimilarity - a.bestSimilarity);

    // Só considera ambiguidade se houver múltiplos COLABORADORES DIFERENTES (não múltiplas biometrias do mesmo)
    if (closeEmployeeMatches.length > 1 && closeEmployeeMatches[0].bestSimilarity - closeEmployeeMatches[1].bestSimilarity < 0.03) {
      // Diferença menor que 3% entre os dois melhores = ambiguidade real
      request.log.warn({
        topMatches: closeEmployeeMatches.slice(0, 3).map((m) => ({ name: m.name, similarity: m.bestSimilarity })),
        bestSimilarity,
      }, 'Multiple different employees with high similarity - rejecting for security');
      
      await prisma.auditLog.create({
        data: {
          action: 'RECOGNITION_AMBIGUOUS',
          actor: payload.deviceId ?? 'totem',
          payload: { 
            bestSimilarity,
            topMatches: closeEmployeeMatches.slice(0, 3),
          },
        },
      });

      return reply.send({
        matched: false,
        similarity: bestSimilarity,
        message: 'Reconhecimento ambíguo. Múltiplos colaboradores com similaridade alta. Procure o RH.',
      });
    }

    // Validação rigorosa: só aceita se a similaridade for acima do threshold
    // FORÇA o threshold mínimo - nunca aceita abaixo disso
    const MINIMUM_THRESHOLD = Math.max(env.FACIAL_THRESHOLD, 0.90); // Garante pelo menos 0.90
    
    if (!bestEmployee || bestSimilarity < MINIMUM_THRESHOLD) {
      request.log.warn({
        bestSimilarity,
        threshold: env.FACIAL_THRESHOLD,
        minimumThreshold: MINIMUM_THRESHOLD,
        bestEmployee: bestEmployee?.name,
        allSimilarities: allSimilarities.slice(0, 5).map((s) => ({
          name: s.employeeName,
          similarity: s.similarity,
        })),
      }, 'Recognition rejected - similarity below threshold');

      await prisma.auditLog.create({
        data: {
          action: 'RECOGNITION_FAILED',
          actor: payload.deviceId ?? 'totem',
          payload: { 
            similarity: bestSimilarity,
            threshold: env.FACIAL_THRESHOLD,
            minimumThreshold: MINIMUM_THRESHOLD,
            bestEmployeeId: bestEmployee?.id,
          },
        },
      });

      let message: string;
      if (bestSimilarity < 0) {
        message = 'Nenhum rosto detectado. Aproxime-se mais da câmera e mantenha boa iluminação.';
      } else if (bestSimilarity < 0.5) {
        message = 'Rosto não reconhecido. Verifique se você está cadastrado no sistema ou procure o RH.';
      } else if (bestSimilarity < 0.7) {
        message = `Rosto não reconhecido. Similaridade muito baixa (${(bestSimilarity * 100).toFixed(1)}%). Verifique se você está cadastrado.`;
      } else {
        message = `Rosto não reconhecido. Similaridade: ${(bestSimilarity * 100).toFixed(1)}% (mínimo necessário: ${(MINIMUM_THRESHOLD * 100).toFixed(1)}%). Procure o RH para recadastrar sua biometria.`;
      }

      return reply.send({
        matched: false,
        similarity: bestSimilarity,
        message,
      });
    }

    // Log de sucesso para auditoria
    request.log.info({
      employeeId: bestEmployee.id,
      employeeName: bestEmployee.name,
      similarity: bestSimilarity,
      threshold: env.FACIAL_THRESHOLD,
      minimumThreshold: MINIMUM_THRESHOLD,
      embeddingId: bestEmbeddingId,
      allSimilarities: allSimilarities.slice(0, 3).map((s) => ({
        name: s.employeeName,
        similarity: s.similarity,
      })),
    }, 'Facial recognition successful');

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
        employee: bestEmployee,
        canRegister: false,
        message: 'Todos os registros do dia já foram feitos',
      });
    }

    if (payload.previewOnly) {
      return reply.send({
        matched: true,
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
  });
}

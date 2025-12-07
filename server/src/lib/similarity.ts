export type EmbeddingVector = number[];

/**
 * Normaliza um vetor de embedding para magnitude unitária
 * Isso garante que comparações de similaridade sejam consistentes
 */
export function normalizeEmbedding(embedding: EmbeddingVector): EmbeddingVector {
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitude === 0) {
    throw new Error('Embedding vector has zero magnitude');
  }

  return embedding.map((val) => val / magnitude);
}

/**
 * Calcula similaridade de cosseno entre dois vetores de embedding
 * Ambos os vetores devem estar normalizados para melhor precisão
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) {
    throw new Error('Embedding vectors must have the same length');
  }

  // Se os vetores já estão normalizados, o produto escalar é a similaridade de cosseno
  // Caso contrário, calcula normalmente
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  // Verifica se os vetores já estão normalizados (magnitude ≈ 1.0)
  const isNormalized = Math.abs(magA - 1.0) < 0.01 && Math.abs(magB - 1.0) < 0.01;
  
  if (isNormalized) {
    // Se normalizados, produto escalar = similaridade de cosseno
    return Math.max(-1, Math.min(1, dot)); // Clamp entre -1 e 1
  }

  // Caso contrário, calcula normalmente
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function parseEmbedding(value: unknown): EmbeddingVector {
  if (!Array.isArray(value)) {
    throw new Error('Embedding must be an array');
  }

  return value.map((item) => {
    const parsed = typeof item === 'number' ? item : Number(item);
    if (Number.isNaN(parsed)) {
      throw new Error('Embedding contains non-numeric values');
    }
    return parsed;
  });
}

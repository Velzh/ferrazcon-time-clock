import { env } from '../config/env';

export type AlignStatus = 'NO_FACE' | 'TOO_FAR' | 'TOO_CLOSE' | 'OFF_CENTER' | 'ALIGNED';

export type RecogDetectResult = {
  hasFace: boolean;
  alignStatus: AlignStatus;
  message: string;
  faceRatio?: number | null;
  centerX?: number | null;
  centerY?: number | null;
};

export type RecogEmbedResult = {
  embedding: number[];
  algorithm: string;
  model: string;
  detector: string;
};

function joinUrl(path: string) {
  return `${env.RECOG_PY_URL.replace(/\/+$/, '')}${path}`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(joinUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }

  if (!response.ok) {
    const detail = (data as { detail?: unknown; message?: string }).detail;
    const message =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in (detail as object)
          ? String((detail as { message: string }).message)
          : (data as { message?: string }).message ?? `recog-py erro ${response.status}`;

    const err = new Error(message) as Error & { status?: number; payload?: unknown };
    err.status = response.status;
    err.payload = detail ?? data;
    throw err;
  }

  return data as T;
}

export const recogPyClient = {
  health: async () => {
    const response = await fetch(joinUrl('/health'));
    if (!response.ok) throw new Error(`recog-py health ${response.status}`);
    return response.json() as Promise<{ status: string; ready: boolean; algorithm: string }>;
  },
  detect: (imageBase64: string) => postJson<RecogDetectResult>('/detect', { imageBase64 }),
  embed: (imageBase64: string, opts?: { requireAligned?: boolean }) =>
    postJson<RecogEmbedResult>('/embed', {
      imageBase64,
      requireAligned: opts?.requireAligned ?? true,
    }),
};

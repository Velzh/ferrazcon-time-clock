import { getToken, getSelectedEmpresaId } from '@/lib/authStorage';

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

function buildUrl(path: string): string {
  if ((API_BASE_URL === '/api' || API_BASE_URL.endsWith('/api')) && path.startsWith('/api/')) {
    return `${API_BASE_URL}${path.slice(4)}`;
  }
  return `${API_BASE_URL}${path}`;
}

function getAuthHeaders(omitContentType?: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const empresaId = getSelectedEmpresaId();
  if (empresaId) headers['X-Empresa-Id'] = empresaId;
  if (!omitContentType) headers['Content-Type'] = 'application/json';
  return headers;
}

export type ImportacaoListItem = {
  id: string;
  empresaId: string;
  mesReferencia: string;
  tipo: string;
  arquivoUrl: string | null;
  status: string;
  logs: unknown;
  criadoPor: string | null;
  revisadoPor: string | null;
  revisadoEm: string | null;
  createdAt: string;
  updatedAt: string;
  linhasCount: number;
};

export type ImportacaoLinha = {
  id: string;
  importacaoArquivoId: string;
  colaborador: string;
  horas60: string | null;
  horas100: string | null;
  noturno: string | null;
  interjornada: string | null;
  desconto: string | null;
  alocado: string | null;
  planoDeSaude: string | null;
  observacao: string | null;
  validado: boolean;
};

export type ImportacaoDetail = {
  id: string;
  empresaId: string;
  mesReferencia: string;
  tipo: string;
  status: string;
  logs: unknown;
  linhas: ImportacaoLinha[];
  createdAt: string;
};

export const importacaoService = {
  list: (mesReferencia?: string) => {
    const q = mesReferencia ? `?mesReferencia=${encodeURIComponent(mesReferencia)}` : '';
    return fetch(buildUrl(`/api/importacao${q}`), {
      headers: getAuthHeaders(),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? r.statusText);
      }
      return r.json() as Promise<ImportacaoListItem[]>;
    });
  },

  getById: (id: string) =>
    fetch(buildUrl(`/api/importacao/${id}`), { headers: getAuthHeaders() }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? r.statusText);
      }
      return r.json() as Promise<ImportacaoDetail>;
    }),

  upload: (file: File, mesReferencia?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (mesReferencia) form.append('mesReferencia', mesReferencia);
    return fetch(buildUrl('/api/importacao'), {
      method: 'POST',
      headers: getAuthHeaders(true) as Record<string, string>,
      body: form,
    }).then(async (r) => {
      const text = await r.text();
      if (!r.ok) {
        let message = r.statusText;
        try {
          const err = JSON.parse(text);
          message = err.message ?? message;
        } catch {
          message = text || message;
        }
        throw new Error(message);
      }
      return text ? (JSON.parse(text) as ImportacaoDetail) : undefined;
    });
  },

  updateLinha: (importacaoId: string, linhaId: string, data: Partial<ImportacaoLinha>) =>
    fetch(buildUrl(`/api/importacao/${importacaoId}/linhas/${linhaId}`), {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? r.statusText);
      }
      return r.json() as Promise<ImportacaoLinha>;
    }),

  confirmar: (id: string) =>
    fetch(buildUrl(`/api/importacao/${id}/confirmar`), {
      method: 'POST',
      headers: getAuthHeaders(),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? r.statusText);
      }
      return r.json() as Promise<{ message: string }>;
    }),
};

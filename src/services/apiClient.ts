import { getToken, getSelectedEmpresaId } from '@/lib/authStorage';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function joinBaseAndPath(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, '');

  // Evita gerar /api/api/... quando base já é "/api" (ou termina com "/api")
  // e o path também começa com "/api".
  if ((normalizedBase === '/api' || normalizedBase.endsWith('/api')) && path.startsWith('/api/')) {
    return `${normalizedBase}${path.slice('/api'.length)}`;
  }

  return `${normalizedBase}${path}`;
}

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const empresaId = getSelectedEmpresaId();
  if (empresaId) {
    headers['X-Empresa-Id'] = empresaId;
  }
  return headers;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  try {
    const hasBody = init?.body !== undefined && init?.body !== null;
    const headers: HeadersInit = {
      ...getAuthHeaders(),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    };

    const response = await fetch(joinBaseAndPath(API_BASE_URL, input), {
      headers,
      ...init,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message ?? `Erro ${response.status}: ${response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando em http://localhost:4000');
    }
    throw error;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...init,
    }),
  delete: <T>(path: string) =>
    request<T>(path, {
      method: 'DELETE',
    }),
};

export { API_BASE_URL };

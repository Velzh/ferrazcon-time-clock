const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  try {
    const hasBody = init?.body !== undefined && init?.body !== null;
    const headers: HeadersInit = {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    };

    const response = await fetch(`${API_BASE_URL}${input}`, {
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

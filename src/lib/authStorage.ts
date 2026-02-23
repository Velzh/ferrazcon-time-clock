const TOKEN_KEY = 'fzc-auth-token';
const USER_KEY = 'fzc-auth-user';
const EMPRESA_KEY = 'fzc-selected-empresa-id';

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  empresaId: string | null;
  empresa: { id: string; name: string; slug: string } | null;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMPRESA_KEY);
}

export function getSelectedEmpresaId(): string | null {
  return localStorage.getItem(EMPRESA_KEY);
}

export function setSelectedEmpresaId(empresaId: string | null): void {
  if (empresaId) {
    localStorage.setItem(EMPRESA_KEY, empresaId);
  } else {
    localStorage.removeItem(EMPRESA_KEY);
  }
}

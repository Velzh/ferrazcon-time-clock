import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from '@/lib/authStorage';
import {
  getToken,
  getUser,
  setToken,
  setUser,
  clearAuth,
  getSelectedEmpresaId,
  setSelectedEmpresaId as persistSelectedEmpresaId,
} from '@/lib/authStorage';

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  selectedEmpresaId: string | null;
  setSelectedEmpresaId: (id: string | null) => void;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUserState] = useState<AuthUser | null>(() => getUser());
  const [selectedEmpresaId, setSelectedEmpresaIdState] = useState<string | null>(
    () => getSelectedEmpresaId()
  );

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    setTokenState(newToken);
    setUserState(newUser);
    if (newUser.empresaId) {
      persistSelectedEmpresaId(newUser.empresaId);
      setSelectedEmpresaIdState(newUser.empresaId);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setTokenState(null);
    setUserState(null);
    setSelectedEmpresaIdState(null);
  }, []);

  const setSelectedEmpresaId = useCallback((id: string | null) => {
    persistSelectedEmpresaId(id);
    setSelectedEmpresaIdState(id);
  }, []);

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t || !u) {
      setTokenState(null);
      setUserState(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      selectedEmpresaId,
      setSelectedEmpresaId,
      isAuthenticated: !!token && !!user,
      login,
      logout,
    }),
    [token, user, selectedEmpresaId, setSelectedEmpresaId, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

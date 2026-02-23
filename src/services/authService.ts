import { apiClient } from './apiClient';
import type { AuthUser } from '@/lib/authStorage';

export type LoginPayload = { email: string; password: string };

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type EmpresaOption = { id: string; name: string; slug: string };

export const authService = {
  login: (payload: LoginPayload) =>
    apiClient.post<LoginResponse>('/api/auth/login', payload),

  listEmpresas: () =>
    apiClient.get<EmpresaOption[]>('/api/empresas'),
};

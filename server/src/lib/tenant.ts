import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@prisma/client';
import { verifyToken } from './auth';

export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  empresaId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export function getAuthUser(request: FastifyRequest): AuthUser | null {
  return request.user ?? null;
}

/** Empresa id para escopo: do usuário logado ou do header X-Empresa-Id (apenas ADMIN). */
export function getEmpresaId(request: FastifyRequest): string | null {
  const user = request.user;
  if (!user) return null;
  if (user.empresaId) return user.empresaId;
  if (user.role === 'ADMIN') {
    const header = request.headers['x-empresa-id'];
    const id = Array.isArray(header) ? header[0] : header;
    if (id) return id;
  }
  return null;
}

/** Exige que a requisição tenha usuário autenticado. Retorna 401 se não houver. */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthUser | null {
  const user = request.user;
  if (!user) {
    reply.code(401).send({ message: 'Não autenticado' });
    return null;
  }
  return user;
}

/** Exige um dos papéis. Retorna 403 se o usuário não tiver permissão. */
export function requireRole(request: FastifyRequest, reply: FastifyReply, allowed: Role[]): AuthUser | null {
  const user = requireAuth(request, reply);
  if (!user) return null;
  if (!allowed.includes(user.role)) {
    reply.code(403).send({ message: 'Sem permissão para esta ação' });
    return null;
  }
  return user;
}

/** Exige que o usuário tenha acesso à empresa (seu empresaId ou ADMIN com X-Empresa-Id). */
export function requireEmpresaScope(request: FastifyRequest, reply: FastifyReply): string | null {
  const user = requireAuth(request, reply);
  if (!user) return null;
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    reply.code(403).send({ message: 'Empresa não definida. Use X-Empresa-Id se for ADMIN.' });
    return null;
  }
  return empresaId;
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken } from './auth';
import type { AuthUser } from './tenant';

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', undefined);

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!bearer) return;

    const payload = verifyToken(bearer);
    if (!payload) return;

    (request as FastifyRequest & { user: AuthUser }).user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      empresaId: payload.empresaId,
    };
  });
}

export default fp(authPlugin, { name: 'auth-plugin' });

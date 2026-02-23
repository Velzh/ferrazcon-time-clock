import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/tenant';

export async function empresaRoutes(app: FastifyInstance) {
  /** Lista empresas: ADMIN vê todas; GESTOR/ATENDENTE/BALCAO vê apenas a sua. */
  app.get('/api/empresas', async (request, reply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    if (user.role === 'ADMIN') {
      const list = await prisma.empresa.findMany({
        where: { active: true },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      });
      return list;
    }

    if (user.empresaId) {
      const empresa = await prisma.empresa.findFirst({
        where: { id: user.empresaId, active: true },
        select: { id: true, name: true, slug: true },
      });
      return empresa ? [empresa] : [];
    }

    return [];
  });
}

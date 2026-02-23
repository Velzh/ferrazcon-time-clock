import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { verifyPassword, signToken } from '../../lib/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: 'E-mail e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({
      where: { email: body.data.email },
      include: { empresa: true },
    });

    if (!user || !user.active) {
      return reply.code(401).send({ message: 'Credenciais inválidas' });
    }

    const ok = await verifyPassword(body.data.password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ message: 'Credenciais inválidas' });
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      empresaId: user.empresaId,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        empresaId: user.empresaId,
        empresa: user.empresa ? { id: user.empresa.id, name: user.empresa.name, slug: user.empresa.slug } : null,
      },
    });
  });
}

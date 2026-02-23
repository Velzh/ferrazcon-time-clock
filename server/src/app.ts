import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';

import { env } from './config/env';
import authPlugin from './lib/authPlugin';
import { authRoutes } from './modules/auth/auth.routes';
import { empresaRoutes } from './modules/empresas/empresa.routes';
import { employeeRoutes } from './modules/employees/employee.routes';
import { timeEntryRoutes } from './modules/time-entries/timeEntry.routes';
import { recognitionRoutes } from './modules/recognition/recognition.routes';
import { folhaRoutes } from './modules/folha/folha.routes';
import { importacaoRoutes } from './modules/importacao/importacao.routes';

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token', 'X-Empresa-Id'],
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });

  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB
  await app.register(authPlugin);

  app.get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(empresaRoutes);
  await app.register(employeeRoutes);
  await app.register(timeEntryRoutes);
  await app.register(recognitionRoutes);
  await app.register(folhaRoutes);
  await app.register(importacaoRoutes);

  return app;
}

export async function startServer() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    return app;
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

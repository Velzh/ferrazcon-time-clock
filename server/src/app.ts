import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { env } from './config/env';
import { employeeRoutes } from './modules/employees/employee.routes';
import { timeEntryRoutes } from './modules/time-entries/timeEntry.routes';
import { recognitionRoutes } from './modules/recognition/recognition.routes';

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token'],
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });

  app.get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(employeeRoutes);
  await app.register(timeEntryRoutes);
  await app.register(recognitionRoutes);

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

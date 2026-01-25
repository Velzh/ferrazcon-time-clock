import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  TZ: z.string().default('America/Sao_Paulo'),
  FACIAL_THRESHOLD: z.coerce.number().default(0.90),
  ENABLE_SHEETS: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      try {
        // Tenta decodificar base64
        return JSON.parse(Buffer.from(val, 'base64').toString());
      } catch {
        // Se falhar, assume que já é JSON string
        try {
          return typeof val === 'string' ? JSON.parse(val) : val;
        } catch {
          return val; // Retorna como está se não conseguir parsear
        }
      }
    }),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_TAB: z.string().default('Registros'),
  DEVICE_TOKEN: z.string().default('local-demo'),
  TURSO_AUTH_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
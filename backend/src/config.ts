import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ override: true });

const envSchema = z.object({
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_DATABASE: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173')
});

export const env = envSchema.parse(process.env);

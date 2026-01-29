import { z } from 'zod';

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1, 'DATABASE_PATH is required'),
  STORAGE_PATH: z.string().min(1, 'STORAGE_PATH is required'),
  REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment variables:',
    parsed.error.flatten().fieldErrors
  );
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}

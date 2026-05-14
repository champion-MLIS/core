import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PCO_APP_ID: z.string().min(1, 'PCO_APP_ID is required. Copy .env.example to .env and fill it in.'),
  PCO_SECRET: z.string().min(1, 'PCO_SECRET is required. Copy .env.example to .env and fill it in.'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment configuration invalid:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

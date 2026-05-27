import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load .env with override:true. Without this, an empty ambient env var
// (e.g. Claude Desktop injects an empty ANTHROPIC_API_KEY into child
// processes) wins over what's actually in the file. The .env file is
// always the source of truth for this CLI.
dotenvConfig({ override: true });

const EnvSchema = z.object({
  PCO_APP_ID: z.string().min(1, 'PCO_APP_ID is required. Copy .env.example to .env and fill it in.'),
  PCO_SECRET: z.string().min(1, 'PCO_SECRET is required. Copy .env.example to .env and fill it in.'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL (e.g. https://xxx.supabase.co).'),
  SUPABASE_SERVICE_ROLE: z
    .string()
    .min(
      1,
      'SUPABASE_SERVICE_ROLE is required. Grab it from Supabase dashboard → Project Settings → API Keys → service_role.',
    ),
  // Master switch for the live PCO write in the broadcast processor (Phase F.2).
  // Default OFF — the processor is a safe no-op (rows stay in the callback
  // queue) until Stephen runs a controlled smoke test and flips this to 'true'.
  BROADCAST_PCO_WRITE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
});

/**
 * Agent env extends the base env with Anthropic-related and Champion-link
 * config. Only loaded by CLIs that need it (agent:draft, future agent runs)
 * so other commands don't fail when ANTHROPIC_API_KEY isn't set yet.
 */
const AgentEnvSchema = EnvSchema.extend({
  ANTHROPIC_API_KEY: z
    .string()
    .min(
      1,
      'ANTHROPIC_API_KEY is required. Generate at https://console.anthropic.com/settings/keys.',
    ),
  ANTHROPIC_DRAFT_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_VOICE_CHECK_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  CHAMPION_WEBSITE_URL: z.string().url().default('https://champion.church'),
  CHAMPION_KIDS_URL: z.string().url().default('https://champion.church/kids'),
  CHAMPION_GROUPS_URL: z.string().url().default('https://champion.church/groups'),
  CHAMPION_GROWTH_TRACK_URL: z.string().url().default('https://champion.church/growth-track'),
  // "Three things to do today" page linked from the inbound-keyword auto-reply
  // (Phase F). Stephen confirms/creates the page; change the URL here or in env.
  CHAMPION_NEXT_STEPS_URL: z.string().url().default('https://champion.church/next'),
});

export type Env = z.infer<typeof EnvSchema>;
export type AgentEnv = z.infer<typeof AgentEnvSchema>;

let cached: Env | null = null;
let agentCached: AgentEnv | null = null;

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

export function loadAgentEnv(): AgentEnv {
  if (agentCached) return agentCached;
  const result = AgentEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Agent environment configuration invalid:\n${issues}`);
  }
  agentCached = result.data;
  return agentCached;
}

/** Reset the cached env. Tests only. */
export function _resetEnvCache(): void {
  cached = null;
  agentCached = null;
}

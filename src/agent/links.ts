import type { AgentEnv } from '../config/env.ts';

export interface ChampionLinks {
  website: string;
  kids: string;
  groups: string;
  growthTrack: string;
}

export function linksFromEnv(env: AgentEnv): ChampionLinks {
  return {
    website: env.CHAMPION_WEBSITE_URL,
    kids: env.CHAMPION_KIDS_URL,
    groups: env.CHAMPION_GROUPS_URL,
    growthTrack: env.CHAMPION_GROWTH_TRACK_URL,
  };
}

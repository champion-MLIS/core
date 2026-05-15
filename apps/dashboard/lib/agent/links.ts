export interface ChampionLinks {
  website: string;
  kids: string;
  groups: string;
  growthTrack: string;
}

export function linksFromEnv(): ChampionLinks {
  return {
    website: process.env.CHAMPION_WEBSITE_URL ?? 'https://champion.church',
    kids: process.env.CHAMPION_KIDS_URL ?? 'https://champion.church/kids',
    groups: process.env.CHAMPION_GROUPS_URL ?? 'https://champion.church/groups',
    growthTrack:
      process.env.CHAMPION_GROWTH_TRACK_URL ?? 'https://champion.church/growth-track',
  };
}

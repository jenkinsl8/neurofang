import type { AvatarCatalogEntry, AvatarPickRequest } from '@neurofang/shared';
import { avatarCatalog } from './avatarCatalog.js';
import { getRecentAvatars, rememberAvatar } from './recentAvatarStore.js';

function scoreAvatar(avatar: AvatarCatalogEntry, request: AvatarPickRequest): number {
  let score = 0;
  if (request.preferredGender && avatar.gender === request.preferredGender) score += 2;
  if (getRecentAvatars().includes(avatar.id)) score -= 4;
  return score + Math.random();
}

export function pickAvatar(request: AvatarPickRequest = {}) {
  const excluded = new Set(request.excludeIds ?? []);
  const candidates = avatarCatalog.filter((avatar) => !excluded.has(avatar.id));
  const raceCounts = new Map<string, number>();

  for (const recent of getRecentAvatars()) {
    const avatar = avatarCatalog.find((entry) => entry.id === recent);
    if (avatar) raceCounts.set(avatar.raceGroup, (raceCounts.get(avatar.raceGroup) ?? 0) + 1);
  }

  const sorted = candidates
    .map((avatar) => ({
      avatar,
      weighted: scoreAvatar(avatar, request) - (raceCounts.get(avatar.raceGroup) ?? 0)
    }))
    .sort((a, b) => b.weighted - a.weighted);

  const selected = sorted[0]?.avatar ?? avatarCatalog[0];
  rememberAvatar(selected.id);
  return selected;
}

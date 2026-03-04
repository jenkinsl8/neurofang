import fs from 'node:fs';
import path from 'node:path';

const STORE_PATH = path.resolve(process.cwd(), 'apps/server/data/recent-avatars.json');
const MAX_RECENT = 6;

type Store = { recentlyUsed: string[] };

let cache: Store = { recentlyUsed: [] };

export function loadRecentAvatars() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    cache = JSON.parse(raw) as Store;
  } catch {
    cache = { recentlyUsed: [] };
  }
}

export function getRecentAvatars() {
  return cache.recentlyUsed;
}

export function rememberAvatar(avatarId: string) {
  cache.recentlyUsed = [avatarId, ...cache.recentlyUsed.filter((id) => id !== avatarId)].slice(0, MAX_RECENT);
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2));
}

// Handle-reach tracking: given a handle on X / Instagram / TikTok, read its
// public profile (followers, following, posts, verified) through treg and keep
// it as a time series in handle_stats. This is the "reach collector" that
// mention-based listening does not give — followers are a profile fact, not a
// per-post one. Needs only TREG_TOKEN; no per-platform key.
//
// treg profile endpoints return a provider-native `output` whose field names
// vary slightly per platform; mapTregProfile normalises them. It is pure and
// unit-tested against the real shapes.

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { handleStats } from '@/lib/db/schema';
import { tregCall, tregEnabled } from '@/lib/treg';

export const HANDLE_PLATFORMS = ['x', 'instagram', 'tiktok'] as const;
export type HandlePlatform = (typeof HANDLE_PLATFORMS)[number];

export function isHandlePlatform(s: string): s is HandlePlatform {
  return (HANDLE_PLATFORMS as readonly string[]).includes(s);
}

const PROFILE_ENDPOINT: Record<HandlePlatform, string> = {
  x: 'treg.x.user.profile',
  instagram: 'treg.instagram.user.profile',
  tiktok: 'treg.tiktok.user.profile',
};

export interface HandleStats {
  platform: HandlePlatform;
  handle: string;          // senza @, minuscolo
  displayName?: string;
  followers: number;
  following?: number;
  postsCount?: number;
  likes?: number;          // solo TikTok
  verified: boolean;
  bio?: string;
  servedBy?: string;
}

// Forma grezza del profilo treg (unione dei campi delle tre piattaforme).
export type TregProfile = {
  username?: string;
  name?: string; full_name?: string; nickname?: string;
  followers?: number; following?: number;
  posts_count?: number; videos_count?: number; likes?: number;
  is_verified?: boolean;
  description?: string; biography?: string;
};

function intOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined;
}

/** Normalizza l'output treg in HandleStats. null se non è un profilo valido. */
export function mapTregProfile(
  platform: HandlePlatform,
  o: TregProfile | null | undefined,
  servedBy?: string,
): HandleStats | null {
  if (!o) return null;
  const handle = (o.username ?? '').replace(/^@/, '').trim().toLowerCase();
  const followers = intOrUndef(o.followers);
  // Un profilo senza handle e senza follower non è un hit utile.
  if (!handle && followers === undefined) return null;
  return {
    platform,
    handle: handle || '(unknown)',
    displayName: o.name ?? o.full_name ?? o.nickname ?? undefined,
    followers: followers ?? 0,
    following: intOrUndef(o.following),
    postsCount: intOrUndef(o.posts_count ?? o.videos_count),
    likes: intOrUndef(o.likes),
    verified: Boolean(o.is_verified),
    bio: o.description ?? o.biography ?? undefined,
    servedBy,
  };
}

/** Legge via treg la reach di un handle. null su miss / token assente / errore. */
export async function fetchHandleStats(
  platform: HandlePlatform,
  rawHandle: string,
): Promise<HandleStats | null> {
  if (!tregEnabled()) return null;
  const handle = rawHandle.replace(/^@/, '').trim();
  if (!handle) return null;
  const r = await tregCall<TregProfile>(PROFILE_ENDPOINT[platform], { username: handle, handle });
  if (!r.ok) return null;
  return mapTregProfile(platform, r.output, r.servedBy);
}

/** Persiste una rilevazione (append: la serie storica è il punto). */
export async function saveHandleStats(projectId: number, s: HandleStats): Promise<void> {
  const db = await getDb();
  await db.insert(handleStats).values({
    projectId,
    platform: s.platform,
    handle: s.handle,
    displayName: s.displayName ?? null,
    followers: s.followers,
    following: s.following ?? null,
    postsCount: s.postsCount ?? null,
    likes: s.likes ?? null,
    verified: s.verified,
    bio: s.bio ?? null,
    servedBy: s.servedBy ?? null,
  });
}

export type HandleStatsRow = {
  platform: string; handle: string; display_name: string | null;
  followers: number; following: number | null; posts_count: number | null;
  likes: number | null; verified: boolean; fetched_at: string;
};

/** L'ultima rilevazione per ogni handle tracciato nel progetto (read-back R4). */
export async function latestHandleStats(projectId: number): Promise<HandleStatsRow[]> {
  const db = await getDb();
  const res = await db.execute(sql`
    SELECT DISTINCT ON (platform, handle)
      platform, handle, display_name, followers, following, posts_count, likes, verified, fetched_at
    FROM handle_stats
    WHERE project_id = ${projectId}
    ORDER BY platform, handle, fetched_at DESC
  `);
  return res.rows as HandleStatsRow[];
}

/** La serie storica di un singolo handle, dal più recente. */
export async function handleHistory(
  projectId: number,
  platform: HandlePlatform,
  handle: string,
  limit = 60,
): Promise<HandleStatsRow[]> {
  const db = await getDb();
  const h = handle.replace(/^@/, '').trim().toLowerCase();
  const res = await db.execute(sql`
    SELECT platform, handle, display_name, followers, following, posts_count, likes, verified, fetched_at
    FROM handle_stats
    WHERE project_id = ${projectId} AND platform = ${platform} AND handle = ${h}
    ORDER BY fetched_at DESC
    LIMIT ${limit}
  `);
  return res.rows as HandleStatsRow[];
}

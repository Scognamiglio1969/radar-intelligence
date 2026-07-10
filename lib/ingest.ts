import { getDb, setMeta, getMeta } from '@/lib/db';
import { mentions, projects } from '@/lib/db/schema';
import { CONNECTORS } from '@/lib/connectors';
import { setTelegramChannels } from '@/lib/connectors/telegram';
import { setRssFeeds } from '@/lib/connectors/rss';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import type { RawMention } from '@/lib/connectors/types';

export type SourceStatus = Record<string, {
  ok: boolean; count: number; error?: string; at: string;
  /** Ultima raccolta riuscita: distingue un singhiozzo momentaneo da una fonte ferma */
  lastOkAt?: string;
}>;

function rawEngagementScore(m: RawMention): number {
  const e = m.engagement;
  if (!e) return 0;
  return (e.likes ?? 0) + 2 * (e.comments ?? 0) + 3 * (e.shares ?? 0) + (e.views ?? 0) / 200;
}

export async function ingestProject(project: typeof projects.$inferSelect) {
  const db = await getDb();
  const q = {
    anyTerms: project.keywords,
    allTerms: project.allTerms ?? [],
    excludeTerms: project.excludeTerms ?? [],
    languages: project.languages,
    countries: project.countries ?? [],
  };
  const status: SourceStatus = (await getMeta<SourceStatus>('source_status')) ?? {};
  let inserted = 0;

  // Filtro booleano centralizzato: AND e NOT valgono per tutte le fonti,
  // anche quelle la cui API non supporta gli operatori.
  const lc = (s: string) => s.toLowerCase();
  const matchesBoolean = (m: RawMention) => {
    const text = lc(`${m.title ?? ''} ${m.content}`);
    if (q.allTerms.length && !q.allTerms.every((t) => text.includes(lc(t)))) return false;
    if (q.excludeTerms.some((t) => text.includes(lc(t)))) return false;
    return true;
  };

  setTelegramChannels(project.telegramChannels ?? []);
  setRssFeeds(project.rssFeeds ?? []);
  // Carica le chiavi API inserite dall'utente prima di decidere quali fonti sono attive.
  await hydrateConnectorCredentials();
  const enabled = CONNECTORS.filter((c) => c.enabled());
  const results = await Promise.allSettled(
    enabled.map(async (c) => {
      console.log(`[ingest] ${c.id}: fetch…`);
      const list = await c.fetchMentions(q);
      console.log(`[ingest] ${c.id}: ${list.length} mention`);
      return { id: c.id, mentions: list };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const connectorId = enabled[i].id;
    const r = results[i];
    if (r.status === 'rejected') {
      const prev = status[connectorId];
      status[connectorId] = {
        ok: false, count: 0,
        error: String(r.reason?.message ?? r.reason),
        at: new Date().toISOString(),
        lastOkAt: prev?.ok ? prev.at : prev?.lastOkAt,
      };
      continue;
    }
    const now = Date.now();
    const rows = r.value.mentions
      .filter(matchesBoolean)
      // Scarta date invalide o future (feed a volte sballati) e più vecchie di 90 giorni
      .filter((m) => !Number.isNaN(m.publishedAt.getTime())
        && m.publishedAt.getTime() < now + 3600_000
        && m.publishedAt.getTime() > now - 90 * 86400_000)
      .map((m) => ({
        projectId: project.id,
        source: m.source,
        externalId: m.externalId.slice(0, 500),
        url: m.url,
        title: m.title,
        content: m.content,
        author: m.author,
        authorHandle: m.authorHandle,
        community: m.community,
        publishedAt: m.publishedAt,
        language: m.language,
        engagement: m.engagement,
        engagementScore: rawEngagementScore(m),
        reach: m.reach,
      }));
    let count = 0;
    // Inserimento a blocchi con dedup sull'indice UNIQUE (project, source, external_id)
    for (let j = 0; j < rows.length; j += 100) {
      const chunk = rows.slice(j, j + 100);
      if (chunk.length === 0) continue;
      const res = await db.insert(mentions).values(chunk).onConflictDoNothing().returning({ id: mentions.id });
      count += res.length;
    }
    inserted += count;
    const okAt = new Date().toISOString();
    status[r.value.id] = { ok: true, count, at: okAt, lastOkAt: okAt };
  }

  await setMeta('source_status', status);
  await setMeta('last_ingest_at', new Date().toISOString());
  return { inserted, status };
}

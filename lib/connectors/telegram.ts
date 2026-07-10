import type { Connector, RawMention } from './types';
import { collect, fetchText, stripHtml, truncate } from './util';

// Canali Telegram pubblici via anteprima web t.me/s/<canale> (nessuna chiave).
// Modello "watchlist": si monitorano i canali elencati nel progetto, quindi
// il filtro OR non si applica (la scelta del canale È il filtro); AND e NOT
// vengono comunque applicati centralmente dall'ingest.

let watchedChannels: string[] = [];

/** Impostato dall'ingest prima del fetch, coi canali del progetto corrente. */
export function setTelegramChannels(channels: string[]) {
  watchedChannels = channels
    .map((c) => c.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\/(s\/)?/, ''))
    .filter((c) => /^[A-Za-z0-9_]{4,}$/.test(c));
}

function parseChannel(html: string, channel: string): RawMention[] {
  const out: RawMention[] = [];
  // Ogni messaggio è un blocco tgme_widget_message con data-post="canale/id"
  const blocks = html.split('data-post="').slice(1);
  for (const block of blocks.slice(-30)) {
    const postId = block.slice(0, block.indexOf('"'));
    if (!postId.includes('/')) continue;
    const textMatch = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;
    const text = stripHtml(textMatch[1]);
    if (!text) continue;
    const timeMatch = block.match(/datetime="([^"]+)"/);
    const viewsMatch = block.match(/tgme_widget_message_views[^>]*>([^<]+)</);
    const authorMatch = block.match(/tgme_widget_message_owner_name[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    let views = 0;
    if (viewsMatch) {
      const v = viewsMatch[1].trim().toUpperCase();
      views = v.endsWith('M') ? parseFloat(v) * 1_000_000 : v.endsWith('K') ? parseFloat(v) * 1_000 : parseInt(v, 10) || 0;
    }
    out.push({
      source: 'telegram',
      externalId: postId,
      url: `https://t.me/${postId}`,
      content: truncate(text, 1200),
      author: authorMatch ? stripHtml(authorMatch[1]) : channel,
      authorHandle: `@${channel}`,
      community: `@${channel}`,
      publishedAt: timeMatch ? new Date(timeMatch[1]) : new Date(),
      engagement: { views },
      reach: views,
    });
  }
  return out;
}

async function fetchChannel(channel: string): Promise<RawMention[]> {
  const html = await fetchText(`https://t.me/s/${channel}`);
  return parseChannel(html, channel);
}

export const telegram: Connector = {
  id: 'telegram',
  label: 'Telegram (channels)',
  tier: 'free',
  enabled: () => true,
  async fetchMentions() {
    if (watchedChannels.length === 0) return [];
    return collect(watchedChannels.slice(0, 10).map(fetchChannel));
  },
};

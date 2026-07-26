import { collect, fetchJson, truncate } from './util';
import type { Connector, RawMention } from './types';
import { cfg } from '@/lib/connector-config';

// Discord non offre ricerca pubblica cross-server: si legge SOLO un server
// che l'utente amministra, con un bot ufficiale — stesso principio "owned"
// già usato per Facebook/LinkedIn, non ascolto di terzi. Il bot va invitato
// nel server coi permessi per leggere i canali configurati, e nel Developer
// Portal va abilitato il "Message Content Intent": senza, l'API restituisce
// i messaggi con testo vuoto.
//
// NON verificato dal vivo — servirebbe un vero bot registrato e un server
// reale, non riproducibile in questo ambiente. La forma dell'API è quella
// documentata e stabile da anni (v10), ma va confermata al primo uso reale:
// stesso principio già applicato a Google Places.
//
// Nessun filtro per parola chiave qui: come Telegram, si leggono i messaggi
// recenti dei canali configurati e ci pensa il filtro booleano centrale
// dell'ingest a tenere solo quelli pertinenti.

type DcAuthor = { id: string; username: string; global_name?: string | null; bot?: boolean };
type DcReaction = { count: number };
type DcMessage = {
  id: string; content: string; timestamp: string; author: DcAuthor;
  reactions?: DcReaction[];
};
type DcChannel = { id: string; guild_id?: string; name?: string };

async function fetchChannel(channelId: string, token: string): Promise<RawMention[]> {
  const headers = { authorization: `Bot ${token}` };
  const [channel, messages] = await Promise.all([
    fetchJson<DcChannel>(`https://discord.com/api/v10/channels/${channelId}`, { headers }),
    fetchJson<DcMessage[]>(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, { headers }),
  ]);
  return messages
    .filter((m) => !m.author?.bot && m.content?.trim())
    .map((m) => {
      const likes = (m.reactions ?? []).reduce((s, r) => s + r.count, 0);
      return {
        source: 'discord',
        externalId: m.id,
        url: channel.guild_id ? `https://discord.com/channels/${channel.guild_id}/${channelId}/${m.id}` : undefined,
        content: truncate(m.content, 1500),
        author: m.author.global_name || m.author.username,
        community: channel.name ? `#${channel.name}` : channelId,
        publishedAt: new Date(m.timestamp),
        engagement: { likes },
      } satisfies RawMention;
    });
}

export const discord: Connector = {
  id: 'discord',
  label: 'Discord',
  tier: 'freekey',
  enabled: () => Boolean(cfg('DISCORD_BOT_TOKEN') && cfg('DISCORD_CHANNEL_IDS')),
  disabledReason: 'Requires a Discord bot token (invited to your server, with the Message Content Intent enabled) and the channel IDs to read: enter them here',
  async fetchMentions() {
    const token = cfg('DISCORD_BOT_TOKEN');
    const ids = (cfg('DISCORD_CHANNEL_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (!token || ids.length === 0) return [];
    return collect(ids.map((id) => fetchChannel(id, token)));
  },
};

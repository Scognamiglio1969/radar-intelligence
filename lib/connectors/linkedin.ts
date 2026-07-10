import type { Connector, RawMention } from './types';
import { truncate } from './util';
import { cfg } from '@/lib/connector-config';

// LinkedIn Community Management API: post della propria pagina aziendale
// (LinkedIn non offre ricerca pubblica dei post di terzi).
// Si attiva con LINKEDIN_ACCESS_TOKEN + LINKEDIN_ORG_ID nelle env var.

type LiPost = {
  id: string; commentary?: string; publishedAt?: number;
};

export const linkedin: Connector = {
  id: 'linkedin',
  label: 'LinkedIn',
  tier: 'premium',
  enabled: () => Boolean(cfg('LINKEDIN_ACCESS_TOKEN') && cfg('LINKEDIN_ORG_ID')),
  disabledReason: 'Requires LinkedIn Access Token and Organization ID (Community Management API): enter them here',
  async fetchMentions() {
    const orgId = cfg('LINKEDIN_ORG_ID')!;
    const author = encodeURIComponent(`urn:li:organization:${orgId}`);
    const res = await fetch(
      `https://api.linkedin.com/rest/posts?author=${author}&q=author&count=30&sortBy=LAST_MODIFIED`,
      {
        headers: {
          Authorization: `Bearer ${cfg('LINKEDIN_ACCESS_TOKEN')}`,
          'LinkedIn-Version': '202409',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) throw new Error(`LinkedIn: HTTP ${res.status}`);
    const data = await res.json() as { elements?: LiPost[] };
    return (data.elements ?? []).map((p) => ({
      source: 'linkedin',
      externalId: p.id,
      url: `https://www.linkedin.com/feed/update/${p.id}`,
      content: truncate(p.commentary ?? '', 1200),
      community: 'pagina aziendale',
      publishedAt: p.publishedAt ? new Date(p.publishedAt) : new Date(),
    } satisfies RawMention)).filter((m) => m.content);
  },
};

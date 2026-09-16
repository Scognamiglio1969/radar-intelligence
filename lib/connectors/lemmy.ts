import type { Connector, RawMention } from './types';
import { collect, excerptAround, fetchJson, stripHtml, truncate } from './util';

// ---------------------------------------------------------------------------
// Lemmy — le discussioni del fediverso, nel formato di Reddit.
//
// Nessuna chiave: la ricerca è pubblica. Si interroga un'istanza grande
// (lemmy.world) che vede i contenuti federati di tutte le altre, quindi un
// post nato su aussie.zone o feddit.it arriva lo stesso.
//
// La ricerca del server è larga: su "Claude" restituisce anche nomi propri e
// parole simili. Come per arXiv, ogni risultato si ricontrolla qui per una
// corrispondenza LETTERALE nel titolo o nel testo — meglio perdere un post
// che riempire l'archivio di cose che non c'entrano.
// ---------------------------------------------------------------------------

const INSTANCE = 'https://lemmy.world';

type Person = { name: string; display_name?: string; actor_id?: string };
type Community = { name: string; title?: string; actor_id?: string };
type PostView = {
  post: {
    id: number; name: string; body?: string; url?: string; ap_id: string;
    published: string; embed_description?: string; removed?: boolean; deleted?: boolean; nsfw?: boolean;
  };
  creator: Person;
  community: Community;
  counts?: { comments?: number; score?: number; upvotes?: number };
};
type CommentView = {
  comment: { id: number; content: string; ap_id: string; published: string; removed?: boolean; deleted?: boolean };
  creator: Person;
  community: Community;
  post: { name: string; url?: string };
  counts?: { score?: number; upvotes?: number; child_count?: number };
};

/** "https://aussie.zone/c/brisbane" → "brisbane@aussie.zone": il nome con cui la si cerca. */
function communityName(c: Community): string {
  try {
    return `${c.name}@${new URL(c.actor_id ?? '').host}`;
  } catch {
    return c.name;
  }
}

function handle(p: Person): string {
  try {
    return `@${p.name}@${new URL(p.actor_id ?? '').host}`;
  } catch {
    return p.name;
  }
}

/** Il markdown di Lemmy ridotto a testo: via immagini, link lasciati come parole. */
export function lemmyText(md: string): string {
  return stripHtml(md
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]+/g, ' '));
}

export function literalMatch(term: string, text: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

async function search(term: string): Promise<RawMention[]> {
  const base = `${INSTANCE}/api/v3/search?q=${encodeURIComponent(term)}&sort=New&listing_type=All&limit=30`;
  const [posts, comments] = await Promise.all([
    fetchJson<{ posts?: PostView[] }>(`${base}&type_=Posts`),
    fetchJson<{ comments?: CommentView[] }>(`${base}&type_=Comments`),
  ]);

  const out: RawMention[] = [];
  for (const p of posts.posts ?? []) {
    if (p.post.removed || p.post.deleted || p.post.nsfw) continue;
    const body = lemmyText(p.post.body ?? p.post.embed_description ?? '');
    if (!literalMatch(term, `${p.post.name} ${body}`)) continue;
    out.push({
      source: 'lemmy',
      externalId: `post-${p.post.ap_id}`,
      // Il permalink della discussione, non il link che condivide: chi apre
      // la menzione vuole vedere la conversazione.
      url: p.post.ap_id,
      title: truncate(p.post.name, 300),
      content: excerptAround(body || p.post.name, term, 1200),
      author: p.creator.display_name || p.creator.name,
      authorHandle: handle(p.creator),
      community: communityName(p.community),
      publishedAt: new Date(p.post.published),
      engagement: { likes: p.counts?.upvotes ?? p.counts?.score ?? 0, comments: p.counts?.comments ?? 0 },
    });
  }
  for (const c of comments.comments ?? []) {
    if (c.comment.removed || c.comment.deleted) continue;
    const body = lemmyText(c.comment.content);
    if (!literalMatch(term, body)) continue;
    out.push({
      source: 'lemmy',
      externalId: `comment-${c.comment.ap_id}`,
      url: c.comment.ap_id,
      title: truncate(`Re: ${c.post.name}`, 300),
      content: excerptAround(body, term, 1200),
      author: c.creator.display_name || c.creator.name,
      authorHandle: handle(c.creator),
      community: communityName(c.community),
      publishedAt: new Date(c.comment.published),
      engagement: { likes: c.counts?.upvotes ?? c.counts?.score ?? 0, comments: c.counts?.child_count ?? 0 },
    });
  }
  return out;
}

export const lemmy: Connector = {
  id: 'lemmy',
  label: 'Lemmy',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    return collect(q.anyTerms.slice(0, 4).map(search));
  },
};

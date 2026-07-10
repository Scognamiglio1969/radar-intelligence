import type { Connector, RawMention } from './types';
import { fetchJson, truncate } from './util';
import { cfg } from '@/lib/connector-config';

type SearchItem = {
  id: { videoId?: string };
  snippet: {
    title: string; description: string; channelTitle: string;
    publishedAt: string; defaultAudioLanguage?: string;
  };
};
type VideoStats = { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } };

export const youtube: Connector = {
  id: 'youtube',
  label: 'YouTube',
  tier: 'freekey',
  enabled: () => Boolean(cfg('YOUTUBE_API_KEY')),
  disabledReason: 'Requires a YouTube API key (free from Google Cloud Console): enter it here',
  async fetchMentions(q) {
    const key = cfg('YOUTUBE_API_KEY')!;
    const out: RawMention[] = [];
    // La quota gratuita (10.000 unità/giorno) si consuma in fretta con search
    // (100 unità a chiamata): limitiamo a 2 keyword per esecuzione.
    for (const kw of q.anyTerms.slice(0, 2)) {
      const search = await fetchJson<{ items?: SearchItem[] }>(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=25&q=${encodeURIComponent(kw)}&key=${key}`,
      );
      const items = (search.items ?? []).filter((i) => i.id.videoId);
      if (items.length === 0) continue;
      const ids = items.map((i) => i.id.videoId).join(',');
      const stats = await fetchJson<{ items?: VideoStats[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${key}`,
      );
      const statMap = new Map((stats.items ?? []).map((v) => [v.id, v.statistics]));
      for (const it of items) {
        const s = statMap.get(it.id.videoId!) ?? {};
        out.push({
          source: 'youtube',
          externalId: it.id.videoId!,
          url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
          title: it.snippet.title,
          content: truncate(it.snippet.description || it.snippet.title, 1000),
          author: it.snippet.channelTitle,
          community: it.snippet.channelTitle,
          publishedAt: new Date(it.snippet.publishedAt),
          language: it.snippet.defaultAudioLanguage?.slice(0, 2),
          engagement: {
            likes: Number(s.likeCount ?? 0),
            comments: Number(s.commentCount ?? 0),
            views: Number(s.viewCount ?? 0),
          },
          reach: Number(s.viewCount ?? 0),
        });
      }
    }
    return out;
  },
};

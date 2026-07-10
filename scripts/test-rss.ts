import { rss, setRssFeeds } from '../lib/connectors/rss';

async function main() {
  setRssFeeds(['https://www.ansa.it/sito/ansait_rss.xml', 'https://feeds.bbci.co.uk/news/technology/rss.xml']);
  const q = { anyTerms: [], allTerms: [], excludeTerms: [], languages: [], countries: [] };
  const items = await rss.fetchMentions(q);
  console.log(`${items.length} articoli da 2 feed`);
  for (const it of items.slice(0, 3)) {
    console.log(`- [${it.community}] ${it.title?.slice(0, 70)} → ${it.url?.slice(0, 50)}`);
  }
}
main();

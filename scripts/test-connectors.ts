import { CONNECTORS } from '../lib/connectors';

const q = {
  anyTerms: ['intelligenza artificiale', 'artificial intelligence'],
  allTerms: [],
  excludeTerms: [],
  languages: ['it', 'en'],
  countries: [],
};

async function main() {
  for (const c of CONNECTORS) {
    if (!c.enabled()) {
      console.log(`⏭  ${c.id}: disattivato (${c.disabledReason})`);
      continue;
    }
    const t0 = Date.now();
    try {
      const mentions = await c.fetchMentions(q);
      const sample = mentions[0];
      console.log(`✅ ${c.id}: ${mentions.length} mention in ${Date.now() - t0}ms`);
      if (sample) {
        console.log(`   es: [${sample.publishedAt.toISOString().slice(0, 16)}] ${(sample.title ?? sample.content).slice(0, 90)}`);
      }
    } catch (e) {
      console.log(`❌ ${c.id}: ${(e as Error).message}`);
    }
  }
}

main();

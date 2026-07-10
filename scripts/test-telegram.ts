import { telegram, setTelegramChannels } from '../lib/connectors/telegram';

async function main() {
  setTelegramChannels(['@durov', 'telegram']);
  const q = { anyTerms: [], allTerms: [], excludeTerms: [], languages: [], countries: [] };
  const mentions = await telegram.fetchMentions(q);
  console.log(`${mentions.length} messaggi`);
  if (mentions[0]) {
    console.log('es:', mentions[0].community, '|', mentions[0].content.slice(0, 80), '| views:', mentions[0].engagement?.views);
  }
}
main();

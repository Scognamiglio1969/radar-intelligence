import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { detectAlerts, getRecentAlerts } from '../lib/alerts';

async function main() {
  const db = await getDb();
  // Ripulisce gli alert delle ultime 24h per far riscattare il rilevamento
  await db.execute(sql`DELETE FROM alerts WHERE created_at >= now() - interval '24 hours'`);
  const created = await detectAlerts(1);
  console.log(`Alert creati: ${created}`);
  const rows = await getRecentAlerts(1, 3);
  for (const a of rows) {
    const d = (a.data ?? {}) as Record<string, unknown>;
    console.log('\n---', a.type, `(${a.severity})`);
    console.log('msg:', a.message);
    console.log('spiegazione:', d.explanation ?? '(nessuna)');
    console.log('temi:', JSON.stringify(d.topics));
    console.log('fonti:', JSON.stringify(d.bySource));
    console.log('contenuti chiave:', JSON.stringify(d.keyMentions, null, 2));
  }
}
main();

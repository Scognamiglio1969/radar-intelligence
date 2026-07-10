// Notifiche push via bot Telegram — pensate per NON essere invadenti:
// - alert: un solo messaggio per giro di pipeline (e gli alert stessi sono
//   già deduplicati: mai due dello stesso tipo entro 24h)
// - daily digest: un messaggio al giorno, corto, quando esce il brief
// Nessun altro evento genera notifiche.

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: text.slice(0, 4000),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          // Digest giornaliero e note informative arrivano SENZA suono;
          // il suono è riservato agli alert (vedi notifyAlerts)
          disable_notification: true,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function sendWithSound(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: text.slice(0, 4000),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

const appUrl = () => process.env.APP_URL ?? '';

/** Un messaggio per gli alert appena creati. Suono solo se severità alta. */
export async function notifyAlerts(projectName: string, items: { message: string; severity: string }[]) {
  if (items.length === 0) return;
  const lines = items.map((a) => `${a.severity === 'alta' ? '🔴' : '🟠'} ${a.message}`).join('\n');
  const text = `<b>⚠️ ${projectName}</b>\n${lines}${appUrl() ? `\n\n<a href="${appUrl()}/alerts">Apri gli alert →</a>` : ''}`;
  const loud = items.some((a) => a.severity === 'alta');
  await (loud ? sendWithSound(text) : sendTelegram(text));
}

/** Digest mattutino, silenzioso: una riga di numeri + link al brief. */
export async function notifyDailyDigest(projectName: string, stats: {
  mentions24h: number; sentiment: string; topTrend?: string;
}) {
  const trend = stats.topTrend ? ` · trend: <i>${stats.topTrend}</i>` : '';
  await sendTelegram(
    `☀️ <b>${projectName}</b> — brief di oggi pronto\n${stats.mentions24h} mention nelle ultime 24h · sentiment ${stats.sentiment}${trend}${appUrl() ? `\n<a href="${appUrl()}/brief">Leggi il brief →</a>` : ''}`,
  );
}

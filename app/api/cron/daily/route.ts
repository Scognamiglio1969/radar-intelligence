import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Cron giornaliero Vercel: pipeline completa + digest Telegram del mattino.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  }
  try {
    const result = await runPipeline({ full: true, digest: true });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Cron giornaliero fallito:', e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}

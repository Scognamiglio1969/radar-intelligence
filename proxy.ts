import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// Protezione dell'intera app: richiede una sessione utente valida.
// Esclusi: landing, login, /api/auth, cron (protetto da CRON_SECRET), report condivisi.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/landing') || pathname.startsWith('/login')
    || pathname.startsWith('/api/auth') || pathname.startsWith('/api/cron/')
    || pathname.startsWith('/share/')) {
    return NextResponse.next();
  }
  // Verifica la firma del cookie di sessione (senza toccare il DB)
  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value) !== null) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  // Home senza login → presentazione del prodotto; pagine interne → accesso.
  url.pathname = pathname === '/' ? '/landing' : '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)).*)'],
};

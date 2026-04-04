import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const setupUrl = new URL('/api/v1/system/bootstrap-status', req.url);
  try {
    const res = await fetch(setupUrl, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.next();
    }
    const payload = await res.json();
    const setupRequired = Boolean(payload.setup_required);

    if (setupRequired && pathname !== '/setup') {
      return NextResponse.redirect(new URL('/setup', req.url));
    }

    if (!setupRequired && pathname === '/setup') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!favicon.ico).*)']
};

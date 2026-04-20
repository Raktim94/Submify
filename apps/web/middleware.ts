import { NextRequest, NextResponse } from 'next/server';

/** Next.js edge middleware (must be named `middleware` in `middleware.ts` at the app root). */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  if (pathname === '/setup') {
    return NextResponse.redirect(new URL('/register', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!favicon.ico).*)']
};

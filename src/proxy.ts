/**
 * Lemniscate — Next.js Proxy (formerly Middleware)
 * ----------------------------------------------------------------------------
 * Minimal pass-through proxy. No authentication is required at the edge
 * layer — this is a single-tenant, self-hosted application protected by the
 * LEMNISCATE_API_KEY check in individual API route handlers.
 *
 * The matcher intentionally excludes static assets and image optimization
 * routes to keep Next.js infrastructure fast.
 *
 * Note: Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
 * and the `middleware()` export to `proxy()`. See:
 * https://nextjs.org/docs/messages/middleware-to-proxy
 */
import { type NextRequest, NextResponse } from 'next/server'

export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
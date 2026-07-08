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

export function proxy(request: NextRequest) {
  // Generate cryptographically secure base64 nonce (16 characters)
  const nonce = btoa(crypto.randomUUID()).slice(0, 16)
  const isProd = process.env.NODE_ENV === 'production'

  // Configure script-src: strict in production (nonce only), relaxed in dev for HMR
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}'`
    : `'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}'`

  const styleSrc = `'self' 'unsafe-inline'` // Tailwind and UI components require inline styles

  // Production permits only encrypted WebSocket (wss:); dev allows plain ws: for local HMR
  const connectSrc = isProd
    ? `'self' wss:`
    : `'self' ws: wss:`

  const cspHeader = `default-src 'self'; script-src ${scriptSrc}; style-src ${styleSrc}; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connectSrc}; object-src 'none'; base-uri 'self'; frame-ancestors 'none';`

  // Pass nonce to request headers so Server Components can read it
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Set the CSP header on the response
  response.headers.set('Content-Security-Policy', cspHeader)

  return response
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
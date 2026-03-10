import type { Request, Response, NextFunction } from 'express';

/**
 * Basic security headers.
 * CSP is intentionally strict-but-compatible for API responses.
 * For static frontend hosting, enforce CSP at CDN/reverse-proxy layer.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
    next();
}

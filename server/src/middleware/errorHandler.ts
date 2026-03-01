/**
 * errorHandler.ts — Centralized Express error handling middleware
 */

import type { Request, Response, NextFunction } from 'express';

// Express requires 4-parameter signature for error handlers
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction,
): void {
    console.error('[Server] Unhandled error:', err.message);

    if (err.message.includes('not allowed by CORS') || err.message.includes('CORS')) {
        res.status(403).json({ error: 'Not allowed by CORS' });
        return;
    }

    res.status(500).json({ error: 'Internal server error' });
}

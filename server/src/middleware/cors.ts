/**
 * cors.ts — CORS middleware extracted from the original proxy.ts
 */

import cors from 'cors';
import { config } from '../config.js';

export const corsMiddleware = cors({
    origin(origin, cb) {
        // Allow requests with no origin (curl, server-to-server)
        if (!origin || config.allowedOrigins.includes(origin)) {
            cb(null, true);
        } else {
            cb(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
});

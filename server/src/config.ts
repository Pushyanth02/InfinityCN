/**
 * config.ts — Centralized server configuration from environment variables
 */

function validateUrl(url: string, name: string): string {
    try {
        const parsed = new URL(url);
        // Block internal/metadata IPs for SSRF protection
        const hostname = parsed.hostname;
        if (
            hostname === '169.254.169.254' || // Cloud metadata
            hostname === '0.0.0.0' || // Bind-all
            hostname === '::1' || // IPv6 loopback
            hostname === '[::]' || // IPv6 bind-all
            hostname.startsWith('10.') || // RFC1918
            hostname.startsWith('192.168.') || // RFC1918
            hostname.startsWith('fd') || // IPv6 ULA (fdxx:)
            hostname.startsWith('fe80') || // IPv6 link-local
            /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) // RFC1918
        ) {
            console.warn(`[Config] ${name} points to internal IP "${hostname}", using default`);
            return '';
        }
        return url;
    } catch {
        console.warn(`[Config] Invalid URL for ${name}: "${url}"`);
        return '';
    }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.floor(n);
}

export const config = {
    // Server
    port: parsePositiveInt(process.env.PORT, 3001),
    nodeEnv: process.env.NODE_ENV || 'development',

    // CORS
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean),

    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'icn:',
    cacheTtlSeconds: parsePositiveInt(process.env.CACHE_TTL_SECONDS, 1800),

    // RabbitMQ
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://infinitycn:infinitycn_dev@localhost:5672',
    workerConcurrency: parsePositiveInt(process.env.WORKER_CONCURRENCY, 1),

    // Rate limiting
    rateWindowMs: parsePositiveInt(process.env.RATE_WINDOW_MS, 60_000),
    rateMaxRequests: parsePositiveInt(process.env.RATE_MAX_REQUESTS, 30),

    // AI Provider keys
    geminiKey: process.env.GEMINI_API_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || '',
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    groqKey: process.env.GROQ_API_KEY || '',
    deepseekKey: process.env.DEEPSEEK_API_KEY || '',
    ollamaUrl:
        validateUrl(
            (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
            'OLLAMA_URL',
        ) || 'http://localhost:11434',

    // Max output tokens cap (prevents cost abuse)
    maxTokensCap: parsePositiveInt(process.env.MAX_TOKENS_CAP, 2048),
} as const;

export type Config = typeof config;

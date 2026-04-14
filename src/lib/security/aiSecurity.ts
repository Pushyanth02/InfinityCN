/**
 * ai/security.ts — AI request security helpers
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function normalizeApiKey(value?: string): string {
    return (value ?? '').trim();
}

function isPrivateIp(hostname: string): boolean {
    return (
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
}

function isLocalAddress(hostname: string): boolean {
    return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || isPrivateIp(hostname);
}

export function assertSecureEndpoint(
    rawUrl: string,
    label: string,
    options: { allowHttpLocalhost?: boolean } = {},
): void {
    const allowHttpLocalhost = options.allowHttpLocalhost ?? false;
    const url = new URL(rawUrl, window.location.origin);

    if (url.protocol === 'https:') return;

    if (url.protocol === 'http:' && allowHttpLocalhost && isLocalAddress(url.hostname)) {
        return;
    }

    throw new Error(`${label} must use HTTPS. Received: ${url.protocol}//${url.host}`);
}

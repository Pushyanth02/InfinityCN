# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 15.x    | :white_check_mark: |
| < 15.0  | :x:                |

## Security Features

### API Key Encryption (v15.0.0+)
API keys entered in the AI Settings panel are encrypted before storage:
- **Algorithm**: AES-256-GCM via Web Crypto API (SubtleCrypto)
- **Key Derivation**: PBKDF2 with 100,000 iterations and SHA-256
- **IV**: Random 12-byte IV generated per encryption
- **Device Binding**: Keys are derived from browser fingerprint, making encrypted data opaque on other devices

### File Upload Limits
- Maximum file size: **50 MB**
- Supported formats: PDF, EPUB, DOCX, PPTX, TXT
- Legacy formats (.doc, .ppt, .xls) are rejected with helpful error messages

### Backend Proxy (Recommended for Production)
For production deployments, use the optional backend proxy (`server/proxy.ts`) to:
- Keep API keys server-side (never exposed to browser)
- Enable per-IP rate limiting (30 req/min default)
- Restrict CORS origins
- Cap max output tokens to prevent cost abuse

### Content Security
- All AI provider requests support routing through the proxy
- No external scripts loaded at runtime (except optional Vercel Analytics)
- PWA service worker only caches same-origin assets

## Reporting a Vulnerability

Please report security vulnerabilities by opening a private issue or contacting the maintainers directly.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within 48 hours and provide a fix within 7 days for critical issues.

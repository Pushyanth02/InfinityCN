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

### Client-Side Security

| Area | Implementation |
|------|----------------|
| **API Keys** | AES-GCM encrypted in localStorage with device-derived key |
| **XSS Prevention** | React's built-in escaping. No use of `dangerouslySetInnerHTML` |
| **Input Validation** | File size limits (50MB), file type checking |
| **Data Storage** | IndexedDB for offline data. All data stays on-device |

### Backend Proxy (Recommended for Production)

When using the optional API proxy (`server/proxy.ts`):

| Area | Implementation |
|------|----------------|
| **Rate Limiting** | 30 requests/minute per IP (sliding window) |
| **CORS** | Configurable origin whitelist |
| **Token Capping** | Maximum 2048 output tokens to prevent cost abuse |
| **Request Validation** | JSON body type checking |

### Third-Party Dependencies

We regularly audit dependencies using `npm audit`. Current status:
- Run `npm audit` to check for vulnerabilities
- Run `npm audit fix` to automatically resolve fixable issues

## Reporting a Vulnerability

If you discover a security vulnerability in InfinityCN, please report it responsibly:

### How to Report

1. **GitHub:** Use the "Security" tab → "Report a vulnerability"
2. **Private Issue:** Open a private issue on the repository

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgment | Within 48 hours |
| Initial Assessment | Within 1 week |
| Fix Development | Varies by severity |
| Public Disclosure | After fix is released |

### Severity Levels

| Level | Response Time | Examples |
|-------|--------------|----------|
| **Critical** | 24-48 hours | Remote code execution, data breach |
| **High** | 1 week | Authentication bypass, XSS |
| **Medium** | 2 weeks | Information disclosure |
| **Low** | Next release | Minor issues |

## Security Best Practices for Users

### API Keys

- Never share your API keys publicly
- Use environment variables for production deployments
- Consider using the server proxy for shared deployments
- Rotate keys periodically

### Deployment

- Always use HTTPS in production
- Configure proper CORS origins
- Keep dependencies updated
- Enable Content Security Policy headers

### Data Privacy

- InfinityCN stores all data locally by default
- No data is transmitted to external servers (except AI API calls)
- Processed text stays in browser IndexedDB
- Clear browser data to remove all stored content

## Changelog

- **v15.0.0** (February 2026): AES-GCM API key encryption, updated security documentation

# Security Policy

## Supported Versions

The following versions of InfinityCN are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 15.x    | :white_check_mark: |
| 14.x    | :white_check_mark: |
| < 14.0  | :x:                |

## Security Architecture

### Client-Side Security

InfinityCN is primarily a client-side application with the following security considerations:

| Area | Implementation |
|------|----------------|
| **API Keys** | Stored in browser localStorage. Users are responsible for key security. |
| **XSS Prevention** | React's built-in escaping. No use of `dangerouslySetInnerHTML`. |
| **Input Validation** | File size limits (50MB), file type checking. |
| **Data Storage** | IndexedDB for offline data. All data stays on-device. |

### Optional Server Proxy Security

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

1. **Email:** Open a private security advisory on GitHub
2. **GitHub:** Use the "Security" tab → "Report a vulnerability"

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

- **v15.0.0** (February 2026): Updated security documentation
- **v14.0.0**: Added rate limiting to server proxy
- **v13.0.0**: Added CORS origin validation

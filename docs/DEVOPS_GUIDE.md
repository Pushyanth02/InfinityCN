# DevOps & Deployment Guide

## CI/CD Pipeline

### Current Configuration

The project uses GitHub Actions for continuous integration:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-test-build:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Setup Node 20
      - npm ci (with cache)
      - Format check (prettier)
      - Lint (eslint)
      - Type check (tsc)
      - Tests (vitest)
      - Build (vite)
      - Upload artifact (main branch only)
```

### Pipeline Stages

| Stage | Command | Purpose | Duration |
|-------|---------|---------|----------|
| Install | `npm ci` | Reproducible dependency install | ~15s |
| Format | `npm run format:check` | Code style validation | ~3s |
| Lint | `npm run lint` | Code quality checks | ~5s |
| Type Check | `npx tsc -b --noEmit` | TypeScript validation | ~8s |
| Test | `npm test` | Unit tests (51 tests) | ~2s |
| Build | `npm run build` | Production bundle | ~4s |

**Total pipeline time:** ~40-50 seconds

---

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+

### Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test                  # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# Code quality
npm run lint              # ESLint
npm run format            # Prettier (write)
npm run format:check      # Prettier (check only)

# Build
npm run build             # Production build
npm run preview           # Preview production build
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_MANGADEX_CLIENT_ID` | No | Built-in | MangaDex API client ID |
| `VITE_API_PROXY_URL` | No | None | API proxy server URL |

---

## Production Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure build settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm ci`
3. Deploy

Environment variables for production:
```
VITE_API_PROXY_URL=https://your-proxy.vercel.app
```

### Static Hosting (Netlify, GitHub Pages)

Build the production bundle:
```bash
npm run build
```

Deploy the `dist/` directory. Configure:
- SPA routing: All routes → `index.html`
- Cache headers: Static assets can be cached indefinitely (fingerprinted)

### Docker (Self-Hosted)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

```nginx
# nginx.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    
    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## API Proxy Server

For production deployments with shared API keys:

### Setup

```bash
# Install dependencies (proxy uses express)
npm install express cors

# Set environment variables
export PORT=3001
export ALLOWED_ORIGINS=https://your-app.vercel.app
export GEMINI_API_KEY=your-key
export OPENAI_API_KEY=your-key

# Start proxy
npx tsx server/proxy.ts
```

### Vercel Serverless Deployment

Convert `server/proxy.ts` to serverless function:

```typescript
// api/ai/[provider].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { provider } = req.query;
  // ... proxy logic
}
```

---

## Monitoring & Observability

### Built-in Analytics

Vercel Analytics is pre-configured:
```tsx
<Analytics />
<SpeedInsights />
```

### Performance Monitoring

Add Web Vitals tracking:
```typescript
// main.tsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics(metric: any) {
  console.log(metric);
  // Send to your analytics service
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

### Error Tracking

Integrate Sentry (optional):
```bash
npm install @sentry/react
```

```typescript
// main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: import.meta.env.MODE,
});
```

---

## Security Checklist

### Pre-Deployment

- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Ensure no API keys in code/commits
- [ ] Review CORS configuration
- [ ] Enable HTTPS

### Post-Deployment

- [ ] Verify CSP headers
- [ ] Test rate limiting
- [ ] Monitor error rates
- [ ] Set up alerts

### Recommended Headers

```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.groq.com https://api.deepseek.com;" always;
```

---

## Rollback Procedures

### Vercel

1. Go to Deployments
2. Find previous stable deployment
3. Click "..." → "Promote to Production"

### Manual Rollback

```bash
# Find previous working commit
git log --oneline

# Revert to specific commit
git revert HEAD~N  # Where N is number of commits back

# Or reset (if force push allowed)
git reset --hard <commit-sha>
git push --force
```

---

## Scaling Considerations

### Client-Side (Current)

The app is fully client-side and scales infinitely:
- Static assets served from CDN
- No server-side compute
- IndexedDB per-user storage

### With API Proxy

For the optional proxy server:
- Use serverless functions (Vercel, AWS Lambda)
- Rate limiting is per-IP, suitable for moderate traffic
- For high traffic, consider Redis for distributed rate limiting

### Database (Future)

If adding a backend database:
- Consider PlanetScale (MySQL) or Supabase (Postgres)
- Implement connection pooling
- Use read replicas for scalability

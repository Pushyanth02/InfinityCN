# DevOps Steering

<!--
  STATUS: ASPIRATIONAL DESIGN GUIDANCE — NOT the implemented stack.
  This file describes a target Postgres/Redis/Nginx topology. The repository as
  shipped uses a deliberately simpler stack. Treat this as future-direction
  guidance, never as ground truth. For what is actually deployed, read:
    - CLAUDE.md              (authoritative, the "Gotchas" section in particular)
    - docs/ARCHITECTURE.md   (authoritative deep-dive)
    - docker-compose.yml     (the real topology: app + worker + caddy + db-data)
  Implemented stack: Next.js (standalone) + embedded poller or standalone worker,
  SQLite (file) as both app DB and the job queue, local-filesystem storage,
  Caddy reverse proxy. No Postgres, no Redis (see note on REDIS_URL below), no
  managed object storage, no Nginx.
-->

> ⚠️ **This is aspirational guidance, not the implemented stack.**
> The sections below describe a future Postgres/Redis/Nginx topology. The
> production codebase today ships with **SQLite + SQLite-queue + Caddy** and
> filesystem storage. Read `CLAUDE.md` and `docs/ARCHITECTURE.md` for what is
> actually deployed. The bullet lists below that name PostgreSQL/Redis/object
> storage/Nginx are **targets**, not current facts.

## Philosophy

Infrastructure must be reproducible, observable, and recoverable.

Every deployment should be automated, repeatable, and reversible.

---

## Environment Architecture

### Local Development

- Docker Compose for all services.
- Hot reloading for frontend and backend.
- Local SQLite (file) as both app DB and job queue, local-filesystem storage.
  *(Aspirational target: PostgreSQL + Redis + object storage — not yet wired.)*
- Seed scripts for development data.

### Staging

- Mirror production topology.
- Use production-like data volumes.
- Validate deployments before production promotion.

### Production (aspirational target — NOT what ships today)

- Containerized services.
- Reverse proxy (Nginx/Caddy) for TLS and routing.
- Managed or self-hosted PostgreSQL.
- Redis for queue and caching.
- Persistent object storage for documents.

> Implemented today (see `docker-compose.yml`): `app` (Next.js standalone) +
> `worker` (optional; embedded poller is the default) + `caddy`, sharing a
> `db-data` volume. Database and queue are a single SQLite file; storage is the
> local filesystem. The items above are the target if/when the project outgrows
> SQLite.

---

## Docker

- Use multi-stage builds to minimize image size.
- Pin base image versions.
- Never run containers as root.
- Use health checks in all service containers.
- Keep Dockerfiles near the service they build.
- Use .dockerignore to exclude unnecessary files.

---

## Environment Variables

Required variables must be documented.

Use `.env.example` as the reference template.

Never commit `.env` files.

Validate environment variables at startup; fail fast on missing required values.

Group variables by concern:

- Database
- Redis
- Storage
- Auth
- Feature flags
- Worker configuration

---

## Health Checks

Every service must expose a health endpoint.

Health checks must verify:

- service is running
- database is reachable
- storage is accessible
- (Redis is reachable — **only when `REDIS_URL` is configured**; Redis rate-limiting is opt-in, not a required service)

Return structured JSON with component status.

---

## Logging

Use structured logging (JSON).

Include:

- timestamp
- log level
- service name
- request ID (when applicable)
- relevant context

Log levels:

- ERROR: failures requiring attention
- WARN: degraded but recoverable conditions
- INFO: significant state changes
- DEBUG: diagnostic detail (disabled in production)

Never log secrets, tokens, or sensitive document content.

---

## Monitoring

Track:

- request latency
- error rates
- queue depth
- worker throughput
- database connection pool usage
- storage usage

Set alerts for anomalous values.

---

## CI/CD Pipeline

### On Pull Request

- Lint
- Type check
- Unit tests
- Integration tests
- Build verification

### On Merge to Main

- Full test suite
- Build production images
- Push to container registry
- Deploy to staging
- Run smoke tests

### Production Deployment

- Manual promotion from staging
- Blue-green or rolling deployment
- Automatic rollback on health check failure

---

## Backup and Recovery

- Automated daily database backups.
- Document storage replication or backup.
- Test recovery procedures regularly.
- Document recovery runbook.

---

## Secrets Management

- Use environment variables or a secrets manager.
- Rotate secrets on a defined schedule.
- Never store secrets in source control.
- Audit secret access.

---

## Scaling

> Aspirational — the shipped single-process stack does not horizontally scale yet.

- Frontend: stateless, horizontally scalable.
- API: stateless, horizontally scalable behind load balancer.
- Workers: scale independently based on queue depth.
  *(Today there is one embedded poller or one standalone worker; multi-worker
  coordination would require the reserved, currently-unimplemented `REDIS_URL`
  queue backend — see the REDIS_URL note above.)*
- Database: vertical scaling first, read replicas when needed.
- Redis: sentinel or cluster for high availability.

---

## Incident Response

- Define severity levels.
- Maintain an on-call rotation.
- Document runbooks for common failures.
- Conduct blameless post-mortems.
- Track incidents and resolutions.

---

## Service Dependencies

Startup order:

1. PostgreSQL
2. Redis
3. Object Storage
4. API
5. Workers
6. Frontend
7. Reverse Proxy

Use health check dependencies in Docker Compose to enforce order.

---

## Resource Limits

Set memory and CPU limits for all containers.

Prevent a single service from consuming all host resources.

Monitor and adjust based on usage patterns.

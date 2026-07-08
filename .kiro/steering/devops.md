# DevOps Steering

## Philosophy

Infrastructure must be reproducible, observable, and recoverable.

Every deployment should be automated, repeatable, and reversible.

---

## Environment Architecture

### Local Development

- Docker Compose for all services.
- Hot reloading for frontend and backend.
- Local PostgreSQL, Redis, and object storage.
- Seed scripts for development data.

### Staging

- Mirror production topology.
- Use production-like data volumes.
- Validate deployments before production promotion.

### Production

- Containerized services.
- Reverse proxy (Nginx/Caddy) for TLS and routing.
- Managed or self-hosted PostgreSQL.
- Redis for queue and caching.
- Persistent object storage for documents.

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
- Redis is reachable
- storage is accessible

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

- Frontend: stateless, horizontally scalable.
- API: stateless, horizontally scalable behind load balancer.
- Workers: scale independently based on queue depth.
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

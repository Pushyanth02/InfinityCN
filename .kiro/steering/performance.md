# Performance Steering

## Philosophy

Performance is a feature, not an afterthought.

Optimize for perceived speed and real throughput.

Measure before optimizing. Never optimize without evidence.

---

## Performance Budgets

### Frontend

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.5s
- Total bundle size (gzipped): < 200KB initial load
- Per-route chunk: < 50KB gzipped

### API

- P50 response time: < 100ms
- P95 response time: < 500ms
- P99 response time: < 1s
- Upload endpoint: handle files up to 50MB without timeout

### Workers

- Job start latency (queue → execution): < 2s
- Small document processing (< 50 pages): < 30s
- Large document processing (500+ pages): < 5 minutes
- Worker idle memory: < 256MB
- Worker peak memory per job: < 1GB

---

## Database Performance

### Indexing

- Index all columns used in WHERE, JOIN, and ORDER BY clauses.
- Use composite indexes for multi-column queries.
- Avoid over-indexing write-heavy tables.
- Review query plans for slow queries.

### Query Optimization

- Avoid N+1 queries.
- Use eager loading for known relationships.
- Paginate all list endpoints.
- Limit SELECT to required columns for large tables.
- Use database-level pagination (OFFSET/LIMIT or cursor-based).

### Connection Management

- Use connection pooling.
- Set appropriate pool size limits.
- Close connections on worker shutdown.
- Monitor connection pool utilization.

---

## Caching Strategy

### When to Cache

- Expensive computations that rarely change.
- Frequently accessed read-heavy data.
- External API responses.
- Computed aggregates (stats, counts).

### When Not to Cache

- User-specific mutable data that changes frequently.
- Data where staleness causes correctness issues.
- Small lookups faster than cache overhead.

### Cache Invalidation

- Use explicit invalidation on write.
- Set TTLs appropriate to data volatility.
- Prefer short TTLs over complex invalidation logic.
- Document cache dependencies.

### Cache Layers

- Browser cache for static assets (long TTL with content hashing).
- Redis cache for computed values and session data.
- In-memory cache for hot configuration values only.

---

## Large Document Processing

### Memory Management

- Stream file content; never load entire files into memory.
- Process pages/sections incrementally.
- Release references after processing each chunk.
- Set memory limits per worker process.
- Monitor and alert on memory pressure.

### CPU Management

- Use timeouts for all processing stages.
- Break large jobs into smaller sub-tasks when possible.
- Yield periodically in long-running loops.
- Monitor CPU usage per worker.

### I/O Management

- Buffer writes; avoid per-paragraph database inserts.
- Batch database operations where possible.
- Use streaming uploads and downloads for large files.
- Minimize disk I/O during processing.

---

## Queue Throughput

### Job Design

- Keep jobs focused and bounded in duration.
- Prefer many small jobs over few large jobs.
- Set appropriate timeouts per job type.
- Use priority queues for user-initiated vs. background work.

### Scaling Rules

- Scale workers based on queue depth.
- Monitor job completion rate.
- Alert on growing queue backlog.
- Set maximum concurrent jobs per worker.

### Backpressure

- Reject new uploads when queue depth exceeds threshold.
- Communicate processing delays to users.
- Prioritize in-progress jobs over new submissions.

---

## Frontend Performance

### Bundle Optimization

- Code-split by route.
- Lazy-load non-critical components.
- Tree-shake unused code.
- Analyze bundle size on every build.

### Rendering Performance

- Virtualize long lists and large documents.
- Avoid layout thrashing.
- Debounce expensive event handlers (scroll, resize, input).
- Use CSS transforms for animations (GPU-accelerated).
- Maintain 60fps during scroll and animation.

### Network Performance

- Compress all API responses (gzip/brotli).
- Use HTTP/2 or HTTP/3.
- Prefetch predictable navigation targets.
- Cache API responses with appropriate headers.
- Use optimistic updates for fast perceived performance.

### Image and Asset Performance

- Serve responsive images.
- Use modern formats (WebP, AVIF).
- Lazy-load below-the-fold images.
- Set explicit dimensions to prevent layout shift.

---

## Monitoring and Measurement

### Metrics to Track

- Core Web Vitals (LCP, FID, CLS).
- API response times (P50, P95, P99).
- Database query times.
- Queue depth and job duration.
- Worker memory and CPU usage.
- Error rates by endpoint.

### Tools

- Use structured logging for performance events.
- Track slow queries in database logs.
- Monitor Redis memory and eviction rates.
- Profile worker memory during large document processing.

### Process

- Review performance metrics weekly.
- Investigate regressions immediately.
- Set alerts on budget violations.
- Document optimization decisions and their measured impact.

---

## Anti-Patterns to Avoid

- Loading entire documents into memory.
- Unbounded database queries (no LIMIT).
- Synchronous processing in API request handlers.
- Polling when WebSockets or SSE would work.
- Unnecessary re-renders in React components.
- Fetching data already available in cache or state.
- Over-fetching: requesting more data than displayed.
- Premature optimization without measurement.

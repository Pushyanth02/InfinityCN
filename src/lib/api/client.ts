/**
 * Lemniscate — Client API helper
 * ----------------------------------------------------------------------------
 * Thin wrapper around `fetch` for the versioned (`/api/v1/*`) surface.
 *
 * The v1 routes respond with the standard envelope:
 *   success: { data: T, meta?: { pagination, ... } }
 *   error:   { error: { code, message, details? } }
 *
 * `apiFetch` unwraps `data` on success and throws an `ApiError` (carrying the
 * status code + machine-readable code + message) on a non-OK response, so call
 * sites can `try/catch` a single typed error instead of re-implementing the
 * envelope unwrap and error-shape parse in every component.
 *
 * Used by the frontend views after the legacy `/api/*` routes were retired in
 * favor of the versioned surface. Keep this the single seam for v1 consumption
 * so future envelope changes touch one place.
 */

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** JSON-serializable request body (sets content-type to application/json). */
  body?: unknown
  /** Search params appended to the URL. */
  params?: Record<string, string | number | boolean | undefined | null>
}

/** Typed error thrown by `apiFetch` for any non-OK response. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    if (details) this.details = details
  }
}

/** Build a URL with optional search params (drops undefined/null/empty). */
function buildUrl(path: string, params?: ApiFetchOptions['params']): string {
  if (!params) return path
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Fetch a v1 endpoint and return the unwrapped `data` payload.
 *
 * @example
 *   const job = await apiFetch<Job>(`/api/v1/jobs/${jobId}`)
 *   const { results, total } = await apiFetch<SearchResults>(
 *     `/api/v1/narratives/${id}/search`,
 *     { params: { q } },
 *   )
 *
 * Throws `ApiError` on a non-OK response. Network errors throw the underlying
 * `TypeError` from `fetch` (callers that need to distinguish should catch both).
 */
export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const { body, params, headers, ...rest } = opts

  const init: RequestInit = { ...rest }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json', ...headers }
  } else if (headers) {
    init.headers = headers
  }

  const res = await fetch(buildUrl(path, params), init)

  // Try to parse the envelope regardless of status — both success and error
  // bodies are JSON. A non-JSON response (rare; e.g. a proxy 502) falls back
  // to a generic error so the caller never sees a cryptic JSON parse failure.
  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | null

  if (!res.ok) {
    const err = json?.error
    throw new ApiError(
      err?.message || `Request failed with status ${res.status}`,
      res.status,
      err?.code || 'INTERNAL_ERROR',
      err?.details,
    )
  }

  // `data` is always present on success per the envelope contract. Defend
  // against a malformed (non-envelope) success body by falling back to the
  // raw JSON so the caller still gets something usable rather than undefined.
  return (json?.data ?? (json as unknown)) as T
}

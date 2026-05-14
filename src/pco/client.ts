/**
 * Minimal Planning Center Online REST client.
 *
 * Auth: HTTP Basic with App ID + Secret (Personal Access Token).
 * Base: https://api.planningcenteronline.com
 * Spec: https://developer.planning.center/docs/#/overview/authentication
 *
 * Rate limit: 100 requests per 20 seconds per application. PCO returns
 *   X-PCO-API-Request-Rate-Count, X-PCO-API-Request-Rate-Limit, X-PCO-API-Request-Rate-Period
 *   on every response, and HTTP 429 with Retry-After when exceeded.
 *
 * This client intentionally has no persistence and no business logic — it
 * just speaks PCO. Higher layers (Guest Intake Agent, etc.) compose it.
 */

const PCO_BASE_URL = 'https://api.planningcenteronline.com';

export interface PcoClientOptions {
  appId: string;
  secret: string;
  baseUrl?: string;
  /** Maximum retries on 429 / 5xx. Defaults to 3. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
  /** Override the fetch implementation (used in tests). */
  fetchImpl?: typeof fetch;
}

export interface PcoRequestOptions {
  /** Query string parameters. Arrays are joined with commas (PCO convention for `include`). */
  query?: Record<string, string | number | boolean | string[] | undefined>;
  /** AbortSignal for caller-driven cancellation. */
  signal?: AbortSignal;
}

export class PcoError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'PcoError';
  }
}

export class PcoClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PcoClientOptions) {
    if (!opts.appId || !opts.secret) {
      throw new Error('PcoClient requires both appId and secret.');
    }
    this.authHeader = 'Basic ' + Buffer.from(`${opts.appId}:${opts.secret}`).toString('base64');
    this.baseUrl = opts.baseUrl ?? PCO_BASE_URL;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get<T = unknown>(path: string, opts: PcoRequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    return this.requestWithRetry<T>(url, opts.signal);
  }

  private buildUrl(
    path: string,
    query: PcoRequestOptions['query'],
  ): string {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          url.searchParams.set(key, value.join(','));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async requestWithRetry<T>(url: string, signal?: AbortSignal): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= this.maxRetries) {
      try {
        return await this.requestOnce<T>(url, signal);
      } catch (err) {
        lastError = err;
        if (!this.shouldRetry(err) || attempt === this.maxRetries) {
          throw err;
        }
        const delayMs = this.backoffDelay(err, attempt);
        await sleep(delayMs);
        attempt++;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('PCO request failed');
  }

  private async requestOnce<T>(url: string, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const composed = composeSignals(controller.signal, signal);

    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'User-Agent': 'champion-mlis/0.0.1',
        },
        signal: composed,
      });

      if (!res.ok) {
        const body = await safeReadBody(res);
        throw new PcoError(
          `PCO ${res.status} ${res.statusText} for ${url}`,
          res.status,
          body,
        );
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private shouldRetry(err: unknown): boolean {
    if (err instanceof PcoError) {
      return err.status === 429 || (err.status >= 500 && err.status < 600);
    }
    // Network-level errors (DNS, socket reset, abort from our own timeout) are retryable.
    return err instanceof Error && err.name !== 'AbortError';
  }

  private backoffDelay(err: unknown, attempt: number): number {
    if (err instanceof PcoError && err.status === 429) {
      const retryAfter = retryAfterMs(err);
      if (retryAfter !== null) return retryAfter;
    }
    // Exponential backoff: 500ms, 1s, 2s, 4s, capped at 10s.
    return Math.min(500 * 2 ** attempt, 10_000);
  }
}

function retryAfterMs(err: PcoError): number | null {
  if (typeof err.body !== 'object' || err.body === null) return null;
  const obj = err.body as Record<string, unknown>;
  const retryAfter = obj['retry_after'];
  if (typeof retryAfter === 'number') return retryAfter * 1000;
  return null;
}

async function safeReadBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function composeSignals(a: AbortSignal, b: AbortSignal | undefined): AbortSignal {
  if (!b) return a;
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { TrackerHttpError, type SyncDirection, type TrackerProviderId } from "./types";

export interface TrackerSyncJob {
  id: string;
  provider: TrackerProviderId;
  mangaId?: string;
  direction: SyncDirection;
  attempts: number;
}

export interface TrackerSyncQueueStats {
  pending: number;
  running: boolean;
  processed: number;
  failed: number;
  lastError: string | null;
  lastRunAt: string | null;
}

export interface TrackerSyncQueueOptions {
  handler: (job: TrackerSyncJob) => Promise<void>;
  rateLimits?: Partial<Record<TrackerProviderId, number>>;
  maxAttempts?: number;
  backoffMs?: number;
  debounceMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  randomId?: () => string;
}

const DEFAULT_RATE_LIMITS: Record<TrackerProviderId, number> = {
  // AniList allows ~90 requests/minute. One status update uses 2 requests
  // (read remote + save), so space requests at 700ms.
  anilist: 700,
  // MAL allows ~3 requests/second.
  myanimelist: 340,
};

const DEFAULT_DEBOUNCE_MS = 4000;

class ProviderLimiter {
  private nextAt = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly now: () => number,
  ) {}

  async wait(): Promise<void> {
    if (this.intervalMs <= 0) return;
    const wait = this.nextAt - this.now();
    if (wait > 0) await this.sleep(wait);
    this.nextAt = this.now() + this.intervalMs;
  }
}

/**
 * Dedicated tracker sync queue. It is intentionally independent from the
 * chapter download queue: tracker writes are rate-limited per provider and a
 * provider outage must never block reading or downloads.
 */
export class TrackerSyncQueue {
  private readonly jobs: TrackerSyncJob[] = [];
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly limiters: Record<TrackerProviderId, ProviderLimiter>;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly debounceMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly randomId: () => string;

  private running = false;
  private stopped = false;
  private processed = 0;
  private failed = 0;
  private lastError: string | null = null;
  private lastRunAt: string | null = null;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly options: TrackerSyncQueueOptions) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffMs = options.backoffMs ?? 1500;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? (() => Math.random().toString(36).slice(2));
    const limits = { ...DEFAULT_RATE_LIMITS, ...options.rateLimits };
    this.limiters = {
      anilist: new ProviderLimiter(limits.anilist ?? 0, this.sleep, this.now),
      myanimelist: new ProviderLimiter(
        limits.myanimelist ?? 0,
        this.sleep,
        this.now,
      ),
    };
  }

  /** Queue a job immediately (used by manual sync and schedules). */
  enqueue(input: {
    provider: TrackerProviderId;
    mangaId?: string;
    direction: SyncDirection;
  }): void {
    if (this.stopped) return;
    this.jobs.push({
      id: this.randomId(),
      provider: input.provider,
      mangaId: input.mangaId,
      direction: input.direction,
      attempts: 0,
    });
    void this.kick();
  }

  /** Debounced push after chapter completion, keyed per manga/provider. */
  schedulePush(mangaId: string, provider: TrackerProviderId): void {
    if (this.stopped) return;
    const key = `${mangaId}:${provider}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    if (this.debounceMs <= 0) {
      this.enqueue({ provider, mangaId, direction: "push" });
      return;
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.jobs.push({
        id: this.randomId(),
        provider,
        mangaId,
        direction: "push",
        attempts: 0,
      });
      void this.kick();
    }, this.debounceMs);
    // Node keeps the process alive for pending timers; do not block shutdown.
    timer.unref?.();
    this.debounceTimers.set(key, timer);
  }

  stats(): TrackerSyncQueueStats {
    return {
      pending: this.jobs.length + this.debounceTimers.size,
      running: this.running,
      processed: this.processed,
      failed: this.failed,
      lastError: this.lastError,
      lastRunAt: this.lastRunAt,
    };
  }

  /** Moves pending debounce timers into the queue, then processes everything. */
  async drain(): Promise<void> {
    if (this.stopped) return;
    for (const [key, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
      const [mangaId, provider] = key.split(":");
      if (!mangaId || (provider !== "anilist" && provider !== "myanimelist")) {
        continue;
      }
      this.jobs.push({
        id: this.randomId(),
        provider,
        mangaId,
        direction: "push",
        attempts: 0,
      });
    }
    await this.kick();
    if (this.running) {
      await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    }
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.jobs.length = 0;
    this.resolveIdle();
  }

  private async kick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.jobs.length > 0 && !this.stopped) {
        const job = this.jobs.shift()!;
        await this.limiters[job.provider].wait();
        try {
          await this.options.handler(job);
          this.processed += 1;
          this.lastRunAt = new Date(this.now()).toISOString();
          this.lastError = null;
        } catch (error) {
          const retry = this.retryDelay(error, job.attempts);
          const retryable = !(
            error instanceof TrackerHttpError &&
            (error.kind === "auth" || error.kind === "invalid")
          );
          const canRetry = retryable && job.attempts + 1 < this.maxAttempts;
          this.lastError =
            error instanceof Error ? error.message : "Tracker sync failed";
          if (canRetry) {
            job.attempts += 1;
            this.jobs.push(job);
            await this.sleep(retry);
          } else {
            this.failed += 1;
          }
        }
      }
    } finally {
      this.running = false;
      if (this.jobs.length > 0 && !this.stopped) {
        void this.kick();
      } else {
        this.resolveIdle();
      }
    }
  }

  private retryDelay(error: unknown, attempt: number): number {
    if (error instanceof TrackerHttpError) {
      if (error.kind === "rate_limit") {
        return error.retryAfterMs ?? this.backoffMs * (attempt + 1);
      }
      if (error.kind === "auth" || error.kind === "invalid") {
        // Retrying an expired token or an invalid link will not help.
        return 0;
      }
    }
    return this.backoffMs * 2 ** attempt;
  }

  private resolveIdle(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

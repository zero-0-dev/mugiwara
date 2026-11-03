import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Optional key suffix so independent route groups do not share buckets. */
  name: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * Small in-memory fixed-window limiter. A single-user self-hosted server does
 * not need a distributed limiter; this is enough to blunt brute-force pairing
 * attempts and expensive endpoint abuse.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs);
  cleanup.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = options.keyGenerator
      ? options.keyGenerator(req)
      : req.ip || req.socket.remoteAddress || "unknown";
    const key = `${options.name}:${identity}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    const resetSeconds = Math.ceil(bucket.resetAt / 1000);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (bucket.count > options.max) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
      );
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    next();
  };
}

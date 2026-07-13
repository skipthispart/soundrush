// Simple in-memory rate limiter for API routes.
// Prevents brute-force and abuse without needing Redis/external services.

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

// Clean up expired buckets every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, 60_000).unref?.();
}

/**
 * Check if a request should be rate-limited.
 * Returns { ok: true } if allowed, { ok: false, retryAfter } if blocked.
 */
export function rateLimit(
  key: string,
  maxReq: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= maxReq) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { ok: false, retryAfter };
  }

  existing.count += 1;
  return { ok: true };
}

/**
 * Extract client IP from a Next.js request.
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Validate that a URL is safe to fetch (prevents SSRF attacks).
 * Blocks internal/private IPs and non-http(s) protocols.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]"
    ) {
      return false;
    }

    // Block private/internal IP ranges (IPv4)
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
      if (a === 100 && b >= 64 && b <= 127) return false;
    }

    // Block internal TLDs
    if (
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".lan") ||
      host.endsWith(".localhost")
    ) {
      return false;
    }

    // Block cloud metadata endpoints
    if (
      host === "metadata" ||
      host === "metadata.google.internal" ||
      host === "169.254.169.254"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

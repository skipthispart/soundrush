import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Security headers middleware — runs on every request.
// Protects against XSS, MIME sniffing, downgrade attacks, bots, and injection.

// --- Bot detection: block known scanners and empty User-Agents ---
const BLOCKED_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /dirbuster/i,
  /wpscan/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /burp/i,
  /zap/i,
  /hydra/i,
  /metasploit/i,
  /havij/i,
  /w3af/i,
  /skipfish/i,
  /arachni/i,
  /ratproxy/i,
  /gobuster/i,
  /ffuf/i,
  /wfuzz/i,
];

// --- SQL injection / XSS / path traversal patterns ---
const SQL_INJECTION_PATTERNS = [
  /union\s+select/i,
  /'\s*or\s*'?\d/i,
  /'\s*or\s*'?\w/i,
  /'\s*or\s*1\s*=\s*1/i,
  /'\s*or\s*'1'='1/i,
  /;\s*drop\s+table/i,
  /;\s*delete\s+from/i,
  /;\s*insert\s+into/i,
  /;\s*update\s+\w+\s+set/i,
  /<script[^>]*>/i,
  /<\/script>/i,
  /javascript:/i,
  /on\w+\s*=\s*['"]/i,
  /\.\.\//i,
  /\.\.\\/i,
  /\/etc\/passwd/i,
  /\/proc\/self\/environ/i,
  /cmd=/i,
  /exec=/i,
  /system=/i,
  /passthru=/i,
  /eval=/i,
  /assert=/i,
  /base64_decode/i,
  /file_get_contents/i,
  /fopen/i,
];

function isSuspiciousUserAgent(ua: string): boolean {
  if (!ua || ua.trim() === "") return true;
  if (ua.length < 10) return true;
  return BLOCKED_UA_PATTERNS.some(p => p.test(ua));
}

function hasSuspiciousPatterns(req: NextRequest): boolean {
  // Check the full URL (decoded)
  const checks: string[] = [req.url];

  // Also check decoded URL
  try {
    checks.push(decodeURIComponent(req.url));
  } catch {}

  // Check all query parameter values
  const url = new URL(req.url);
  url.searchParams.forEach((value) => {
    checks.push(value);
    try { checks.push(decodeURIComponent(value)); } catch {}
  });

  // Check pathname
  checks.push(url.pathname);

  return checks.some(str =>
    SQL_INJECTION_PATTERNS.some(p => p.test(str)),
  );
}

export function middleware(req: NextRequest) {
  const ua = req.headers.get("user-agent") || "";
  const url = req.url;

  // --- Block suspicious User-Agents (scanners, bots) ---
  if (isSuspiciousUserAgent(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // --- Block SQL injection / XSS / path traversal attempts ---
  if (hasSuspiciousPatterns(req)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // --- Request method whitelist ---
  const method = req.method;
  if (!["GET", "POST", "HEAD", "OPTIONS"].includes(method)) {
    return new NextResponse("Method Not Allowed", { status: 405 });
  }

  const res = NextResponse.next();

  // Content Security Policy — restrict where resources can load from
  // Note: NO frame-ancestors directive (allows embedding from any origin)
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  );

  // Prevent MIME-type sniffing
  res.headers.set("X-Content-Type-Options", "nosniff");

  // Force HTTPS for 1 year (including subdomains)
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // Referrer policy
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — disable unnecessary browser features
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  );

  // Hide X-Powered-By header
  res.headers.delete("X-Powered-By");

  return res;
}

export const config = {
  // Run on all routes except static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon.jpeg|apple-icon.jpeg).*)",
  ],
};

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // --- Security: hide X-Powered-By header ---
  poweredByHeader: false,
  // --- Security: strict CORS for API routes ---
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          // Only allow same-origin API calls (prevents CSRF from other sites)
          { key: "Access-Control-Allow-Origin", value: "null" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;

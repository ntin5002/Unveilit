import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicit Node.js-deployable Next.js output. No Vite runtime/build path exists.
  output: "standalone",
  // The E2E harness (and many local tools) reach the dev server over 127.0.0.1 while
  // `next dev` advertises localhost. Without this, Next.js treats 127.0.0.1 as a
  // cross-origin dev request, blocks the HMR channel, and the app never hydrates —
  // client-only UI such as the provider credential dialog then stays inert.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/g/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "display-capture=(), camera=(), microphone=()" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/api/public/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;

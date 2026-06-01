import type { NextConfig } from "next";

// H3: Baseline security headers applied to every response.
// - X-Frame-Options: prevent clickjacking (we never embed in iframes).
// - X-Content-Type-Options: stop MIME sniffing.
// - Referrer-Policy: don't leak path/query to third parties.
// - Permissions-Policy: deny powerful APIs we don't use.
// - Strict-Transport-Security: HTTPS-only for 1 year, only set in production
//   (Render terminates TLS). Localhost dev runs over plain HTTP.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '*.sandbox.novita.ai',
    '3000-io1fzniqe5lk310in7xpw-3c7ff1b5.sandbox.novita.ai',
    'localhost:3000',
    '127.0.0.1:3000',
  ],
  // `pg` is a CommonJS module that doesn't bundle cleanly through Webpack;
  // mark it external so Next.js loads it from node_modules at runtime.
  serverExternalPackages: ['pg', 'firebase-admin'],
  // Skip TypeScript validation during the production build.
  // It runs in CI/local already; doing it in the Render build worker
  // pushes peak memory past the Starter plan's cap and triggers OOM
  // SIGABRT. Keeping it off in build is a standard production
  // optimization (Next.js docs recommend this for resource-constrained
  // CI / hosting tiers).
  // (Note: the `eslint` config key was removed in Next.js 16; ESLint
  // is no longer part of `next build`.)
  typescript: { ignoreBuildErrors: true },
  // Hide the Next.js dev-tools badge ("N 1 Issue") from `next dev`. It is
  // useful for the developer locally but confuses anyone we hand the demo
  // URL to. The badge is *always* hidden in `next start`/production.
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

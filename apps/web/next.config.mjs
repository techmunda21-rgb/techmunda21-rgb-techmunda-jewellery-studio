/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
let apiOrigin = 'http://localhost:4000';
try { apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').origin; } catch { /* keep default */ }

// Content-Security-Policy: only our own scripts run; the API origin may supply images/PDFs and receive fetches.
// 'unsafe-inline' for scripts/styles is required by Next.js' inline bootstrap without a nonce middleware (documented trade-off).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  `object-src ${apiOrigin}`,
  `frame-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  // never publish original source to the browser (DevTools → Sources shows only minified bundles)
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@techmunda/shared'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;

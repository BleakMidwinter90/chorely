import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output is only for the Docker image, where it keeps the layer
  // small enough to be pleasant to pull onto a NAS or a Pi.
  //
  // It is deliberately NOT the default: `output: 'standalone'` silently breaks
  // `next start`, so turning it on unconditionally means `npm run build && npm
  // start` produces an app that boots, serves pages, and then fails on every
  // Server Action. The Dockerfile sets this variable; nobody else needs it.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
};

export default nextConfig;

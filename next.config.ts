import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle with only the dependencies actually
  // reached, which is what keeps the self-hosted image small enough to be
  // pleasant to pull onto a NAS or a Pi.
  output: 'standalone',
};

export default nextConfig;

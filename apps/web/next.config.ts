import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@dominion/shared'],
  outputFileTracingRoot: path.join(process.cwd(), '../..')
};

export default nextConfig;

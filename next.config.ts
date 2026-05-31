import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/pool-game',
  assetPrefix: '/pool-game',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in the home directory otherwise wins the workspace-root guess.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;

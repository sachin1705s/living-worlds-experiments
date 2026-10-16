import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Include the common session policy shared with the other experiments.
  turbopack: { root: path.resolve(__dirname, "../..") },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  /* config options here */
};

export default nextConfig;

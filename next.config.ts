import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Base64 data URLs are ~33% larger than raw bytes; a "100KB" JPEG often exceeds
  // the default body limit once JSON-encoded, which breaks photo uploads to /api/ro and bodyshop.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

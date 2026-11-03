import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a verification build run beside a live `next dev` (both would otherwise share .next/).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Native / node-only packages used by optional server routes (local embeddings, Neo4j sync).
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp", "neo4j-driver"],
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;

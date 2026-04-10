import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const localApiProxyUrl = process.env.RADAR_API_PROXY_URL || "http://127.0.0.1:3180";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  transpilePackages: ["echarts", "zrender"],
  turbopack: {
    root: currentDir,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${localApiProxyUrl}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;

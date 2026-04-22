import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const localApiProxyUrl =
  process.env.RADAR_API_PROXY_URL ||
  process.env.NEXT_PUBLIC_RADAR_API_BASE_URL ||
  "http://127.0.0.1:3180";
const localFollowUpApiProxyUrl =
  process.env.RADAR_FOLLOW_UP_API_PROXY_URL || "http://127.0.0.1:3180";
const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  ...Object.values(os.networkInterfaces())
    .flat()
    .filter((details): details is NonNullable<typeof details> =>
      Boolean(details && details.family === "IPv4" && !details.internal)
    )
    .map((details) => details.address),
];

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  transpilePackages: ["echarts", "zrender"],
  allowedDevOrigins,
  turbopack: {
    root: currentDir,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return [
            {
              source: "/api/follow-ups/:path*",
              destination: `${localFollowUpApiProxyUrl}/api/follow-ups/:path*`,
            },
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

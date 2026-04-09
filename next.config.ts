import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root: currentDir,
  },
};

export default nextConfig;

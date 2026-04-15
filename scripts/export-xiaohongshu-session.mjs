#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DEBUG_URL = "http://127.0.0.1:9225";
const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..");

function readOption(argv, name) {
  const flag = `--${name}`;
  const equalsPrefix = `${flag}=`;
  const equalsItem = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsItem) {
    return equalsItem.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function normalizePath(filePath, fallback) {
  const value = filePath || fallback;
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

class CdpClient {
  constructor(debugUrl) {
    this.debugUrl = debugUrl.replace(/\/$/, "");
    this.pending = new Map();
    this.nextId = 1;
    this.ws = null;
  }

  async connect() {
    const targets = await fetch(`${this.debugUrl}/json/list`).then((response) => response.json());
    const target =
      targets.find((item) => item.type === "page" && item.url.includes("xiaohongshu.com")) ||
      targets.find((item) => item.type === "page");

    if (!target?.webSocketDebuggerUrl) {
      throw new Error(
        "No Chrome page target found. Login to Xiaohongshu first, then rerun export."
      );
    }

    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.id || !this.pending.has(payload.id)) {
        return;
      }

      const pending = this.pending.get(payload.id);
      clearTimeout(pending.timer);
      this.pending.delete(payload.id);

      if (payload.error) {
        pending.reject(new Error(payload.error.message));
        return;
      }

      pending.resolve(payload.result);
    });

    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}, timeoutMs = 30_000) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    this.ws?.close();
  }
}

async function main() {
  const outputPath = normalizePath(
    readOption(process.argv.slice(2), "output"),
    path.join(".tmp", "xiaohongshu-session.json")
  );
  const debugUrl = readOption(process.argv.slice(2), "debug-url") || DEFAULT_DEBUG_URL;
  const cdp = new CdpClient(debugUrl);

  try {
    await cdp.connect();
    await cdp.send("Network.enable");
    const result = await cdp.send("Network.getAllCookies");
    const cookies = (result.cookies || []).filter(
      (cookie) =>
        typeof cookie.domain === "string" &&
        (cookie.domain.includes("xiaohongshu.com") || cookie.domain.includes("xhscdn.com"))
    );

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      `${JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          source: "local-xiaohongshu-browser",
          cookies,
        },
        null,
        2
      )}\n`,
      "utf-8"
    );

    console.log(`Exported ${cookies.length} cookies to ${outputPath}`);
  } finally {
    cdp.close();
  }
}

await main();

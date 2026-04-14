#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function readOption(argv, name) {
  const flag = `--${name}`;
  const equalsPrefix = `${flag}=`;
  const equalsItem = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsItem) {
    return equalsItem.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(flag);
  if (index === -1) {
    return "";
  }

  return argv[index + 1] || "";
}

function getShanghaiUpdatedAt() {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} CST`;
}

async function readExisting(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (record) => record && typeof record.platform === "string" && record.platform.trim()
      );
    }

    if (parsed && typeof parsed === "object" && typeof parsed.platform === "string" && parsed.platform.trim()) {
      return [parsed];
    }
  } catch {
    return [];
  }

  return [];
}

async function main() {
  const argv = process.argv.slice(2);
  const filePath = readOption(argv, "file");
  const platform = readOption(argv, "platform");
  const status = readOption(argv, "status");
  const note = readOption(argv, "note");

  if (!filePath || !platform || !status) {
    throw new Error(
      "Usage: node update-platform-status.mjs --file <path> --platform <name> --status <state> [--note <text>]"
    );
  }

  const records = await readExisting(filePath);
  const nextRecord = {
    platform,
    status,
    note,
    updatedAt: getShanghaiUpdatedAt(),
  };
  const nextRecords = records.filter((record) => record?.platform !== platform);
  nextRecords.push(nextRecord);

  nextRecords.sort((left, right) =>
    String(left.platform || "").localeCompare(String(right.platform || ""), "zh-CN")
  );

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(nextRecords, null, 2)}\n`, "utf-8");
  console.log(`Updated ${filePath} for ${platform}: ${status}`);
}

await main();

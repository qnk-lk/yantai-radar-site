#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      continue;
    }
    const name = key.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      args[name] = value;
      index += 1;
    } else {
      args[name] = true;
    }
  }
  return args;
}

function compactText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseUpdatedAt(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (match) {
    return Date.parse(`${match[1]}T${match[2]}+08:00`);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatShanghaiNow() {
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
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} CST`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function mergePlatformCoverage(openclaw, boss) {
  const merged = new Map();
  for (const record of [...normalizeArray(openclaw), ...normalizeArray(boss)]) {
    if (!record?.platform) {
      continue;
    }
    const current = merged.get(record.platform);
    if (!current) {
      merged.set(record.platform, { ...record });
      continue;
    }
    merged.set(record.platform, {
      ...current,
      status: record.status || current.status,
      effectiveCompanyCount: Math.max(
        Number(current.effectiveCompanyCount || 0),
        Number(record.effectiveCompanyCount || 0)
      ),
      querySummary: [current.querySummary, record.querySummary].filter(Boolean).join("；"),
      note: [current.note, record.note].filter(Boolean).join("；"),
    });
  }
  return [...merged.values()];
}

function mergeLead(target, incoming) {
  const merged = { ...target };
  merged.matchedKeywords = [
    ...new Set([
      ...normalizeArray(target.matchedKeywords),
      ...normalizeArray(incoming.matchedKeywords),
    ]),
  ];
  merged.matchedJobs = [
    ...normalizeArray(target.matchedJobs),
    ...normalizeArray(incoming.matchedJobs),
  ].filter((job, index, list) => {
    if (!job?.url) {
      return true;
    }
    return list.findIndex((other) => other?.url === job.url) === index;
  });
  merged.evidence = [
    ...normalizeArray(target.evidence),
    ...normalizeArray(incoming.evidence),
  ].filter((item, index, list) => {
    if (!item?.url && !item?.note) {
      return true;
    }
    return (
      list.findIndex((other) => other?.url === item.url && other?.note === item.note) === index
    );
  });
  merged.signalSummary = compactText(target.signalSummary || incoming.signalSummary);
  merged.inferredNeed = compactText(target.inferredNeed || incoming.inferredNeed);
  merged.leadStrength = compactText(target.leadStrength || incoming.leadStrength);
  merged.companyCategory =
    compactText(target.companyCategory || incoming.companyCategory) || "待判断";
  merged.leadType = compactText(target.leadType || incoming.leadType) || "待判断";
  return merged;
}

function mergeLeads(openclawLeads, bossLeads) {
  const combined = [];
  const map = new Map();
  for (const lead of normalizeArray(openclawLeads)) {
    if (!lead?.companyName || !lead?.city) {
      continue;
    }
    const key = `${lead.city}::${lead.companyName}`;
    map.set(key, { ...lead });
    combined.push(map.get(key));
  }
  for (const lead of normalizeArray(bossLeads)) {
    if (!lead?.companyName || !lead?.city) {
      continue;
    }
    const key = `${lead.city}::${lead.companyName}`;
    if (map.has(key)) {
      const merged = mergeLead(map.get(key), lead);
      map.set(key, merged);
      const index = combined.findIndex((item) => `${item.city}::${item.companyName}` === key);
      if (index >= 0) {
        combined[index] = merged;
      }
    } else {
      map.set(key, { ...lead });
      combined.push(map.get(key));
    }
  }
  return combined.map((lead, index) => ({ ...lead, rank: index + 1 }));
}

async function loadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const openclawPath = args.openclaw;
  const bossPath = args.boss;
  const outputPath = args.output || "public/recruitment-leads.json";

  const openclaw = openclawPath ? await loadJson(openclawPath) : null;
  const boss = bossPath ? await loadJson(bossPath) : null;

  if (!openclaw && !boss) {
    throw new Error("No recruitment lead inputs found to merge.");
  }

  const mergedLeads = mergeLeads(openclaw?.leads, boss?.leads);
  const openclawUpdated = parseUpdatedAt(openclaw?.updatedAt);
  const bossUpdated = parseUpdatedAt(boss?.updatedAt);
  const updatedAt = openclawUpdated || bossUpdated ? formatShanghaiNow() : formatShanghaiNow();

  const merged = {
    updatedAt,
    status: `已同步 ${mergedLeads.length} 家招聘信号反推线索公司。`,
    note: "该数据由本地自动化任务合并 OpenClaw 与 BOSS 直聘抓取结果生成；不采集个人联系方式。",
    strategy: openclaw?.strategy ||
      boss?.strategy || {
        cities: ["烟台", "青岛"],
        targetCompanyLimit: mergedLeads.length,
        primaryPlatforms: ["BOSS直聘", "智联招聘"],
        fallbackPlatforms: ["前程无忧", "猎聘", "齐鲁人才网"],
        keywords: ["MES", "WMS", "QMS", "智能制造"],
      },
    platformCoverage: mergePlatformCoverage(openclaw?.platformCoverage, boss?.platformCoverage),
    leads: mergedLeads,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  console.log(`Merged recruitment leads written to ${outputPath}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

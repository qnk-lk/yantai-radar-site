#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { objectMentionsExcludedEntity } from "./lib/excluded-entities.mjs";

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

function readRepeatedOption(argv, name) {
  const flag = `--${name}`;
  const values = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === flag && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
      continue;
    }

    const equalsPrefix = `${flag}=`;
    if (current.startsWith(equalsPrefix)) {
      values.push(current.slice(equalsPrefix.length));
    }
  }

  return values;
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSortKey(value) {
  const match = String(value || "").match(
    /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/
  );

  return match ? match.slice(1).join("") : "";
}

function pickNewestTimestamp(...values) {
  const validValues = values.filter((value) => getSortKey(value));
  if (!validValues.length) {
    return compactText(values.find(Boolean) || "");
  }

  return [...validValues].sort((left, right) => getSortKey(right).localeCompare(getSortKey(left)))[0];
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

function strengthScore(value) {
  if (value === "高") {
    return 3;
  }

  if (value === "中") {
    return 2;
  }

  return 1;
}

function preferKnownValue(currentValue, nextValue, fallback = "待判断") {
  if (!currentValue || currentValue === fallback) {
    return nextValue || currentValue || fallback;
  }

  return currentValue;
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function mergeLeadRecords(left, right) {
  const sourcePlatforms = uniqueBy(
    [...(left.sourcePlatforms || []), ...(right.sourcePlatforms || [])].filter(Boolean),
    (item) => item
  );
  const matchedJobs = uniqueBy(
    [...(left.matchedJobs || []), ...(right.matchedJobs || [])],
    (item) => `${item.platform || ""}::${item.url || ""}::${item.jobTitle || ""}`
  );
  const allJobs = uniqueBy(
    [...(left.allJobs || []), ...(right.allJobs || [])],
    (item) => `${item.platform || ""}::${item.url || ""}::${item.jobTitle || ""}`
  );
  const evidence = uniqueBy(
    [...(left.evidence || []), ...(right.evidence || [])],
    (item) => `${item.source || ""}::${item.url || ""}`
  );
  const matchedKeywords = uniqueBy(
    [...(left.matchedKeywords || []), ...(right.matchedKeywords || [])].filter(Boolean),
    (item) => item
  );
  const leadStrength =
    strengthScore(right.leadStrength) > strengthScore(left.leadStrength)
      ? right.leadStrength
      : left.leadStrength;
  const signalSummary = compactText(
    `${sourcePlatforms.join("、")} 共发现 ${matchedJobs.length} 个岗位信号。`
  );

  return {
    ...left,
    rank: 0,
    retrievedAt: pickNewestTimestamp(left.retrievedAt, right.retrievedAt),
    companyCategory: preferKnownValue(left.companyCategory, right.companyCategory),
    leadType: preferKnownValue(left.leadType, right.leadType),
    leadStrength,
    signalSummary,
    inferredNeed: preferKnownValue(left.inferredNeed, right.inferredNeed, ""),
    matchedKeywords,
    matchedJobs,
    allJobs,
    evidence,
    sourcePlatforms,
    recommendedAction: left.recommendedAction || right.recommendedAction || "",
    riskNotes: uniqueBy(
      [left.riskNotes, right.riskNotes].map((item) => compactText(item)).filter(Boolean),
      (item) => item
    ).join("；"),
  };
}

async function readPayload(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const payload = JSON.parse(raw);

  return {
    filePath,
    payload,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const outputPath = readOption(argv, "output");
  const inputPaths = readRepeatedOption(argv, "input");
  const leadLimit = Number(readOption(argv, "lead-limit") || "10");
  const platformLimit = Number(readOption(argv, "platform-limit") || "3");
  const selectedPlatforms = readOption(argv, "selected-platforms")
    .split(",")
    .map((item) => compactText(item))
    .filter(Boolean);

  if (!outputPath || inputPaths.length === 0) {
    throw new Error(
      "Usage: node aggregate-recruitment-platforms.mjs --output <path> --input <path> [--input <path> ...]"
    );
  }

  const payloadEntries = [];
  for (const inputPath of inputPaths) {
    try {
      payloadEntries.push(await readPayload(inputPath));
    } catch {
      // Ignore missing or invalid platform documents so the dispatcher can keep running.
    }
  }

  const platformCoverage = payloadEntries.flatMap(
    ({ payload }) => payload.platformCoverage || []
  );
  const leadMap = new Map();

  for (const { payload } of payloadEntries) {
    for (const lead of payload.leads || []) {
      if (objectMentionsExcludedEntity(lead)) {
        continue;
      }

      const key = `${lead.city || ""}::${lead.companyName || ""}`;
      const enrichedLead = {
        ...lead,
        retrievedAt: compactText(lead.retrievedAt || payload.updatedAt),
        allJobs: Array.isArray(lead?.allJobs) ? lead.allJobs : lead?.matchedJobs || [],
        sourcePlatforms: uniqueBy(
          [
            ...(lead.sourcePlatforms || []),
            ...((lead.matchedJobs || []).map((job) => job.platform).filter(Boolean) || []),
          ],
          (item) => item
        ),
      };

      if (!leadMap.has(key)) {
        leadMap.set(key, { ...enrichedLead, rank: 0 });
        continue;
      }

      leadMap.set(key, mergeLeadRecords(leadMap.get(key), enrichedLead));
    }
  }

  const leads = [...leadMap.values()]
    .filter((lead) => !objectMentionsExcludedEntity(lead))
    .sort((left, right) => {
      const strengthDifference = strengthScore(right.leadStrength) - strengthScore(left.leadStrength);
      if (strengthDifference !== 0) {
        return strengthDifference;
      }

      return (right.matchedJobs?.length || 0) - (left.matchedJobs?.length || 0);
    })
    .slice(0, Number.isFinite(leadLimit) ? leadLimit : 10)
    .map((lead, index) => ({
      ...lead,
      rank: index + 1,
    }));

  const mergedPayload = {
    updatedAt: getShanghaiUpdatedAt(),
    status: `已聚合 ${leads.length} 条多平台销售线索。`,
    note: "该数据由多平台统一调度器顺序执行生成；每日随机抽取平台，并在达到总线索阈值后停止。",
    strategy: {
      platformLimit: Number.isFinite(platformLimit) ? platformLimit : 3,
      leadLimit: Number.isFinite(leadLimit) ? leadLimit : 10,
      selectedPlatforms,
    },
    platformCoverage,
    leads,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(mergedPayload, null, 2)}\n`, "utf-8");
  console.log(`Aggregated ${leads.length} recruitment leads to ${outputPath}`);
}

await main();

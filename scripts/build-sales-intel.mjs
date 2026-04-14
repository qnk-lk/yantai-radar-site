#!/usr/bin/env node

import { createHash } from "node:crypto";
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

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeText(value, maxLength = 320) {
  return compactText(value).slice(0, maxLength);
}

function createId(prefix, ...parts) {
  return createHash("sha1")
    .update([prefix, ...parts.map((part) => compactText(part))].join("::"), "utf8")
    .digest("hex");
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
    return "";
  }

  return [...validValues].sort((left, right) => getSortKey(right).localeCompare(getSortKey(left)))[0];
}

function createDetailRows(pairs) {
  return pairs
    .map(([label, value]) => ({
      label,
      value: sanitizeText(value, 600),
    }))
    .filter((item) => item.value);
}

async function readJsonSafe(filePath, fallback) {
  if (!filePath) {
    return fallback;
  }

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function transformRadarEntry(category, entry, fallbackUpdatedAt, index) {
  const title = sanitizeText(entry?.title || `${category} ${index + 1}`, 120);
  const summary =
    sanitizeText(entry?.reason || entry?.action || entry?.demand || entry?.source || "", 260) ||
    "来自 OpenClaw 日报的销售相关信息。";
  const subtitle = [entry?.entity, entry?.location, entry?.publishedAt].filter(Boolean).join(" · ");
  const tags = [
    entry?.location,
    entry?.entity,
    entry?.demand,
    entry?.stage,
    entry?.confidence,
    entry?.score,
  ]
    .map((item) => sanitizeText(item, 60))
    .filter(Boolean)
    .slice(0, 6);

  return {
    id: createId("report", category, title, entry?.publishedAt || "", index),
    kind: "report",
    category,
    title,
    subtitle: sanitizeText(subtitle, 160),
    summary,
    sourceLabel: "OpenClaw 日报",
    publishedAt: sanitizeText(entry?.publishedAt || fallbackUpdatedAt, 40),
    location: sanitizeText(entry?.location, 80),
    entity: sanitizeText(entry?.entity, 120),
    strength: sanitizeText(entry?.score || entry?.confidence, 40),
    actionText: sanitizeText(entry?.action, 120),
    tags,
    detailRows: createDetailRows([
      ["分类", category],
      ["来源", entry?.source],
      ["时间", entry?.publishedAt || fallbackUpdatedAt],
      ["地区", entry?.location],
      ["主体", entry?.entity],
      ["需求", entry?.demand],
      ["阶段", entry?.stage],
      ["可信度", entry?.confidence],
      ["线索等级", entry?.score],
      ["建议动作", entry?.action],
      ["依据", entry?.reason],
    ]),
    evidence: [],
    matchedJobs: [],
  };
}

function transformRadarAction(action, fallbackUpdatedAt, index) {
  const title = sanitizeText(action || `跟进行动 ${index + 1}`, 120);
  return {
    id: createId("action", title, fallbackUpdatedAt, index),
    kind: "report",
    category: "跟进行动",
    title,
    subtitle: sanitizeText(fallbackUpdatedAt, 40),
    summary: "来自 OpenClaw 日报的下一步执行建议。",
    sourceLabel: "OpenClaw 日报",
    publishedAt: sanitizeText(fallbackUpdatedAt, 40),
    location: "",
    entity: "",
    strength: "",
    actionText: title,
    tags: ["待执行"],
    detailRows: createDetailRows([
      ["分类", "跟进行动"],
      ["来源", "OpenClaw 日报"],
      ["同步时间", fallbackUpdatedAt],
      ["执行建议", title],
    ]),
    evidence: [],
    matchedJobs: [],
  };
}

function latestJobPublishedAt(matchedJobs) {
  return pickNewestTimestamp(...(matchedJobs || []).map((job) => job?.publishedAt));
}

function transformRecruitmentLead(lead, index) {
  const sourcePlatforms = Array.isArray(lead?.sourcePlatforms)
    ? lead.sourcePlatforms.filter(Boolean)
    : [];
  const matchedJobs = Array.isArray(lead?.matchedJobs)
    ? lead.matchedJobs.map((job) => ({
        platform: sanitizeText(job?.platform, 40),
        jobTitle: sanitizeText(job?.jobTitle, 120),
        city: sanitizeText(job?.city, 40),
        salary: sanitizeText(job?.salary, 40),
        publishedAt: sanitizeText(job?.publishedAt, 40),
        url: sanitizeText(job?.url, 300),
        keywordHits: Array.isArray(job?.keywordHits)
          ? job.keywordHits.map((item) => sanitizeText(item, 30)).filter(Boolean)
          : [],
        descriptionEvidence: sanitizeText(job?.descriptionEvidence, 320),
      }))
    : [];

  return {
    id: createId("recruitment", lead?.companyName, lead?.city, lead?.rank || index),
    kind: "recruitment",
    category: "招聘信号",
    title: sanitizeText(lead?.companyName || `招聘线索 ${index + 1}`, 120),
    subtitle: sanitizeText(
      [lead?.city, lead?.companyCategory, lead?.leadStrength].filter(Boolean).join(" · "),
      160
    ),
    summary: sanitizeText(lead?.signalSummary || lead?.inferredNeed, 260),
    sourceLabel: sourcePlatforms.length ? sourcePlatforms.join("、") : "招聘聚合",
    publishedAt: latestJobPublishedAt(matchedJobs),
    location: sanitizeText(lead?.city, 60),
    entity: sanitizeText(lead?.companyName, 120),
    strength: sanitizeText(lead?.leadStrength, 40),
    actionText: sanitizeText(lead?.recommendedAction, 160),
    tags: [
      sanitizeText(lead?.leadType, 40),
      sanitizeText(lead?.leadStrength, 20),
      ...((lead?.matchedKeywords || []).map((item) => sanitizeText(item, 20)) || []),
      ...sourcePlatforms.map((item) => sanitizeText(item, 20)),
    ]
      .filter(Boolean)
      .slice(0, 6),
    detailRows: createDetailRows([
      ["分类", lead?.companyCategory],
      ["线索类型", lead?.leadType],
      ["强度", lead?.leadStrength],
      ["城市", lead?.city],
      ["来源平台", sourcePlatforms.join("、")],
      ["推断需求", lead?.inferredNeed],
      ["建议动作", lead?.recommendedAction],
      ["风险提示", lead?.riskNotes],
    ]),
    evidence: Array.isArray(lead?.evidence)
      ? lead.evidence.map((item) => ({
          source: sanitizeText(item?.source, 80),
          url: sanitizeText(item?.url, 300),
          note: sanitizeText(item?.note, 320),
        }))
      : [],
    matchedJobs,
  };
}

function buildReportItems(radarPayload) {
  const updatedAt = sanitizeText(radarPayload?.updatedAt);
  const items = [];

  const sections = [
    ["高优线索", radarPayload?.highPriority],
    ["潜在线索", radarPayload?.potentialLeads],
    ["重点企业", radarPayload?.watchItems],
    ["客户名单", radarPayload?.accounts],
  ];

  for (const [category, entries] of sections) {
    const list = Array.isArray(entries) ? entries : [];
    list.forEach((entry, index) => {
      items.push(transformRadarEntry(category, entry, updatedAt, index));
    });
  }

  const nextActions = Array.isArray(radarPayload?.nextActions) ? radarPayload.nextActions : [];
  nextActions.forEach((action, index) => {
    items.push(transformRadarAction(action, updatedAt, index));
  });

  return items;
}

function buildRecruitmentItems(recruitmentPayload) {
  const leads = Array.isArray(recruitmentPayload?.leads) ? recruitmentPayload.leads : [];
  return leads.map((lead, index) => transformRecruitmentLead(lead, index));
}

function buildSummary(radarPayload, recruitmentPayload, reportCount, recruitmentCount) {
  const focus =
    sanitizeText(radarPayload?.summary?.focus, 240) ||
    "把日报与招聘聚合后的销售相关信息统一到一个面板里查看。";
  const statusParts = [
    sanitizeText(radarPayload?.summary?.status, 180),
    sanitizeText(recruitmentPayload?.status, 180),
  ].filter(Boolean);
  const noteParts = [
    sanitizeText(radarPayload?.summary?.note, 220),
    sanitizeText(recruitmentPayload?.note, 220),
  ].filter(Boolean);

  return {
    focus,
    status:
      statusParts.join(" ") ||
      `当前已汇总 ${reportCount + recruitmentCount} 条销售相关信息。`,
    note:
      noteParts.join(" ") ||
      "该面板会同时吸收 OpenClaw 日报和招聘平台聚合结果。",
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const outputPath = readOption(argv, "output");
  const radarPath = readOption(argv, "radar");
  const recruitmentPath = readOption(argv, "recruitment");

  if (!outputPath) {
    throw new Error(
      "Usage: node build-sales-intel.mjs --output <path> [--radar <path>] [--recruitment <path>]"
    );
  }

  const radarPayload = await readJsonSafe(radarPath, {});
  const recruitmentPayload = await readJsonSafe(recruitmentPath, {});
  const reportItems = buildReportItems(radarPayload);
  const recruitmentItems = buildRecruitmentItems(recruitmentPayload);
  const todayHighlights = recruitmentItems.slice(0, 10);
  const updatedAt =
    pickNewestTimestamp(radarPayload?.updatedAt, recruitmentPayload?.updatedAt) ||
    sanitizeText(radarPayload?.updatedAt || recruitmentPayload?.updatedAt || "等待首次统一同步");

  const payload = {
    updatedAt,
    summary: buildSummary(
      radarPayload,
      recruitmentPayload,
      reportItems.length,
      recruitmentItems.length
    ),
    totals: {
      overall: reportItems.length + recruitmentItems.length,
      reportItems: reportItems.length,
      recruitmentItems: recruitmentItems.length,
      todayHighlights: todayHighlights.length,
    },
    sourceBreakdown: [
      {
        kind: "report",
        count: reportItems.length,
        updatedAt: sanitizeText(radarPayload?.updatedAt),
      },
      {
        kind: "recruitment",
        count: recruitmentItems.length,
        updatedAt: sanitizeText(recruitmentPayload?.updatedAt),
      },
    ],
    feed: [...reportItems, ...recruitmentItems],
    todayHighlights,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`Built ${payload.feed.length} sales intel items at ${outputPath}`);
}

await main();

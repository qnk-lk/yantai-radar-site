#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { filterExcludedEntities, objectMentionsExcludedEntity } from "./lib/excluded-entities.mjs";

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

function sanitizePublicNote(value) {
  return compactText(value)
    .replace(/已从 OpenClaw 最新日报自动同步，来源文件：[^。]*?\.jsonl/gu, "")
    .replace(
      /该数据由招聘平台统一调度器顺序执行生成；每日随机抽取平台，并在达到总线索阈值后停止/gu,
      ""
    )
    .replace(/^[，。；\s]+|[，。；\s]+$/gu, "");
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

function getDateKey(value) {
  const text = String(value || "");
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsedDate);
}

function getTodayDateKey() {
  if (process.env.SALES_INTEL_TODAY_DATE) {
    return getDateKey(process.env.SALES_INTEL_TODAY_DATE);
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isTodayDate(value) {
  const dateKey = getDateKey(value);
  return Boolean(dateKey && dateKey === getTodayDateKey());
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

function compareTimestampDesc(left, right) {
  const leftKey = getSortKey(left);
  const rightKey = getSortKey(right);

  if (leftKey && rightKey) {
    return rightKey.localeCompare(leftKey);
  }

  if (rightKey) {
    return 1;
  }

  if (leftKey) {
    return -1;
  }

  return 0;
}

function splitSourceLabels(value) {
  return String(value || "")
    .split(/[、,，]/u)
    .map((item) => sanitizeText(item, 40))
    .filter(Boolean);
}

function createMatchedJobIdentity(job) {
  return [
    sanitizeText(job?.platform, 40),
    sanitizeText(job?.url, 300),
    sanitizeText(job?.jobTitle, 120),
    sanitizeText(job?.city, 40),
  ].join("::");
}

function normalizeMatchedJob(job) {
  return {
    platform: sanitizeText(job?.platform, 40),
    jobTitle: sanitizeText(job?.jobTitle, 120),
    city: sanitizeText(job?.city, 40),
    salary: sanitizeText(job?.salary, 40),
    publishedAt: sanitizeText(job?.publishedAt, 40),
    url: sanitizeText(job?.url, 300),
    keywordHits: uniqueStrings(
      Array.isArray(job?.keywordHits) ? job.keywordHits.map((item) => sanitizeText(item, 30)) : []
    ).sort((left, right) => left.localeCompare(right, "zh-CN")),
    descriptionEvidence: sanitizeText(job?.descriptionEvidence, 320),
  };
}

function mergeMatchedJobs(previousJobs, currentJobs) {
  const mergedMap = new Map();

  for (const job of Array.isArray(previousJobs) ? previousJobs : []) {
    const normalizedJob = normalizeMatchedJob(job);
    const identity = createMatchedJobIdentity(normalizedJob);
    if (identity) {
      mergedMap.set(identity, normalizedJob);
    }
  }

  for (const job of Array.isArray(currentJobs) ? currentJobs : []) {
    const normalizedJob = normalizeMatchedJob(job);
    const identity = createMatchedJobIdentity(normalizedJob);
    if (!identity) {
      continue;
    }

    const existingJob = mergedMap.get(identity);
    if (!existingJob) {
      mergedMap.set(identity, normalizedJob);
      continue;
    }

    mergedMap.set(identity, {
      ...existingJob,
      ...normalizedJob,
      platform: normalizedJob.platform || existingJob.platform,
      jobTitle: normalizedJob.jobTitle || existingJob.jobTitle,
      city: normalizedJob.city || existingJob.city,
      salary: normalizedJob.salary || existingJob.salary,
      publishedAt: normalizedJob.publishedAt || existingJob.publishedAt,
      url: normalizedJob.url || existingJob.url,
      keywordHits: uniqueStrings([...(existingJob.keywordHits || []), ...(normalizedJob.keywordHits || [])]).sort(
        (left, right) => left.localeCompare(right, "zh-CN")
      ),
      descriptionEvidence: normalizedJob.descriptionEvidence || existingJob.descriptionEvidence,
    });
  }

  return [...mergedMap.values()].sort((left, right) =>
    createMatchedJobIdentity(left).localeCompare(createMatchedJobIdentity(right), "zh-CN")
  );
}

function createEvidenceIdentity(item) {
  return [sanitizeText(item?.source, 80), sanitizeText(item?.url, 300)].join("::");
}

function normalizeEvidenceItem(item) {
  return {
    source: sanitizeText(item?.source, 80),
    url: sanitizeText(item?.url, 300),
    note: sanitizeText(item?.note, 320),
  };
}

function mergeEvidenceItems(previousEvidence, currentEvidence) {
  const mergedMap = new Map();

  for (const item of Array.isArray(previousEvidence) ? previousEvidence : []) {
    const normalizedItem = normalizeEvidenceItem(item);
    const identity = createEvidenceIdentity(normalizedItem);
    if (identity) {
      mergedMap.set(identity, normalizedItem);
    }
  }

  for (const item of Array.isArray(currentEvidence) ? currentEvidence : []) {
    const normalizedItem = normalizeEvidenceItem(item);
    const identity = createEvidenceIdentity(normalizedItem);
    if (!identity) {
      continue;
    }

    const existingItem = mergedMap.get(identity);
    if (!existingItem) {
      mergedMap.set(identity, normalizedItem);
      continue;
    }

    mergedMap.set(identity, {
      ...existingItem,
      ...normalizedItem,
      source: normalizedItem.source || existingItem.source,
      url: normalizedItem.url || existingItem.url,
      note: normalizedItem.note || existingItem.note,
    });
  }

  return [...mergedMap.values()].sort((left, right) =>
    createEvidenceIdentity(left).localeCompare(createEvidenceIdentity(right), "zh-CN")
  );
}

function applyDetailRowOverrides(rows, overrides) {
  const rowMap = new Map();
  const order = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const label = sanitizeText(row?.label, 60);
    const value = sanitizeText(row?.value, 600);
    if (!label) {
      continue;
    }

    if (!rowMap.has(label)) {
      order.push(label);
    }

    rowMap.set(label, {
      label,
      value,
    });
  }

  for (const [labelRaw, valueRaw] of overrides) {
    const label = sanitizeText(labelRaw, 60);
    const value = sanitizeText(valueRaw, 600);
    if (!label || !value) {
      continue;
    }

    if (!rowMap.has(label)) {
      order.push(label);
    }

    rowMap.set(label, {
      label,
      value,
    });
  }

  return order.map((label) => rowMap.get(label)).filter((item) => item?.value);
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
    retrievedAt: sanitizeText(fallbackUpdatedAt, 40),
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
      ["检索时间", fallbackUpdatedAt],
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
    allJobs: [],
  };
}

function transformRadarAction(action, fallbackUpdatedAt, index) {
  const title = sanitizeText(action || `跟进行动 ${index + 1}`, 120);
  return {
    id: createId("action", title, fallbackUpdatedAt, index),
    kind: "report",
    retrievedAt: sanitizeText(fallbackUpdatedAt, 40),
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
      ["检索时间", fallbackUpdatedAt],
      ["来源", "OpenClaw 日报"],
      ["同步时间", fallbackUpdatedAt],
      ["执行建议", title],
    ]),
    evidence: [],
    matchedJobs: [],
    allJobs: [],
  };
}

function latestJobPublishedAt(matchedJobs) {
  return pickNewestTimestamp(...(matchedJobs || []).map((job) => job?.publishedAt));
}

function transformRecruitmentLead(lead, fallbackUpdatedAt, index) {
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
  const allJobs = Array.isArray(lead?.allJobs)
    ? lead.allJobs.map((job) => ({
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
    : matchedJobs;

  const leadCategory = sanitizeText(lead?.leadType, 40) || "聚合信号";

  return {
    id: createId("recruitment", lead?.companyName, lead?.city),
    kind: "recruitment",
    retrievedAt: sanitizeText(lead?.retrievedAt || fallbackUpdatedAt, 40),
    category: leadCategory,
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
      ["检索时间", lead?.retrievedAt || fallbackUpdatedAt],
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
    allJobs,
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

  return filterExcludedEntities(items);
}

function buildRecruitmentItems(recruitmentPayload) {
  const leads = Array.isArray(recruitmentPayload?.leads) ? recruitmentPayload.leads : [];
  const updatedAt = sanitizeText(recruitmentPayload?.updatedAt);
  return filterExcludedEntities(
    leads.map((lead, index) => transformRecruitmentLead(lead, updatedAt, index))
  );
}

function createHistoricalRecruitmentKey(item) {
  const entity = sanitizeText(item?.entity || item?.title, 120);
  const location = sanitizeText(item?.location, 60);
  return `${entity}::${location}`;
}

function buildRecruitmentFingerprintPayload(item) {
  const matchedJobs = mergeMatchedJobs([], item?.matchedJobs || []);
  const allJobs = mergeMatchedJobs([], item?.allJobs || item?.matchedJobs || []);
  const evidence = mergeEvidenceItems([], item?.evidence || []);

  return {
    entity: sanitizeText(item?.entity || item?.title, 120),
    location: sanitizeText(item?.location, 60),
    category: sanitizeText(item?.category, 40),
    strength: sanitizeText(item?.strength, 40),
    sourcePlatforms: uniqueStrings([
      ...splitSourceLabels(item?.sourceLabel),
      ...matchedJobs.map((job) => sanitizeText(job?.platform, 40)),
    ]).sort((left, right) => left.localeCompare(right, "zh-CN")),
    matchedJobs: matchedJobs.map((job) => ({
      platform: job.platform,
      jobTitle: job.jobTitle,
      city: job.city,
      salary: job.salary,
      publishedAt: job.publishedAt,
      url: job.url,
      keywordHits: [...(job.keywordHits || [])],
      descriptionEvidence: job.descriptionEvidence,
    })),
    allJobs: allJobs.map((job) => ({
      platform: job.platform,
      jobTitle: job.jobTitle,
      city: job.city,
      salary: job.salary,
      publishedAt: job.publishedAt,
      url: job.url,
      keywordHits: [...(job.keywordHits || [])],
      descriptionEvidence: job.descriptionEvidence,
    })),
    evidence: evidence.map((item) => ({
      source: item.source,
      url: item.url,
      note: item.note,
    })),
  };
}

function computeRecruitmentFingerprint(item) {
  return createHash("sha1")
    .update(JSON.stringify(buildRecruitmentFingerprintPayload(item)), "utf8")
    .digest("hex");
}

function collectRecruitmentChangeFlags(previousItem, mergedItem) {
  const previousFingerprintPayload = buildRecruitmentFingerprintPayload(previousItem);
  const mergedFingerprintPayload = buildRecruitmentFingerprintPayload(mergedItem);
  const changeFlags = [];

  const previousPlatforms = new Set(previousFingerprintPayload.sourcePlatforms);
  if (
    mergedFingerprintPayload.sourcePlatforms.some((platform) => !previousPlatforms.has(platform))
  ) {
    changeFlags.push("new_platform");
  }

  const previousJobs = new Map(
    previousFingerprintPayload.matchedJobs.map((job) => [createMatchedJobIdentity(job), job])
  );
  let hasNewJob = false;
  let hasUpdatedJob = false;

  for (const job of mergedFingerprintPayload.matchedJobs) {
    const identity = createMatchedJobIdentity(job);
    const previousJob = previousJobs.get(identity);
    if (!previousJob) {
      hasNewJob = true;
      continue;
    }

    if (JSON.stringify(previousJob) !== JSON.stringify(job)) {
      hasUpdatedJob = true;
    }
  }

  if (hasNewJob) {
    changeFlags.push("new_job");
  }

  if (hasUpdatedJob) {
    changeFlags.push("job_updated");
  }

  const previousEvidenceIds = new Set(
    previousFingerprintPayload.evidence.map((item) => createEvidenceIdentity(item))
  );
  if (
    mergedFingerprintPayload.evidence.some(
      (item) => !previousEvidenceIds.has(createEvidenceIdentity(item))
    )
  ) {
    changeFlags.push("new_evidence");
  }

  if (previousFingerprintPayload.category !== mergedFingerprintPayload.category) {
    changeFlags.push("category_changed");
  }

  if (previousFingerprintPayload.strength !== mergedFingerprintPayload.strength) {
    changeFlags.push("strength_changed");
  }

  if (
    sanitizeText(previousItem?.publishedAt, 40) !== sanitizeText(mergedItem?.publishedAt, 40) &&
    sanitizeText(mergedItem?.publishedAt, 40)
  ) {
    changeFlags.push("published_at_changed");
  }

  return uniqueStrings(changeFlags);
}

function mergeDetailRows(leftRows, rightRows) {
  const leftList = Array.isArray(leftRows) ? leftRows : [];
  const rightList = Array.isArray(rightRows) ? rightRows : [];
  const mergedMap = new Map();

  for (const row of leftList) {
    const label = sanitizeText(row?.label, 60);
    const value = sanitizeText(row?.value, 600);
    if (label && value) {
      mergedMap.set(label, { label, value });
    }
  }

  for (const row of rightList) {
    const label = sanitizeText(row?.label, 60);
    const value = sanitizeText(row?.value, 600);
    if (label && value) {
      mergedMap.set(label, { label, value });
    }
  }

  const orderedLabels = uniqueStrings(
    [...rightList, ...leftList].map((row) => sanitizeText(row?.label, 60))
  );

  return orderedLabels.map((label) => mergedMap.get(label)).filter(Boolean);
}

function buildMergedRecruitmentCandidate(previousItem, currentItem) {
  const currentIsNewer =
    compareTimestampDesc(previousItem?.retrievedAt, currentItem?.retrievedAt) > 0;
  const preferred = currentIsNewer ? currentItem : previousItem;
  const fallback = currentIsNewer ? previousItem : currentItem;
  const matchedJobs = mergeMatchedJobs(previousItem?.matchedJobs || [], currentItem?.matchedJobs || []);
  const allJobs = mergeMatchedJobs(
    previousItem?.allJobs || previousItem?.matchedJobs || [],
    currentItem?.allJobs || currentItem?.matchedJobs || []
  );
  const evidence = mergeEvidenceItems(previousItem?.evidence || [], currentItem?.evidence || []);
  const sourceLabel = uniqueStrings([
    ...splitSourceLabels(previousItem?.sourceLabel),
    ...splitSourceLabels(currentItem?.sourceLabel),
    ...matchedJobs.map((job) => sanitizeText(job?.platform, 40)),
  ]).join("、");

  return {
    ...fallback,
    ...preferred,
    id:
      sanitizeText(currentItem?.id, 80) ||
      sanitizeText(previousItem?.id, 80) ||
      createId("recruitment", preferred?.title, preferred?.location),
    kind: "recruitment",
    sourceLabel,
    matchedJobs,
    allJobs,
    evidence,
    tags: uniqueStrings([...(previousItem?.tags || []), ...(currentItem?.tags || [])]).slice(0, 8),
    detailRows: mergeDetailRows(previousItem?.detailRows, currentItem?.detailRows),
    publishedAt:
      latestJobPublishedAt(matchedJobs) ||
      sanitizeText(currentItem?.publishedAt, 40) ||
      sanitizeText(previousItem?.publishedAt, 40),
    category:
      sanitizeText(preferred?.category, 40) || sanitizeText(fallback?.category, 40) || "聚合信号",
    title: sanitizeText(preferred?.title, 120) || sanitizeText(fallback?.title, 120),
    subtitle: sanitizeText(preferred?.subtitle, 160) || sanitizeText(fallback?.subtitle, 160),
    summary: sanitizeText(currentItem?.summary, 260) || sanitizeText(previousItem?.summary, 260),
    location: sanitizeText(preferred?.location, 60) || sanitizeText(fallback?.location, 60),
    entity: sanitizeText(preferred?.entity, 120) || sanitizeText(fallback?.entity, 120),
    strength: sanitizeText(preferred?.strength, 40) || sanitizeText(fallback?.strength, 40),
    actionText:
      sanitizeText(currentItem?.actionText, 160) || sanitizeText(previousItem?.actionText, 160),
  };
}

function mergeHistoricalRecruitmentItem(previousItem, currentItem) {
  const previousFingerprint =
    sanitizeText(previousItem?.historyFingerprint, 80) ||
    computeRecruitmentFingerprint(previousItem);
  const mergedCandidate = buildMergedRecruitmentCandidate(previousItem, currentItem);
  const mergedFingerprint = computeRecruitmentFingerprint(mergedCandidate);
  const lastSeenAt = pickNewestTimestamp(
    previousItem?.lastSeenAt,
    previousItem?.retrievedAt,
    currentItem?.lastSeenAt,
    currentItem?.retrievedAt
  );
  const changeFlags = collectRecruitmentChangeFlags(previousItem, mergedCandidate);
  const hasMaterialChange =
    previousFingerprint !== mergedFingerprint || changeFlags.length > 0;

  if (!hasMaterialChange) {
    return {
      ...previousItem,
      lastSeenAt,
      lastChangedAt:
        sanitizeText(previousItem?.lastChangedAt, 40) ||
        sanitizeText(previousItem?.retrievedAt, 40),
      historyFingerprint: previousFingerprint,
      changeFlags: Array.isArray(previousItem?.changeFlags)
        ? previousItem.changeFlags
        : [],
    };
  }

  const nextRetrievedAt =
    sanitizeText(currentItem?.retrievedAt, 40) ||
    sanitizeText(lastSeenAt, 40) ||
    sanitizeText(previousItem?.retrievedAt, 40);

  return {
    ...mergedCandidate,
    retrievedAt: nextRetrievedAt,
    lastSeenAt,
    lastChangedAt: nextRetrievedAt,
    historyFingerprint: mergedFingerprint,
    changeFlags,
    detailRows: applyDetailRowOverrides(mergedCandidate.detailRows, [
      ["检索时间", nextRetrievedAt],
      ["来源平台", mergedCandidate.sourceLabel],
      ["时间", mergedCandidate.publishedAt],
      ["强度", mergedCandidate.strength],
      ["建议动作", mergedCandidate.actionText],
    ]),
  };
}

function buildHistoricalRecruitmentItems(existingPayload, currentRecruitmentItems) {
  const existingRecruitmentItems = Array.isArray(existingPayload?.feed)
    ? existingPayload.feed.filter(
        (item) => item?.kind === "recruitment" && !objectMentionsExcludedEntity(item)
      )
    : [];

  const historyMap = new Map();

  for (const item of existingRecruitmentItems) {
    const key = createHistoricalRecruitmentKey(item);
    if (!key) {
      continue;
    }

    historyMap.set(key, item);
  }

  for (const item of currentRecruitmentItems) {
    const key = createHistoricalRecruitmentKey(item);
    if (!key) {
      continue;
    }

    const preparedItem = {
      ...item,
      lastSeenAt: sanitizeText(item?.retrievedAt, 40),
      lastChangedAt: sanitizeText(item?.retrievedAt, 40),
      historyFingerprint: computeRecruitmentFingerprint(item),
      changeFlags: [],
      matchedJobs: mergeMatchedJobs([], item?.matchedJobs || []),
      allJobs: mergeMatchedJobs([], item?.allJobs || item?.matchedJobs || []),
      evidence: mergeEvidenceItems([], item?.evidence || []),
    };

    if (!historyMap.has(key)) {
      historyMap.set(key, preparedItem);
      continue;
    }

    historyMap.set(key, mergeHistoricalRecruitmentItem(historyMap.get(key), preparedItem));
  }

  return sortSalesIntelItems(filterExcludedEntities([...historyMap.values()]));
}

function sortSalesIntelItems(items) {
  return [...items].sort((left, right) => {
    const retrievedAtOrder = compareTimestampDesc(left.retrievedAt, right.retrievedAt);
    if (retrievedAtOrder !== 0) {
      return retrievedAtOrder;
    }

    const publishedAtOrder = compareTimestampDesc(left.publishedAt, right.publishedAt);
    if (publishedAtOrder !== 0) {
      return publishedAtOrder;
    }

    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractTodaySearchItems(recruitmentPayload, recruitmentItems) {
  const strategyItems = Array.isArray(recruitmentPayload?.strategy?.selectedPlatforms)
    ? recruitmentPayload.strategy.selectedPlatforms.map((item) => sanitizeText(item, 40))
    : [];

  if (strategyItems.length) {
    return uniqueStrings(strategyItems).slice(0, 3);
  }

  const coverageItems = Array.isArray(recruitmentPayload?.platformCoverage)
    ? recruitmentPayload.platformCoverage
        .map((item) => sanitizeText(item?.platform || item?.name || item?.label, 40))
        .filter(Boolean)
    : [];

  if (coverageItems.length) {
    return uniqueStrings(coverageItems).slice(0, 3);
  }

  return uniqueStrings(
    recruitmentItems.flatMap((item) => [
      ...String(item.sourceLabel || "")
        .split(/[、,，]/u)
        .map((value) => sanitizeText(value, 40))
        .filter(Boolean),
      ...item.matchedJobs.map((job) => sanitizeText(job?.platform, 40)).filter(Boolean),
    ])
  ).slice(0, 3);
}

function buildSummary(radarPayload, recruitmentPayload, reportCount, recruitmentCount) {
  const focus =
    sanitizeText(radarPayload?.summary?.focus, 240) ||
    "把日报与多平台聚合后的销售相关信息统一到一个面板里查看。";
  const statusParts = [
    sanitizeText(radarPayload?.summary?.status, 180),
    sanitizeText(recruitmentPayload?.status, 180),
  ].filter(Boolean);
  const noteParts = [
    sanitizePublicNote(sanitizeText(radarPayload?.summary?.note, 220)),
    sanitizePublicNote(sanitizeText(recruitmentPayload?.note, 220)),
  ].filter(Boolean);

  return {
    focus,
    status:
      statusParts.join(" ") ||
      `当前已汇总 ${reportCount + recruitmentCount} 条销售相关信息。`,
    note:
      noteParts.join(" ") ||
      "该面板会同时吸收 OpenClaw 日报和多平台聚合结果。",
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
  const existingSalesIntelPayload = await readJsonSafe(outputPath, {});
  const reportItems = buildReportItems(radarPayload);
  const currentRecruitmentItems = sortSalesIntelItems(buildRecruitmentItems(recruitmentPayload));
  const recruitmentItems = buildHistoricalRecruitmentItems(
    existingSalesIntelPayload,
    currentRecruitmentItems
  );
  const todayHighlights = isTodayDate(recruitmentPayload?.updatedAt)
    ? filterExcludedEntities(currentRecruitmentItems).slice(0, 10)
    : [];
  const updatedAt =
    pickNewestTimestamp(radarPayload?.updatedAt, recruitmentPayload?.updatedAt) ||
    sanitizeText(radarPayload?.updatedAt || recruitmentPayload?.updatedAt || "等待首次统一同步");

  const payload = {
    updatedAt,
    todaySearchItems: extractTodaySearchItems(recruitmentPayload, todayHighlights),
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
    feed: sortSalesIntelItems(filterExcludedEntities([...reportItems, ...recruitmentItems])),
    todayHighlights,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`Built ${payload.feed.length} sales intel items at ${outputPath}`);
}

await main();

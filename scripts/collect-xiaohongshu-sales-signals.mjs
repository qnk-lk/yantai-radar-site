#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { objectMentionsExcludedEntity, rerankRecords } from "./lib/excluded-entities.mjs";

const DEFAULT_DEBUG_URL = "http://127.0.0.1:9225";
const DEFAULT_QUERIES = [
  "烟台 MES",
  "青岛 MES",
  "MES 招聘",
  "MES实施顾问",
  "MES 上线",
  "WMS 改造",
  "QMS 质量追溯",
  "工厂 信息化",
  "制造业 数字化 改造",
  "ERP MES 打通",
];
const DEFAULT_MAX_SIGNALS = 10;
const DEFAULT_MAX_NOTES_PER_QUERY = 12;
const SEARCH_WAIT_MS = 6_500;
const DETAIL_WAIT_MS = 8_000;
const XIAOHONGSHU_BASE_URL = "https://www.xiaohongshu.com";

const BLOCKED_PATTERN =
  /登录|请登录|验证码|异常访问|安全验证|继续访问请登录|security-check|captcha/i;
const CONTACT_LINE_PATTERN =
  /微信|vx|v信|手机号|电话|邮箱|扫码|私信我|联系我|加我|加微信|留电话/i;
const RECRUITMENT_PATTERN = /招聘|岗位|实施顾问|工程师|内推|招人|hr|HR|实施岗/i;
const NEED_PATTERN =
  /准备上|正在上|求推荐|求介绍|上线|改造|选型|实施|落地|对接|打通|换系统|上mes|上wms|上qms/i;
const INTEL_PATTERN = /失败|多少钱|市场|避坑|经验|感受|教程|怎么学|难做|不好做/i;
const HIGH_SIGNAL_PATTERN = /准备上|正在上|求推荐|上线|改造|选型|招聘|实施顾问|招人/i;
const SERVICE_COMPANY_PATTERN =
  /用友|金蝶|服务号|实施顾问|解决方案|软件|信息|智能|科技|咨询|系统集成|数字化/i;
const CITY_NAMES = ["烟台", "青岛", "山东"];
const COMPANY_NAME_PATTERN =
  /([A-Za-z0-9\u4e00-\u9fa5·（）()]{2,50}(?:有限责任公司|股份有限公司|有限公司|集团|研究院))/g;
const CORE_SIGNAL_PATTERN =
  /MES|WMS|QMS|ERP|APS|SCADA|PLM|智能制造|数字化工厂|工厂信息化|生产管理|质量追溯|仓储管理|模具ERP|模具MES/i;

const KEYWORD_ALIASES = {
  MES: ["MES", "mes", "生产执行", "制造执行", "生产管理系统"],
  WMS: ["WMS", "wms", "仓储管理", "仓库管理", "仓储系统"],
  QMS: ["QMS", "qms", "质量管理", "质量追溯"],
  ERP: ["ERP", "erp"],
  APS: ["APS", "aps"],
  SCADA: ["SCADA", "scada"],
  PLM: ["PLM", "plm"],
  智能制造: ["智能制造", "数字化工厂", "制造业数字化", "工业互联网", "工厂信息化"],
};

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..");

function printHelp() {
  console.log(`Usage:
  pnpm xiaohongshu:browser
  pnpm xiaohongshu:collect -- --output .tmp/xiaohongshu-sales-signals.json --max-signals 10

Options:
  --debug-url <url>            Chrome remote debugging endpoint. Default: ${DEFAULT_DEBUG_URL}
  --output <path>              Output JSON path. Default: .tmp/xiaohongshu-sales-signals.json
  --max-signals <number>       Unique signal limit. Default: ${DEFAULT_MAX_SIGNALS}
  --queries <list>             Comma-separated search queries.
  --max-notes-per-query <n>    Search cards kept from each query. Default: ${DEFAULT_MAX_NOTES_PER_QUERY}
  --session-file <path>        Optional Xiaohongshu cookie session JSON exported from a logged-in browser.
`);
}

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

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function parseList(value, fallback) {
  if (!value) {
    return fallback;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function parseArgs(argv) {
  if (hasFlag(argv, "help") || hasFlag(argv, "h")) {
    printHelp();
    process.exit(0);
  }

  const maxSignals = Number(readOption(argv, "max-signals") || DEFAULT_MAX_SIGNALS);
  const maxNotesPerQuery = Number(
    readOption(argv, "max-notes-per-query") || DEFAULT_MAX_NOTES_PER_QUERY
  );

  return {
    debugUrl: readOption(argv, "debug-url") || DEFAULT_DEBUG_URL,
    output:
      readOption(argv, "output") ||
      path.join(projectRoot, ".tmp", "xiaohongshu-sales-signals.json"),
    sessionFile: readOption(argv, "session-file"),
    maxSignals: Math.max(
      1,
      Math.min(Number.isFinite(maxSignals) ? maxSignals : DEFAULT_MAX_SIGNALS, 30)
    ),
    maxNotesPerQuery: Math.max(
      1,
      Math.min(
        Number.isFinite(maxNotesPerQuery) ? maxNotesPerQuery : DEFAULT_MAX_NOTES_PER_QUERY,
        30
      )
    ),
    queries: parseList(readOption(argv, "queries"), DEFAULT_QUERIES),
  };
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeText(value, maxLength = 400) {
  const lines = String(value || "")
    .split(/\r?\n| {2,}/)
    .map((line) => compactText(line))
    .filter(Boolean)
    .filter((line) => !CONTACT_LINE_PATTERN.test(line));

  return compactText(lines.join(" ")).slice(0, maxLength);
}

function normalizeOutputPath(outputPath) {
  return path.isAbsolute(outputPath) ? outputPath : path.resolve(projectRoot, outputPath);
}

function normalizeOptionalPath(filePath) {
  if (!filePath) {
    return "";
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
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

function formatShanghaiDateTime(date) {
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
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function buildSearchUrl(query) {
  const url = new URL("/search_result", XIAOHONGSHU_BASE_URL);
  url.searchParams.set("keyword", query);
  url.searchParams.set("type", "51");
  return url.toString();
}

function createKeywordSet(queries) {
  const values = new Set();

  for (const query of queries) {
    for (const part of query.split(/\s+/).filter(Boolean)) {
      values.add(part);
      for (const alias of KEYWORD_ALIASES[part] || []) {
        values.add(alias);
      }
    }
  }

  for (const [keyword, aliases] of Object.entries(KEYWORD_ALIASES)) {
    values.add(keyword);
    for (const alias of aliases) {
      values.add(alias);
    }
  }

  for (const cityName of CITY_NAMES) {
    values.add(cityName);
  }

  values.add("招聘");
  values.add("上线");
  values.add("改造");
  values.add("选型");
  values.add("求推荐");
  values.add("数字化");
  values.add("工厂");
  values.add("制造业");

  return [...values].filter(Boolean);
}

function findKeywordHits(text, keywordSet) {
  const source = String(text || "").toUpperCase();
  return keywordSet.filter((keyword) => source.includes(keyword.toUpperCase()));
}

function extractPublishedAt(text) {
  const match = compactText(text).match(/20\d{2}-\d{2}-\d{2}|\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function extractEngagementValue(text) {
  const matches = compactText(text).match(/\d+/g) || [];
  return matches.length ? matches[matches.length - 1] : "";
}

function stripDateAndMetrics(text) {
  return compactText(
    compactText(text)
      .replace(/20\d{2}-\d{2}-\d{2}|\d{2}-\d{2}/g, " ")
      .replace(/\b\d+\b/g, " ")
      .replace(/\b赞\b/g, " ")
  );
}

function extractNoteId(url) {
  const match = String(url || "").match(/\/(?:search_result|explore)\/([^/?]+)/);
  return match ? match[1] : "";
}

function inferCity(text, query) {
  const source = `${query} ${text}`;
  for (const cityName of CITY_NAMES) {
    if (source.includes(cityName)) {
      return cityName;
    }
  }

  return "";
}

function extractCompanyName(text) {
  const source = sanitizeText(text, 2_000);
  const matches = source.match(COMPANY_NAME_PATTERN) || [];

  for (const match of matches) {
    const candidate = compactText(match);
    if (
      candidate.length < 4 ||
      /^小红书/.test(candidate) ||
      /MES|WMS|QMS|ERP|APS|SCADA|PLM|Java|程序员|实施顾问|工厂|制造业|系统|招聘|服务号|要求|想了解/i.test(
        candidate
      )
    ) {
      continue;
    }

    return candidate;
  }

  return "";
}

function normalizePublishedAt(value) {
  const raw = compactText(value);

  if (/^\d{13}$/.test(raw)) {
    return formatShanghaiDateTime(new Date(Number(raw)));
  }

  if (/^\d{10}$/.test(raw)) {
    return formatShanghaiDateTime(new Date(Number(raw) * 1000));
  }

  return raw;
}

function scoreCandidate(candidate, keywordSet) {
  const text = `${candidate.noteTitle} ${candidate.cardText} ${candidate.queryKeyword}`;
  const hits = findKeywordHits(text, keywordSet);
  let score = hits.length * 10;

  if (HIGH_SIGNAL_PATTERN.test(text)) {
    score += 20;
  }

  if (RECRUITMENT_PATTERN.test(text)) {
    score += 12;
  }

  if (CITY_NAMES.some((cityName) => text.includes(cityName))) {
    score += 8;
  }

  if (/公司|工厂|制造业/.test(text)) {
    score += 6;
  }

  return score;
}

function classifySignal({
  noteTitle,
  description,
  queryKeyword,
  authorName,
  companyName,
  matchedKeywords,
}) {
  const text = `${noteTitle} ${description} ${queryKeyword} ${authorName} ${companyName}`;
  const hitCount = matchedKeywords.length;

  let signalType = "行业情报";
  let signalCategory = "制造业数字化主题";
  let inferredNeed =
    "笔记围绕 MES/WMS/QMS 或制造业数字化展开，可作为销售跟进时的行业侧证据。";

  if (RECRUITMENT_PATTERN.test(text)) {
    signalType = "招聘信号";
    inferredNeed =
      "笔记直接涉及 MES/WMS/QMS 岗位、实施顾问或招聘讨论，说明相关组织存在招人或交付扩张信号。";
  } else if (NEED_PATTERN.test(text)) {
    signalType = "需求信号";
    inferredNeed =
      "笔记直接出现上系统、求推荐、改造、上线或选型等表达，说明存在制造业数字化需求。";
  } else if (INTEL_PATTERN.test(text)) {
    signalType = "行业情报";
    inferredNeed =
      "笔记包含价格、实施、避坑或市场反馈，可作为销售沟通和方案包装时的外围情报。";
  }

  if (companyName) {
    signalCategory = "企业主体/待核验";
  } else if (SERVICE_COMPANY_PATTERN.test(`${authorName} ${noteTitle} ${description}`)) {
    signalCategory = "服务商/从业者";
  }

  let signalStrength = "低";
  if ((HIGH_SIGNAL_PATTERN.test(text) && companyName) || hitCount >= 4) {
    signalStrength = "高";
  } else if (NEED_PATTERN.test(text) || RECRUITMENT_PATTERN.test(text) || hitCount >= 2) {
    signalStrength = "中";
  }

  return {
    signalType,
    signalCategory,
    signalStrength,
    inferredNeed,
  };
}

function isRelevantSignal(noteTitle, description, notePreview, matchedKeywords) {
  const text = `${noteTitle} ${description} ${notePreview}`;
  const hasCoreSignal = CORE_SIGNAL_PATTERN.test(text);
  const hasRelevantKeywords = matchedKeywords.some((keyword) =>
    CORE_SIGNAL_PATTERN.test(String(keyword))
  );
  const hasNeedIntent = NEED_PATTERN.test(text) || RECRUITMENT_PATTERN.test(text);

  if (hasCoreSignal || hasRelevantKeywords) {
    return true;
  }

  return hasNeedIntent && /工厂|制造业|生产|质量|仓储|信息化/i.test(text);
}

function createSignal(detail, rank, keywordSet, retrievedAt) {
  const noteTitle = sanitizeText(detail.noteTitle || detail.searchTitle || "", 120);
  const description = sanitizeText(detail.description || detail.notePreview || "", 700);
  const discussionPreview = sanitizeText(detail.notePreview || "", 1_400);
  const city = inferCity(`${noteTitle} ${description} ${discussionPreview}`, detail.queryKeyword);
  const companyName = extractCompanyName(
    `${noteTitle} ${description} ${discussionPreview} ${detail.authorName}`
  );
  const sourceText = `${noteTitle} ${description} ${discussionPreview} ${detail.authorName}`;
  const matchedKeywords = [
    ...new Set(
      findKeywordHits(sourceText, keywordSet)
    ),
  ].slice(0, 10);
  const classification = classifySignal({
    noteTitle,
    description,
    queryKeyword: detail.queryKeyword,
    authorName: detail.authorName,
    companyName,
    matchedKeywords,
  });

  const subject = companyName || noteTitle;
  const signalSummary = `小红书出现“${noteTitle}”笔记，命中 ${
    matchedKeywords.length ? matchedKeywords.join("、") : detail.queryKeyword
  } 等制造业数字化信号。`;
  const evidenceText = [
    `标题：${noteTitle}`,
    detail.authorName ? `作者：${detail.authorName}` : "",
    detail.publishedAt ? `发布时间：${detail.publishedAt}` : "",
    description ? `正文依据：${description}` : "",
  ]
    .filter(Boolean)
    .join("；");

  const signal = {
    rank,
    platform: "小红书",
    sourceType: "social",
    retrievedAt,
    subject,
    companyName,
    city,
    authorName: sanitizeText(detail.authorName, 60),
    noteTitle,
    publishedAt: sanitizeText(normalizePublishedAt(detail.publishedAt || ""), 40),
    signalCategory: classification.signalCategory,
    signalType: classification.signalType,
    signalStrength: classification.signalStrength,
    signalSummary,
    inferredNeed: classification.inferredNeed,
    matchedKeywords: matchedKeywords.length ? matchedKeywords : [detail.queryKeyword],
    matchedQuery: detail.queryKeyword,
    url: detail.detailUrl,
    engagement: {
      likedCount: detail.likedCount || "",
      collectedCount: detail.collectedCount || "",
      commentCount: detail.commentCount || "",
    },
    descriptionEvidence: description,
    notePreview: discussionPreview,
    evidence: [
      {
        source: "小红书笔记详情页",
        url: detail.detailUrl,
        note: sanitizeText(evidenceText, 520),
      },
    ],
    recommendedAction:
      classification.signalType === "需求信号"
        ? "优先核验笔记中的行业、地域和系统诉求，必要时结合企业名、官网或招聘站再做二次确认。"
        : classification.signalType === "招聘信号"
          ? "关注作者、讨论区和相关岗位表达，结合招聘平台交叉验证是否存在项目、交付或招人动作。"
          : "作为外围情报保留，后续可和招聘、日报、同行数据做交叉验证。",
    riskNotes:
      "小红书内容以用户表达为主，不等同于正式采购或招聘公告；已过滤直接联系方式，仍需二次核验。",
  };

  return {
    signal,
    lead: {
      rank,
      companyName: subject,
      city,
      companyCategory: classification.signalCategory,
      leadType: classification.signalType,
      leadStrength: classification.signalStrength,
      signalSummary,
      inferredNeed: classification.inferredNeed,
      matchedKeywords: signal.matchedKeywords,
      matchedJobs: [
        {
          platform: "小红书",
          jobTitle: noteTitle,
          city,
          salary: "",
          publishedAt: signal.publishedAt,
          url: detail.detailUrl,
          keywordHits: signal.matchedKeywords,
          descriptionEvidence: description || discussionPreview,
        },
      ],
      evidence: signal.evidence,
      recommendedAction: signal.recommendedAction,
      riskNotes: signal.riskNotes,
      sourcePlatforms: ["小红书"],
      retrievedAt,
    },
  };
}

function buildPayload({ signals, leads, queries, maxSignals, platformStatus, queryLogs }) {
  const effectiveSignalCount = signals.length;
  return {
    updatedAt: getShanghaiUpdatedAt(),
    status: `已同步 ${effectiveSignalCount} 条小红书制造业数字化线索。`,
    note: "该数据由浏览器登录态抓取小红书搜索结果与笔记详情生成，主要用于发现制造业数字化需求、招聘与行业讨论信号；不采集个人联系方式。",
    strategy: {
      queries,
      targetSignalLimit: maxSignals,
    },
    platformCoverage: [
      {
        platform: "小红书",
        status: platformStatus,
        querySummary: queryLogs.join("；"),
        effectiveSignalCount,
        effectiveCompanyCount: effectiveSignalCount,
        note:
          platformStatus === "ok"
            ? "通过浏览器登录态读取小红书搜索卡片与笔记详情。"
            : "小红书页面可能出现登录、验证码或访问限制，需要刷新登录态后再运行。",
      },
    ],
    signals,
    leads,
  };
}

class CdpClient {
  constructor(debugUrl) {
    this.debugUrl = debugUrl.replace(/\/$/, "");
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
    this.targetId = "";
  }

  async createTarget(url = "about:blank") {
    const endpoint = `${this.debugUrl}/json/new?${encodeURIComponent(url)}`;
    let response = await fetch(endpoint, { method: "PUT" });

    if (!response.ok) {
      response = await fetch(endpoint);
    }

    if (!response.ok) {
      throw new Error(`Chrome failed to create a temporary page target: ${response.status}`);
    }

    return response.json();
  }

  async closeTarget() {
    if (!this.targetId) {
      return;
    }

    const endpoint = `${this.debugUrl}/json/close/${this.targetId}`;
    try {
      let response = await fetch(endpoint, { method: "PUT" });
      if (!response.ok) {
        response = await fetch(endpoint);
      }
    } catch {
      // Ignore close failures so the main run result is preserved.
    } finally {
      this.targetId = "";
    }
  }

  async connect() {
    const version = await fetch(`${this.debugUrl}/json/version`).then((response) => {
      if (!response.ok) {
        throw new Error(`Chrome debugging endpoint returned ${response.status}`);
      }

      return response.json();
    });

    if (!version?.Browser) {
      throw new Error("Chrome debugging endpoint is unavailable.");
    }

    const target = await this.createTarget("about:blank");
    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Chrome did not return a temporary page target.");
    }

    this.targetId = target.id || "";
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ws.addEventListener("message", (event) => this.handleMessage(event));

    try {
      await new Promise((resolve, reject) => {
        this.ws.addEventListener("open", resolve, { once: true });
        this.ws.addEventListener("error", reject, { once: true });
      });
    } catch (error) {
      await this.closeTarget();
      throw error;
    }
  }

  handleMessage(event) {
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
  }

  send(method, params = {}, timeoutMs = 30_000) {
    if (!this.ws) {
      throw new Error("CDP client is not connected.");
    }

    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) {
          return;
        }

        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.exception?.value ||
        result.exceptionDetails.text ||
        "Runtime evaluation failed";
      throw new Error(String(description));
    }

    return result.result.value;
  }

  async navigate(url, waitMs) {
    await this.send("Page.navigate", { url });
    await new Promise((resolve) => {
      setTimeout(resolve, waitMs);
    });
  }

  async loadCookies(cookies) {
    const filteredCookies = Array.isArray(cookies)
      ? cookies
          .filter(
            (cookie) =>
              cookie && typeof cookie.name === "string" && typeof cookie.value === "string"
          )
          .map((cookie) => {
            const value = {
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              httpOnly: Boolean(cookie.httpOnly),
              secure: Boolean(cookie.secure),
            };

            if (typeof cookie.sameSite === "string" && cookie.sameSite) {
              value.sameSite = cookie.sameSite;
            }

            if (
              typeof cookie.expires === "number" &&
              Number.isFinite(cookie.expires) &&
              cookie.expires > 0
            ) {
              value.expires = cookie.expires;
            }

            if (typeof cookie.url === "string" && cookie.url) {
              value.url = cookie.url;
            }

            return value;
          })
      : [];

    if (filteredCookies.length === 0) {
      return;
    }

    await this.send("Network.enable");
    await this.send("Network.setCookies", { cookies: filteredCookies });
  }

  async dispose() {
    try {
      this.ws?.close();
    } finally {
      this.ws = null;
      await this.closeTarget();
    }
  }
}

function searchExtractionExpression(maxNotesPerQuery) {
  return String.raw`(() => {
    const compact = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
    const cards = [...document.querySelectorAll("section.note-item")]
      .map((card) => {
        const cover =
          card.querySelector('a.cover[href*="/search_result/"]') ||
          card.querySelector('a[href*="/search_result/"]') ||
          card.querySelector('a[href*="/explore/"]');
        const titleNode = card.querySelector(".title span, a.title span, .title");
        const footer = card.querySelector(".footer");
        const userNode = footer?.querySelector('a[href*="/user/profile/"]');
        const title = compact(titleNode?.innerText || titleNode?.textContent || "");
        const footerText = compact(footer?.innerText || footer?.textContent || "");
        const cardText = compact(card.innerText || card.textContent || "").slice(0, 420);

        return {
          noteTitle: title,
          detailUrl: cover?.href || "",
          userLine: compact(userNode?.innerText || userNode?.textContent || ""),
          footerText,
          cardText,
        };
      })
      .filter((card) => card.detailUrl && card.cardText)
      .slice(0, ${Number(maxNotesPerQuery)});

    const bodyPreview = compact(document.body?.innerText || "").slice(0, 800);
    return {
      title: document.title,
      url: location.href,
      bodyPreview,
      blocked: ${BLOCKED_PATTERN}.test(document.title + " " + bodyPreview),
      cards,
    };
  })()`;
}

function detailExtractionExpression() {
  return String.raw`(() => {
    const compact = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
    const state = window.__INITIAL_STATE__ || {};
    const noteMap = state.note?.noteDetailMap || {};
    const noteKey = Object.keys(noteMap)[0] || "";
    const note = noteKey ? noteMap[noteKey]?.note || {} : {};
    const noteContentNode =
      document.querySelector(".note-content") || document.querySelector(".note-scroller");
    const interactText = compact(document.querySelector(".interact-container")?.innerText || "");
    const interactMatches = interactText.match(/\d+/g) || [];
    const bodyPreview = compact(document.body?.innerText || "").slice(0, 1800);

    return {
      title: document.title,
      url: location.href,
      blocked: ${BLOCKED_PATTERN}.test(document.title + " " + bodyPreview),
      noteId: note.noteId || noteKey,
      noteTitle: compact(note.title || document.querySelector(".title")?.innerText || ""),
      authorName: compact(
        (note.user?.nickname || document.querySelector(".author")?.innerText || "").replace(/\s*关注$/, "")
      ),
      publishedAt: compact(
        note.time ||
          note.lastUpdateTime ||
          document.querySelector(".date")?.innerText ||
          ""
      ),
      description: compact(note.desc || document.querySelector(".desc")?.innerText || "").slice(0, 900),
      notePreview: compact(noteContentNode?.innerText || document.body?.innerText || "").slice(0, 1500),
      likedCount: String(note.interactInfo?.likedCount || interactMatches[0] || ""),
      collectedCount: String(note.interactInfo?.collectedCount || interactMatches[1] || ""),
      commentCount:
        String(note.interactInfo?.commentCount || interactMatches[2] || "") ||
        (bodyPreview.match(/共\s*(\d+)\s*条评论/) || [])[1] ||
        "",
      noteType: compact(note.noteType || ""),
      tagNames: Array.isArray(note.tagList)
        ? note.tagList
            .map((item) => compact(item.name || item.tagName || ""))
            .filter(Boolean)
            .slice(0, 10)
        : [],
      ipLocation: compact(note.ipLocation || ""),
    };
  })()`;
}

async function collectSearchCandidates(cdp, options, keywordSet) {
  const candidates = [];
  const seenUrls = new Set();
  const queryLogs = [];
  let blockedCount = 0;

  for (const query of options.queries) {
    await cdp.navigate(buildSearchUrl(query), SEARCH_WAIT_MS);
    const result = await cdp.evaluate(searchExtractionExpression(options.maxNotesPerQuery));

    if (result.blocked) {
      blockedCount += 1;
      queryLogs.push(`${query}: blocked`);
      continue;
    }

    const validCards = result.cards
      .map((card) => {
        const footerText = sanitizeText(card.footerText, 220);
        return {
          ...card,
          noteId: extractNoteId(card.detailUrl),
          queryKeyword: query,
          searchTitle: sanitizeText(card.noteTitle, 120),
          searchAuthorName: sanitizeText(stripDateAndMetrics(card.userLine), 60),
          searchPublishedAt: extractPublishedAt(footerText || card.userLine),
          searchEngagement: extractEngagementValue(footerText),
          footerText,
          cardText: sanitizeText(card.cardText, 420),
        };
      })
      .filter((card) => card.detailUrl && card.noteId)
      .filter((card) => {
        if (seenUrls.has(card.detailUrl)) {
          return false;
        }

        seenUrls.add(card.detailUrl);
        return true;
      });

    for (const card of validCards) {
      candidates.push({
        ...card,
        searchScore: scoreCandidate(card, keywordSet),
      });
    }

    queryLogs.push(`${query}: ${validCards.length}`);
  }

  candidates.sort((left, right) => right.searchScore - left.searchScore);
  return {
    candidates,
    queryLogs,
    platformStatus:
      blockedCount > 0 && candidates.length === 0 ? "blocked" : candidates.length > 0 ? "ok" : "limited",
  };
}

async function collectSignals(cdp, options) {
  const keywordSet = createKeywordSet(options.queries);
  const { candidates, queryLogs, platformStatus } = await collectSearchCandidates(
    cdp,
    options,
    keywordSet
  );
  const signals = [];
  const leads = [];
  const seenNoteIds = new Set();
  const retrievedAt = getShanghaiUpdatedAt();

  for (const candidate of candidates) {
    if (signals.length >= options.maxSignals) {
      break;
    }

    await cdp.navigate(candidate.detailUrl, DETAIL_WAIT_MS);
    const detail = await cdp.evaluate(detailExtractionExpression());

    if (detail?.blocked) {
      continue;
    }

    const noteId = detail.noteId || candidate.noteId;
    if (!noteId || seenNoteIds.has(noteId)) {
      continue;
    }

    const mergedDetail = {
      ...candidate,
      ...detail,
      detailUrl: detail.url || candidate.detailUrl,
      noteTitle: sanitizeText(detail.noteTitle || candidate.searchTitle, 120),
      authorName: sanitizeText(detail.authorName || candidate.searchAuthorName, 60),
      publishedAt: sanitizeText(
        normalizePublishedAt(detail.publishedAt || candidate.searchPublishedAt),
        40
      ),
      notePreview: sanitizeText(detail.notePreview || candidate.cardText, 1500),
      description: sanitizeText(detail.description || "", 900),
    };

    const previewKeywords = [
      ...new Set(
        findKeywordHits(
          `${mergedDetail.noteTitle} ${mergedDetail.description} ${mergedDetail.notePreview} ${mergedDetail.authorName}`,
          keywordSet
        )
      ),
    ];
    if (
      !isRelevantSignal(
        mergedDetail.noteTitle,
        mergedDetail.description,
        mergedDetail.notePreview,
        previewKeywords
      )
    ) {
      continue;
    }

    const { signal, lead } = createSignal(mergedDetail, signals.length + 1, keywordSet, retrievedAt);
    if (objectMentionsExcludedEntity(signal) || objectMentionsExcludedEntity(lead)) {
      continue;
    }

    signals.push(signal);
    leads.push(lead);
    seenNoteIds.add(noteId);
  }

  const filteredSignals = rerankRecords(signals);
  const filteredLeads = rerankRecords(leads);

  return buildPayload({
    signals: filteredSignals,
    leads: filteredLeads,
    queries: options.queries,
    maxSignals: options.maxSignals,
    platformStatus,
    queryLogs,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = normalizeOutputPath(options.output);
  const sessionFilePath = normalizeOptionalPath(options.sessionFile);
  const cdp = new CdpClient(options.debugUrl);

  try {
    await cdp.connect();
    if (sessionFilePath) {
      const sessionPayload = JSON.parse(await fs.readFile(sessionFilePath, "utf-8"));
      await cdp.loadCookies(sessionPayload.cookies);
    }
    const payload = await collectSignals(cdp, options);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

    console.log(`Wrote ${payload.signals.length} Xiaohongshu sales signals to ${outputPath}`);
    console.log(`Updated at: ${payload.updatedAt}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.stack || error.message);
    } else {
      console.error(error);
    }
    console.error(
      "If Chrome is not ready, run pnpm xiaohongshu:browser, login to Xiaohongshu, then rerun pnpm xiaohongshu:collect."
    );
    process.exitCode = 1;
  } finally {
    await cdp.dispose();
  }
}

await main();

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { objectMentionsExcludedEntity, rerankRecords } from "./lib/excluded-entities.mjs";

const DEFAULT_DEBUG_URL = "http://127.0.0.1:9224";
const DEFAULT_CITIES = [
  { name: "烟台", code: "707" },
  { name: "青岛", code: "703" },
];
const DEFAULT_KEYWORDS = ["MES", "WMS", "QMS", "智能制造"];
const DEFAULT_MAX_COMPANIES = 10;
const DEFAULT_MAX_JOBS_PER_QUERY = 15;
const DEFAULT_MAX_ALL_JOBS_PER_COMPANY = 20;
const SEARCH_WAIT_MS = 5_500;
const DETAIL_WAIT_MS = 3_500;
const ZHAOPIN_BASE_URL = "https://sou.zhaopin.com/";

const KEYWORD_ALIASES = {
  MES: ["MES", "生产执行", "制造执行"],
  WMS: ["WMS", "仓储", "仓库管理"],
  QMS: ["QMS", "质量管理"],
  MOM: ["MOM"],
  ERP: ["ERP"],
  PLM: ["PLM"],
  智能制造: ["智能制造", "数字化工厂", "工业互联网", "工厂数字化"],
};

const SERVICE_COMPANY_PATTERN =
  /软件|信息|网络|工业互联网|系统集成|咨询|解决方案|用友|金蝶|SAP|云平台|数据服务|物联|自动化|数字科技|智能工业|IT服务/i;
const MANUFACTURING_COMPANY_PATTERN =
  /制造|新能源|能源|电子|半导体|汽车|机械|装备|电气|家纺|集团|工业|材料|食品|医药|生物|化工|仪器|光电|模具|工厂|生产/i;
const SERVICE_JOB_PATTERN = /实施|顾问|售前|项目经理|产品经理|交付|架构/i;
const INTERNAL_DIGITAL_JOB_PATTERN = /运维|工程师|主管|专员|总监|经理|生产|质量|仓储/i;
const BLOCKED_PATTERN =
  /安全验证|验证码|异常访问|访问受限|登录后可查看|请登录后查看|继续访问请登录|为保证您的正常访问/i;
const CONTACT_SEGMENT_PATTERN =
  /(?:[A-Za-z\u4e00-\u9fa5]{1,24}·(?:招聘专员|招聘主管|人事行政经理|人力资源经理|招聘经理|办公室主任|HRBP经理|HRBP|HR|hr|经理)|(?:今日回复\d+次|刚刚活跃|\d+小时内回复可能性大|高回复率|立即沟通|立即投递|收藏|举报|微信扫码分享|APP))/gi;
const CONTACT_LINE_PATTERN =
  /立即沟通|立即投递|招聘专员|招聘主管|人力资源经理|人事行政经理|办公室主任|HRBP|HR|hr|高回复率|小时内回复|今日回复|刚刚活跃|微信扫码分享|举报|APP/i;

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..");

function printHelp() {
  console.log(`Usage:
  pnpm zhaopin:browser
  pnpm zhaopin:collect -- --output .tmp/zhaopin-recruitment-leads.json --max-companies 10

Options:
  --debug-url <url>          Chrome remote debugging endpoint. Default: ${DEFAULT_DEBUG_URL}
  --output <path>            Output JSON path. Default: .tmp/zhaopin-recruitment-leads.json
  --max-companies <number>   Unique company limit. Default: ${DEFAULT_MAX_COMPANIES}
  --keywords <list>          Comma-separated keywords. Default: ${DEFAULT_KEYWORDS.join(",")}
  --cities <list>            Comma-separated cityName:zhaopinCityCode. Default: 烟台:707,青岛:703
  --max-jobs-per-query <n>   Search cards kept from each query. Default: ${DEFAULT_MAX_JOBS_PER_QUERY}
  --max-all-jobs-per-company <n>  Company jobs kept in second-pass search. Default: ${DEFAULT_MAX_ALL_JOBS_PER_COMPANY}
  --session-file <path>      Optional Zhaopin cookie session JSON exported from a logged-in browser.
  --no-details               Do not open job detail pages; use search cards only.
  --no-all-jobs              Do not run the second-pass company job expansion.
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

function parseCities(value) {
  if (!value) {
    return DEFAULT_CITIES;
  }

  const defaultCodeByName = new Map(DEFAULT_CITIES.map((city) => [city.name, city.code]));
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name, code] = item.split(":").map((part) => part.trim());
      return {
        name,
        code: code || defaultCodeByName.get(name) || "",
      };
    })
    .filter((city) => city.name && city.code);
}

function parseArgs(argv) {
  if (hasFlag(argv, "help") || hasFlag(argv, "h")) {
    printHelp();
    process.exit(0);
  }

  const maxCompanies = Number(readOption(argv, "max-companies") || DEFAULT_MAX_COMPANIES);
  const maxJobsPerQuery = Number(
    readOption(argv, "max-jobs-per-query") || DEFAULT_MAX_JOBS_PER_QUERY
  );
  const maxAllJobsPerCompany = Number(
    readOption(argv, "max-all-jobs-per-company") || DEFAULT_MAX_ALL_JOBS_PER_COMPANY
  );

  return {
    debugUrl: readOption(argv, "debug-url") || DEFAULT_DEBUG_URL,
    output:
      readOption(argv, "output") ||
      path.join(projectRoot, ".tmp", "zhaopin-recruitment-leads.json"),
    sessionFile: readOption(argv, "session-file"),
    maxCompanies: Math.max(
      1,
      Math.min(Number.isFinite(maxCompanies) ? maxCompanies : DEFAULT_MAX_COMPANIES, 30)
    ),
    maxJobsPerQuery: Math.max(
      1,
      Math.min(Number.isFinite(maxJobsPerQuery) ? maxJobsPerQuery : DEFAULT_MAX_JOBS_PER_QUERY, 30)
    ),
    maxAllJobsPerCompany: Math.max(
      1,
      Math.min(
        Number.isFinite(maxAllJobsPerCompany)
          ? maxAllJobsPerCompany
          : DEFAULT_MAX_ALL_JOBS_PER_COMPANY,
        30
      )
    ),
    keywords: parseList(readOption(argv, "keywords"), DEFAULT_KEYWORDS),
    cities: parseCities(readOption(argv, "cities")),
    includeDetails: !hasFlag(argv, "no-details"),
    includeAllJobs: !hasFlag(argv, "no-all-jobs"),
  };
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeContactSegments(value) {
  return String(value || "")
    .replace(CONTACT_SEGMENT_PATTERN, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeText(value, maxLength = 260) {
  const lines = removeContactSegments(value)
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

function normalizeCompanyName(value) {
  return sanitizeText(value, 120)
    .replace(/[\s()（）[\]【】]/g, "")
    .toUpperCase();
}

function isSameCompanyName(left, right) {
  const leftValue = normalizeCompanyName(left);
  const rightValue = normalizeCompanyName(right);

  if (!leftValue || !rightValue) {
    return false;
  }

  if (leftValue === rightValue) {
    return true;
  }

  return (
    Math.min(leftValue.length, rightValue.length) >= 6 &&
    (leftValue.includes(rightValue) || rightValue.includes(leftValue))
  );
}

function createCollectedJobIdentity(job) {
  return [
    sanitizeText(job?.platform, 40),
    sanitizeText(job?.url, 300),
    sanitizeText(job?.jobTitle, 120),
    sanitizeText(job?.city, 40),
  ].join("::");
}

function normalizeCollectedJob(job, fallbackPlatform, fallbackCity) {
  return {
    platform: sanitizeText(job?.platform || fallbackPlatform, 40),
    jobTitle: sanitizeText(job?.jobTitle, 120),
    city: sanitizeText(job?.city || fallbackCity, 40),
    salary: sanitizeText(job?.salary, 50),
    publishedAt: sanitizeText(job?.publishedAt, 40),
    url: sanitizeText(job?.url, 300),
    keywordHits: Array.isArray(job?.keywordHits)
      ? [...new Set(job.keywordHits.map((item) => sanitizeText(item, 30)).filter(Boolean))]
      : [],
    descriptionEvidence: sanitizeText(job?.descriptionEvidence, 360),
  };
}

function mergeCollectedJobs(previousJobs, currentJobs, fallbackPlatform, fallbackCity) {
  const mergedMap = new Map();

  for (const job of [...(previousJobs || []), ...(currentJobs || [])]) {
    const normalizedJob = normalizeCollectedJob(job, fallbackPlatform, fallbackCity);
    const identity = createCollectedJobIdentity(normalizedJob);
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
      keywordHits: [...new Set([...(existingJob.keywordHits || []), ...(normalizedJob.keywordHits || [])])],
      descriptionEvidence: normalizedJob.descriptionEvidence || existingJob.descriptionEvidence,
    });
  }

  return [...mergedMap.values()];
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

function buildSearchUrl(city, keyword) {
  const url = new URL(ZHAOPIN_BASE_URL);
  url.searchParams.set("jl", city.code);
  url.searchParams.set("kw", keyword);
  return url.toString();
}

function createKeywordSet(keywords) {
  const values = new Set();

  for (const keyword of keywords) {
    values.add(keyword);
    for (const alias of KEYWORD_ALIASES[keyword] || []) {
      values.add(alias);
    }
  }

  for (const keyword of DEFAULT_KEYWORDS) {
    values.add(keyword);
    for (const alias of KEYWORD_ALIASES[keyword] || []) {
      values.add(alias);
    }
  }

  values.add("数字化");
  values.add("工厂");
  values.add("生产管理");
  values.add("质量管理");
  return [...values].filter(Boolean);
}

function findKeywordHits(text, keywordSet) {
  const source = text.toUpperCase();
  return keywordSet.filter((keyword) => source.includes(keyword.toUpperCase()));
}

function scoreJob(job, keywordSet) {
  const text = `${job.jobTitle} ${job.companyName} ${job.cardText} ${job.queryKeyword}`;
  const hits = findKeywordHits(text, keywordSet);
  let score = hits.length * 10;

  if (/MES|WMS|QMS|MOM|ERP|PLM/i.test(job.jobTitle)) {
    score += 25;
  }

  if (/实施|顾问|售前|项目|产品|开发|运维|工程师|主管|总监/i.test(job.jobTitle)) {
    score += 8;
  }

  if (SERVICE_COMPANY_PATTERN.test(job.companyName)) {
    score += 6;
  }

  if (MANUFACTURING_COMPANY_PATTERN.test(job.companyName)) {
    score += 4;
  }

  return score;
}

function isUsableCompanyName(companyName) {
  if (!companyName) {
    return false;
  }

  if (/某|猎头|代招|外包项目|匿名/i.test(companyName)) {
    return false;
  }

  return companyName.length >= 2;
}

function classifyLead(companyName, jobTitle, description, companyIntro) {
  const companyText = `${companyName} ${companyIntro}`;
  const jobText = `${jobTitle} ${description}`;
  const isService =
    SERVICE_COMPANY_PATTERN.test(companyText) ||
    (/科技|智能|系统/i.test(companyName) && SERVICE_JOB_PATTERN.test(jobTitle));
  const isManufacturer =
    MANUFACTURING_COMPANY_PATTERN.test(companyText) ||
    (INTERNAL_DIGITAL_JOB_PATTERN.test(jobTitle) && /MES|WMS|QMS|生产|质量|仓储/i.test(jobText));

  if (
    isService &&
    (SERVICE_JOB_PATTERN.test(jobTitle) || /服务|解决方案|实施|交付/i.test(companyText))
  ) {
    return {
      companyCategory: "数字化服务商",
      leadType: "同行/合作伙伴",
      inferredNeed:
        "该公司岗位和介绍指向 MES/WMS/QMS/ERP 等制造业数字化交付能力，适合作为同行或生态合作对象持续观察。",
    };
  }

  if (isManufacturer) {
    return {
      companyCategory: "制造业企业",
      leadType: "潜在客户",
      inferredNeed:
        "该公司正在招聘制造业数字化相关岗位，可能存在生产、质量、仓储或工厂运营系统建设需求。",
    };
  }

  return {
    companyCategory: "待判断",
    leadType: "待判断",
    inferredNeed: "招聘信号与制造业数字化关键词有关，但仍需二次核验主营业务和真实需求。",
  };
}

function buildLeadStrength(keywordHits, jobTitle, description) {
  const text = `${jobTitle} ${description}`;

  if (keywordHits.length >= 2 || /MES|WMS|QMS|MOM/i.test(text)) {
    return "高";
  }

  if (/ERP|PLM|智能制造|数字化工厂|工业互联网|生产管理|质量管理/i.test(text)) {
    return "中";
  }

  return "低";
}

function createLeadFromJob(job, detail, rank, keywordSet) {
  const jobTitle = sanitizeText(detail?.jobTitle || job.jobTitle, 80);
  const description = sanitizeText(detail?.jobDescription || "", 360);
  const companyIntro = sanitizeText(
    `${detail?.companyMeta || ""} ${detail?.companyBusiness || ""}`,
    360
  );
  const address = sanitizeText(detail?.address || "", 120);
  const salary = sanitizeText(detail?.salary || job.salary || "", 50);
  const evidenceText = `${jobTitle} ${job.cardText} ${description} ${companyIntro} ${job.queryKeyword}`;
  const keywordHits = [...new Set(findKeywordHits(evidenceText, keywordSet))].slice(0, 8);
  const classification = classifyLead(job.companyName, jobTitle, description, companyIntro);
  const evidenceNoteParts = [
    `岗位：${jobTitle}`,
    salary ? `薪资：${salary}` : "",
    address ? `地址：${address}` : "",
    description ? `岗位依据：${description}` : "",
    companyIntro ? `公司信息：${companyIntro}` : "",
  ].filter(Boolean);

  return {
    rank,
    companyName: job.companyName,
    city: job.city,
    companyCategory: classification.companyCategory,
    leadType: classification.leadType,
    leadStrength: buildLeadStrength(keywordHits, jobTitle, description),
    signalSummary: `智联招聘出现“${jobTitle}”岗位，命中 ${keywordHits.length ? keywordHits.join("、") : job.queryKeyword} 等制造业数字化信号。`,
    inferredNeed: classification.inferredNeed,
    matchedKeywords: keywordHits.length ? keywordHits : [job.queryKeyword],
    matchedJobs: [
      {
        platform: "智联招聘",
        jobTitle,
        city: job.city,
        salary,
        publishedAt: sanitizeText(detail?.updatedAt || "", 40),
        url: job.jobUrl,
        keywordHits: keywordHits.length ? keywordHits : [job.queryKeyword],
        descriptionEvidence: description || sanitizeText(job.cardText, 220),
      },
    ],
    allJobs: [],
    evidence: [
      {
        source: "智联招聘职位页",
        url: job.jobUrl,
        note: sanitizeText(evidenceNoteParts.join("；"), 520),
      },
    ],
    recommendedAction:
      "先核验公司官网、业务范围和近期招聘连续性，再按潜在客户或同行合作对象分层跟进。",
    riskNotes: "仅基于公开招聘页面反推业务信号；已过滤招聘联系人等个人信息。",
  };
}

function mergeLead(lead, job, detail, keywordSet) {
  const jobTitle = sanitizeText(detail?.jobTitle || job.jobTitle, 80);
  const description = sanitizeText(detail?.jobDescription || "", 360);
  const keywordHits = [
    ...new Set(findKeywordHits(`${jobTitle} ${description} ${job.cardText}`, keywordSet)),
  ].slice(0, 8);
  const urlExists = lead.matchedJobs.some((matchedJob) => matchedJob.url === job.jobUrl);

  if (!urlExists) {
    lead.matchedJobs.push({
      platform: "智联招聘",
      jobTitle,
      city: job.city,
      salary: sanitizeText(detail?.salary || job.salary || "", 50),
      publishedAt: sanitizeText(detail?.updatedAt || "", 40),
      url: job.jobUrl,
      keywordHits: keywordHits.length ? keywordHits : [job.queryKeyword],
      descriptionEvidence: description || sanitizeText(job.cardText, 220),
    });
  }

  lead.matchedKeywords = [
    ...new Set([...lead.matchedKeywords, ...keywordHits, job.queryKeyword]),
  ].slice(0, 10);
  lead.leadStrength = buildLeadStrength(lead.matchedKeywords, jobTitle, description);
}

function buildPayload({ leads, cities, keywords, maxCompanies, platformStatus, queryLogs }) {
  const effectiveCompanyCount = leads.length;
  return {
    updatedAt: getShanghaiUpdatedAt(),
    status: `已同步 ${effectiveCompanyCount} 家招聘信号反推线索公司。`,
    note: "该数据由浏览器登录态抓取智联招聘公开职位页面生成，独立于日报和同行地图；不采集个人联系方式。",
    strategy: {
      cities: cities.map((city) => city.name),
      targetCompanyLimit: maxCompanies,
      primaryPlatforms: ["智联招聘", "BOSS直聘"],
      fallbackPlatforms: ["前程无忧", "猎聘", "齐鲁人才网"],
      keywords,
    },
    platformCoverage: [
      {
        platform: "智联招聘",
        status: platformStatus,
        querySummary: queryLogs.join("；"),
        effectiveCompanyCount,
        note:
          platformStatus === "ok"
            ? "通过浏览器职位搜索页与详情页提取结构化招聘线索。"
            : "智联页面可能出现登录、验证码或访问限制，需要刷新登录态后再运行。",
      },
    ],
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
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
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

function searchExtractionExpression(maxJobsPerQuery) {
  return String.raw`(() => {
    const compact = (text) => (text || "").replace(/\s+/g, " ").trim();
    const normalizeJobUrl = (value) => {
      try {
        const url = new URL(value, location.href);
        return url.origin + url.pathname;
      } catch {
        return String(value || "").split("?")[0];
      }
    };
    const cards = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll('a.jobinfo__name[href*="/jobdetail/"], a[href*="/jobdetail/"]'));

    for (const anchor of anchors) {
      const card = anchor.closest(".joblist-box__item, .joblist-box__iteminfo, li, article, .positionlist__list-item");
      const companyAnchor =
        card?.querySelector('a.companyinfo__name[href*="/companydetail/"], a[href*="/companydetail/"]') ||
        card?.querySelector('a[href*="/companydetail/"]');
      const jobUrl = anchor.href;
      const jobTitle = compact(anchor.innerText || anchor.textContent);
      const companyName = compact(companyAnchor?.innerText || companyAnchor?.textContent);

      if (!jobUrl || !jobTitle || seen.has(jobUrl)) {
        continue;
      }

      seen.add(jobUrl);
      cards.push({
        jobTitle,
        jobUrl: normalizeJobUrl(jobUrl),
        companyName,
        companyUrl: companyAnchor?.href || "",
        salary: compact(card?.querySelector(".jobinfo__salary, .summary-planes__salary")?.innerText || ""),
        location: compact(
          card?.querySelector(".jobinfo__other-info-item")?.innerText ||
            card?.querySelector(".jobinfo__other-info")?.innerText ||
            ""
        ),
        cardText: compact(card?.innerText || card?.textContent || "").slice(0, 420),
      });

      if (cards.length >= ${Number(maxJobsPerQuery)}) {
        break;
      }
    }

    const bodyPreview = compact(document.body?.innerText || "").slice(0, 500);
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
    const compact = (text) => (text || "").replace(/\s+/g, " ").trim();
    const bodyPreview = compact(document.body?.innerText || "").slice(0, 800);

    return {
      title: document.title,
      url: location.href,
      blocked: ${BLOCKED_PATTERN}.test(document.title + " " + bodyPreview),
      jobTitle:
        compact(document.querySelector(".summary-planes__title")?.innerText) ||
        compact(document.querySelector("h1")?.innerText),
      salary: compact(document.querySelector(".summary-planes__salary")?.innerText || ""),
      updatedAt: compact(document.querySelector(".summary-planes__time")?.innerText || ""),
      address: compact(document.querySelector(".job-address__content, .job-address")?.innerText || ""),
      jobDescription:
        compact(document.querySelector(".describtion-card")?.innerText || "")
          .replace(/^职位描述\s*/, "")
          .slice(0, 1400),
      companyName: compact(document.querySelector(".company-info__name")?.innerText || ""),
      companyMeta: compact(document.querySelector(".company-info__desc")?.innerText || ""),
      companyBusiness: compact(document.querySelector(".company-info__business")?.innerText || "").slice(0, 700),
    };
  })()`;
}

async function collectSearchJobs(cdp, options, keywordSet) {
  const jobs = [];
  const seenJobUrls = new Set();
  const queryLogs = [];
  let blockedCount = 0;

  for (const city of options.cities) {
    for (const keyword of options.keywords) {
      const searchUrl = buildSearchUrl(city, keyword);
      await cdp.navigate(searchUrl, SEARCH_WAIT_MS);
      const result = await cdp.evaluate(searchExtractionExpression(options.maxJobsPerQuery));

      if (result.blocked) {
        blockedCount += 1;
        queryLogs.push(`${city.name}/${keyword}: blocked`);
        continue;
      }

      const validCards = result.cards
        .map((card) => ({
          ...card,
          city: city.name,
          queryKeyword: keyword,
        }))
        .filter((card) => isUsableCompanyName(card.companyName))
        .filter((card) => card.location.startsWith(city.name))
        .filter((card) => {
          if (seenJobUrls.has(card.jobUrl)) {
            return false;
          }

          seenJobUrls.add(card.jobUrl);
          return true;
        });

      for (const card of validCards) {
        jobs.push({
          ...card,
          searchScore: scoreJob(card, keywordSet),
        });
      }

      queryLogs.push(`${city.name}/${keyword}: ${validCards.length}`);
    }
  }

  jobs.sort((left, right) => right.searchScore - left.searchScore);
  return {
    jobs,
    queryLogs,
    platformStatus:
      blockedCount > 0 && jobs.length === 0 ? "blocked" : jobs.length > 0 ? "ok" : "limited",
  };
}

function orderJobsForCityBalance(jobs, cities) {
  const buckets = cities.map((city) =>
    jobs
      .filter((job) => job.city === city.name)
      .sort((left, right) => right.searchScore - left.searchScore)
  );
  const orderedJobs = [];
  let index = 0;

  while (buckets.some((bucket) => index < bucket.length)) {
    for (const bucket of buckets) {
      if (index < bucket.length) {
        orderedJobs.push(bucket[index]);
      }
    }

    index += 1;
  }

  return orderedJobs;
}

function createCompanySearchJob(card, companyName, city, matchedJobsByUrl) {
  const matchedJob = matchedJobsByUrl.get(sanitizeText(card?.jobUrl, 300));
  return normalizeCollectedJob(
    {
      platform: "智联招聘",
      jobTitle: sanitizeText(card?.jobTitle, 120),
      city,
      salary: sanitizeText(card?.salary, 50),
      publishedAt: matchedJob?.publishedAt || "",
      url: sanitizeText(card?.jobUrl, 300),
      keywordHits: matchedJob?.keywordHits || [],
      descriptionEvidence:
        matchedJob?.descriptionEvidence || sanitizeText(card?.cardText, 320) || companyName,
    },
    "智联招聘",
    city
  );
}

async function collectAllJobsForLead(cdp, lead, options) {
  const city = options.cities.find((item) => item.name === lead.city);
  if (!city) {
    return mergeCollectedJobs(lead.matchedJobs, [], "智联招聘", lead.city);
  }

  const matchedJobsByUrl = new Map(
    (lead.matchedJobs || []).map((job) => [sanitizeText(job?.url, 300), job])
  );
  const companySearchUrl = buildSearchUrl(city, lead.companyName);
  await cdp.navigate(companySearchUrl, SEARCH_WAIT_MS);
  const result = await cdp.evaluate(searchExtractionExpression(options.maxAllJobsPerCompany));

  if (result?.blocked) {
    return mergeCollectedJobs(lead.matchedJobs, [], "智联招聘", lead.city);
  }

  const companyJobs = (result?.cards || [])
    .filter((card) => card?.jobTitle && card?.jobUrl)
    .filter((card) => isSameCompanyName(card.companyName, lead.companyName))
    .filter((card) => !card.location || String(card.location).startsWith(lead.city))
    .slice(0, options.maxAllJobsPerCompany)
    .map((card) => createCompanySearchJob(card, lead.companyName, lead.city, matchedJobsByUrl));

  return mergeCollectedJobs(lead.matchedJobs, companyJobs, "智联招聘", lead.city);
}

async function collectLeads(cdp, options) {
  const keywordSet = createKeywordSet(options.keywords);
  const { jobs, queryLogs, platformStatus } = await collectSearchJobs(cdp, options, keywordSet);
  const orderedJobs = orderJobsForCityBalance(jobs, options.cities);
  const leads = [];
  const leadByCompany = new Map();

  for (const job of orderedJobs) {
    if (
      leads.length >= options.maxCompanies &&
      !leadByCompany.has(`${job.city}::${job.companyName}`)
    ) {
      continue;
    }

    let detail = null;
    if (options.includeDetails) {
      await cdp.navigate(job.jobUrl, DETAIL_WAIT_MS);
      detail = await cdp.evaluate(detailExtractionExpression());
    }

    if (detail?.blocked) {
      continue;
    }

    const companyKey = `${job.city}::${job.companyName}`;
    const existingLead = leadByCompany.get(companyKey);

    if (existingLead) {
      mergeLead(existingLead, job, detail, keywordSet);
      continue;
    }

    if (leads.length >= options.maxCompanies) {
      continue;
    }

    const lead = createLeadFromJob(job, detail, leads.length + 1, keywordSet);
    if (objectMentionsExcludedEntity(lead)) {
      continue;
    }

    leads.push(lead);
    leadByCompany.set(companyKey, lead);
  }

  for (const lead of leads) {
    lead.allJobs = options.includeAllJobs
      ? await collectAllJobsForLead(cdp, lead, options)
      : mergeCollectedJobs(lead.matchedJobs, [], "智联招聘", lead.city);
  }

  return buildPayload({
    leads: rerankRecords(leads),
    cities: options.cities,
    keywords: options.keywords,
    maxCompanies: options.maxCompanies,
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
    const payload = await collectLeads(cdp, options);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

    console.log(`Wrote ${payload.leads.length} Zhaopin recruitment leads to ${outputPath}`);
    console.log(`Updated at: ${payload.updatedAt}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      "If Chrome is not ready, run pnpm zhaopin:browser, login to Zhaopin, then rerun pnpm zhaopin:collect."
    );
    process.exitCode = 1;
  } finally {
    await cdp.dispose();
  }
}

await main();

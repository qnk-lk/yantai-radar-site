#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DEBUG_URL = "http://127.0.0.1:9223";
const DEFAULT_CITIES = [
  { name: "烟台", code: "120400" },
  { name: "青岛", code: "120300" },
];
const DEFAULT_KEYWORDS = ["MES", "WMS", "QMS", "智能制造"];
const DEFAULT_MAX_COMPANIES = 10;
const DEFAULT_MAX_JOBS_PER_QUERY = 20;
const SEARCH_WAIT_MS = 5_000;
const DETAIL_WAIT_MS = 3_500;
const SEARCH_BASE_URL = "https://we.51job.com/pc/search";
const SEARCH_API_BASE_URL = "https://we.51job.com/api/job/search-pc";

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
const SERVICE_JOB_PATTERN = /实施|顾问|售前|项目经理|产品经理|交付|架构|解决方案|软件销售/i;
const INTERNAL_DIGITAL_JOB_PATTERN = /运维|工程师|主管|专员|总监|经理|生产|质量|仓储/i;
const BLOCKED_PATTERN =
  /安全验证|滑动验证|访问异常|访问受限|验证码|页面暂时无法访问|访问验证|请完成验证|验证后继续访问/i;

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..");

function printHelp() {
  console.log(`Usage:
  pnpm run 51job:collect -- --output .tmp/51job-recruitment-leads.json --max-companies 10

Options:
  --debug-url <url>          Chrome remote debugging endpoint. Default: ${DEFAULT_DEBUG_URL}
  --output <path>            Output JSON path. Default: .tmp/51job-recruitment-leads.json
  --max-companies <number>   Unique company limit. Default: ${DEFAULT_MAX_COMPANIES}
  --keywords <list>          Comma-separated keywords. Default: ${DEFAULT_KEYWORDS.join(",")}
  --cities <list>            Comma-separated cityName:51jobAreaCode. Default: 烟台:120400,青岛:120300
  --max-jobs-per-query <n>   Search cards kept from each query. Default: ${DEFAULT_MAX_JOBS_PER_QUERY}
  --no-details               Do not open job detail pages; use search cards only.
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

  return {
    debugUrl: readOption(argv, "debug-url") || DEFAULT_DEBUG_URL,
    output:
      readOption(argv, "output") ||
      path.join(projectRoot, ".tmp", "51job-recruitment-leads.json"),
    maxCompanies: Math.max(
      1,
      Math.min(Number.isFinite(maxCompanies) ? maxCompanies : DEFAULT_MAX_COMPANIES, 30)
    ),
    maxJobsPerQuery: Math.max(
      1,
      Math.min(Number.isFinite(maxJobsPerQuery) ? maxJobsPerQuery : DEFAULT_MAX_JOBS_PER_QUERY, 40)
    ),
    keywords: parseList(readOption(argv, "keywords"), DEFAULT_KEYWORDS),
    cities: parseCities(readOption(argv, "cities")),
    includeDetails: !hasFlag(argv, "no-details"),
  };
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeText(value, maxLength = 260) {
  return compactText(value).slice(0, maxLength);
}

function normalizeOutputPath(outputPath) {
  return path.isAbsolute(outputPath) ? outputPath : path.resolve(projectRoot, outputPath);
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

function buildSearchPageUrl(city, keyword) {
  const url = new URL(SEARCH_BASE_URL);
  url.searchParams.set("jobArea", city.code);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("searchType", "2");
  url.searchParams.set("keywordType", "");
  return url.toString();
}

function buildSearchApiUrl(city, keyword, maxJobsPerQuery) {
  const url = new URL(SEARCH_API_BASE_URL);
  const timestamp = String(Math.floor(Date.now() / 1000));
  url.searchParams.set("api_key", "51job");
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("searchType", "2");
  url.searchParams.set("function", "");
  url.searchParams.set("industry", "");
  url.searchParams.set("jobArea", city.code);
  url.searchParams.set("jobArea2", "");
  url.searchParams.set("landmark", "");
  url.searchParams.set("metro", "");
  url.searchParams.set("salary", "");
  url.searchParams.set("workYear", "");
  url.searchParams.set("degree", "");
  url.searchParams.set("companyType", "");
  url.searchParams.set("companySize", "");
  url.searchParams.set("jobType", "");
  url.searchParams.set("issueDate", "");
  url.searchParams.set("sortType", "0");
  url.searchParams.set("pageNum", "1");
  url.searchParams.set("requestId", "");
  url.searchParams.set("keywordType", "");
  url.searchParams.set("pageSize", String(maxJobsPerQuery));
  url.searchParams.set("source", "1");
  url.searchParams.set("accountId", "");
  url.searchParams.set("pageCode", "sou|sou|soulb");
  url.searchParams.set("scene", "7");
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
  const source = String(text || "").toUpperCase();
  return keywordSet.filter((keyword) => source.includes(keyword.toUpperCase()));
}

function scoreJob(job, keywordSet) {
  const text = `${job.jobTitle} ${job.companyName} ${job.cardText} ${job.queryKeyword}`;
  const hits = findKeywordHits(text, keywordSet);
  let score = hits.length * 10;

  if (/MES|WMS|QMS|MOM|ERP|PLM/i.test(job.jobTitle)) {
    score += 25;
  }

  if (/实施|顾问|售前|项目|产品|开发|运维|工程师|主管|总监|销售/i.test(job.jobTitle)) {
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
    `${detail?.companyMeta || ""} ${detail?.companyIntro || ""}`,
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
    signalSummary: `前程无忧出现“${jobTitle}”岗位，命中 ${keywordHits.length ? keywordHits.join("、") : job.queryKeyword} 等制造业数字化信号。`,
    inferredNeed: classification.inferredNeed,
    matchedKeywords: keywordHits.length ? keywordHits : [job.queryKeyword],
    matchedJobs: [
      {
        platform: "前程无忧",
        jobTitle,
        city: job.city,
        salary,
        publishedAt: sanitizeText(detail?.updatedAt || job.updatedAt || "", 40),
        url: job.jobUrl,
        keywordHits: keywordHits.length ? keywordHits : [job.queryKeyword],
        descriptionEvidence: description || sanitizeText(job.cardText, 220),
      },
    ],
    evidence: [
      {
        source: "前程无忧职位页",
        url: job.jobUrl,
        note: sanitizeText(evidenceNoteParts.join("；"), 520),
      },
    ],
    recommendedAction:
      "先核验公司官网、业务范围和近期招聘连续性，再按潜在客户或同行合作对象分层跟进。",
    riskNotes: "仅基于公开招聘页面反推业务信号；未采集招聘联系人等个人信息。",
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
      platform: "前程无忧",
      jobTitle,
      city: job.city,
      salary: sanitizeText(detail?.salary || job.salary || "", 50),
      publishedAt: sanitizeText(detail?.updatedAt || job.updatedAt || "", 40),
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
    note: "该数据由浏览器访问前程无忧公开搜索接口与职位详情页生成，独立于日报和同行地图；不采集个人联系方式。",
    strategy: {
      cities: cities.map((city) => city.name),
      targetCompanyLimit: maxCompanies,
      primaryPlatforms: ["BOSS直聘", "智联招聘", "前程无忧"],
      fallbackPlatforms: ["猎聘", "小红书", "企查查"],
      keywords,
    },
    platformCoverage: [
      {
        platform: "前程无忧",
        status: platformStatus,
        querySummary: queryLogs.join("；"),
        effectiveCompanyCount,
        note:
          platformStatus === "ok"
            ? "通过浏览器上下文访问搜索接口与职位详情页提取结构化招聘线索。"
            : "前程无忧页面可能出现访问限制或接口异常，需要检查浏览器上下文和网络环境。",
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

  async dispose() {
    try {
      this.ws?.close();
    } finally {
      this.ws = null;
      await this.closeTarget();
    }
  }
}

function searchExtractionExpression(apiUrl) {
  return String.raw`(async () => {
    const compact = (text) => (text || "").replace(/\s+/g, " ").trim();
    const response = await fetch(${JSON.stringify(apiUrl)}, { credentials: "include" });
    const text = await response.text();
    const pagePreview = compact(document.body?.innerText || "").slice(0, 400);

    try {
      const payload = JSON.parse(text);
      const items = payload?.resultbody?.job?.items || [];

      return {
        statusCode: response.status,
        pagePreview,
        blocked: false,
        items: items.map((item) => ({
          jobTitle: compact(item.jobName),
          jobUrl: item.jobHref || "",
          companyName: compact(item.fullCompanyName || item.companyName),
          companyUrl: item.companyHref || "",
          salary: compact(item.provideSalaryString),
          location: compact(item.jobAreaString),
          updatedAt: compact(item.issueDateString),
          jobTags: Array.isArray(item.jobTags) ? item.jobTags.map((tag) => compact(tag)).filter(Boolean) : [],
          companyType: compact(item.companyTypeString),
          companySize: compact(item.companySizeString),
          industry: compact([item.industryType1Str, item.industryType2Str].filter(Boolean).join(" ")),
          workYear: compact(item.workYearString),
          degree: compact(item.degreeString),
          cardText: compact(
            [
              item.jobName,
              item.provideSalaryString,
              item.jobAreaString,
              item.workYearString,
              item.degreeString,
              ...(Array.isArray(item.jobTags) ? item.jobTags : []),
              item.fullCompanyName || item.companyName,
              item.companyTypeString,
              item.companySizeString,
              item.industryType1Str,
              item.industryType2Str,
            ]
              .filter(Boolean)
              .join(" ")
          ).slice(0, 420),
        })),
      };
    } catch (error) {
      const preview = compact(text).slice(0, 500);
      return {
        statusCode: response.status,
        pagePreview,
        blocked: ${BLOCKED_PATTERN}.test(preview),
        parseFailed: true,
        preview,
        items: [],
      };
    }
  })()`;
}

function detailExtractionExpression() {
  return String.raw`(() => {
    const compact = (text) => (text || "").replace(/\s+/g, " ").trim();
    const bodyPreview = compact(document.body?.innerText || "").slice(0, 800);
    const addressNode = Array.from(document.querySelectorAll(".fp, p, div")).find((node) =>
      compact(node.innerText || "").startsWith("上班地址：")
    );

    return {
      title: document.title,
      blocked:
        !document.querySelector("h1") && ${BLOCKED_PATTERN}.test(document.title + " " + bodyPreview),
      jobTitle: compact(document.querySelector("h1")?.innerText || ""),
      salary: compact(document.querySelector(".cn strong")?.innerText || ""),
      updatedAt: compact(document.querySelector(".cn .msg.ltype")?.innerText || ""),
      address: compact((addressNode?.innerText || "").replace(/^上班地址：/, "")),
      jobDescription: compact(document.querySelector(".bmsg.job_msg.inbox")?.innerText || "").slice(0, 1400),
      companyName:
        compact(document.querySelector(".com_name")?.innerText || "") ||
        compact(document.querySelector(".com_msg")?.innerText || ""),
      companyMeta: compact(document.querySelector(".com_tag")?.innerText || ""),
      companyIntro: compact(document.querySelector(".tmsg.inbox")?.innerText || "").slice(0, 700),
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
      await cdp.navigate(buildSearchPageUrl(city, keyword), SEARCH_WAIT_MS);
      const result = await cdp.evaluate(
        searchExtractionExpression(buildSearchApiUrl(city, keyword, options.maxJobsPerQuery))
      );

      if (result.blocked) {
        blockedCount += 1;
        queryLogs.push(`${city.name}/${keyword}: blocked`);
        continue;
      }

      const validItems = (result.items || [])
        .map((item) => ({
          ...item,
          city: city.name,
          queryKeyword: keyword,
        }))
        .filter((item) => item.jobTitle && item.jobUrl && isUsableCompanyName(item.companyName))
        .filter((item) => item.location.startsWith(city.name))
        .filter((item) => {
          if (seenJobUrls.has(item.jobUrl)) {
            return false;
          }

          seenJobUrls.add(item.jobUrl);
          return true;
        });

      for (const item of validItems) {
        jobs.push({
          ...item,
          searchScore: scoreJob(item, keywordSet),
        });
      }

      queryLogs.push(`${city.name}/${keyword}: ${validItems.length}`);
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
    leads.push(lead);
    leadByCompany.set(companyKey, lead);
  }

  return buildPayload({
    leads,
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
  const cdp = new CdpClient(options.debugUrl);

  try {
    await cdp.connect();
    const payload = await collectLeads(cdp, options);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

    console.log(`Wrote ${payload.leads.length} 51job recruitment leads to ${outputPath}`);
    console.log(`Updated at: ${payload.updatedAt}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await cdp.dispose();
  }
}

await main();

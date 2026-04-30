import cors from "@fastify/cors";
import Fastify from "fastify";

import { buildCompanyDuplicateCandidates } from "./lib/company-dedupe.mjs";

import {
  initializeStore,
  readCompanyDuplicateDecision,
  readCompanyDuplicateDecisions,
  readCompanyProfile,
  readCompanyProfiles,
  readCompetitorUpdates,
  readDocument,
  readFollowUpRecord,
  readFollowUpRecords,
  readLeadAction,
  readLeadActions,
  resolveConfig,
  upsertCompanyDuplicateDecision,
  upsertCompanyProfile,
  upsertFollowUpRecord,
  upsertLeadAction,
} from "./lib/store.mjs";

const DEFAULT_TOPBAR_CONTEXT = Object.freeze({
  city: "烟台开发区",
  timezone: "Asia/Shanghai",
  temperature: null,
  condition: null,
  reportTime: "",
  source: "fallback",
});
const DEFAULT_TOPBAR_COORDINATES = Object.freeze({
  latitude: 37.5635523,
  longitude: 121.2373543,
});
const DEFAULT_TOPBAR_WEATHER_TARGET = "370600";
const TOPBAR_CONTEXT_TIMEOUT_MS = 3500;
const TOPBAR_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;
const topbarContextCache = new Map();

function createAbortSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeAmapText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAmapText(item)).find(Boolean) ?? "";
  }

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function buildTopbarCacheKey(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return "default";
  }

  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}

function buildAmapUrl(pathname, params) {
  const url = new URL(`https://restapi.amap.com${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("key", process.env.AMAP_WEB_API_KEY ?? "");
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: createAbortSignal(TOPBAR_CONTEXT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function resolveTopbarLocationLabel(addressComponent) {
  const district = normalizeAmapText(addressComponent?.district);
  const township = normalizeAmapText(addressComponent?.township);
  const city = normalizeAmapText(addressComponent?.city);
  const province = normalizeAmapText(addressComponent?.province);

  return district || township || city || province || DEFAULT_TOPBAR_CONTEXT.city;
}

async function loadTopbarContext(latitude, longitude) {
  const resolvedLatitude = latitude ?? DEFAULT_TOPBAR_COORDINATES.latitude;
  const resolvedLongitude = longitude ?? DEFAULT_TOPBAR_COORDINATES.longitude;
  const cacheKey = buildTopbarCacheKey(resolvedLatitude, resolvedLongitude);
  const cached = topbarContextCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  if (!process.env.AMAP_WEB_API_KEY) {
    return DEFAULT_TOPBAR_CONTEXT;
  }

  const regeoUrl = buildAmapUrl("/v3/geocode/regeo", {
    location: `${resolvedLongitude},${resolvedLatitude}`,
    extensions: "base",
    radius: "1000",
    roadlevel: "0",
  });
  const regeoJson = await fetchJson(regeoUrl);
  const addressComponent = regeoJson?.regeocode?.addressComponent ?? {};
  const weatherTarget =
    normalizeAmapText(addressComponent?.adcode) ||
    normalizeAmapText(addressComponent?.city) ||
    normalizeAmapText(addressComponent?.province) ||
    DEFAULT_TOPBAR_WEATHER_TARGET;
  const weatherUrl = buildAmapUrl("/v3/weather/weatherInfo", {
    city: weatherTarget,
    extensions: "base",
  });
  const weatherJson = await fetchJson(weatherUrl);
  const liveWeather = weatherJson?.lives?.[0] ?? {};
  const temperature = normalizeCoordinate(liveWeather.temperature);
  const payload = {
    city: resolveTopbarLocationLabel(addressComponent),
    timezone: "Asia/Shanghai",
    temperature,
    condition: normalizeAmapText(liveWeather.weather) || null,
    reportTime: normalizeAmapText(liveWeather.reporttime),
    source: "amap",
  };

  topbarContextCache.set(cacheKey, {
    expiresAt: Date.now() + TOPBAR_CONTEXT_CACHE_TTL_MS,
    payload,
  });

  return payload;
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--host" && next) {
      options.host = next;
      index += 1;
      continue;
    }

    if (current === "--port" && next) {
      options.port = Number(next);
      index += 1;
    }
  }

  return options;
}

function normalizeSalesIntelPublishedAt(item) {
  const candidateValues = [
    item?.publishedAt,
    ...(Array.isArray(item?.matchedJobs) ? item.matchedJobs.map((job) => job?.publishedAt) : []),
  ];

  for (const value of candidateValues) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getShanghaiDateKey(value) {
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

function getTodayShanghaiDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getRecruitmentUpdatedAt(payload) {
  if (!Array.isArray(payload?.sourceBreakdown)) {
    return "";
  }

  const recruitmentSource = payload.sourceBreakdown.find((item) => item?.kind === "recruitment");
  return typeof recruitmentSource?.updatedAt === "string" ? recruitmentSource.updatedAt : "";
}

function getCurrentDayTodayHighlights(payload) {
  const todayDateKey = getTodayShanghaiDateKey();
  const recruitmentDateKey = getShanghaiDateKey(getRecruitmentUpdatedAt(payload));

  if (!todayDateKey || recruitmentDateKey !== todayDateKey) {
    return [];
  }

  if (!Array.isArray(payload?.todayHighlights)) {
    return [];
  }

  return payload.todayHighlights.filter((item) => {
    const itemDateKey = getShanghaiDateKey(item?.retrievedAt || item?.publishedAt);
    return !itemDateKey || itemDateKey === todayDateKey;
  });
}

function createSalesIntelListItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    retrievedAt: item.retrievedAt ?? null,
    category: item.category,
    title: item.title,
    subtitle: item.subtitle,
    summary: item.summary,
    sourceLabel: item.sourceLabel,
    publishedAt: normalizeSalesIntelPublishedAt(item),
    location: item.location,
    entity: item.entity,
    strength: item.strength,
    actionText: item.actionText,
    tags: Array.isArray(item.tags) ? item.tags : [],
  };
}

function createCurrentDaySalesIntelPayload(payload) {
  const todayHighlights = getCurrentDayTodayHighlights(payload);
  const totals = {
    ...(payload?.totals ?? {}),
    todayHighlights: todayHighlights.length,
  };

  return {
    ...payload,
    todaySearchItems:
      todayHighlights.length && Array.isArray(payload?.todaySearchItems)
        ? payload.todaySearchItems
        : [],
    totals,
    todayHighlights,
  };
}

function createSalesIntelListPayload(payload) {
  const currentDayPayload = createCurrentDaySalesIntelPayload(payload);

  return {
    updatedAt: currentDayPayload.updatedAt,
    todaySearchItems: Array.isArray(currentDayPayload.todaySearchItems)
      ? currentDayPayload.todaySearchItems
      : [],
    summary: currentDayPayload.summary,
    totals: currentDayPayload.totals,
    sourceBreakdown: Array.isArray(currentDayPayload.sourceBreakdown)
      ? currentDayPayload.sourceBreakdown
      : [],
    feed: Array.isArray(currentDayPayload.feed)
      ? currentDayPayload.feed.map(createSalesIntelListItem)
      : [],
    todayHighlights: Array.isArray(currentDayPayload.todayHighlights)
      ? currentDayPayload.todayHighlights.map(createSalesIntelListItem)
      : [],
  };
}

function getSalesIntelItemDateKey(item) {
  return getShanghaiDateKey(item?.retrievedAt || normalizeSalesIntelPublishedAt(item));
}

function createTrendDateRange(items, updatedAt, days = 7) {
  const parsedTimes = items
    .map((item) => {
      const dateKey = getSalesIntelItemDateKey(item);
      return dateKey ? new Date(`${dateKey}T00:00:00+08:00`).getTime() : Number.NaN;
    })
    .filter((value) => Number.isFinite(value));
  const fallbackTime = getShanghaiDateKey(updatedAt)
    ? new Date(`${getShanghaiDateKey(updatedAt)}T00:00:00+08:00`).getTime()
    : Date.now();
  const baseTime = parsedTimes.length ? Math.max(...parsedTimes) : fallbackTime;
  const baseDate = new Date(baseTime);

  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - (days - 1 - index));
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

    return {
      date: dateKey,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      total: 0,
      report: 0,
      recruitment: 0,
      highStrength: 0,
    };
  });
}

function isHighStrength(value) {
  return ["高", "high", "strong"].includes(String(value || "").trim().toLowerCase());
}

function buildSalesTrend(payload) {
  const items = Array.isArray(payload?.feed) ? payload.feed : [];
  const days = createTrendDateRange(items, payload?.updatedAt);
  const dayMap = new Map(days.map((item) => [item.date, item]));

  for (const item of items) {
    const dateKey = getSalesIntelItemDateKey(item);
    const bucket = dayMap.get(dateKey);

    if (!bucket) {
      continue;
    }

    bucket.total += 1;

    if (item?.kind === "report") {
      bucket.report += 1;
    }

    if (item?.kind === "recruitment") {
      bucket.recruitment += 1;
    }

    if (isHighStrength(item?.strength)) {
      bucket.highStrength += 1;
    }
  }

  return days;
}

function getFreshnessStatus(updatedAt, maxAgeHours = 30) {
  const dateKey = getShanghaiDateKey(updatedAt);

  if (!dateKey) {
    return "missing";
  }

  const parsedDate = new Date(String(updatedAt).replace(/\s*CST$/u, ""));
  const time = Number.isNaN(parsedDate.getTime())
    ? new Date(`${dateKey}T00:00:00+08:00`).getTime()
    : parsedDate.getTime();
  const ageHours = (Date.now() - time) / (1000 * 60 * 60);

  if (ageHours > maxAgeHours) {
    return "stale";
  }

  return "normal";
}

function buildOverviewStatsPayload(db) {
  const salesDocument = readDocument(db, "salesIntel");
  const recruitmentDocument = readDocument(db, "recruitmentLeads");
  const competitorDocument = readDocument(db, "competitors");
  const salesPayload = salesDocument?.payload ?? {};
  const recruitmentPayload = recruitmentDocument?.payload ?? {};
  const competitorPayload = competitorDocument?.payload ?? {};
  const currentSalesPayload = createCurrentDaySalesIntelPayload(salesPayload);
  const leadActions = readLeadActions(db);
  const followUpRecords = readFollowUpRecords(db);
  const companyProfiles = readCompanyProfiles(db);
  const actionCompanyIds = new Set(
    leadActions
      .filter((item) => item.status === "follow_up" || item.status === "company")
      .map((item) => item.companyId)
      .filter(Boolean)
  );
  const selectedPlatforms = [
    ...(recruitmentPayload?.strategy?.selectedPlatforms ?? []),
    ...(recruitmentPayload?.strategy?.primaryPlatforms ?? []),
  ].filter(Boolean);
  const sourceItems = [
    {
      key: "report",
      label: "OpenClaw 日报",
      updatedAt:
        currentSalesPayload.sourceBreakdown?.find((item) => item?.kind === "report")?.updatedAt ??
        "",
      count: currentSalesPayload.totals?.reportItems ?? 0,
    },
    {
      key: "recruitment",
      label: "招聘与平台聚合",
      updatedAt:
        currentSalesPayload.sourceBreakdown?.find((item) => item?.kind === "recruitment")
          ?.updatedAt ?? "",
      count: currentSalesPayload.totals?.recruitmentItems ?? 0,
    },
    {
      key: "competitor",
      label: "同行链路",
      updatedAt: competitorPayload?.updatedAt ?? competitorDocument?.updatedAt ?? "",
      count: Array.isArray(competitorPayload?.competitors) ? competitorPayload.competitors.length : 0,
    },
    {
      key: "followUp",
      label: "跟进记录",
      updatedAt: followUpRecords[0]?.updatedAt ?? "",
      count: followUpRecords.length,
    },
  ].map((item) => ({
    ...item,
    status: getFreshnessStatus(item.updatedAt),
  }));

  return {
    updatedAt: new Date().toISOString(),
    salesUpdatedAt: currentSalesPayload.updatedAt ?? salesDocument?.updatedAt ?? "",
    trend: {
      days: buildSalesTrend(salesPayload),
    },
    funnel: {
      totalSignals: currentSalesPayload.totals?.overall ?? 0,
      companyCount: companyProfiles.length,
      actionCompanyCount: actionCompanyIds.size,
      activeFollowUps: followUpRecords.filter((item) => item.reminderStatus !== "completed").length,
      closedFollowUps: followUpRecords.filter((item) => item.reminderStatus === "completed").length,
    },
    platforms: {
      selectedPlatforms: [...new Set(selectedPlatforms)],
      coverage: Array.isArray(recruitmentPayload?.platformCoverage)
        ? recruitmentPayload.platformCoverage
        : [],
      updatedAt: recruitmentPayload?.updatedAt ?? recruitmentDocument?.updatedAt ?? "",
      status: recruitmentPayload?.status ?? "",
    },
    sources: {
      normalCount: sourceItems.filter((item) => item.status === "normal").length,
      totalCount: sourceItems.length,
      items: sourceItems,
    },
  };
}

function findSalesIntelItem(payload, itemId) {
  const collections = [payload?.feed, payload?.todayHighlights];

  for (const items of collections) {
    if (!Array.isArray(items)) {
      continue;
    }

    const match = items.find((item) => item?.id === itemId);
    if (match) {
      return match;
    }
  }

  return null;
}

function buildApp(config, db) {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.get("/api/health", async () => {
    const rows = db.prepare("SELECT key, source, updated_at FROM documents ORDER BY key").all();
    const tableCounts = {
      documents: db.prepare("SELECT COUNT(*) AS count FROM documents").get().count,
      followUpRecords: db.prepare("SELECT COUNT(*) AS count FROM follow_up_records").get().count,
      followUpEvents: db.prepare("SELECT COUNT(*) AS count FROM follow_up_events").get().count,
      companyProfiles: db.prepare("SELECT COUNT(*) AS count FROM company_profiles").get().count,
      leadActions: db.prepare("SELECT COUNT(*) AS count FROM lead_actions").get().count,
      companyDuplicateDecisions: db
        .prepare("SELECT COUNT(*) AS count FROM company_duplicate_decisions")
        .get().count,
      competitorMaster: db.prepare("SELECT COUNT(*) AS count FROM competitor_master").get().count,
      competitorSnapshots: db.prepare("SELECT COUNT(*) AS count FROM competitor_snapshots").get()
        .count,
      competitorUpdates: db.prepare("SELECT COUNT(*) AS count FROM competitor_updates").get().count,
    };

    return {
      ok: true,
      dataDir: config.dataDir,
      dbPath: config.dbPath,
      timestamp: new Date().toISOString(),
      documents: rows,
      tableCounts,
    };
  });

  app.get("/api/radar/latest", async (_request, reply) => {
    const document = readDocument(db, "radar");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Radar data not found",
      };
    }

    return document.payload;
  });

  app.get("/api/competitors", async (_request, reply) => {
    const document = readDocument(db, "competitors");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Competitor data not found",
      };
    }

    return document.payload;
  });

  app.get("/api/sales/intel", async (request, reply) => {
    const document = readDocument(db, "salesIntel");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Sales intel data not found",
      };
    }

    if (String(request.query?.full || "") === "1") {
      return createCurrentDaySalesIntelPayload(document.payload);
    }

    return createSalesIntelListPayload(document.payload);
  });

  app.get("/api/sales/intel/items/:id", async (request, reply) => {
    const document = readDocument(db, "salesIntel");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Sales intel data not found",
      };
    }

    const item = findSalesIntelItem(document.payload, request.params?.id);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        message: "Sales intel item not found",
      };
    }

    return item;
  });

  app.get("/api/overview/stats", async () => buildOverviewStatsPayload(db));

  app.get("/api/company-duplicates", async (_request, reply) => {
    const document = readDocument(db, "salesIntel");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Sales intel data not found",
      };
    }

    const items = Array.isArray(document.payload?.feed) ? document.payload.feed : [];
    const decisions = readCompanyDuplicateDecisions(db);
    const decisionMap = new Map(decisions.map((decision) => [decision.duplicateKey, decision]));
    const groups = buildCompanyDuplicateCandidates(items).filter((group) => {
      const decision = decisionMap.get(group.duplicateKey);
      return !decision;
    });

    return {
      groups,
      decisions,
      totals: {
        groups: groups.length,
        companies: groups.reduce((total, group) => total + group.companies.length, 0),
        decisions: decisions.length,
      },
      updatedAt: document.payload?.updatedAt ?? document.updatedAt,
    };
  });

  app.get("/api/company-duplicates/:duplicateKey", async (request, reply) => {
    const item = readCompanyDuplicateDecision(db, request.params?.duplicateKey);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        message: "Company duplicate decision not found",
      };
    }

    return item;
  });

  app.put("/api/company-duplicates/:duplicateKey", async (request, reply) => {
    try {
      const item = upsertCompanyDuplicateDecision(db, {
        ...(request.body ?? {}),
        duplicateKey: request.params?.duplicateKey,
      });

      return {
        ok: true,
        item,
      };
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid company duplicate decision",
      };
    }
  });

  app.get("/api/topbar/context", async (request) => {
    const latitude = normalizeCoordinate(request.query?.latitude ?? request.query?.lat);
    const longitude = normalizeCoordinate(request.query?.longitude ?? request.query?.lon);

    try {
      return await loadTopbarContext(latitude, longitude);
    } catch (error) {
      app.log.warn({ error }, "Failed to load topbar context");
      return DEFAULT_TOPBAR_CONTEXT;
    }
  });

  app.get("/api/competitors/updates", async (request) => {
    const limit = Number(request.query?.limit);

    return {
      items: readCompetitorUpdates(db, limit),
    };
  });

  app.get("/api/follow-ups", async () => {
    const items = readFollowUpRecords(db);

    return {
      items,
      totals: {
        overall: items.length,
        assigned: items.filter((item) => item.owner).length,
        unassigned: items.filter((item) => !item.owner).length,
      },
    };
  });

  app.get("/api/follow-ups/:companyId", async (request, reply) => {
    const item = readFollowUpRecord(db, request.params?.companyId);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        message: "Follow-up record not found",
      };
    }

    return item;
  });

  app.put("/api/follow-ups/:companyId", async (request, reply) => {
    try {
      const item = upsertFollowUpRecord(db, {
        ...(request.body ?? {}),
        companyId: request.params?.companyId,
      });

      return {
        ok: true,
        item,
      };
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid follow-up record",
      };
    }
  });

  app.get("/api/company-profiles", async () => {
    const items = readCompanyProfiles(db);

    return {
      items,
      totals: {
        overall: items.length,
      },
    };
  });

  app.get("/api/company-profiles/:companyId", async (request, reply) => {
    const item = readCompanyProfile(db, request.params?.companyId);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        message: "Company profile not found",
      };
    }

    return item;
  });

  app.put("/api/company-profiles/:companyId", async (request, reply) => {
    try {
      const item = upsertCompanyProfile(db, {
        ...(request.body ?? {}),
        companyId: request.params?.companyId,
      });

      return {
        ok: true,
        item,
      };
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid company profile",
      };
    }
  });

  app.get("/api/lead-actions", async () => {
    const items = readLeadActions(db);

    return {
      items,
      totals: {
        overall: items.length,
      },
    };
  });

  app.get("/api/lead-actions/:itemId", async (request, reply) => {
    const item = readLeadAction(db, request.params?.itemId);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        message: "Lead action not found",
      };
    }

    return item;
  });

  app.put("/api/lead-actions/:itemId", async (request, reply) => {
    try {
      const item = upsertLeadAction(db, {
        ...(request.body ?? {}),
        itemId: request.params?.itemId,
      });

      return {
        ok: true,
        item,
      };
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid lead action",
      };
    }
  });

  app.get("/api/recruitment/leads", async (_request, reply) => {
    const document = readDocument(db, "recruitmentLeads");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Recruitment lead data not found",
      };
    }

    return document.payload;
  });

  app.get("/api/admin/divisions", async (_request, reply) => {
    const document = readDocument(db, "adminDivisions");

    if (!document) {
      reply.code(404);
      return {
        ok: false,
        message: "Admin division data not found",
      };
    }

    return document.payload;
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
}

const cliOptions = parseCliArgs(process.argv.slice(2));
const config = {
  ...resolveConfig(),
  ...(cliOptions.host ? { host: cliOptions.host } : {}),
  ...(Number.isFinite(cliOptions.port) ? { port: cliOptions.port } : {}),
};
const database = await initializeStore(config);
const app = buildApp(config, database);

try {
  await app.listen({
    host: config.host,
    port: config.port,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

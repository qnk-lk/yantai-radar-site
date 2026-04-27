import cors from "@fastify/cors";
import Fastify from "fastify";

import {
  initializeStore,
  readCompanyProfile,
  readCompanyProfiles,
  readCompetitorUpdates,
  readDocument,
  readFollowUpRecord,
  readFollowUpRecords,
  resolveConfig,
  upsertCompanyProfile,
  upsertFollowUpRecord,
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
      competitorMaster: db.prepare("SELECT COUNT(*) AS count FROM competitor_master").get().count,
      competitorSnapshots: db.prepare("SELECT COUNT(*) AS count FROM competitor_snapshots").get().count,
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

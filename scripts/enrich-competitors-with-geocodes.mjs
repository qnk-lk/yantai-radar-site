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

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => compactText(value)).filter(Boolean))];
}

function normalizeCoordinate(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
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

const LOW_PRECISION_LEVELS = new Set([
  "country",
  "province",
  "city",
  "district",
  "development_zone",
  "\u56fd\u5bb6",
  "\u7701",
  "\u57ce\u5e02",
  "\u533a\u53bf",
  "\u5f00\u53d1\u533a",
]);

function isUsableGeocodeLevel(level) {
  const normalizedLevel = compactText(level).toLowerCase();
  if (!normalizedLevel) {
    return true;
  }

  return !LOW_PRECISION_LEVELS.has(normalizedLevel);
}

function getConfidenceByQueryType(queryType) {
  if (queryType === "address") {
    return "high";
  }

  if (queryType === "location" || queryType === "poi") {
    return "medium";
  }

  return "medium";
}

function parseLocationValue(value) {
  const [longitude, latitude] = String(value || "")
    .split(",")
    .map((item) => Number(item));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function buildQueryCandidates(company) {
  const regionPrefix = uniqueStrings([company.province, company.city, company.district]).join("");
  const cityScope = uniqueStrings([company.city, company.district]).join("");
  const candidates = [];

  for (const address of uniqueStrings([company.address])) {
    candidates.push({
      queryType: "address",
      address,
      city: cityScope,
      keyword: `${regionPrefix}${address}`,
    });
  }

  for (const location of uniqueStrings([company.location])) {
    candidates.push({
      queryType: "location",
      address: location,
      city: cityScope,
      keyword: `${regionPrefix}${location}`,
    });
  }

  for (const poiName of uniqueStrings([company.poiName])) {
    candidates.push({
      queryType: "poi",
      address: poiName,
      city: cityScope,
      keyword: `${regionPrefix}${poiName}`,
    });
  }

  const companyQuery = compactText(company.companyName);
  if (companyQuery) {
    candidates.push({
      queryType: "company",
      address: companyQuery,
      city: cityScope,
      keyword: `${regionPrefix}${companyQuery}`,
    });
  }

  return uniqueStrings(candidates.map((item) => `${item.queryType}::${item.city}::${item.keyword}`)).map(
    (key) => {
      const [queryType, city, keyword] = key.split("::");
      return {
        queryType,
        city,
        keyword,
        address: keyword,
      };
    }
  );
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

async function geocodeWithAmap({ key, address, city }) {
  const searchParams = new URLSearchParams({
    key,
    address,
    output: "JSON",
  });

  if (city) {
    searchParams.set("city", city);
  }

  const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Amap geocode failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "1" || !Array.isArray(payload.geocodes) || !payload.geocodes.length) {
    return null;
  }

  const geocode = payload.geocodes[0];
  const coordinates = parseLocationValue(geocode.location);
  if (!coordinates || !isUsableGeocodeLevel(geocode.level)) {
    return null;
  }

  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    province: compactText(geocode.province),
    city: Array.isArray(geocode.city)
      ? compactText(geocode.city[0])
      : compactText(geocode.city),
    district: compactText(geocode.district),
    address: compactText(geocode.formatted_address || geocode.formattedAddress),
    level: compactText(geocode.level),
  };
}

async function geocodeCandidate(candidate, provider, amapKey) {
  if (provider !== "amap" || !amapKey) {
    return null;
  }

  return geocodeWithAmap({
    key: amapKey,
    address: candidate.address,
    city: candidate.city,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const inputPath = readOption(argv, "input");
  const outputPath = readOption(argv, "output") || inputPath;
  const cachePath = readOption(argv, "cache");
  const provider = compactText(
    readOption(argv, "provider") || process.env.COMPETITOR_GEOCODER_PROVIDER || "amap"
  ).toLowerCase();
  const amapKey = compactText(
    readOption(argv, "amap-key") || process.env.AMAP_WEB_API_KEY || process.env.GAODE_WEB_API_KEY
  );

  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: node enrich-competitors-with-geocodes.mjs --input <path> [--output <path>] [--cache <path>]"
    );
  }

  const payload = await readJsonSafe(inputPath, null);
  if (!payload || !Array.isArray(payload.competitors)) {
    throw new Error(`Invalid competitors payload: ${inputPath}`);
  }

  const cache = await readJsonSafe(cachePath, {});
  let cacheDirty = false;
  let geocodedCount = 0;
  const canCallProvider = !(provider === "amap" && !amapKey);

  if (!canCallProvider) {
    console.log("Skip competitor geocoding: AMAP_WEB_API_KEY is not configured.");
  }

  for (const company of payload.competitors) {
    const existingLatitude = normalizeCoordinate(company.latitude);
    const existingLongitude = normalizeCoordinate(company.longitude);

    if (existingLatitude !== null && existingLongitude !== null) {
      continue;
    }

    const candidates = buildQueryCandidates(company);
    for (const candidate of candidates) {
      const cacheKey = `${provider}::${candidate.queryType}::${candidate.city}::${candidate.address}`;
      const cached = cache[cacheKey];

      if (cached?.ok && cached.result) {
        Object.assign(company, {
          latitude: cached.result.latitude,
          longitude: cached.result.longitude,
          province: company.province || cached.result.province,
          city: company.city || cached.result.city,
          district: company.district || cached.result.district,
          address: company.address || cached.result.address,
          location: company.location || cached.result.address,
          geocodeSource: provider,
          geocodeConfidence: cached.result.confidence,
          geocodedAt: cached.result.geocodedAt,
        });
        geocodedCount += 1;
        break;
      }

      if (cached && cached.ok === false) {
        continue;
      }

      if (!canCallProvider) {
        continue;
      }

      let result = null;
      try {
        result = await geocodeCandidate(candidate, provider, amapKey);
      } catch (error) {
        console.warn(
          `Geocode failed for ${company.companyName} (${candidate.queryType}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (!result) {
        cache[cacheKey] = {
          ok: false,
          checkedAt: getShanghaiUpdatedAt(),
        };
        cacheDirty = true;
        continue;
      }

      const geocodedAt = getShanghaiUpdatedAt();
      const confidence = getConfidenceByQueryType(candidate.queryType);
      cache[cacheKey] = {
        ok: true,
        checkedAt: geocodedAt,
        result: {
          ...result,
          confidence,
          geocodedAt,
        },
      };
      cacheDirty = true;

      Object.assign(company, {
        latitude: result.latitude,
        longitude: result.longitude,
        province: company.province || result.province,
        city: company.city || result.city,
        district: company.district || result.district,
        address: company.address || result.address,
        location: company.location || result.address,
        geocodeSource: provider,
        geocodeConfidence: confidence,
        geocodedAt,
      });
      geocodedCount += 1;
      break;
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  if (cachePath && cacheDirty) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
  }

  console.log(`Geocoded ${geocodedCount} competitor records.`);
}

await main();

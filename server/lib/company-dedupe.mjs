const REGION_PREFIX_PATTERN =
  /^(中国|山东省?|烟台市?|青岛市?|威海市?|潍坊市?|济南市?|淄博市?|临沂市?|日照市?|东营市?|滨州市?|德州市?|泰安市?|济宁市?|枣庄市?|聊城市?|菏泽市?)/u;
const LEGAL_SUFFIX_PATTERN =
  /(股份有限公司|有限责任公司|集团有限公司|有限公司|分公司|集团公司|股份公司|公司)$/u;

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

function resolveCompanyName(item) {
  return compactText(item?.entity || item?.companyName || item?.title || "");
}

function resolveCity(item) {
  return compactText(
    item?.location || item?.city || item?.matchedJobs?.find((job) => compactText(job?.city))?.city
  );
}

function splitSourceLabels(value) {
  return [
    ...new Set(
      compactText(value)
        .split(/[、,，/]/u)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function compareTimeDesc(left, right) {
  return compactText(right).localeCompare(compactText(left));
}

function uniqueStrings(values) {
  return [...new Set(values.map((item) => compactText(item)).filter(Boolean))];
}

export function normalizeCompanyDuplicateKey(value) {
  let normalized = compactText(value)
    .replace(/[（）()【】\[\]{}「」『』"'“”‘’·.,，。:：;；\-_/\\|]/gu, "")
    .replace(REGION_PREFIX_PATTERN, "")
    .replace(LEGAL_SUFFIX_PATTERN, "");

  let previous = "";
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(REGION_PREFIX_PATTERN, "").replace(LEGAL_SUFFIX_PATTERN, "");
  }

  return normalized;
}

function buildCompanyEntries(items) {
  const companyMap = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const companyName = resolveCompanyName(item);
    if (!companyName) {
      continue;
    }

    const city = resolveCity(item);
    const companyId = `${companyName}::${city || "unknown"}`;
    const sourcePlatforms = uniqueStrings([
      ...splitSourceLabels(item?.sourceLabel),
      ...((item?.matchedJobs ?? []).map((job) => job?.platform) || []),
      ...((item?.allJobs ?? []).map((job) => job?.platform) || []),
    ]);
    const signalTime = compactText(item?.retrievedAt || item?.publishedAt || "");
    const current = companyMap.get(companyId);

    if (!current) {
      companyMap.set(companyId, {
        companyId,
        companyName,
        city,
        duplicateKey: normalizeCompanyDuplicateKey(companyName),
        latestRetrievedAt: signalTime,
        signalCount: 1,
        sourcePlatforms,
        sampleTitle: compactText(item?.title),
        sampleSummary: compactText(item?.summary),
      });
      continue;
    }

    current.signalCount += 1;
    current.sourcePlatforms = uniqueStrings([...current.sourcePlatforms, ...sourcePlatforms]);

    if (compareTimeDesc(current.latestRetrievedAt, signalTime) > 0) {
      current.latestRetrievedAt = signalTime;
      current.sampleTitle = compactText(item?.title) || current.sampleTitle;
      current.sampleSummary = compactText(item?.summary) || current.sampleSummary;
    }
  }

  return [...companyMap.values()];
}

function scoreDuplicateGroup(companies) {
  const cityCount = new Set(companies.map((company) => company.city).filter(Boolean)).size;
  const sourceCount = new Set(companies.flatMap((company) => company.sourcePlatforms)).size;
  const signalCount = companies.reduce((total, company) => total + company.signalCount, 0);

  return Math.min(100, 58 + companies.length * 10 + sourceCount * 4 + signalCount + cityCount * 2);
}

function buildReason(companies) {
  const cities = uniqueStrings(companies.map((company) => company.city));
  const sourcePlatforms = uniqueStrings(companies.flatMap((company) => company.sourcePlatforms));
  const reasons = ["企业名称去除地区前缀和工商后缀后高度一致"];

  if (cities.length) {
    reasons.push(`城市范围：${cities.join("、")}`);
  }

  if (sourcePlatforms.length) {
    reasons.push(`来源平台：${sourcePlatforms.join("、")}`);
  }

  return reasons;
}

export function buildCompanyDuplicateCandidates(items) {
  const entries = buildCompanyEntries(items).filter(
    (entry) => entry.duplicateKey && entry.duplicateKey.length >= 2
  );
  const duplicateMap = new Map();

  for (const entry of entries) {
    const list = duplicateMap.get(entry.duplicateKey) ?? [];
    list.push(entry);
    duplicateMap.set(entry.duplicateKey, list);
  }

  return [...duplicateMap.entries()]
    .map(([duplicateKey, companies]) => ({
      id: duplicateKey,
      duplicateKey,
      canonicalName: [...companies].sort((left, right) => {
        const signalOrder = right.signalCount - left.signalCount;
        if (signalOrder !== 0) {
          return signalOrder;
        }

        return left.companyName.length - right.companyName.length;
      })[0].companyName,
      confidence: scoreDuplicateGroup(companies),
      reasons: buildReason(companies),
      companies: [...companies].sort((left, right) => {
        const nameOrder = left.companyName.localeCompare(right.companyName, "zh-CN");
        if (nameOrder !== 0) {
          return nameOrder;
        }

        return left.city.localeCompare(right.city, "zh-CN");
      }),
    }))
    .filter((group) => group.companies.length > 1)
    .sort((left, right) => {
      const confidenceOrder = right.confidence - left.confidence;
      if (confidenceOrder !== 0) {
        return confidenceOrder;
      }

      return right.companies.length - left.companies.length;
    });
}

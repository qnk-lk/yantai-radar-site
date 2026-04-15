const EXCLUDED_ENTITY_ALIASES = [
  "烟台市利道软件科技有限公司",
  "烟台利道软件科技有限公司",
  "利道软件科技有限公司",
  "烟台利道软件",
  "烟台利道",
  "利道软件",
];

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return compactText(value)
    .replace(/[\s"'`~!@#$%^&*()_+\-=[\]{};:\\|,.<>/?，。；：、“”‘’（）【】《》]/g, "")
    .toUpperCase();
}

const NORMALIZED_EXCLUDED_ENTITY_ALIASES = EXCLUDED_ENTITY_ALIASES.map(normalizeText).filter(Boolean);

export function containsExcludedEntityText(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return false;
  }

  return NORMALIZED_EXCLUDED_ENTITY_ALIASES.some((alias) => normalizedValue.includes(alias));
}

export function objectMentionsExcludedEntity(value, seen = new Set()) {
  if (typeof value === "string") {
    return containsExcludedEntityText(value);
  }

  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => objectMentionsExcludedEntity(item, seen));
  }

  return Object.values(value).some((item) => objectMentionsExcludedEntity(item, seen));
}

export function filterExcludedEntities(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !objectMentionsExcludedEntity(item));
}

export function rerankRecords(items) {
  return filterExcludedEntities(items).map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

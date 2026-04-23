import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const projectRoot = path.resolve(currentDir, "..", "..");
const defaultDataDir = path.join(projectRoot, "public");
const defaultDbPath = path.join(projectRoot, "server", "data", "radar.sqlite");
const COMPETITOR_STALE_THRESHOLD = 3;
const COMPETITOR_CITY_PRIORITY = ["烟台", "青岛"];
const COMPETITOR_DISTANCE_PRIORITY = ["烟台本地", "青岛重点"];
const DEFAULT_COMPETITOR_UPDATE_LIMIT = 40;
const FOLLOW_UP_STAGES = new Set(["priority", "watch", "screening"]);
const FOLLOW_UP_COMMUNICATION_METHODS = new Set(["phone", "wechat", "visit", "email", "other"]);
const FOLLOW_UP_CONTACT_RESULTS = new Set([
  "not_contacted",
  "connected",
  "interested",
  "no_need",
  "pending",
  "invalid",
]);
const FOLLOW_UP_DEAL_STAGES = new Set([
  "lead",
  "qualified",
  "contacted",
  "proposal",
  "won",
  "lost",
]);
const FOLLOW_UP_EXTRA_COLUMNS = [
  ["communication_method", "TEXT NOT NULL DEFAULT ''"],
  ["contact_result", "TEXT NOT NULL DEFAULT ''"],
  ["next_action", "TEXT NOT NULL DEFAULT ''"],
  ["deal_stage", "TEXT NOT NULL DEFAULT ''"],
];

export const DOCUMENT_DEFINITIONS = {
  radar: {
    fileName: "latest.json",
  },
  salesIntel: {
    fileName: "sales-intel.json",
  },
  competitors: {
    fileName: "competitors.json",
  },
  recruitmentLeads: {
    fileName: "recruitment-leads.json",
  },
  adminDivisions: {
    fileName: "china-admin-divisions.json",
  },
};

export function resolveConfig() {
  return {
    host: process.env.RADAR_API_HOST || "127.0.0.1",
    port: Number(process.env.RADAR_API_PORT || 3180),
    dataDir: process.env.RADAR_DATA_DIR || defaultDataDir,
    dbPath: process.env.RADAR_DB_PATH || defaultDbPath,
  };
}

export async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJsonFile(dataDir, fileName) {
  const filePath = path.join(dataDir, fileName);
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export async function readJsonPath(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export function createDatabase(dbPath) {
  return new DatabaseSync(dbPath);
}

function parseJsonText(value, fallback) {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function normalizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeEvidenceItem(value) {
  return {
    source: normalizeText(value?.source),
    url: normalizeText(value?.url),
    note: normalizeText(value?.note),
  };
}

function normalizeCompetitor(value, index) {
  return {
    rank: Number.isFinite(value?.rank) ? Number(value.rank) : index + 1,
    companyName: normalizeText(value?.companyName),
    province: normalizeText(value?.province),
    city: normalizeText(value?.city),
    district: normalizeText(value?.district),
    location: normalizeText(value?.location),
    address: normalizeText(value?.address),
    poiName: normalizeText(value?.poiName),
    latitude: normalizeOptionalNumber(value?.latitude),
    longitude: normalizeOptionalNumber(value?.longitude),
    geocodeSource: normalizeText(value?.geocodeSource),
    geocodeConfidence: normalizeText(value?.geocodeConfidence),
    geocodedAt: normalizeText(value?.geocodedAt),
    distanceTier: normalizeText(value?.distanceTier),
    serviceFit: normalizeText(value?.serviceFit),
    manufacturingFocus: normalizeText(value?.manufacturingFocus),
    coreServices: normalizeStringList(value?.coreServices),
    whyRelevant: normalizeText(value?.whyRelevant),
    evidenceStrength: normalizeText(value?.evidenceStrength),
    evidence: Array.isArray(value?.evidence)
      ? value.evidence
          .map((item) => normalizeEvidenceItem(item))
          .filter((item) => item.source || item.url || item.note)
      : [],
  };
}

function normalizeCompetitorPayload(payload) {
  const baselineEvidence = Array.isArray(payload?.baseline?.evidence)
    ? payload.baseline.evidence
        .map((item) => normalizeEvidenceItem(item))
        .filter((item) => item.source || item.url || item.note)
    : [];

  return {
    updatedAt: normalizeText(payload?.updatedAt, "等待首次自动同步"),
    status: normalizeText(payload?.status),
    note: normalizeText(payload?.note),
    baseline: {
      companyName: normalizeText(payload?.baseline?.companyName),
      serviceScopeSummary: normalizeText(payload?.baseline?.serviceScopeSummary),
      evidence: baselineEvidence,
    },
    competitors: Array.isArray(payload?.competitors)
      ? payload.competitors
          .map((item, index) => normalizeCompetitor(item, index))
          .filter((item) => item.companyName && item.city)
      : [],
  };
}

function createCompetitorId(companyName, city) {
  return createHash("sha1")
    .update(`${normalizeText(city)}::${normalizeText(companyName)}`, "utf8")
    .digest("hex");
}

function createEvidenceId(competitorId, evidence) {
  return createHash("sha1")
    .update(
      [
        competitorId,
        normalizeText(evidence.source),
        normalizeText(evidence.url),
        normalizeText(evidence.note),
      ].join("::"),
      "utf8"
    )
    .digest("hex");
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatUpdateValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function parseStoredUpdateValue(value) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeFollowUpStage(value) {
  const stage = normalizeText(value, "screening");
  return FOLLOW_UP_STAGES.has(stage) ? stage : "screening";
}

function normalizeEnumValue(value, allowedValues) {
  const normalized = normalizeText(value);
  return allowedValues.has(normalized) ? normalized : "";
}

function normalizeFollowUpRecord(row) {
  return {
    companyId: row.company_id,
    companyName: row.company_name,
    city: row.city,
    stage: row.stage,
    owner: row.owner,
    communicationMethod: row.communication_method,
    contactResult: row.contact_result,
    nextAction: row.next_action,
    dealStage: row.deal_stage,
    nextReminderAt: row.next_reminder_at,
    note: row.note,
    lastFollowedAt: row.last_followed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeFollowUpInput(input) {
  const now = new Date().toISOString();
  const companyId = normalizeText(input?.companyId);

  if (!companyId) {
    throw new Error("companyId is required");
  }

  return {
    companyId,
    companyName: normalizeText(input?.companyName),
    city: normalizeText(input?.city),
    stage: normalizeFollowUpStage(input?.stage),
    owner: normalizeText(input?.owner),
    communicationMethod: normalizeEnumValue(
      input?.communicationMethod,
      FOLLOW_UP_COMMUNICATION_METHODS
    ),
    contactResult: normalizeEnumValue(input?.contactResult, FOLLOW_UP_CONTACT_RESULTS),
    nextAction: normalizeText(input?.nextAction),
    dealStage: normalizeEnumValue(input?.dealStage, FOLLOW_UP_DEAL_STAGES),
    nextReminderAt: normalizeText(input?.nextReminderAt),
    note: normalizeText(input?.note),
    lastFollowedAt: normalizeText(input?.lastFollowedAt),
    updatedAt: normalizeText(input?.updatedAt, now),
  };
}

function ensureTableColumn(db, tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

function cityPriority(city) {
  const index = COMPETITOR_CITY_PRIORITY.indexOf(city);
  return index === -1 ? COMPETITOR_CITY_PRIORITY.length : index;
}

function distancePriority(distanceTier) {
  const index = COMPETITOR_DISTANCE_PRIORITY.indexOf(distanceTier);
  return index === -1 ? COMPETITOR_DISTANCE_PRIORITY.length : index;
}

function sortCompetitors(left, right) {
  const cityOrder = cityPriority(left.city) - cityPriority(right.city);
  if (cityOrder !== 0) {
    return cityOrder;
  }

  const distanceOrder = distancePriority(left.distanceTier) - distancePriority(right.distanceTier);
  if (distanceOrder !== 0) {
    return distanceOrder;
  }

  const rankOrder = left.latestRank - right.latestRank;
  if (rankOrder !== 0) {
    return rankOrder;
  }

  return left.companyName.localeCompare(right.companyName, "zh-CN");
}

function createCompetitorUpdate(db, input) {
  db.prepare(
    `
      INSERT INTO competitor_updates (
        competitor_id,
        snapshot_id,
        update_type,
        field_name,
        summary,
        old_value,
        new_value,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.competitorId ?? null,
    input.snapshotId ?? null,
    input.updateType,
    input.fieldName ?? null,
    input.summary,
    formatUpdateValue(input.oldValue),
    formatUpdateValue(input.newValue),
    input.createdAt
  );
}

function upsertCompetitorSnapshot(db, payload, source, importedAt) {
  db.prepare(
    `
      INSERT INTO competitor_snapshots (
        source,
        snapshot_updated_at,
        imported_at,
        status,
        note,
        baseline,
        company_count,
        content
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, snapshot_updated_at) DO UPDATE SET
        imported_at = excluded.imported_at,
        status = excluded.status,
        note = excluded.note,
        baseline = excluded.baseline,
        company_count = excluded.company_count,
        content = excluded.content
    `
  ).run(
    source,
    payload.updatedAt,
    importedAt,
    payload.status,
    payload.note,
    toJson(payload.baseline),
    payload.competitors.length,
    toJson(payload)
  );

  const row = db
    .prepare(
      `
        SELECT id
        FROM competitor_snapshots
        WHERE source = ? AND snapshot_updated_at = ?
      `
    )
    .get(source, payload.updatedAt);

  return row?.id ?? null;
}

function readCompetitorMasterMap(db) {
  const rows = db.prepare("SELECT * FROM competitor_master").all();
  return new Map(rows.map((row) => [row.id, row]));
}

function readCompetitorEvidenceMap(db, competitorId) {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM competitor_evidence
        WHERE competitor_id = ?
      `
    )
    .all(competitorId);

  return new Map(rows.map((row) => [row.id, row]));
}

function upsertCompetitorMaster(
  db,
  competitorId,
  competitor,
  snapshotId,
  importedAt,
  snapshotUpdatedAt
) {
  db.prepare(
    `
      INSERT INTO competitor_master (
        id,
        company_name,
        city,
        distance_tier,
        service_fit,
        manufacturing_focus,
        core_services,
        why_relevant,
        evidence_strength,
        latest_rank,
        first_seen_at,
        last_seen_at,
        last_snapshot_updated_at,
        last_snapshot_id,
        miss_count,
        is_active,
        latest_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        company_name = excluded.company_name,
        city = excluded.city,
        distance_tier = excluded.distance_tier,
        service_fit = excluded.service_fit,
        manufacturing_focus = excluded.manufacturing_focus,
        core_services = excluded.core_services,
        why_relevant = excluded.why_relevant,
        evidence_strength = excluded.evidence_strength,
        latest_rank = excluded.latest_rank,
        last_seen_at = excluded.last_seen_at,
        last_snapshot_updated_at = excluded.last_snapshot_updated_at,
        last_snapshot_id = excluded.last_snapshot_id,
        miss_count = 0,
        is_active = 1,
        latest_payload = excluded.latest_payload
    `
  ).run(
    competitorId,
    competitor.companyName,
    competitor.city,
    competitor.distanceTier,
    competitor.serviceFit,
    competitor.manufacturingFocus,
    toJson(competitor.coreServices),
    competitor.whyRelevant,
    competitor.evidenceStrength,
    competitor.rank,
    importedAt,
    importedAt,
    snapshotUpdatedAt,
    snapshotId,
    toJson(competitor)
  );
}

function syncCompetitorEvidence(db, competitorId, evidenceList, snapshotId, importedAt) {
  const existingEvidence = readCompetitorEvidenceMap(db, competitorId);

  for (const evidence of evidenceList) {
    const evidenceId = createEvidenceId(competitorId, evidence);
    const existing = existingEvidence.get(evidenceId);

    db.prepare(
      `
        INSERT INTO competitor_evidence (
          id,
          competitor_id,
          source_name,
          url,
          note,
          first_seen_at,
          last_seen_at,
          last_snapshot_id,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          source_name = excluded.source_name,
          url = excluded.url,
          note = excluded.note,
          last_seen_at = excluded.last_seen_at,
          last_snapshot_id = excluded.last_snapshot_id,
          is_active = 1
      `
    ).run(
      evidenceId,
      competitorId,
      evidence.source,
      evidence.url,
      evidence.note,
      existing?.first_seen_at ?? importedAt,
      importedAt,
      snapshotId
    );

    if (!existing) {
      createCompetitorUpdate(db, {
        competitorId,
        snapshotId,
        updateType: "evidence_added",
        fieldName: "evidence",
        summary: `${evidence.source || "新增来源"}补充了 ${evidence.url || "新证据"}`,
        oldValue: null,
        newValue: evidence,
        createdAt: importedAt,
      });
    }
  }
}

function markMissingCompetitors(db, currentIds, snapshotId, importedAt) {
  const activeRows = db
    .prepare(
      `
        SELECT id, company_name, city, miss_count, is_active
        FROM competitor_master
        WHERE is_active = 1
      `
    )
    .all();

  for (const row of activeRows) {
    if (currentIds.has(row.id)) {
      continue;
    }

    const nextMissCount = Number(row.miss_count || 0) + 1;
    const nextActive = nextMissCount < COMPETITOR_STALE_THRESHOLD ? 1 : 0;

    db.prepare(
      `
        UPDATE competitor_master
        SET miss_count = ?, is_active = ?
        WHERE id = ?
      `
    ).run(nextMissCount, nextActive, row.id);

    if (nextMissCount === 1) {
      createCompetitorUpdate(db, {
        competitorId: row.id,
        snapshotId,
        updateType: "missing_from_snapshot",
        summary: `${row.company_name} 本次未出现在最新同行结果中`,
        oldValue: { active: true },
        newValue: { active: nextActive === 1 },
        createdAt: importedAt,
      });
    }

    if (nextActive === 0) {
      createCompetitorUpdate(db, {
        competitorId: row.id,
        snapshotId,
        updateType: "deactivated",
        summary: `${row.company_name} 连续 ${COMPETITOR_STALE_THRESHOLD} 次未出现，已转为历史记录`,
        oldValue: { isActive: true, missCount: nextMissCount - 1 },
        newValue: { isActive: false, missCount: nextMissCount },
        createdAt: importedAt,
      });
    }
  }
}

function buildCompetitorSnapshotDocument(db, payload) {
  const masterRows = db
    .prepare(
      `
        SELECT *
        FROM competitor_master
        WHERE is_active = 1
      `
    )
    .all()
    .sort(sortCompetitors);

  const evidenceRows = db
    .prepare(
      `
        SELECT competitor_id, source_name, url, note
        FROM competitor_evidence
        WHERE is_active = 1
        ORDER BY first_seen_at ASC, id ASC
      `
    )
    .all();

  const evidenceMap = new Map();
  for (const row of evidenceRows) {
    const current = evidenceMap.get(row.competitor_id) ?? [];
    current.push({
      source: row.source_name,
      url: row.url,
      note: row.note,
    });
    evidenceMap.set(row.competitor_id, current);
  }

  const competitors = masterRows.map((row, index) => ({
    ...parseJsonText(row.latest_payload, {}),
    rank: index + 1,
    companyName: row.company_name,
    city: row.city,
    distanceTier: row.distance_tier,
    serviceFit: row.service_fit,
    manufacturingFocus: row.manufacturing_focus,
    coreServices: parseJsonText(row.core_services, []),
    whyRelevant: row.why_relevant,
    evidenceStrength: row.evidence_strength,
    evidence: evidenceMap.get(row.id) ?? [],
  }));

  return {
    updatedAt: payload.updatedAt,
    status: `已同步 ${competitors.length} 家制造服务同行公司。`,
    note: payload.note,
    baseline: payload.baseline,
    competitors,
  };
}

function importCompetitorDocument(db, rawPayload, source) {
  const payload = normalizeCompetitorPayload(rawPayload);
  const importedAt = new Date().toISOString();
  const snapshotUpdatedAt = payload.updatedAt || importedAt;

  db.exec("BEGIN");

  try {
    const snapshotId = upsertCompetitorSnapshot(db, payload, source, importedAt);
    const existingMaster = readCompetitorMasterMap(db);
    const currentIds = new Set();

    for (const competitor of payload.competitors) {
      const competitorId = createCompetitorId(competitor.companyName, competitor.city);
      const previous = existingMaster.get(competitorId);
      currentIds.add(competitorId);

      upsertCompetitorMaster(
        db,
        competitorId,
        competitor,
        snapshotId,
        importedAt,
        snapshotUpdatedAt
      );

      if (!previous) {
        createCompetitorUpdate(db, {
          competitorId,
          snapshotId,
          updateType: "discovered",
          summary: `${competitor.companyName} 首次进入同行主库`,
          oldValue: null,
          newValue: competitor,
          createdAt: importedAt,
        });
      } else {
        const previousComparable = {
          companyName: previous.company_name,
          province: normalizeText(parseJsonText(previous.latest_payload, {})?.province),
          city: previous.city,
          district: normalizeText(parseJsonText(previous.latest_payload, {})?.district),
          location: normalizeText(parseJsonText(previous.latest_payload, {})?.location),
          address: normalizeText(parseJsonText(previous.latest_payload, {})?.address),
          poiName: normalizeText(parseJsonText(previous.latest_payload, {})?.poiName),
          latitude: normalizeOptionalNumber(parseJsonText(previous.latest_payload, {})?.latitude),
          longitude: normalizeOptionalNumber(parseJsonText(previous.latest_payload, {})?.longitude),
          geocodeSource: normalizeText(parseJsonText(previous.latest_payload, {})?.geocodeSource),
          geocodeConfidence: normalizeText(
            parseJsonText(previous.latest_payload, {})?.geocodeConfidence
          ),
          geocodedAt: normalizeText(parseJsonText(previous.latest_payload, {})?.geocodedAt),
          distanceTier: previous.distance_tier,
          serviceFit: previous.service_fit,
          manufacturingFocus: previous.manufacturing_focus,
          coreServices: parseJsonText(previous.core_services, []),
          whyRelevant: previous.why_relevant,
          evidenceStrength: previous.evidence_strength,
          rank: previous.latest_rank,
        };

        const fieldPairs = [
          ["province", previousComparable.province, competitor.province],
          ["city", previousComparable.city, competitor.city],
          ["district", previousComparable.district, competitor.district],
          ["location", previousComparable.location, competitor.location],
          ["address", previousComparable.address, competitor.address],
          ["poiName", previousComparable.poiName, competitor.poiName],
          ["latitude", previousComparable.latitude, competitor.latitude],
          ["longitude", previousComparable.longitude, competitor.longitude],
          ["geocodeSource", previousComparable.geocodeSource, competitor.geocodeSource],
          ["geocodeConfidence", previousComparable.geocodeConfidence, competitor.geocodeConfidence],
          ["geocodedAt", previousComparable.geocodedAt, competitor.geocodedAt],
          ["distanceTier", previousComparable.distanceTier, competitor.distanceTier],
          ["serviceFit", previousComparable.serviceFit, competitor.serviceFit],
          [
            "manufacturingFocus",
            previousComparable.manufacturingFocus,
            competitor.manufacturingFocus,
          ],
          ["coreServices", previousComparable.coreServices, competitor.coreServices],
          ["whyRelevant", previousComparable.whyRelevant, competitor.whyRelevant],
          ["evidenceStrength", previousComparable.evidenceStrength, competitor.evidenceStrength],
          ["rank", previousComparable.rank, competitor.rank],
        ];

        for (const [fieldName, before, after] of fieldPairs) {
          if (valuesEqual(before, after)) {
            continue;
          }

          createCompetitorUpdate(db, {
            competitorId,
            snapshotId,
            updateType: fieldName === "rank" ? "rank_changed" : "field_changed",
            fieldName,
            summary: `${competitor.companyName} 的 ${fieldName} 已更新`,
            oldValue: before,
            newValue: after,
            createdAt: importedAt,
          });
        }

        if (Number(previous.is_active) !== 1 || Number(previous.miss_count) !== 0) {
          createCompetitorUpdate(db, {
            competitorId,
            snapshotId,
            updateType: "reactivated",
            summary: `${competitor.companyName} 重新出现在最新同行结果中`,
            oldValue: {
              isActive: Number(previous.is_active) === 1,
              missCount: Number(previous.miss_count || 0),
            },
            newValue: {
              isActive: true,
              missCount: 0,
            },
            createdAt: importedAt,
          });
        }
      }

      syncCompetitorEvidence(db, competitorId, competitor.evidence, snapshotId, importedAt);
    }

    markMissingCompetitors(db, currentIds, snapshotId, importedAt);

    const nextDocument = buildCompetitorSnapshotDocument(db, payload);
    writeDocument(db, "competitors", nextDocument, source, importedAt);

    db.exec("COMMIT");
    return nextDocument;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS competitor_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      snapshot_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      baseline TEXT NOT NULL,
      company_count INTEGER NOT NULL,
      content TEXT NOT NULL,
      UNIQUE(source, snapshot_updated_at)
    );

    CREATE TABLE IF NOT EXISTS competitor_master (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      city TEXT NOT NULL,
      distance_tier TEXT NOT NULL,
      service_fit TEXT NOT NULL,
      manufacturing_focus TEXT NOT NULL,
      core_services TEXT NOT NULL,
      why_relevant TEXT NOT NULL,
      evidence_strength TEXT NOT NULL,
      latest_rank INTEGER NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_snapshot_updated_at TEXT NOT NULL,
      last_snapshot_id INTEGER,
      miss_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      latest_payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS competitor_evidence (
      id TEXT PRIMARY KEY,
      competitor_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      note TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_snapshot_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS competitor_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id TEXT,
      snapshot_id INTEGER,
      update_type TEXT NOT NULL,
      field_name TEXT,
      summary TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS follow_up_records (
      company_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      city TEXT NOT NULL,
      stage TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      communication_method TEXT NOT NULL DEFAULT '',
      contact_result TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      deal_stage TEXT NOT NULL DEFAULT '',
      next_reminder_at TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      last_followed_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_competitor_master_active
      ON competitor_master (is_active, city, latest_rank);

    CREATE INDEX IF NOT EXISTS idx_competitor_evidence_competitor
      ON competitor_evidence (competitor_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_competitor_updates_created
      ON competitor_updates (created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_follow_up_records_stage
      ON follow_up_records (stage, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_follow_up_records_reminder
      ON follow_up_records (next_reminder_at, updated_at DESC);
  `);

  for (const [columnName, columnDefinition] of FOLLOW_UP_EXTRA_COLUMNS) {
    ensureTableColumn(db, "follow_up_records", columnName, columnDefinition);
  }
}

export function hasDocument(db, key) {
  const row = db.prepare("SELECT key FROM documents WHERE key = ?").get(key);
  return Boolean(row);
}

export function writeDocument(db, key, payload, source, updatedAt = new Date().toISOString()) {
  db.prepare(
    `
      INSERT INTO documents (key, content, source, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        content = excluded.content,
        source = excluded.source,
        updated_at = excluded.updated_at
    `
  ).run(key, JSON.stringify(payload), source, updatedAt);
}

export function importDocument(db, key, payload, source) {
  if (key === "competitors") {
    return importCompetitorDocument(db, payload, source);
  }

  writeDocument(db, key, payload, source);
  return payload;
}

export function readDocument(db, key) {
  const row = db
    .prepare("SELECT content, source, updated_at FROM documents WHERE key = ?")
    .get(key);

  if (!row) {
    return null;
  }

  return {
    payload: JSON.parse(row.content),
    source: row.source,
    updatedAt: row.updated_at,
  };
}

export function readCompetitorUpdates(db, limit = DEFAULT_COMPETITOR_UPDATE_LIMIT) {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(200, Math.trunc(limit)))
    : DEFAULT_COMPETITOR_UPDATE_LIMIT;

  const rows = db
    .prepare(
      `
        SELECT
          updates.id,
          updates.competitor_id,
          updates.snapshot_id,
          updates.update_type,
          updates.field_name,
          updates.summary,
          updates.old_value,
          updates.new_value,
          updates.created_at,
          master.company_name,
          master.city,
          snapshots.snapshot_updated_at
        FROM competitor_updates AS updates
        LEFT JOIN competitor_master AS master
          ON master.id = updates.competitor_id
        LEFT JOIN competitor_snapshots AS snapshots
          ON snapshots.id = updates.snapshot_id
        ORDER BY updates.created_at DESC, updates.id DESC
        LIMIT ?
      `
    )
    .all(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    competitorId: row.competitor_id,
    snapshotId: row.snapshot_id,
    companyName: row.company_name,
    city: row.city,
    updateType: row.update_type,
    fieldName: row.field_name,
    summary: row.summary,
    oldValue: parseStoredUpdateValue(row.old_value),
    newValue: parseStoredUpdateValue(row.new_value),
    createdAt: row.created_at,
    snapshotUpdatedAt: row.snapshot_updated_at,
  }));
}

export function readFollowUpRecords(db) {
  return db
    .prepare(
      `
        SELECT
          company_id,
          company_name,
          city,
          stage,
          owner,
          communication_method,
          contact_result,
          next_action,
          deal_stage,
          next_reminder_at,
          note,
          last_followed_at,
          created_at,
          updated_at
        FROM follow_up_records
        ORDER BY updated_at DESC, company_name ASC
      `
    )
    .all()
    .map(normalizeFollowUpRecord);
}

export function readFollowUpRecord(db, companyId) {
  const row = db
    .prepare(
      `
        SELECT
          company_id,
          company_name,
          city,
          stage,
          owner,
          communication_method,
          contact_result,
          next_action,
          deal_stage,
          next_reminder_at,
          note,
          last_followed_at,
          created_at,
          updated_at
        FROM follow_up_records
        WHERE company_id = ?
      `
    )
    .get(normalizeText(companyId));

  return row ? normalizeFollowUpRecord(row) : null;
}

export function upsertFollowUpRecord(db, input) {
  const record = normalizeFollowUpInput(input);
  const now = new Date().toISOString();
  const createdAt = now;

  db.prepare(
    `
      INSERT INTO follow_up_records (
        company_id,
        company_name,
        city,
        stage,
        owner,
        communication_method,
        contact_result,
        next_action,
        deal_stage,
        next_reminder_at,
        note,
        last_followed_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id) DO UPDATE SET
        company_name = excluded.company_name,
        city = excluded.city,
        stage = excluded.stage,
        owner = excluded.owner,
        communication_method = excluded.communication_method,
        contact_result = excluded.contact_result,
        next_action = excluded.next_action,
        deal_stage = excluded.deal_stage,
        next_reminder_at = excluded.next_reminder_at,
        note = excluded.note,
        last_followed_at = excluded.last_followed_at,
        updated_at = excluded.updated_at
    `
  ).run(
    record.companyId,
    record.companyName,
    record.city,
    record.stage,
    record.owner,
    record.communicationMethod,
    record.contactResult,
    record.nextAction,
    record.dealStage,
    record.nextReminderAt,
    record.note,
    record.lastFollowedAt,
    createdAt,
    record.updatedAt
  );

  return readFollowUpRecord(db, record.companyId);
}

function hasCompetitorState(db) {
  const row = db
    .prepare(
      `
        SELECT
          (SELECT COUNT(*) FROM competitor_master) AS master_count,
          (SELECT COUNT(*) FROM competitor_snapshots) AS snapshot_count
      `
    )
    .get();

  return Number(row?.master_count || 0) > 0 || Number(row?.snapshot_count || 0) > 0;
}

function backfillLegacyCompetitorState(db) {
  if (!hasDocument(db, "competitors") || hasCompetitorState(db)) {
    return;
  }

  const document = readDocument(db, "competitors");
  if (!document) {
    return;
  }

  importDocument(db, "competitors", document.payload, document.source || "legacy-backfill");
}

export async function seedDatabaseFromFiles(db, config) {
  for (const [key, definition] of Object.entries(DOCUMENT_DEFINITIONS)) {
    if (hasDocument(db, key)) {
      continue;
    }

    const payload = await readJsonFile(config.dataDir, definition.fileName);
    importDocument(db, key, payload, "seed");
  }
}

export async function initializeStore(config) {
  await ensureParentDirectory(config.dbPath);
  const db = createDatabase(config.dbPath);
  ensureSchema(db);
  await seedDatabaseFromFiles(db, config);
  backfillLegacyCompetitorState(db);
  return db;
}

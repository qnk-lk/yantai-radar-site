import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const projectRoot = path.resolve(currentDir, "..", "..");
const defaultDataDir = path.join(projectRoot, "public");
const defaultDbPath = path.join(projectRoot, "server", "data", "radar.sqlite");

export const DOCUMENT_DEFINITIONS = {
  radar: {
    fileName: "latest.json",
  },
  competitors: {
    fileName: "competitors.json",
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

export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export function hasDocument(db, key) {
  const row = db.prepare("SELECT key FROM documents WHERE key = ?").get(key);
  return Boolean(row);
}

export function writeDocument(db, key, payload, source) {
  const updatedAt = new Date().toISOString();

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

export async function seedDatabaseFromFiles(db, config) {
  for (const [key, definition] of Object.entries(DOCUMENT_DEFINITIONS)) {
    if (hasDocument(db, key)) {
      continue;
    }

    const payload = await readJsonFile(config.dataDir, definition.fileName);
    writeDocument(db, key, payload, "seed");
  }
}

export async function initializeStore(config) {
  await ensureParentDirectory(config.dbPath);
  const db = createDatabase(config.dbPath);
  ensureSchema(db);
  await seedDatabaseFromFiles(db, config);
  return db;
}

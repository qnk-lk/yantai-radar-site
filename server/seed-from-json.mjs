import {
  DOCUMENT_DEFINITIONS,
  createDatabase,
  ensureParentDirectory,
  ensureSchema,
  importDocument,
  readJsonFile,
  resolveConfig,
} from "./lib/store.mjs";

const config = resolveConfig();

await ensureParentDirectory(config.dbPath);

const db = createDatabase(config.dbPath);
ensureSchema(db);

for (const [key, definition] of Object.entries(DOCUMENT_DEFINITIONS)) {
  const payload = await readJsonFile(config.dataDir, definition.fileName);
  importDocument(db, key, payload, "seed-script");
}

db.close();

import {
  DOCUMENT_DEFINITIONS,
  createDatabase,
  ensureParentDirectory,
  ensureSchema,
  readJsonFile,
  resolveConfig,
  writeDocument,
} from "./lib/store.mjs";

const config = resolveConfig();

await ensureParentDirectory(config.dbPath);

const db = createDatabase(config.dbPath);
ensureSchema(db);

for (const [key, definition] of Object.entries(DOCUMENT_DEFINITIONS)) {
  const payload = await readJsonFile(config.dataDir, definition.fileName);
  writeDocument(db, key, payload, "seed-script");
}

db.close();

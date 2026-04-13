import process from "node:process";

import {
  createDatabase,
  ensureParentDirectory,
  ensureSchema,
  importDocument,
  readJsonPath,
  resolveConfig,
} from "./lib/store.mjs";

function parseArgs(argv) {
  const args = {
    key: "",
    input: "",
    source: "manual-import",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--key" && next) {
      args.key = next;
      index += 1;
      continue;
    }

    if (current === "--input" && next) {
      args.input = next;
      index += 1;
      continue;
    }

    if (current === "--source" && next) {
      args.source = next;
      index += 1;
    }
  }

  if (!args.key || !args.input) {
    throw new Error("Usage: node import-document.mjs --key <key> --input <path> [--source <name>]");
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const config = resolveConfig();
const payload = await readJsonPath(args.input);

await ensureParentDirectory(config.dbPath);
const db = createDatabase(config.dbPath);
ensureSchema(db);
importDocument(db, args.key, payload, args.source);
db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      key: args.key,
      dbPath: config.dbPath,
      source: args.source,
      input: args.input,
    },
    null,
    2
  )
);

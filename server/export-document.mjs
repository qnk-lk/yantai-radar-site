import fs from "node:fs/promises";
import process from "node:process";

import {
  createDatabase,
  ensureParentDirectory,
  readDocument,
  resolveConfig,
} from "./lib/store.mjs";

function parseArgs(argv) {
  const args = {
    key: "",
    output: "",
    failIfMissing: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--key" && next) {
      args.key = next;
      index += 1;
      continue;
    }

    if (current === "--output" && next) {
      args.output = next;
      index += 1;
      continue;
    }

    if (current === "--fail-if-missing") {
      args.failIfMissing = true;
    }
  }

  if (!args.key || !args.output) {
    throw new Error(
      "Usage: node export-document.mjs --key <key> --output <path> [--fail-if-missing]"
    );
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const config = resolveConfig();
const db = createDatabase(config.dbPath);

try {
  const document = readDocument(db, args.key);

  if (!document) {
    if (args.failIfMissing) {
      throw new Error(`Document not found for key: ${args.key}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: false,
          key: args.key,
          output: args.output,
          missing: true,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  await ensureParentDirectory(args.output);
  await fs.writeFile(args.output, `${JSON.stringify(document.payload, null, 2)}\n`, "utf-8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        key: args.key,
        output: args.output,
        source: document.source,
        updatedAt: document.updatedAt,
      },
      null,
      2
    )
  );
} finally {
  db.close();
}

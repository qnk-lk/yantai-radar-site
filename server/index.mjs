import cors from "@fastify/cors";
import Fastify from "fastify";

import { initializeStore, readCompetitorUpdates, readDocument, resolveConfig } from "./lib/store.mjs";

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

function buildApp(config, db) {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: true,
  });

  app.get("/api/health", async () => {
    const rows = db.prepare("SELECT key, source, updated_at FROM documents ORDER BY key").all();

    return {
      ok: true,
      dataDir: config.dataDir,
      dbPath: config.dbPath,
      timestamp: new Date().toISOString(),
      documents: rows,
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

  app.get("/api/competitors/updates", async (request) => {
    const limit = Number(request.query?.limit);

    return {
      items: readCompetitorUpdates(db, limit),
    };
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

import cors from "@fastify/cors";
import Fastify from "fastify";

import { initializeStore, readDocument, resolveConfig } from "./lib/store.mjs";

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

const config = resolveConfig();
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

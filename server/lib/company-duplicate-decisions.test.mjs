import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createDatabase,
  ensureSchema,
  readCompanyDuplicateDecision,
  readCompanyDuplicateDecisions,
  upsertCompanyDuplicateDecision,
} from "./store.mjs";

async function createTempDatabase() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "company-duplicate-decisions-"));
  const dbPath = path.join(tmpDir, "radar.sqlite");
  const db = createDatabase(dbPath);
  ensureSchema(db);
  return { db, tmpDir };
}

test("stores and updates company duplicate merge decisions", async () => {
  const { db, tmpDir } = await createTempDatabase();

  try {
    const first = upsertCompanyDuplicateDecision(db, {
      duplicateKey: "明远科技",
      status: "merged",
      canonicalCompanyId: "烟台明远科技有限公司::烟台",
      canonicalCompanyName: "烟台明远科技有限公司",
      companyIds: ["烟台明远科技有限公司::烟台", "明远科技有限责任公司::烟台"],
      companyNames: ["烟台明远科技有限公司", "明远科技有限责任公司"],
      reason: "人工确认同一企业",
    });

    assert.equal(first.duplicateKey, "明远科技");
    assert.equal(first.status, "merged");
    assert.deepEqual(first.companyIds, [
      "烟台明远科技有限公司::烟台",
      "明远科技有限责任公司::烟台",
    ]);

    const updated = upsertCompanyDuplicateDecision(db, {
      duplicateKey: "明远科技",
      status: "ignored",
      canonicalCompanyId: "",
      canonicalCompanyName: "",
      companyIds: [],
      companyNames: [],
      reason: "人工判断不是同一企业",
    });

    assert.equal(updated.status, "ignored");
    assert.equal(readCompanyDuplicateDecision(db, "明远科技")?.reason, "人工判断不是同一企业");
    assert.equal(readCompanyDuplicateDecisions(db).length, 1);
  } finally {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

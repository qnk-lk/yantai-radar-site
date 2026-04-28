import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createDatabase,
  ensureSchema,
  readFollowUpRecord,
  readFollowUpRecords,
  upsertFollowUpRecord,
} from "./store.mjs";

async function createTempDatabase() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "follow-up-records-"));
  const dbPath = path.join(tmpDir, "radar.sqlite");
  const db = createDatabase(dbPath);
  ensureSchema(db);
  return { db, tmpDir };
}

test("upserts follow-up record and appends event history", async () => {
  const { db, tmpDir } = await createTempDatabase();

  try {
    const first = upsertFollowUpRecord(db, {
      companyId: "山东用友软件技术有限公司::青岛",
      companyName: "山东用友软件技术有限公司",
      city: "青岛",
      stage: "watch",
      owner: "销售A",
      communicationMethod: "phone",
      contactResult: "connected",
      nextAction: "确认 MES 需求",
      dealStage: "lead",
      nextReminderAt: "2026-04-29 09:30:00",
      reminderStatus: "open",
      completedAt: "",
      note: "从招聘线索纳入跟进",
      lastFollowedAt: "2026-04-28 09:30:00",
    });

    assert.equal(first.companyId, "山东用友软件技术有限公司::青岛");
    assert.equal(first.events?.length, 1);
    assert.equal(first.events?.[0]?.nextAction, "确认 MES 需求");

    const updated = upsertFollowUpRecord(db, {
      companyId: "山东用友软件技术有限公司::青岛",
      companyName: "山东用友软件技术有限公司",
      city: "青岛",
      stage: "priority",
      owner: "销售A",
      communicationMethod: "wechat",
      contactResult: "interested",
      nextAction: "约现场沟通",
      dealStage: "qualified",
      nextReminderAt: "2026-04-30 09:30:00",
      reminderStatus: "completed",
      completedAt: "2026-04-28 10:00:00",
      note: "客户有进一步沟通意向",
      lastFollowedAt: "2026-04-28 10:00:00",
    });

    assert.equal(updated.stage, "priority");
    assert.equal(updated.contactResult, "interested");
    assert.equal(updated.events?.length, 2);
    assert.equal(readFollowUpRecords(db).length, 1);
    assert.equal(readFollowUpRecord(db, "山东用友软件技术有限公司::青岛")?.events?.length, 2);
  } finally {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

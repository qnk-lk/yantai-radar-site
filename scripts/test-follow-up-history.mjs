import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createDatabase,
  ensureParentDirectory,
  ensureSchema,
  readFollowUpEvents,
  readFollowUpRecord,
  upsertFollowUpRecord,
} from "../server/lib/store.mjs";

const dbPath = path.resolve(".tmp", "follow-up-history-test.sqlite");

await fs.rm(dbPath, { force: true });
await ensureParentDirectory(dbPath);

const db = createDatabase(dbPath);
ensureSchema(db);

const companyId = "company-history-test";

upsertFollowUpRecord(db, {
  companyId,
  companyName: "历史测试公司",
  city: "烟台",
  stage: "watch",
  owner: "LK",
  communicationMethod: "phone",
  contactResult: "connected",
  nextAction: "确认 MES 系统负责人",
  dealStage: "contacted",
  nextReminderAt: "2026-04-25 09:00:00",
  note: "第一次电话沟通",
  lastFollowedAt: "2026-04-24 09:30:00",
});

upsertFollowUpRecord(db, {
  companyId,
  companyName: "历史测试公司",
  city: "烟台",
  stage: "priority",
  owner: "LK",
  communicationMethod: "wechat",
  contactResult: "interested",
  nextAction: "发送方案资料",
  dealStage: "qualified",
  nextReminderAt: "2026-04-26 10:00:00",
  note: "客户表达初步兴趣",
  lastFollowedAt: "2026-04-24 15:00:00",
});

const latest = readFollowUpRecord(db, companyId);
const events = readFollowUpEvents(db, companyId);

assert.equal(latest.stage, "priority");
assert.equal(latest.communicationMethod, "wechat");
assert.equal(latest.contactResult, "interested");
assert.equal(events.length, 2);
assert.equal(events[0].note, "客户表达初步兴趣");
assert.equal(events[1].note, "第一次电话沟通");
assert.equal(events[0].followedAt, "2026-04-24 15:00:00");

db.close();
await fs.rm(dbPath, { force: true });

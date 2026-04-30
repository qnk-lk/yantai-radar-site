import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildOverviewStatsPayload } from "../index.mjs";
import {
  createDatabase,
  ensureSchema,
  upsertCompanyDuplicateDecision,
  upsertFollowUpRecord,
  upsertLeadAction,
  writeDocument,
} from "./store.mjs";

async function createTempDatabase() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "overview-stats-"));
  const dbPath = path.join(tmpDir, "radar.sqlite");
  const db = createDatabase(dbPath);
  ensureSchema(db);
  return { db, tmpDir };
}

test("buildOverviewStatsPayload returns quality, follow-up, and report metrics", async () => {
  const { db, tmpDir } = await createTempDatabase();

  try {
    writeDocument(
      db,
      "salesIntel",
      {
        updatedAt: "2026-04-30 09:41:21 CST",
        totals: {
          overall: 3,
          reportItems: 1,
          recruitmentItems: 2,
          todayHighlights: 1,
        },
        sourceBreakdown: [
          { kind: "report", count: 1, updatedAt: "2026-04-30 09:30:00 CST" },
          { kind: "recruitment", count: 2, updatedAt: "2026-04-30 09:41:21 CST" },
        ],
        feed: [
          {
            id: "lead-1",
            kind: "recruitment",
            entity: "山东用友软件技术有限公司",
            title: "MES 实施顾问",
            location: "青岛",
            sourceLabel: "智联招聘",
            strength: "高",
            retrievedAt: "2026-04-30 09:41:21",
            publishedAt: "2026-04-30 08:20:00",
            evidence: [{ source: "智联招聘", url: "https://example.com/1", note: "" }],
            matchedJobs: [
              { platform: "智联招聘", city: "青岛", publishedAt: "2026-04-30 08:20:00" },
            ],
          },
          {
            id: "lead-2",
            kind: "recruitment",
            entity: "烟台明远科技有限公司",
            title: "QMS 顾问",
            location: "",
            sourceLabel: "",
            strength: "中",
            retrievedAt: "2026-04-29 12:00:00",
            publishedAt: "",
            evidence: [],
          },
          {
            id: "lead-3",
            kind: "report",
            entity: "烟台明远科技有限责任公司",
            title: "数字化项目立项",
            location: "烟台",
            sourceLabel: "OpenClaw",
            strength: "高",
            retrievedAt: "2026-04-28 11:00:00",
            publishedAt: "2026-04-28 11:00:00",
            evidence: [{ source: "OpenClaw", url: "", note: "" }],
          },
        ],
        todayHighlights: [],
      },
      "test",
      "2026-04-30 09:41:21 CST"
    );

    writeDocument(
      db,
      "recruitmentLeads",
      {
        updatedAt: "2026-04-30 09:41:21 CST",
        strategy: {
          selectedPlatforms: ["智联招聘", "BOSS直聘"],
        },
        platformCoverage: [{ platform: "智联招聘", status: "ok", effectiveCompanyCount: 2 }],
      },
      "test",
      "2026-04-30 09:41:21 CST"
    );

    writeDocument(
      db,
      "competitors",
      {
        updatedAt: "2026-04-30 09:10:00 CST",
        competitors: [{ companyName: "样例同行" }],
      },
      "test",
      "2026-04-30 09:10:00 CST"
    );

    upsertLeadAction(db, {
      itemId: "lead-1",
      status: "follow_up",
      companyId: "山东用友软件技术有限公司::青岛",
      companyName: "山东用友软件技术有限公司",
    });

    upsertFollowUpRecord(db, {
      companyId: "山东用友软件技术有限公司::青岛",
      companyName: "山东用友软件技术有限公司",
      city: "青岛",
      stage: "priority",
      owner: "销售A",
      communicationMethod: "phone",
      contactResult: "interested",
      nextAction: "约现场沟通",
      dealStage: "qualified",
      nextReminderAt: "2026-04-30 18:00:00",
      reminderStatus: "open",
      completedAt: "",
      note: "重点跟进",
      lastFollowedAt: "2026-04-30 10:00:00",
    });

    upsertCompanyDuplicateDecision(db, {
      duplicateKey: "其他企业",
      status: "ignored",
      canonicalCompanyId: "",
      canonicalCompanyName: "",
      companyIds: [],
      companyNames: [],
      reason: "不相关",
    });

    const payload = buildOverviewStatsPayload(db);

    assert.equal(payload.quality.pendingDuplicateGroups, 1);
    assert.equal(payload.quality.missingPublishedAt, 1);
    assert.equal(payload.quality.missingCity, 1);
    assert.equal(payload.quality.missingSource, 1);
    assert.equal(payload.quality.lowEvidence, 1);
    assert.equal(payload.quality.untouched, 2);
    assert.equal(payload.followUps.total, 1);
    assert.equal(payload.followUps.assigned, 1);
    assert.equal(payload.followUps.today, 1);
    assert.equal(payload.reports.totals.signals, 3);
    assert.equal(payload.reports.platformContribution[0].label, "智联招聘");
    assert.equal(payload.reports.conversion.signalToActionRate, 33);
  } finally {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

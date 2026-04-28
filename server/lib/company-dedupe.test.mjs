import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCompanyDuplicateCandidates,
  normalizeCompanyDuplicateKey,
} from "./company-dedupe.mjs";

test("normalizes regional prefixes and legal suffixes for duplicate matching", () => {
  assert.equal(normalizeCompanyDuplicateKey("烟台明远科技有限公司"), "明远科技");
  assert.equal(normalizeCompanyDuplicateKey("明远科技有限责任公司"), "明远科技");
});

test("groups likely duplicate companies without merging unrelated names", () => {
  const candidates = buildCompanyDuplicateCandidates([
    {
      id: "lead-1",
      entity: "烟台明远科技有限公司",
      title: "MES 项目经理",
      location: "烟台",
      sourceLabel: "智联招聘",
      retrievedAt: "2026-04-28 09:30:00",
      summary: "招聘 MES 项目经理",
    },
    {
      id: "lead-2",
      entity: "明远科技有限责任公司",
      title: "QMS 实施顾问",
      location: "烟台市",
      sourceLabel: "BOSS直聘",
      retrievedAt: "2026-04-28 10:00:00",
      summary: "招聘 QMS 实施顾问",
    },
    {
      id: "lead-3",
      entity: "明远装备有限公司",
      title: "设备工程师",
      location: "烟台",
      sourceLabel: "前程无忧",
      retrievedAt: "2026-04-28 10:10:00",
      summary: "招聘设备工程师",
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].canonicalName, "烟台明远科技有限公司");
  assert.deepEqual(
    candidates[0].companies.map((company) => company.companyName),
    ["明远科技有限责任公司", "烟台明远科技有限公司"]
  );
});

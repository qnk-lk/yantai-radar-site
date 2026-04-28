import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..");

function createLead(index) {
  return {
    companyName: `测试制造企业${String(index).padStart(2, "0")}`,
    city: index % 2 === 0 ? "烟台" : "青岛",
    companyCategory: "制造业",
    leadType: "招聘需求",
    leadStrength: index % 3 === 0 ? "高" : "中",
    signalSummary: `发现 MES/QMS 相关岗位 ${index}`,
    inferredNeed: "MES/QMS 数字化需求",
    matchedKeywords: ["MES", "QMS"],
    matchedJobs: [
      {
        platform: "智联招聘",
        jobTitle: `MES 实施顾问 ${index}`,
        city: index % 2 === 0 ? "烟台" : "青岛",
        salary: "8-12K",
        publishedAt: "2026-04-28 09:00:00 CST",
        url: `https://example.com/jobs/${index}`,
        keywordHits: ["MES"],
        descriptionEvidence: "负责 MES 项目实施和制造现场调研。",
      },
    ],
    evidence: [
      {
        source: "智联招聘",
        url: `https://example.com/company/${index}`,
        note: "招聘页命中制造业数字化关键词。",
      },
    ],
    sourcePlatforms: ["智联招聘"],
    recommendedAction: "进入企业库观察",
    riskNotes: "",
  };
}

test("sales intel feed keeps full aggregate history while today highlights stay limited", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "sales-intel-history-"));
  const platformPath = path.join(tmpDir, "platform.json");
  const aggregatePath = path.join(tmpDir, "aggregate.json");
  const salesPath = path.join(tmpDir, "sales-intel.json");
  const historyPath = path.join(tmpDir, "sales-intel-history.json");

  await mkdir(tmpDir, { recursive: true });
  await writeFile(
    platformPath,
    `${JSON.stringify(
      {
        updatedAt: "2026-04-28 09:30:00 CST",
        platformCoverage: [{ platform: "智联招聘", status: "ok", effectiveCompanyCount: 12 }],
        leads: Array.from({ length: 12 }, (_, index) => createLead(index + 1)),
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  await execFileAsync("node", [
    path.join(projectRoot, "scripts", "aggregate-recruitment-platforms.mjs"),
    "--output",
    aggregatePath,
    "--input",
    platformPath,
    "--lead-limit",
    "10",
    "--selected-platforms",
    "智联招聘",
  ]);

  const aggregatePayload = JSON.parse(await readFile(aggregatePath, "utf-8"));
  assert.equal(aggregatePayload.leads.length, 10);
  assert.equal(aggregatePayload.allLeads.length, 12);

  await execFileAsync(
    "node",
    [
      path.join(projectRoot, "scripts", "build-sales-intel.mjs"),
      "--recruitment",
      aggregatePath,
      "--output",
      salesPath,
      "--history",
      historyPath,
    ],
    {
      env: {
        ...process.env,
        SALES_INTEL_TODAY_DATE: "2026-04-28",
      },
    }
  );

  const salesPayload = JSON.parse(await readFile(salesPath, "utf-8"));
  assert.equal(salesPayload.todayHighlights.length, 10);
  assert.equal(salesPayload.feed.length, 12);
  assert.equal(salesPayload.totals.todayHighlights, 10);
  assert.equal(salesPayload.totals.recruitmentItems, 12);
});

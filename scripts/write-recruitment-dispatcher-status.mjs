#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function readOption(argv, name) {
  const flag = `--${name}`;
  const equalsPrefix = `${flag}=`;
  const equalsItem = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsItem) {
    return equalsItem.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(flag);
  if (index === -1) {
    return "";
  }

  return argv[index + 1] || "";
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonSafe(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseCsv(value) {
  return compactText(value)
    .split(",")
    .map((item) => compactText(item))
    .filter(Boolean);
}

function parseAttemptLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [platform, status, leadCount, candidateLimit, startedAt, finishedAt, note] =
        line.split("\t");

      return {
        platform: compactText(platform),
        status: compactText(status),
        leadCount: Number(leadCount || 0),
        candidateLimit: Number(candidateLimit || 0),
        startedAt: compactText(startedAt),
        finishedAt: compactText(finishedAt),
        note: compactText(note),
      };
    });
}

async function main() {
  const argv = process.argv.slice(2);
  const outputPath = readOption(argv, "output");
  const aggregatePath = readOption(argv, "aggregate");
  const status = readOption(argv, "status");
  const startedAt = readOption(argv, "started-at");
  const finishedAt = readOption(argv, "finished-at");
  const stopReason = readOption(argv, "stop-reason");
  const platformLimit = Number(readOption(argv, "platform-limit") || 0);
  const leadLimit = Number(readOption(argv, "lead-limit") || 0);
  const platformCandidateLimit = Number(readOption(argv, "platform-candidate-limit") || 0);
  const totalLeads = Number(readOption(argv, "total-leads") || 0);
  const selectedPlatforms = parseCsv(readOption(argv, "selected-platforms"));
  const candidatePlatforms = parseCsv(readOption(argv, "candidate-platforms"));

  if (!outputPath || !status) {
    throw new Error(
      "Usage: node write-recruitment-dispatcher-status.mjs --output <path> --status <value>"
    );
  }

  const aggregatePayload = (await readJsonSafe(aggregatePath)) ?? {};
  const aggregateStrategy = aggregatePayload?.strategy ?? {};
  const attempts = parseAttemptLines(process.env.ATTEMPT_LINES || "");
  const blockedPlatforms = attempts.filter((item) => item.status === "blocked").length;
  const failedPlatforms = attempts.filter(
    (item) => item.status === "error" || item.status === "failed"
  ).length;
  const successfulPlatforms = attempts.filter(
    (item) => item.status === "ok" || item.status === "limited"
  ).length;

  const payload = {
    updatedAt: compactText(finishedAt || aggregatePayload?.updatedAt || new Date().toISOString()),
    status: compactText(status),
    startedAt: compactText(startedAt),
    finishedAt: compactText(finishedAt),
    stopReason: compactText(stopReason),
    strategy: {
      platformLimit: Number.isFinite(platformLimit)
        ? platformLimit
        : Number(aggregateStrategy.platformLimit || 0),
      leadLimit: Number.isFinite(leadLimit) ? leadLimit : Number(aggregateStrategy.leadLimit || 0),
      platformCandidateLimit: Number.isFinite(platformCandidateLimit) ? platformCandidateLimit : 0,
      selectedPlatforms,
      candidatePlatforms,
    },
    totals: {
      attemptedPlatforms: attempts.length,
      successfulPlatforms,
      failedPlatforms,
      blockedPlatforms,
      totalLeads: Number.isFinite(totalLeads) ? totalLeads : 0,
      newLeadCount: Number(aggregateStrategy.newLeadCount || 0),
      duplicateLeadCount: Number(aggregateStrategy.duplicateLeadCount || 0),
    },
    attempts,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`Wrote recruitment dispatcher status to ${outputPath}`);
}

await main();

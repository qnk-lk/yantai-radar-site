"use client";

import {
  BankOutlined,
  CalendarOutlined,
  ClusterOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  ProfileOutlined,
  ScheduleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { FollowUpRecord, FollowUpStage } from "./follow-up-types";
import type {
  CompanyDuplicateDecision,
  CompanyDuplicateGroup,
  SalesIntelItem,
} from "./sales-intel-types";

type CompanyJob = NonNullable<SalesIntelItem["allJobs"]>[number];
type CompanyStageFilter = FollowUpStage | "all";
type CompanyProfileFormValues = Pick<
  CompanyProfileRecord,
  | "industry"
  | "scale"
  | "website"
  | "address"
  | "contactName"
  | "contactMethod"
  | "owner"
  | "level"
  | "status"
  | "note"
> & {
  tagsText: string;
};

export type CompanyProfileRecord = {
  companyId: string;
  companyName: string;
  city: string;
  industry: string;
  scale: string;
  website: string;
  address: string;
  contactName: string;
  contactMethod: string;
  owner: string;
  level: string;
  status: string;
  tags: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type CompanyLibraryEntry = {
  id: string;
  companyName: string;
  city: string;
  latestRetrievedAt: string;
  latestSummary: string;
  sourcePlatforms: string[];
  signalCount: number;
  allJobsCount: number;
  strongest: string;
  items: SalesIntelItem[];
};

function compactText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProfileTags(value: string) {
  return uniqueStrings(
    String(value || "")
      .split(/[,，、\n]/u)
      .map((item) => item.trim())
  );
}

function getSortKey(value: string) {
  const match = compactText(value).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/u);
  return match ? match.slice(1).join("") : "";
}

function compareTimestampDesc(left: string, right: string) {
  const leftKey = getSortKey(left);
  const rightKey = getSortKey(right);

  if (leftKey && rightKey) {
    return rightKey.localeCompare(leftKey);
  }

  if (rightKey) {
    return 1;
  }

  if (leftKey) {
    return -1;
  }

  return 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => compactText(item)).filter(Boolean))];
}

function splitSourceLabels(value: string) {
  return uniqueStrings(
    compactText(value)
      .split(/[、,，]/u)
      .map((item) => item.trim())
  );
}

function resolveCompanyName(item: SalesIntelItem) {
  return compactText(item.entity || item.title);
}

function resolveCity(item: SalesIntelItem) {
  return compactText(
    item.location || item.matchedJobs?.find((job) => compactText(job.city))?.city || ""
  );
}

function strengthScore(value: string) {
  if (value === "高") {
    return 3;
  }

  if (value === "中") {
    return 2;
  }

  if (value === "低") {
    return 1;
  }

  return 0;
}

function formatDisplayUpdatedAt(value: string) {
  return compactText(value).replace(/\s*CST$/u, "");
}

function getFollowUpStageLabel(t: (key: string) => string, stage: FollowUpStage) {
  if (stage === "priority") {
    return t("companies.profile.stages.priority");
  }

  if (stage === "watch") {
    return t("companies.profile.stages.watch");
  }

  return t("companies.profile.stages.screening");
}

function createJobIdentity(job: CompanyJob) {
  return [job.platform, job.url, job.jobTitle, job.city]
    .map((item) => compactText(item))
    .join("::");
}

function collectCompanyJobs(entry: CompanyLibraryEntry) {
  const jobMap = new Map<string, CompanyJob>();

  for (const item of entry.items) {
    const jobs = item.allJobs?.length ? item.allJobs : (item.matchedJobs ?? []);

    for (const job of jobs) {
      const identity = createJobIdentity(job);
      if (!identity || jobMap.has(identity)) {
        continue;
      }

      jobMap.set(identity, job);
    }
  }

  return [...jobMap.values()].sort((left, right) =>
    compareTimestampDesc(compactText(left.publishedAt), compactText(right.publishedAt))
  );
}

function resolveCompanyStage(entry: CompanyLibraryEntry) {
  if (strengthScore(entry.strongest) >= 3) {
    return "priority";
  }

  if (entry.signalCount >= 2 || entry.allJobsCount >= 3) {
    return "watch";
  }

  return "screening";
}

function getLatestAction(entry: CompanyLibraryEntry) {
  return compactText(entry.items.find((item) => compactText(item.actionText))?.actionText || "");
}

function getEntryTotalSignalCount(entries: CompanyLibraryEntry[]) {
  return entries.reduce((total, entry) => total + entry.signalCount, 0);
}

function getEntryTotalJobCount(entries: CompanyLibraryEntry[]) {
  return entries.reduce((total, entry) => total + entry.allJobsCount, 0);
}

function getSignalTime(item: SalesIntelItem) {
  return compactText(item.retrievedAt || item.publishedAt || "");
}

function getEntryFirstSignalAt(entry: CompanyLibraryEntry) {
  const times = entry.items
    .map((item) => getSignalTime(item))
    .filter(Boolean)
    .sort(compareTimestampDesc);

  return times[times.length - 1] ?? "";
}

const DEMAND_KEYWORDS = [
  "MES",
  "WMS",
  "QMS",
  "ERP",
  "PLM",
  "APS",
  "WCS",
  "SCADA",
  "智能制造",
  "工业互联网",
  "数字化",
  "制造执行",
  "生产管理",
  "质量管理",
  "仓储",
] as const;
const companyStageFilterValues: FollowUpStage[] = ["priority", "watch", "screening"];

function collectCompanyDemandTags(entry: CompanyLibraryEntry, jobs: CompanyJob[]) {
  const signalText = [
    entry.latestSummary,
    ...entry.items.flatMap((item) => [
      item.title,
      item.summary,
      item.subtitle,
      item.category,
      item.actionText,
      ...(item.tags ?? []),
    ]),
    ...jobs.flatMap((job) => [job.jobTitle, job.descriptionEvidence, ...(job.keywordHits ?? [])]),
  ]
    .map((item) => compactText(item))
    .join(" ")
    .toUpperCase();

  return DEMAND_KEYWORDS.filter((keyword) => signalText.includes(keyword.toUpperCase()));
}

function collectCompanyTimeline(entry: CompanyLibraryEntry) {
  return [...entry.items]
    .sort((left, right) => compareTimestampDesc(getSignalTime(left), getSignalTime(right)))
    .slice(0, 8);
}

export function buildCompanyLibraryEntries(items: SalesIntelItem[]) {
  const companyMap = new Map<string, CompanyLibraryEntry>();

  for (const item of items) {
    const companyName = resolveCompanyName(item);
    if (!companyName) {
      continue;
    }

    const city = resolveCity(item);
    const id = `${companyName}::${city || "unknown"}`;
    const sourcePlatforms = uniqueStrings([
      ...splitSourceLabels(item.sourceLabel),
      ...((item.matchedJobs ?? []).map((job) => compactText(job.platform)).filter(Boolean) || []),
      ...((item.allJobs ?? []).map((job) => compactText(job.platform)).filter(Boolean) || []),
    ]);
    const allJobsCount = uniqueStrings(
      (item.allJobs ?? item.matchedJobs ?? []).map(
        (job) =>
          `${compactText(job.platform)}::${compactText(job.url)}::${compactText(job.jobTitle)}`
      )
    ).length;

    const current = companyMap.get(id);
    if (!current) {
      companyMap.set(id, {
        id,
        companyName,
        city,
        latestRetrievedAt: compactText(item.retrievedAt || item.publishedAt || ""),
        latestSummary: compactText(item.summary),
        sourcePlatforms,
        signalCount: 1,
        allJobsCount,
        strongest: compactText(item.strength),
        items: [item],
      });
      continue;
    }

    current.signalCount += 1;
    current.sourcePlatforms = uniqueStrings([...current.sourcePlatforms, ...sourcePlatforms]);
    current.items = [...current.items, item].sort((left, right) =>
      compareTimestampDesc(
        compactText(left.retrievedAt || left.publishedAt || ""),
        compactText(right.retrievedAt || right.publishedAt || "")
      )
    );
    current.allJobsCount = Math.max(
      current.allJobsCount,
      uniqueStrings(
        current.items.flatMap((signal) =>
          (signal.allJobs ?? signal.matchedJobs ?? []).map(
            (job) =>
              `${compactText(job.platform)}::${compactText(job.url)}::${compactText(job.jobTitle)}`
          )
        )
      ).length
    );

    const nextRetrievedAt = compactText(item.retrievedAt || item.publishedAt || "");
    if (compareTimestampDesc(current.latestRetrievedAt, nextRetrievedAt) > 0) {
      current.latestRetrievedAt = nextRetrievedAt;
      current.latestSummary = compactText(item.summary) || current.latestSummary;
    }

    if (strengthScore(item.strength) > strengthScore(current.strongest)) {
      current.strongest = compactText(item.strength);
    }
  }

  return [...companyMap.values()].sort((left, right) => {
    const retrievedOrder = compareTimestampDesc(left.latestRetrievedAt, right.latestRetrievedAt);
    if (retrievedOrder !== 0) {
      return retrievedOrder;
    }

    return right.signalCount - left.signalCount;
  });
}

export function applyCompanyDuplicateDecisions(
  entries: CompanyLibraryEntry[],
  decisions: CompanyDuplicateDecision[]
) {
  const mergedDecisions = decisions.filter(
    (decision) =>
      decision.status === "merged" && decision.canonicalCompanyId && decision.companyIds.length > 1
  );

  if (!mergedDecisions.length) {
    return entries;
  }

  const decisionByCompanyId = new Map<string, CompanyDuplicateDecision>();

  for (const decision of mergedDecisions) {
    for (const companyId of decision.companyIds) {
      decisionByCompanyId.set(companyId, decision);
    }
  }

  const mergedMap = new Map<string, CompanyLibraryEntry>();

  for (const entry of entries) {
    const decision = decisionByCompanyId.get(entry.id);
    const targetId = decision?.canonicalCompanyId || entry.id;
    const current = mergedMap.get(targetId);

    if (!current) {
      mergedMap.set(targetId, {
        ...entry,
        id: targetId,
        companyName: decision?.canonicalCompanyName || entry.companyName,
        city: entry.city,
        sourcePlatforms: uniqueStrings(entry.sourcePlatforms),
        items: [...entry.items],
      });
      continue;
    }

    current.signalCount += entry.signalCount;
    current.allJobsCount += entry.allJobsCount;
    current.sourcePlatforms = uniqueStrings([...current.sourcePlatforms, ...entry.sourcePlatforms]);
    current.items = [...current.items, ...entry.items].sort((left, right) =>
      compareTimestampDesc(
        compactText(left.retrievedAt || left.publishedAt || ""),
        compactText(right.retrievedAt || right.publishedAt || "")
      )
    );

    if (entry.city && !current.city.includes(entry.city)) {
      current.city = uniqueStrings([current.city, entry.city]).join("、");
    }

    if (compareTimestampDesc(current.latestRetrievedAt, entry.latestRetrievedAt) > 0) {
      current.latestRetrievedAt = entry.latestRetrievedAt;
      current.latestSummary = entry.latestSummary || current.latestSummary;
    }

    if (strengthScore(entry.strongest) > strengthScore(current.strongest)) {
      current.strongest = entry.strongest;
    }
  }

  return [...mergedMap.values()].sort((left, right) => {
    const retrievedOrder = compareTimestampDesc(left.latestRetrievedAt, right.latestRetrievedAt);
    if (retrievedOrder !== 0) {
      return retrievedOrder;
    }

    return right.signalCount - left.signalCount;
  });
}

function CompanyIndexItem({
  entry,
  active,
  onSelect,
}: {
  entry: CompanyLibraryEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[1.35rem] border bg-white/80 px-4 py-4 text-left shadow-[0_12px_34px_rgba(69,49,28,0.06)] transition hover:-translate-y-0.5 hover:bg-white ${
        active ? "border-(--color-accent)" : "border-(--color-line)"
      }`}
    >
      <Space orientation="vertical" size={10} style={{ display: "flex" }}>
        <Space wrap size={[8, 8]}>
          {entry.city ? <Tag>{entry.city}</Tag> : null}
          {entry.strongest ? (
            <Tag color="orange">{t("companies.strongest_signal", { value: entry.strongest })}</Tag>
          ) : null}
          <Tag icon={<ClusterOutlined />}>
            {t("companies.signal_count", { count: entry.signalCount })}
          </Tag>
        </Space>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {entry.companyName}
        </Typography.Title>
        <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
          {entry.latestSummary}
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          {entry.latestRetrievedAt
            ? `${t("entry.retrieved_at")} ${formatDisplayUpdatedAt(entry.latestRetrievedAt)}`
            : t("sales_intel.not_synced")}
        </Typography.Text>
      </Space>
    </button>
  );
}

function CompanyMetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card size="small" className="h-full">
      <div className="flex items-center justify-between gap-3">
        <Statistic title={title} value={value} />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-(--color-card-soft) text-lg text-(--color-accent)">
          {icon}
        </span>
      </div>
    </Card>
  );
}

function DuplicateCandidatePanel({
  groups,
  onSelectCompany,
  onConfirmMerge,
  onIgnore,
  pendingKey,
}: {
  groups: CompanyDuplicateGroup[];
  onSelectCompany: (companyId: string) => void;
  onConfirmMerge: (group: CompanyDuplicateGroup) => void;
  onIgnore: (group: CompanyDuplicateGroup) => void;
  pendingKey: string;
}) {
  const { t } = useTranslation();
  const visibleGroups = groups.slice(0, 4);

  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <ClusterOutlined />
          <span>{t("companies.duplicates.title")}</span>
        </Space>
      }
      extra={<Tag color={groups.length ? "orange" : "default"}>{groups.length}</Tag>}
    >
      {visibleGroups.length ? (
        <div className="grid gap-3">
          {visibleGroups.map((group) => (
            <div
              key={group.id}
              className="rounded-[1.1rem] border border-(--color-line) bg-(--color-card-soft) px-3 py-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Typography.Text strong>{group.canonicalName}</Typography.Text>
                <Tag color="gold">
                  {t("companies.duplicates.confidence", { value: group.confidence })}
                </Tag>
              </div>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {group.reasons.slice(0, 2).join("；")}
              </Typography.Paragraph>
              <Space wrap size={[8, 8]}>
                {group.companies.map((company) => (
                  <button
                    key={company.companyId}
                    type="button"
                    onClick={() => onSelectCompany(company.companyId)}
                    className="cursor-pointer rounded-full border border-(--color-line) bg-white/75 px-3 py-1 text-sm text-(--color-ink) transition hover:border-(--color-accent) hover:text-(--color-accent)"
                  >
                    {company.companyName}
                    {company.city ? ` · ${company.city}` : ""}
                  </button>
                ))}
              </Space>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="small"
                  loading={pendingKey === `${group.duplicateKey}:ignored`}
                  onClick={() => onIgnore(group)}
                >
                  {t("companies.duplicates.ignore")}
                </Button>
                <Button
                  size="small"
                  type="primary"
                  loading={pendingKey === `${group.duplicateKey}:merged`}
                  onClick={() => onConfirmMerge(group)}
                >
                  {t("companies.duplicates.confirm_merge")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t("companies.duplicates.empty")}
        </Typography.Paragraph>
      )}
    </Card>
  );
}

function CompanyProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-(--color-line) bg-white/65 px-4 py-3">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Paragraph strong style={{ marginTop: 6, marginBottom: 0 }}>
        {value}
      </Typography.Paragraph>
    </div>
  );
}

function DemandJudgementCard({ demandTags }: { demandTags: readonly string[] }) {
  const { t } = useTranslation();

  return (
    <Card size="small" title={t("companies.profile.demand_title")}>
      {demandTags.length ? (
        <div className="space-y-3">
          <Space wrap size={[8, 8]}>
            {demandTags.map((tag) => (
              <Tag key={tag} color="blue">
                {tag}
              </Tag>
            ))}
          </Space>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t("companies.profile.demand_description", {
              value: demandTags.slice(0, 5).join(" / "),
            })}
          </Typography.Paragraph>
        </div>
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t("companies.profile.demand_empty")}
        </Typography.Paragraph>
      )}
    </Card>
  );
}

function FollowUpReserveCard({
  stageLabel,
  stageColor,
  nextAction,
  record,
}: {
  stageLabel: string;
  stageColor: string;
  nextAction: string;
  record?: FollowUpRecord | null;
}) {
  const { t } = useTranslation();

  return (
    <Card size="small" title={t("companies.profile.followup_title")}>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">{t("companies.profile.stage_label")}</Typography.Text>
          <Tag color={stageColor}>{stageLabel}</Tag>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">{t("companies.profile.owner_label")}</Typography.Text>
          <Typography.Text>{record?.owner || t("companies.profile.owner_empty")}</Typography.Text>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">
            {t("companies.profile.deal_stage_label")}
          </Typography.Text>
          <Typography.Text>
            {record?.dealStage
              ? t(`follow_ups.deal_stages.${record.dealStage}`)
              : t("companies.profile.deal_stage_empty")}
          </Typography.Text>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">
            {t("companies.profile.communication_method_label")}
          </Typography.Text>
          <Typography.Text>
            {record?.communicationMethod
              ? t(`follow_ups.communication_methods.${record.communicationMethod}`)
              : t("companies.profile.communication_method_empty")}
          </Typography.Text>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">
            {t("companies.profile.contact_result_label")}
          </Typography.Text>
          <Typography.Text>
            {record?.contactResult
              ? t(`follow_ups.contact_results.${record.contactResult}`)
              : t("companies.profile.contact_result_empty")}
          </Typography.Text>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">
            {t("companies.profile.next_reminder_label")}
          </Typography.Text>
          <Typography.Text>
            {formatDisplayUpdatedAt(record?.nextReminderAt ?? "") ||
              t("companies.profile.next_reminder_empty")}
          </Typography.Text>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text type="secondary">
            {t("companies.profile.last_followed_label")}
          </Typography.Text>
          <Typography.Text>
            {formatDisplayUpdatedAt(record?.lastFollowedAt ?? "") ||
              t("companies.profile.last_followed_empty")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] border border-(--color-line) bg-(--color-card-soft) px-3 py-3 md:col-span-2">
          <Typography.Text type="secondary">
            {t("companies.profile.next_action_label")}
          </Typography.Text>
          <Typography.Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
            {record?.nextAction || nextAction || t("companies.profile.next_action_empty")}
          </Typography.Paragraph>
        </div>
        <div className="rounded-[1rem] border border-dashed border-(--color-line) bg-white/45 px-3 py-3 md:col-span-2">
          <Typography.Text type="secondary">{t("companies.profile.note_label")}</Typography.Text>
          <Typography.Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
            {record?.note || t("companies.profile.note_empty")}
          </Typography.Paragraph>
        </div>
      </div>
    </Card>
  );
}

function CompanyTimelineCard({ entry }: { entry: CompanyLibraryEntry }) {
  const { t } = useTranslation();
  const timelineItems = collectCompanyTimeline(entry);

  return (
    <Card
      title={
        <Space size={8}>
          <ScheduleOutlined />
          <span>{t("companies.profile.timeline_title")}</span>
        </Space>
      }
    >
      {timelineItems.length ? (
        <div className="space-y-0">
          {timelineItems.map((item, index) => {
            const signalTime = getSignalTime(item);

            return (
              <div key={item.id} className="relative grid gap-3 pl-6 pb-5 last:pb-0">
                <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-(--color-accent)" />
                {index < timelineItems.length - 1 ? (
                  <span className="absolute left-[5px] top-5 bottom-0 w-px bg-(--color-line)" />
                ) : null}
                <div className="space-y-2">
                  <Space wrap size={[8, 8]}>
                    {signalTime ? (
                      <Tag>{`${t("entry.retrieved_at")} ${formatDisplayUpdatedAt(signalTime)}`}</Tag>
                    ) : null}
                    {item.sourceLabel ? <Tag>{item.sourceLabel}</Tag> : null}
                    {item.category ? <Tag color="blue">{item.category}</Tag> : null}
                  </Space>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                    {item.summary}
                  </Typography.Paragraph>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty description={t("companies.profile.timeline_empty")} />
      )}
    </Card>
  );
}

function RiskPanel({
  riskItems,
}: {
  riskItems: Array<{ title: string; detail: string; color: string }>;
}) {
  const { t } = useTranslation();

  return (
    <Card size="small" title={t("companies.profile.risk_title")}>
      {riskItems.length ? (
        <div className="grid gap-3">
          {riskItems.map((item) => (
            <div
              key={item.title}
              className="rounded-[1rem] border border-(--color-line) bg-(--color-card-soft) px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Tag color={item.color}>{t("companies.profile.risk_tag")}</Tag>
                <Typography.Text strong>{item.title}</Typography.Text>
              </div>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                {item.detail}
              </Typography.Paragraph>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[1rem] border border-(--color-line) bg-white/65 px-3 py-3">
          <Typography.Text strong>{t("companies.profile.risk_normal_title")}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {t("companies.profile.risk_normal_detail")}
          </Typography.Paragraph>
        </div>
      )}
    </Card>
  );
}

function SignalRow({ item }: { item: SalesIntelItem }) {
  const { t } = useTranslation();
  const retrievedAt = compactText(item.retrievedAt || item.publishedAt || "");

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <Space orientation="vertical" size={5} style={{ display: "flex" }}>
        <Space wrap size={[8, 8]}>
          <Tag color="blue">{item.category}</Tag>
          {item.sourceLabel ? <Tag>{item.sourceLabel}</Tag> : null}
          {item.strength ? (
            <Tag color="orange">{t("sales_intel.strength", { value: item.strength })}</Tag>
          ) : null}
        </Space>
        <Typography.Text strong>{item.title}</Typography.Text>
        <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
          {item.summary}
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          {retrievedAt
            ? `${t("entry.retrieved_at")} ${formatDisplayUpdatedAt(retrievedAt)}`
            : t("sales_intel.not_synced")}
        </Typography.Text>
      </Space>
    </div>
  );
}

function JobPreviewList({ jobs }: { jobs: CompanyJob[] }) {
  const { t } = useTranslation();

  if (!jobs.length) {
    return <Empty description={t("companies.profile.job_empty")} />;
  }

  return (
    <div className="divide-y divide-(--color-line)">
      {jobs.slice(0, 6).map((job) => {
        const headline = [job.jobTitle, job.platform, job.city, job.salary, job.publishedAt]
          .map((item) => compactText(item))
          .filter(Boolean)
          .join(" · ");

        return (
          <div key={createJobIdentity(job)} className="py-4 first:pt-0 last:pb-0">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              <div className="min-w-0 space-y-2">
                <Typography.Text strong ellipsis title={headline}>
                  {headline || t("sales_intel.no_job_description")}
                </Typography.Text>
                <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {job.descriptionEvidence || t("sales_intel.no_job_description")}
                </Typography.Paragraph>
              </div>
              {job.url ? (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-(--color-line) px-3 py-1.5 text-sm font-medium text-(--color-accent) hover:bg-(--color-card-soft)"
                >
                  {t("sales_intel.open_source")}
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanyProfile({
  entry,
  followUpRecord,
  profileRecord,
  onSaveProfile,
}: {
  entry: CompanyLibraryEntry | null;
  followUpRecord?: FollowUpRecord | null;
  profileRecord?: CompanyProfileRecord | null;
  onSaveProfile: (profile: CompanyProfileRecord) => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<CompanyProfileFormValues>();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!entry || !profileModalOpen) {
      return;
    }

    form.setFieldsValue({
      industry: profileRecord?.industry ?? "",
      scale: profileRecord?.scale ?? "",
      website: profileRecord?.website ?? "",
      address: profileRecord?.address ?? "",
      contactName: profileRecord?.contactName ?? "",
      contactMethod: profileRecord?.contactMethod ?? "",
      owner: profileRecord?.owner ?? "",
      level: profileRecord?.level ?? "",
      status: profileRecord?.status ?? "",
      tagsText: profileRecord?.tags?.join("，") ?? "",
      note: profileRecord?.note ?? "",
    });
  }, [entry, form, profileModalOpen, profileRecord]);

  if (!entry) {
    return (
      <Card>
        <Empty description={t("companies.empty")} />
      </Card>
    );
  }

  const jobs = collectCompanyJobs(entry);
  const followUpStage = followUpRecord?.stage ?? resolveCompanyStage(entry);
  const followUpStageLabel = getFollowUpStageLabel(t, followUpStage);
  const followUpStageColor = followUpStage === "priority" ? "orange" : "blue";
  const nextAction = getLatestAction(entry);
  const firstSignalAt = getEntryFirstSignalAt(entry);
  const demandTags = collectCompanyDemandTags(entry, jobs);
  const riskItems = [
    entry.signalCount <= 1
      ? {
          title: t("companies.profile.risks.single_signal_title"),
          detail: t("companies.profile.risks.single_signal_detail"),
          color: "gold",
        }
      : null,
    entry.sourcePlatforms.length <= 1
      ? {
          title: t("companies.profile.risks.single_source_title"),
          detail: t("companies.profile.risks.single_source_detail"),
          color: "gold",
        }
      : null,
    jobs.length === 0
      ? {
          title: t("companies.profile.risks.no_job_title"),
          detail: t("companies.profile.risks.no_job_detail"),
          color: "default",
        }
      : null,
    strengthScore(entry.strongest) < 3
      ? {
          title: t("companies.profile.risks.low_strength_title"),
          detail: t("companies.profile.risks.low_strength_detail"),
          color: "blue",
        }
      : null,
    !entry.latestRetrievedAt
      ? {
          title: t("companies.profile.risks.no_time_title"),
          detail: t("companies.profile.risks.no_time_detail"),
          color: "red",
        }
      : null,
  ].filter((item): item is { title: string; detail: string; color: string } => Boolean(item));

  async function saveProfile(values: CompanyProfileFormValues) {
    if (!entry) {
      return;
    }

    setProfileSaving(true);

    try {
      const response = await fetch(`/api/company-profiles/${encodeURIComponent(entry.id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          companyId: entry.id,
          companyName: entry.companyName,
          city: entry.city,
          tags: parseProfileTags(values.tagsText),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save company profile: ${response.status}`);
      }

      const payload = (await response.json()) as { item?: CompanyProfileRecord };
      if (payload.item) {
        onSaveProfile(payload.item);
        setProfileModalOpen(false);
      }
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <Space orientation="vertical" size={20} style={{ display: "flex" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <Space wrap size={[8, 8]}>
                {entry.city ? <Tag>{entry.city}</Tag> : null}
                <Tag color="orange">
                  {entry.strongest
                    ? t("companies.strongest_signal", { value: entry.strongest })
                    : t("companies.profile.no_strength")}
                </Tag>
                <Tag icon={<CalendarOutlined />}>
                  {entry.latestRetrievedAt
                    ? formatDisplayUpdatedAt(entry.latestRetrievedAt)
                    : t("sales_intel.not_synced")}
                </Tag>
              </Space>
              <div className="space-y-2">
                <Typography.Title level={2} style={{ margin: 0 }}>
                  {entry.companyName}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {t("companies.profile.subtitle")}
                </Typography.Paragraph>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <CompanyMetricCard
              title={t("companies.signal_metric")}
              value={entry.signalCount}
              icon={<FileSearchOutlined />}
            />
            <CompanyMetricCard
              title={t("companies.platform_metric")}
              value={entry.sourcePlatforms.length}
              icon={<GlobalOutlined />}
            />
            <CompanyMetricCard
              title={t("companies.job_metric")}
              value={entry.allJobsCount}
              icon={<ProfileOutlined />}
            />
          </div>

          <Card size="small" title={t("companies.profile.basic_title")}>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <CompanyProfileField
                label={t("companies.profile.fields.company")}
                value={entry.companyName}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.city")}
                value={entry.city || t("companies.unknown_city")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.first_seen")}
                value={
                  firstSignalAt
                    ? formatDisplayUpdatedAt(firstSignalAt)
                    : t("sales_intel.not_synced")
                }
              />
              <CompanyProfileField
                label={t("companies.profile.fields.latest_seen")}
                value={
                  entry.latestRetrievedAt
                    ? formatDisplayUpdatedAt(entry.latestRetrievedAt)
                    : t("sales_intel.not_synced")
                }
              />
            </div>
          </Card>

          <Card
            size="small"
            title={t("companies.profile.master_title")}
            extra={
              <Button size="small" type="primary" onClick={() => setProfileModalOpen(true)}>
                {t("companies.profile.edit")}
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <CompanyProfileField
                label={t("companies.profile.fields.industry")}
                value={profileRecord?.industry || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.scale")}
                value={profileRecord?.scale || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.level")}
                value={profileRecord?.level || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.status")}
                value={profileRecord?.status || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.website")}
                value={profileRecord?.website || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.address")}
                value={profileRecord?.address || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.contact")}
                value={profileRecord?.contactName || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.contact_method")}
                value={profileRecord?.contactMethod || t("companies.profile.master_empty")}
              />
              <CompanyProfileField
                label={t("companies.profile.fields.owner")}
                value={profileRecord?.owner || t("companies.profile.master_empty")}
              />
            </div>
            <div className="mt-3 rounded-[1rem] border border-dashed border-(--color-line) bg-white/55 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Typography.Text type="secondary">
                  {t("companies.profile.master_tags")}
                </Typography.Text>
                {profileRecord?.tags?.length ? (
                  profileRecord.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
                ) : (
                  <Tag>{t("companies.profile.master_empty")}</Tag>
                )}
              </div>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                {profileRecord?.note || t("companies.profile.master_note_empty")}
              </Typography.Paragraph>
            </div>
          </Card>

          <Modal
            title={t("companies.profile.edit_title")}
            open={profileModalOpen}
            onCancel={() => setProfileModalOpen(false)}
            onOk={() => form.submit()}
            okText={t("companies.profile.save")}
            cancelText={t("companies.profile.cancel")}
            confirmLoading={profileSaving}
            destroyOnHidden
          >
            <Form<CompanyProfileFormValues>
              form={form}
              layout="vertical"
              onFinish={(values) => void saveProfile(values)}
            >
              <div className="grid gap-x-3 md:grid-cols-2">
                <Form.Item name="industry" label={t("companies.profile.fields.industry")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="scale" label={t("companies.profile.fields.scale")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="level" label={t("companies.profile.fields.level")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="status" label={t("companies.profile.fields.status")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="website" label={t("companies.profile.fields.website")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="address" label={t("companies.profile.fields.address")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="contactName" label={t("companies.profile.fields.contact")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item
                  name="contactMethod"
                  label={t("companies.profile.fields.contact_method")}
                >
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="owner" label={t("companies.profile.fields.owner")}>
                  <Input allowClear />
                </Form.Item>
                <Form.Item name="tagsText" label={t("companies.profile.fields.tags")}>
                  <Input allowClear placeholder={t("companies.profile.tags_placeholder")} />
                </Form.Item>
              </div>
              <Form.Item name="note" label={t("companies.profile.fields.note")}>
                <Input.TextArea
                  allowClear
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  placeholder={t("companies.profile.note_placeholder")}
                />
              </Form.Item>
            </Form>
          </Modal>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
            <Card size="small" title={t("companies.profile.summary_title")}>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {entry.latestSummary || t("companies.profile.summary_empty")}
              </Typography.Paragraph>
            </Card>

            <DemandJudgementCard demandTags={demandTags} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
            <FollowUpReserveCard
              stageLabel={followUpStageLabel}
              stageColor={followUpStageColor}
              nextAction={nextAction}
              record={followUpRecord}
            />
            <RiskPanel riskItems={riskItems} />
          </div>

          <Card size="small" title={t("companies.profile.source_title")}>
            <Space wrap size={[8, 8]}>
              {entry.sourcePlatforms.length ? (
                entry.sourcePlatforms.map((platform) => (
                  <Tag key={`${entry.id}-${platform}`} icon={<GlobalOutlined />}>
                    {platform}
                  </Tag>
                ))
              ) : (
                <Tag>{t("sales_intel.not_synced")}</Tag>
              )}
            </Space>
          </Card>
        </Space>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <CompanyTimelineCard entry={entry} />

        <Card
          title={
            <Space size={8}>
              <ProfileOutlined />
              <span>{t("companies.profile.job_preview_title")}</span>
            </Space>
          }
        >
          <JobPreviewList jobs={jobs} />
        </Card>
      </div>

      <Card
        title={
          <Space size={8}>
            <FileSearchOutlined />
            <span>{t("companies.recent_signals")}</span>
          </Space>
        }
      >
        <div className="divide-y divide-(--color-line)">
          {entry.items.slice(0, 6).map((item) => (
            <SignalRow key={item.id} item={item} />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function CompanyLibraryPanel({
  entries,
  records,
  profiles,
  duplicateGroups,
  duplicateDecisions,
  onSaveDuplicateDecision,
  onSaveProfile,
}: {
  entries: CompanyLibraryEntry[];
  records: FollowUpRecord[];
  profiles: CompanyProfileRecord[];
  duplicateGroups: CompanyDuplicateGroup[];
  duplicateDecisions: CompanyDuplicateDecision[];
  onSaveDuplicateDecision: (decision: CompanyDuplicateDecision) => void;
  onSaveProfile: (profile: CompanyProfileRecord) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<CompanyStageFilter>("all");
  const [demandFilter, setDemandFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [pendingDuplicateDecisionKey, setPendingDuplicateDecisionKey] = useState("");
  const effectiveEntries = useMemo(
    () => applyCompanyDuplicateDecisions(entries, duplicateDecisions),
    [duplicateDecisions, entries]
  );
  const totalSignalCount = useMemo(
    () => getEntryTotalSignalCount(effectiveEntries),
    [effectiveEntries]
  );
  const totalJobCount = useMemo(() => getEntryTotalJobCount(effectiveEntries), [effectiveEntries]);
  const followUpRecordMap = useMemo(
    () => new Map(records.map((record) => [record.companyId, record])),
    [records]
  );
  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.companyId, profile])),
    [profiles]
  );
  const cityOptions = useMemo(
    () =>
      uniqueStrings(effectiveEntries.map((entry) => entry.city)).map((city) => ({
        value: city,
        label: city,
      })),
    [effectiveEntries]
  );
  const demandOptions = useMemo(() => {
    const demandSet = new Set<string>();

    for (const entry of effectiveEntries) {
      const jobs = collectCompanyJobs(entry);
      for (const tag of collectCompanyDemandTags(entry, jobs)) {
        demandSet.add(tag);
      }
    }

    return [...demandSet]
      .sort((left, right) => left.localeCompare(right))
      .map((tag) => ({
        value: tag,
        label: tag,
      }));
  }, [effectiveEntries]);

  useEffect(() => {
    const targetId = new URLSearchParams(window.location.search).get("company");

    if (!targetId || !effectiveEntries.some((entry) => entry.id === targetId)) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setQuery("");
      setSelectedId(targetId);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [effectiveEntries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return effectiveEntries.filter((entry) => {
      const record = followUpRecordMap.get(entry.id);
      const stage = record?.stage ?? resolveCompanyStage(entry);
      const demandTags = collectCompanyDemandTags(entry, collectCompanyJobs(entry));

      if (cityFilter && entry.city !== cityFilter) {
        return false;
      }

      if (stageFilter !== "all" && stage !== stageFilter) {
        return false;
      }

      if (demandFilter && !(demandTags as readonly string[]).includes(demandFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        entry.companyName,
        entry.city,
        entry.latestSummary,
        ...entry.sourcePlatforms,
        ...demandTags,
        ...entry.items.flatMap((item) => [
          item.title,
          item.summary,
          item.category,
          item.sourceLabel,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [cityFilter, demandFilter, effectiveEntries, followUpRecordMap, query, stageFilter]);

  async function saveDuplicateDecision(group: CompanyDuplicateGroup, status: "merged" | "ignored") {
    const canonicalCompany =
      group.companies.find((company) => company.companyName === group.canonicalName) ??
      group.companies[0];
    const pendingKey = `${group.duplicateKey}:${status}`;
    setPendingDuplicateDecisionKey(pendingKey);

    try {
      const response = await fetch(
        `/api/company-duplicates/${encodeURIComponent(group.duplicateKey)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            canonicalCompanyId: status === "merged" ? canonicalCompany?.companyId : "",
            canonicalCompanyName: status === "merged" ? group.canonicalName : "",
            companyIds:
              status === "merged" ? group.companies.map((company) => company.companyId) : [],
            companyNames:
              status === "merged" ? group.companies.map((company) => company.companyName) : [],
            reason:
              status === "merged"
                ? t("companies.duplicates.merge_reason")
                : t("companies.duplicates.ignore_reason"),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to save duplicate decision: ${response.status}`);
      }

      const payload = (await response.json()) as { item?: CompanyDuplicateDecision };
      if (payload.item) {
        onSaveDuplicateDecision(payload.item);
        if (status === "merged" && canonicalCompany?.companyId) {
          setSelectedId(canonicalCompany.companyId);
        }
      }
    } finally {
      setPendingDuplicateDecisionKey("");
    }
  }

  const resolvedSelectedId =
    selectedId && filteredEntries.some((entry) => entry.id === selectedId)
      ? selectedId
      : (filteredEntries[0]?.id ?? null);
  const activeEntry = filteredEntries.find((entry) => entry.id === resolvedSelectedId) ?? null;
  const activeFollowUpRecord = activeEntry ? followUpRecordMap.get(activeEntry.id) : null;
  const activeProfileRecord = activeEntry ? profileMap.get(activeEntry.id) : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(19rem,0.76fr)_minmax(0,1.24fr)]">
      <Card
        title={t("companies.index_title")}
        extra={
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("companies.search_placeholder")}
            style={{ width: 260 }}
          />
        }
      >
        <Space orientation="vertical" size={16} style={{ display: "flex" }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t("companies.index_description")}
          </Typography.Paragraph>

          <div className="grid gap-3">
            <Select
              allowClear
              value={cityFilter || undefined}
              onChange={(value) => setCityFilter(value ?? "")}
              placeholder={t("companies.filters.city")}
              options={cityOptions}
            />
            <Select
              value={stageFilter}
              onChange={(value) => setStageFilter(value)}
              options={[
                { value: "all", label: t("companies.filters.all_stages") },
                ...companyStageFilterValues.map((stage) => ({
                  value: stage,
                  label: getFollowUpStageLabel(t, stage),
                })),
              ]}
            />
            <Select
              allowClear
              value={demandFilter || undefined}
              onChange={(value) => setDemandFilter(value ?? "")}
              placeholder={t("companies.filters.demand")}
              options={demandOptions}
            />
            <Typography.Text type="secondary">
              {t("companies.filters.result", {
                count: filteredEntries.length,
                total: effectiveEntries.length,
              })}
            </Typography.Text>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <CompanyMetricCard
              title={t("companies.total_companies_metric")}
              value={effectiveEntries.length}
              icon={<BankOutlined />}
            />
            <CompanyMetricCard
              title={t("companies.total_signals_metric")}
              value={totalSignalCount}
              icon={<FileSearchOutlined />}
            />
            <CompanyMetricCard
              title={t("companies.total_jobs_metric")}
              value={totalJobCount}
              icon={<ProfileOutlined />}
            />
          </div>

          <DuplicateCandidatePanel
            groups={duplicateGroups}
            onSelectCompany={(companyId) => {
              setQuery("");
              setSelectedId(companyId);
            }}
            onConfirmMerge={(group) => void saveDuplicateDecision(group, "merged")}
            onIgnore={(group) => void saveDuplicateDecision(group, "ignored")}
            pendingKey={pendingDuplicateDecisionKey}
          />

          {filteredEntries.length ? (
            <div className="grid max-h-[58rem] gap-3 overflow-y-auto pr-2">
              {filteredEntries.map((entry) => (
                <CompanyIndexItem
                  key={entry.id}
                  entry={entry}
                  active={entry.id === resolvedSelectedId}
                  onSelect={() => setSelectedId(entry.id)}
                />
              ))}
            </div>
          ) : (
            <Empty description={t("companies.empty")} />
          )}
        </Space>
      </Card>

      <CompanyProfile
        entry={activeEntry}
        followUpRecord={activeFollowUpRecord}
        profileRecord={activeProfileRecord}
        onSaveProfile={onSaveProfile}
      />
    </div>
  );
}

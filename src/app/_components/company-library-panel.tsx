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
import { Card, Empty, Input, Space, Statistic, Tag, Typography } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { SalesIntelItem } from "./sales-intel-types";

type CompanyJob = NonNullable<SalesIntelItem["allJobs"]>[number];

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

function CompanyProfile({ entry }: { entry: CompanyLibraryEntry | null }) {
  const { t } = useTranslation();

  if (!entry) {
    return (
      <Card>
        <Empty description={t("companies.empty")} />
      </Card>
    );
  }

  const jobs = collectCompanyJobs(entry);
  const followUpStage = resolveCompanyStage(entry);
  const followUpStageLabel =
    followUpStage === "priority"
      ? t("companies.profile.stages.priority")
      : followUpStage === "watch"
        ? t("companies.profile.stages.watch")
        : t("companies.profile.stages.screening");
  const nextAction = getLatestAction(entry);

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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(19rem,0.82fr)]">
            <Card size="small" title={t("companies.profile.summary_title")}>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {entry.latestSummary || t("companies.profile.summary_empty")}
              </Typography.Paragraph>
            </Card>

            <Card size="small" title={t("companies.profile.followup_title")}>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Typography.Text type="secondary">
                    {t("companies.profile.stage_label")}
                  </Typography.Text>
                  <Tag color={followUpStage === "priority" ? "orange" : "blue"}>
                    {followUpStageLabel}
                  </Tag>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Typography.Text type="secondary">
                    {t("companies.profile.owner_label")}
                  </Typography.Text>
                  <Typography.Text>{t("companies.profile.owner_empty")}</Typography.Text>
                </div>
                <div className="rounded-[1rem] border border-(--color-line) bg-(--color-card-soft) px-3 py-3">
                  <Typography.Text type="secondary">
                    {t("companies.profile.next_action_label")}
                  </Typography.Text>
                  <Typography.Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
                    {nextAction || t("companies.profile.next_action_empty")}
                  </Typography.Paragraph>
                </div>
              </div>
            </Card>
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
        <Card
          title={
            <Space size={8}>
              <ScheduleOutlined />
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
    </div>
  );
}

export function CompanyLibraryPanel({ entries }: { entries: CompanyLibraryEntry[] }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const totalSignalCount = useMemo(() => getEntryTotalSignalCount(entries), [entries]);
  const totalJobCount = useMemo(() => getEntryTotalJobCount(entries), [entries]);

  const filteredEntries = useMemo(() => {
    if (!query.trim()) {
      return entries;
    }

    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) =>
      [
        entry.companyName,
        entry.city,
        entry.latestSummary,
        ...entry.sourcePlatforms,
        ...entry.items.flatMap((item) => [
          item.title,
          item.summary,
          item.category,
          item.sourceLabel,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [entries, query]);

  const resolvedSelectedId =
    selectedId && filteredEntries.some((entry) => entry.id === selectedId)
      ? selectedId
      : (filteredEntries[0]?.id ?? null);
  const activeEntry = filteredEntries.find((entry) => entry.id === resolvedSelectedId) ?? null;

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

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <CompanyMetricCard
              title={t("companies.total_companies_metric")}
              value={entries.length}
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

      <CompanyProfile entry={activeEntry} />
    </div>
  );
}

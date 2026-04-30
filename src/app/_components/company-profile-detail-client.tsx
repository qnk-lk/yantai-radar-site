"use client";

import {
  ArrowLeftOutlined,
  BankOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Space, Spin, Statistic, Tag, Timeline, Typography } from "antd";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./i18n";
import {
  buildCompanyLibraryEntries,
  type CompanyLibraryEntry,
  type CompanyProfileRecord,
} from "./company-library-panel";
import type { FollowUpRecord, FollowUpRecordsPayload } from "./follow-up-types";
import type { SalesIntelData, SalesIntelItem, SalesIntelMatchedJob } from "./sales-intel-types";

type CompanyProfilesPayload = {
  items: CompanyProfileRecord[];
};

type CompanyDetailData = {
  salesIntelData: SalesIntelData;
  followUpRecords: FollowUpRecord[];
  companyProfiles: CompanyProfileRecord[];
};

function compactText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDisplayUpdatedAt(value: string) {
  return compactText(value).replace(/\s*CST$/u, "");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => compactText(item)).filter(Boolean))];
}

function createFallbackSalesIntelData(): SalesIntelData {
  return {
    updatedAt: "",
    todaySearchItems: [],
    summary: {
      focus: "",
      status: "",
      note: "",
    },
    totals: {
      overall: 0,
      reportItems: 0,
      recruitmentItems: 0,
      todayHighlights: 0,
    },
    sourceBreakdown: [
      { kind: "report", count: 0, updatedAt: "" },
      { kind: "recruitment", count: 0, updatedAt: "" },
    ],
    feed: [],
    todayHighlights: [],
  };
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function collectCompanyJobs(entry: CompanyLibraryEntry | null) {
  if (!entry) {
    return [];
  }

  const jobMap = new Map<string, SalesIntelMatchedJob>();

  for (const item of entry.items) {
    for (const job of [...(item.matchedJobs ?? []), ...(item.allJobs ?? [])]) {
      const key = [job.platform, job.jobTitle, job.city, job.url].map(compactText).join("::");
      if (key && !jobMap.has(key)) {
        jobMap.set(key, job);
      }
    }
  }

  return [...jobMap.values()];
}

function getSortText(item: SalesIntelItem) {
  return compactText(item.retrievedAt || item.publishedAt || "");
}

function sortSignals(items: SalesIntelItem[]) {
  return [...items].sort((left, right) => getSortText(right).localeCompare(getSortText(left)));
}

function buildRecordOnlyEntry(record: FollowUpRecord, summary: string): CompanyLibraryEntry {
  return {
    id: record.companyId,
    companyName: record.companyName,
    city: record.city,
    latestRetrievedAt: record.updatedAt,
    latestSummary: summary,
    sourcePlatforms: [],
    signalCount: 0,
    allJobsCount: 0,
    strongest: "",
    items: [],
  };
}

function mergeCompanyEntries(
  salesIntelData: SalesIntelData,
  followUpRecords: FollowUpRecord[],
  recordOnlySummary: string
) {
  const companyEntries = buildCompanyLibraryEntries(salesIntelData.feed);
  const existingIds = new Set(companyEntries.map((entry) => entry.id));
  const recordOnlyEntries = followUpRecords
    .filter((record) => !existingIds.has(record.companyId))
    .map((record) => buildRecordOnlyEntry(record, recordOnlySummary));

  return [...companyEntries, ...recordOnlyEntries];
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-(--color-line) bg-white/70 px-4 py-3">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text strong className="mt-1 block" ellipsis title={value}>
        {value}
      </Typography.Text>
    </div>
  );
}

function SignalList({ items }: { items: SalesIntelItem[] }) {
  const { t } = useTranslation();

  if (!items.length) {
    return <Empty description={t("company_detail.signals_empty")} />;
  }

  return (
    <div className="grid gap-3">
      {sortSignals(items).map((item) => (
        <article
          key={item.id}
          className="rounded-[1.1rem] border border-(--color-line) bg-white/70 px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{item.category}</Tag>
            {item.sourceLabel ? <Tag>{item.sourceLabel}</Tag> : null}
            {item.strength ? (
              <Tag color={item.strength === "高" ? "red" : "blue"}>{item.strength}</Tag>
            ) : null}
            <Typography.Text type="secondary">
              {formatDisplayUpdatedAt(item.retrievedAt || item.publishedAt || "") ||
                t("sales_intel.not_synced")}
            </Typography.Text>
          </div>
          <Typography.Title level={5} style={{ marginTop: 10, marginBottom: 6 }}>
            {item.title}
          </Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 0 }}>{item.summary}</Typography.Paragraph>
        </article>
      ))}
    </div>
  );
}

function JobList({ jobs }: { jobs: SalesIntelMatchedJob[] }) {
  const { t } = useTranslation();

  if (!jobs.length) {
    return <Empty description={t("company_detail.jobs_empty")} />;
  }

  return (
    <div className="grid gap-3">
      {jobs.map((job) => (
        <div
          key={[job.platform, job.jobTitle, job.city, job.url].join("::")}
          className="rounded-[1.1rem] border border-(--color-line) bg-white/70 px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Typography.Text strong>
                {job.jobTitle || t("sales_intel.no_job_description")}
              </Typography.Text>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.platform ? <Tag>{job.platform}</Tag> : null}
                {job.city ? <Tag>{job.city}</Tag> : null}
                {job.salary ? <Tag>{job.salary}</Tag> : null}
                {job.publishedAt ? <Tag>{formatDisplayUpdatedAt(job.publishedAt)}</Tag> : null}
              </div>
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
          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 10, marginBottom: 0 }}>
            {job.descriptionEvidence || t("sales_intel.no_job_description")}
          </Typography.Paragraph>
        </div>
      ))}
    </div>
  );
}

function FollowUpTimeline({ record }: { record?: FollowUpRecord }) {
  const { t } = useTranslation();
  const events = record?.events ?? [];

  if (!record) {
    return <Empty description={t("company_detail.follow_empty")} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ProfileField
          label={t("follow_ups.fields.owner")}
          value={record.owner || t("follow_ups.values.unassigned_owner")}
        />
        <ProfileField
          label={t("follow_ups.fields.contact_result")}
          value={
            record.contactResult
              ? t(`follow_ups.contact_results.${record.contactResult}`)
              : t("follow_ups.values.no_contact_result")
          }
        />
        <ProfileField
          label={t("follow_ups.fields.next_reminder")}
          value={
            formatDisplayUpdatedAt(record.nextReminderAt) || t("follow_ups.values.no_reminder")
          }
        />
      </div>
      {events.length ? (
        <Timeline
          items={events.map((event) => ({
            children: (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Typography.Text strong>
                    {formatDisplayUpdatedAt(event.followedAt || event.createdAt)}
                  </Typography.Text>
                  {event.owner ? <Tag>{event.owner}</Tag> : null}
                  {event.stage ? <Tag>{t(`follow_ups.stages.${event.stage}`)}</Tag> : null}
                </div>
                {event.nextAction ? (
                  <Typography.Paragraph style={{ marginBottom: 0 }}>
                    {event.nextAction}
                  </Typography.Paragraph>
                ) : null}
                {event.note ? (
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {event.note}
                  </Typography.Paragraph>
                ) : null}
              </div>
            ),
          }))}
        />
      ) : (
        <Typography.Text type="secondary">{t("follow_ups.history.empty")}</Typography.Text>
      )}
    </div>
  );
}

export function CompanyProfileDetailClient() {
  const { t } = useTranslation();
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState<CompanyDetailData>({
    salesIntelData: createFallbackSalesIntelData(),
    followUpRecords: [],
    companyProfiles: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setCompanyId(new URLSearchParams(window.location.search).get("company") ?? "");
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsLoading(true);
      setLoadError("");

      try {
        const [salesIntelData, followUpPayload, profilePayload] = await Promise.all([
          loadJson<SalesIntelData>("/api/sales/intel"),
          loadJson<FollowUpRecordsPayload>("/api/follow-ups"),
          loadJson<CompanyProfilesPayload>("/api/company-profiles"),
        ]);

        if (!active) {
          return;
        }

        setData({
          salesIntelData,
          followUpRecords: Array.isArray(followUpPayload.items) ? followUpPayload.items : [],
          companyProfiles: Array.isArray(profilePayload.items) ? profilePayload.items : [],
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : t("company_detail.load_failed"));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [t]);

  const entries = useMemo(
    () =>
      mergeCompanyEntries(
        data.salesIntelData,
        data.followUpRecords,
        t("follow_ups.record_only_summary")
      ),
    [data.followUpRecords, data.salesIntelData, t]
  );
  const activeEntry = entries.find((entry) => entry.id === companyId) ?? null;
  const profile = data.companyProfiles.find((item) => item.companyId === companyId);
  const followUpRecord = data.followUpRecords.find((item) => item.companyId === companyId);
  const jobs = collectCompanyJobs(activeEntry);
  const sourcePlatforms = activeEntry ? uniqueStrings(activeEntry.sourcePlatforms) : [];

  if (isLoading) {
    return (
      <Card>
        <div className="flex min-h-[24rem] items-center justify-center">
          <Spin tip={t("company_detail.loading")} />
        </div>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <Empty description={loadError} />
      </Card>
    );
  }

  if (!activeEntry) {
    return (
      <Card>
        <Empty description={t("company_detail.not_found")} />
        <div className="mt-4 text-center">
          <Link href="/companies">
            <Button icon={<ArrowLeftOutlined />}>{t("company_detail.back")}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <Space wrap size={[8, 8]}>
              {activeEntry.city ? <Tag>{activeEntry.city}</Tag> : null}
              {activeEntry.strongest ? (
                <Tag color={activeEntry.strongest === "高" ? "red" : "blue"}>
                  {t("companies.strongest_signal", { value: activeEntry.strongest })}
                </Tag>
              ) : null}
              <Tag icon={<ClockCircleOutlined />}>
                {formatDisplayUpdatedAt(activeEntry.latestRetrievedAt) ||
                  t("sales_intel.not_synced")}
              </Tag>
            </Space>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {activeEntry.companyName}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {activeEntry.latestSummary || t("company_detail.summary_empty")}
            </Typography.Paragraph>
          </div>
          <Link href={`/companies?company=${encodeURIComponent(companyId)}`}>
            <Button icon={<ArrowLeftOutlined />}>{t("company_detail.back")}</Button>
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Space size={12}>
            <FileSearchOutlined className="text-lg text-(--color-accent)" />
            <Statistic
              title={t("company_detail.metrics.signals")}
              value={activeEntry.signalCount}
            />
          </Space>
        </Card>
        <Card>
          <Space size={12}>
            <ProfileOutlined className="text-lg text-(--color-accent)" />
            <Statistic title={t("company_detail.metrics.jobs")} value={jobs.length} />
          </Space>
        </Card>
        <Card>
          <Space size={12}>
            <BankOutlined className="text-lg text-(--color-accent)" />
            <Statistic
              title={t("company_detail.metrics.platforms")}
              value={sourcePlatforms.length}
            />
          </Space>
        </Card>
      </div>

      <Card title={t("company_detail.profile_title")}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ProfileField
            label={t("companies.profile.fields.industry")}
            value={profile?.industry || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.scale")}
            value={profile?.scale || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.level")}
            value={profile?.level || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.status")}
            value={profile?.status || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.website")}
            value={profile?.website || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.address")}
            value={profile?.address || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.contact")}
            value={profile?.contactName || t("companies.profile.master_empty")}
          />
          <ProfileField
            label={t("companies.profile.fields.contact_method")}
            value={profile?.contactMethod || t("companies.profile.master_empty")}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {profile?.tags?.length ? (
            profile.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
          ) : (
            <Tag>{t("companies.profile.master_empty")}</Tag>
          )}
        </div>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {profile?.note || t("companies.profile.master_note_empty")}
        </Typography.Paragraph>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t("company_detail.signals_title")}>
          <SignalList items={activeEntry.items} />
        </Card>
        <Card title={t("company_detail.jobs_title")}>
          <JobList jobs={jobs} />
        </Card>
      </div>

      <Card title={t("company_detail.follow_title")}>
        <FollowUpTimeline record={followUpRecord} />
      </Card>
    </div>
  );
}

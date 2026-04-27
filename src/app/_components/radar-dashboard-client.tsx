"use client";

import {
  AlertOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  RadarChartOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Progress, Space, Statistic, Tag, Typography } from "antd";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import "./i18n";
import {
  CompanyLibraryPanel,
  buildCompanyLibraryEntries,
  type CompanyLibraryEntry,
  type CompanyProfileRecord,
} from "./company-library-panel";
import { CompetitorCityFilter, type SelectedCity } from "./competitor-city-filter";
import { CompetitorCompanyList } from "./competitor-company-list";
import { CompetitorMapPanel } from "./competitor-map-panel";
import {
  getCompetitorKey,
  type ChinaAdminIndex,
  type CompetitorCompany,
  type CompetitorData,
} from "./competitor-types";
import { LanguageSwitcher } from "./language-switcher";
import { LocationWeatherClock } from "./location-weather-clock";
import { RadarTopNavigation } from "./radar-top-navigation";
import { SalesIntelFeedPanel } from "./sales-intel-feed-panel";
import { SalesIntelTodayPanel } from "./sales-intel-today-panel";
import type { SalesIntelData, SalesIntelItem } from "./sales-intel-types";
import { DashboardLoadingSkeleton } from "./dashboard-loading-skeleton";
import { FollowUpManagementPanel } from "./follow-up-management-panel";
import type { FollowUpRecord, FollowUpRecordsPayload } from "./follow-up-types";

export type DashboardView =
  | "overview"
  | "leads"
  | "companies"
  | "competitors"
  | "follow-ups"
  | "sources";

type ApiHealthPayload = {
  ok: boolean;
  dataDir: string;
  dbPath: string;
  timestamp: string;
  documents: Array<{
    key: string;
    source: string;
    updated_at: string;
  }>;
  tableCounts?: {
    documents?: number;
    followUpRecords?: number;
    followUpEvents?: number;
    companyProfiles?: number;
    competitorMaster?: number;
    competitorSnapshots?: number;
    competitorUpdates?: number;
  };
};

type RecruitmentPlatformCoverage = {
  platform: string;
  status: string;
  querySummary?: string;
  effectiveCompanyCount?: number;
  note?: string;
  updatedAt?: string;
};

type RecruitmentLeadsPayload = {
  updatedAt?: string;
  status?: string;
  note?: string;
  strategy?: {
    selectedPlatforms?: string[];
    primaryPlatforms?: string[];
    fallbackPlatforms?: string[];
    platformLimit?: number;
    leadLimit?: number;
  };
  platformCoverage?: RecruitmentPlatformCoverage[];
};

type CompanyProfilesPayload = {
  items: CompanyProfileRecord[];
  totals?: {
    overall: number;
  };
};

const fallbackAdminIndex: ChinaAdminIndex = {};

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

function createFallbackCompetitorData(t: (key: string) => string): CompetitorData {
  return {
    updatedAt: t("fallback.competitor.updated_at"),
    status: t("fallback.competitor.status"),
    note: t("fallback.competitor.note"),
    baseline: {
      companyName: t("fallback.competitor.baseline_company_name"),
      serviceScopeSummary: t("fallback.competitor.baseline_service_scope_summary"),
      evidence: [],
    },
    competitors: [],
  };
}

function compactText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => compactText(item)).filter(Boolean))];
}

function createDataSources(apiPath: string, staticPath: string) {
  return [apiPath, staticPath];
}

function createRemoteOnlyDataSources(apiPath: string) {
  return [apiPath];
}

function createFallbackRecruitmentLeadsData(): RecruitmentLeadsPayload {
  return {
    updatedAt: "",
    status: "",
    note: "",
    strategy: {
      selectedPlatforms: [],
      primaryPlatforms: ["BOSS直聘", "智联招聘", "小红书"],
      fallbackPlatforms: ["前程无忧", "猎聘", "脉脉"],
    },
    platformCoverage: [],
  };
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }

  return (await response.json()) as T;
}

async function loadJsonWithFallback<T>(urls: string[]): Promise<T> {
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      return await loadJson<T>(url);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Failed to load ${urls.join(", ")}`);
}

function formatDisplayUpdatedAt(value: string) {
  return compactText(value).replace(/\s*CST$/u, "");
}

function parseDisplayDate(value: string) {
  const normalized = value.trim().replace(/\s*CST$/u, "");

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized.includes("T") ? normalized : normalized.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFreshnessStatus(value: string, maxAgeHours = 30) {
  const parsed = parseDisplayDate(value);

  if (!parsed) {
    return "missing" as const;
  }

  const ageHours = (Date.now() - parsed.getTime()) / 1000 / 60 / 60;
  return ageHours > maxAgeHours ? ("stale" as const) : ("normal" as const);
}

function getSalesStrengthScore(value: string) {
  if (value.includes("高")) {
    return 3;
  }

  if (value.includes("中")) {
    return 2;
  }

  if (value.includes("低")) {
    return 1;
  }

  return 0;
}

function getSalesItemTime(item: SalesIntelItem) {
  return item.retrievedAt || item.publishedAt || "";
}

function getSalesItemEntity(item: SalesIntelItem) {
  return item.entity || item.title;
}

function getMappableCompetitorCount(companies: CompetitorCompany[]) {
  return companies.filter(
    (company) =>
      Number.isFinite(Number(company.latitude)) && Number.isFinite(Number(company.longitude))
  ).length;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card>
      <Statistic title={label} value={value} />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {detail}
      </Typography.Paragraph>
    </Card>
  );
}

function OverviewPriorityPanel({
  items,
  updatedAt,
  searchItems,
}: {
  items: SalesIntelItem[];
  updatedAt: string;
  searchItems: string[];
}) {
  const { t } = useTranslation();
  const priorityItems = [...items]
    .sort((left, right) => {
      const strengthOrder =
        getSalesStrengthScore(right.strength) - getSalesStrengthScore(left.strength);

      if (strengthOrder !== 0) {
        return strengthOrder;
      }

      return getSalesItemTime(right).localeCompare(getSalesItemTime(left));
    })
    .slice(0, 4);
  const primaryItem = priorityItems[0] ?? null;
  const secondaryItems = priorityItems.slice(1);

  return (
    <Card
      className="h-full overflow-hidden"
      title={t("overview.priority.title")}
      extra={
        <Link href="/leads">
          <Button type="link">{t("overview.open_leads")}</Button>
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {updatedAt ? (
            <Tag color="green">
              {t("overview.priority.updated_at", { value: formatDisplayUpdatedAt(updatedAt) })}
            </Tag>
          ) : null}
          {searchItems.length ? (
            <Tag>{t("overview.priority.search_items", { value: searchItems.join("、") })}</Tag>
          ) : null}
        </div>

        {primaryItem ? (
          <div className="rounded-[1.5rem] border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,250,241,0.95),rgba(243,233,217,0.86))] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="orange">{t("overview.priority.rank", { value: 1 })}</Tag>
              {primaryItem.category ? <Tag>{primaryItem.category}</Tag> : null}
              {primaryItem.sourceLabel ? <Tag>{primaryItem.sourceLabel}</Tag> : null}
              {primaryItem.strength ? (
                <Tag color="red">{t("sales_intel.strength", { value: primaryItem.strength })}</Tag>
              ) : null}
            </div>
            <Typography.Title level={3} style={{ marginTop: 14, marginBottom: 8 }}>
              {getSalesItemEntity(primaryItem)}
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {primaryItem.summary}
            </Typography.Paragraph>
            <div className="mt-4 flex flex-wrap gap-2">
              {(primaryItem.tags ?? []).slice(0, 6).map((tag) => (
                <Tag key={`${primaryItem.id}-${tag}`}>{tag}</Tag>
              ))}
            </div>
          </div>
        ) : (
          <Empty description={t("overview.priority.empty")} />
        )}

        {secondaryItems.length ? (
          <div className="grid gap-3">
            {secondaryItems.map((item, index) => (
              <div
                key={item.id}
                className="rounded-[1.1rem] border border-(--color-line) bg-white/65 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <Typography.Text strong>{getSalesItemEntity(item)}</Typography.Text>
                    <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                      {item.summary}
                    </Typography.Paragraph>
                  </div>
                  <Tag className="shrink-0">
                    {t("overview.priority.rank", { value: index + 2 })}
                  </Tag>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function OverviewLeadPreview({ items }: { items: SalesIntelItem[] }) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("overview.preview_title")}
      extra={
        <Link href="/leads">
          <Button type="link">{t("overview.open_leads")}</Button>
        </Link>
      }
    >
      {items.length ? (
        <div className="divide-y divide-(--color-line)">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="py-4 first:pt-0 last:pb-0">
              <Space orientation="vertical" size={4} style={{ display: "flex" }}>
                <Space wrap size={[8, 8]}>
                  <Tag color="orange">{item.category}</Tag>
                  {item.sourceLabel ? <Tag>{item.sourceLabel}</Tag> : null}
                </Space>
                <Typography.Text strong>{item.title}</Typography.Text>
                <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {item.summary}
                </Typography.Paragraph>
              </Space>
            </div>
          ))}
        </div>
      ) : (
        <Empty description={t("sales_intel.no_data")} />
      )}
    </Card>
  );
}

function OverviewAttentionPanel({
  salesIntelData,
  competitorData,
}: {
  salesIntelData: SalesIntelData;
  competitorData: CompetitorData;
}) {
  const { t } = useTranslation();
  const reportSource = salesIntelData.sourceBreakdown.find((item) => item.kind === "report");
  const mappedCompetitorCount = getMappableCompetitorCount(competitorData.competitors);
  const attentionItems = [
    salesIntelData.totals.todayHighlights === 0
      ? {
          title: t("overview.attention.no_today"),
          detail: t("overview.attention.no_today_detail"),
          color: "orange",
        }
      : null,
    salesIntelData.totals.overall === 0
      ? {
          title: t("overview.attention.no_sales"),
          detail: t("overview.attention.no_sales_detail"),
          color: "red",
        }
      : null,
    reportSource && reportSource.count === 0
      ? {
          title: t("overview.attention.report_zero"),
          detail: t("overview.attention.report_zero_detail"),
          color: "orange",
        }
      : null,
    competitorData.competitors.length === 0
      ? {
          title: t("overview.attention.no_competitor"),
          detail: t("overview.attention.no_competitor_detail"),
          color: "red",
        }
      : null,
    competitorData.competitors.length > 0 &&
    mappedCompetitorCount < competitorData.competitors.length
      ? {
          title: t("overview.attention.low_geocode"),
          detail: t("overview.attention.low_geocode_detail", {
            mapped: mappedCompetitorCount,
            total: competitorData.competitors.length,
          }),
          color: "gold",
        }
      : null,
  ].filter((item): item is { title: string; detail: string; color: string } => Boolean(item));

  return (
    <Card title={t("overview.attention.title")} className="h-full">
      {attentionItems.length ? (
        <div className="grid gap-3">
          {attentionItems.map((item) => (
            <div
              key={item.title}
              className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <AlertOutlined className="text-(--color-accent)" />
                <Typography.Text strong>{item.title}</Typography.Text>
                <Tag color={item.color}>{t("overview.attention.tag")}</Tag>
              </div>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                {item.detail}
              </Typography.Paragraph>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-4">
          <Space size={8}>
            <CheckCircleOutlined className="text-(--color-accent)" />
            <Typography.Text strong>{t("overview.attention.normal_title")}</Typography.Text>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {t("overview.attention.normal_detail")}
          </Typography.Paragraph>
        </div>
      )}
    </Card>
  );
}

function OverviewActionCard({
  icon,
  title,
  value,
  description,
  href,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  value: string | number;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <Card className="h-full overflow-hidden">
      <div className="flex h-full flex-col justify-between gap-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-(--color-card-soft) text-lg text-(--color-accent)">
              {icon}
            </span>
            <Typography.Text className="text-3xl font-semibold text-(--color-ink)">
              {value}
            </Typography.Text>
          </div>
          <div className="space-y-2">
            <Typography.Title level={5} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {description}
            </Typography.Paragraph>
          </div>
        </div>

        <Link href={href}>
          <Button type="link" style={{ paddingInline: 0 }}>
            {actionLabel} <ArrowRightOutlined />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function OverviewStatusPanel({
  salesIntelData,
  competitorData,
}: {
  salesIntelData: SalesIntelData;
  competitorData: CompetitorData;
}) {
  const { t } = useTranslation();
  const reportSource = salesIntelData.sourceBreakdown.find((item) => item.kind === "report");
  const recruitmentSource = salesIntelData.sourceBreakdown.find(
    (item) => item.kind === "recruitment"
  );
  const statusItems = [
    {
      title: t("overview.status.report"),
      updatedAt: reportSource?.updatedAt ?? "",
      detail: reportSource
        ? t("sources.cards.report_detail", { count: reportSource.count })
        : t("sales_intel.not_synced"),
    },
    {
      title: t("overview.status.recruitment"),
      updatedAt: recruitmentSource?.updatedAt ?? "",
      detail: recruitmentSource
        ? t("sources.cards.recruitment_detail", { count: recruitmentSource.count })
        : t("sales_intel.not_synced"),
    },
    {
      title: t("overview.status.competitor"),
      updatedAt: competitorData.updatedAt,
      detail: t("sources.cards.competitor_detail", {
        count: competitorData.competitors.length,
      }),
    },
  ];

  return (
    <Card
      title={t("overview.status.title")}
      extra={
        <Link href="/sources">
          <Button type="link">{t("overview.open_sources")}</Button>
        </Link>
      }
    >
      <div className="grid gap-3">
        {statusItems.map((item) => {
          const hasUpdatedAt = Boolean(item.updatedAt);

          return (
            <div
              key={item.title}
              className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Space size={8}>
                  {hasUpdatedAt ? (
                    <CheckCircleOutlined className="text-(--color-accent)" />
                  ) : (
                    <ClockCircleOutlined className="text-(--color-muted)" />
                  )}
                  <Typography.Text strong>{item.title}</Typography.Text>
                </Space>
                <Tag color={hasUpdatedAt ? "green" : "default"}>
                  {hasUpdatedAt ? t("overview.status.synced") : t("overview.status.waiting")}
                </Tag>
              </div>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                {item.updatedAt
                  ? `${formatDisplayUpdatedAt(item.updatedAt)} · ${item.detail}`
                  : item.detail}
              </Typography.Paragraph>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function OverviewCompanySnapshot({ entries }: { entries: CompanyLibraryEntry[] }) {
  const { t } = useTranslation();
  const topEntries = entries.slice(0, 4);

  return (
    <Card
      title={t("overview.company_snapshot.title")}
      extra={
        <Link href="/companies">
          <Button type="link">{t("overview.open_companies")}</Button>
        </Link>
      }
    >
      {topEntries.length ? (
        <div className="divide-y divide-(--color-line)">
          {topEntries.map((entry) => (
            <div key={entry.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <Typography.Text strong>{entry.companyName}</Typography.Text>
                  <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                    {entry.latestSummary}
                  </Typography.Paragraph>
                </div>
                <Tag className="shrink-0">{entry.city || t("companies.unknown_city")}</Tag>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty description={t("companies.empty")} />
      )}
    </Card>
  );
}

function OverviewCompetitorSnapshot({ companies }: { companies: CompetitorCompany[] }) {
  const { t } = useTranslation();
  const topCompanies = companies.slice(0, 4);

  return (
    <Card
      title={t("overview.competitor_snapshot.title")}
      extra={
        <Link href="/competitors">
          <Button type="link">{t("overview.open_competitors")}</Button>
        </Link>
      }
    >
      {topCompanies.length ? (
        <div className="space-y-3">
          {topCompanies.map((company) => (
            <div
              key={getCompetitorKey(company)}
              className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Tag color="orange">#{company.rank}</Tag>
                <Tag>{company.city}</Tag>
                {company.serviceFit ? <Tag>{company.serviceFit}</Tag> : null}
              </div>
              <Typography.Text strong className="mt-2 block">
                {company.companyName}
              </Typography.Text>
              <Typography.Paragraph
                ellipsis={{ rows: 2 }}
                style={{ marginTop: 6, marginBottom: 0 }}
              >
                {company.manufacturingFocus || company.whyRelevant}
              </Typography.Paragraph>
            </div>
          ))}
        </div>
      ) : (
        <Empty description={t("deck.empty_filtered")} />
      )}
    </Card>
  );
}

function OverviewCommandCenter({
  salesIntelData,
  competitorData,
  companyEntries,
  visibleCompetitors,
}: {
  salesIntelData: SalesIntelData;
  competitorData: CompetitorData;
  companyEntries: CompanyLibraryEntry[];
  visibleCompetitors: CompetitorCompany[];
}) {
  const { t } = useTranslation();
  const quickCards = [
    {
      icon: <RadarChartOutlined />,
      title: t("overview.quick.leads_title"),
      value: salesIntelData.totals.todayHighlights,
      description: t("overview.quick.leads_description"),
      href: "/leads",
      actionLabel: t("overview.open_leads"),
    },
    {
      icon: <ApartmentOutlined />,
      title: t("overview.quick.companies_title"),
      value: companyEntries.length,
      description: t("overview.quick.companies_description"),
      href: "/companies",
      actionLabel: t("overview.open_companies"),
    },
    {
      icon: <TeamOutlined />,
      title: t("overview.quick.competitors_title"),
      value: visibleCompetitors.length,
      description: t("overview.quick.competitors_description"),
      href: "/competitors",
      actionLabel: t("overview.open_competitors"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
        <OverviewPriorityPanel
          items={salesIntelData.todayHighlights}
          updatedAt={salesIntelData.updatedAt}
          searchItems={salesIntelData.todaySearchItems ?? []}
        />
        <OverviewAttentionPanel salesIntelData={salesIntelData} competitorData={competitorData} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <OverviewCompanySnapshot entries={companyEntries} />
        <OverviewStatusPanel salesIntelData={salesIntelData} competitorData={competitorData} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)]">
        <OverviewLeadPreview items={salesIntelData.feed} />
        <OverviewCompetitorSnapshot companies={visibleCompetitors} />
      </div>

      <Card title={t("overview.quick.title")}>
        <div className="grid gap-3 md:grid-cols-3">
          {quickCards.map((item) => (
            <OverviewActionCard key={item.href} {...item} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function SourcesPanel({
  salesIntelData,
  competitorData,
  followUpRecords,
  companyProfiles,
  recruitmentLeadsData,
  apiHealth,
}: {
  salesIntelData: SalesIntelData;
  competitorData: CompetitorData;
  followUpRecords: FollowUpRecord[];
  companyProfiles: CompanyProfileRecord[];
  recruitmentLeadsData: RecruitmentLeadsPayload;
  apiHealth: ApiHealthPayload | null;
}) {
  const { t } = useTranslation();
  const reportSource = salesIntelData.sourceBreakdown.find((item) => item.kind === "report");
  const recruitmentSource = salesIntelData.sourceBreakdown.find(
    (item) => item.kind === "recruitment"
  );
  const healthDocuments = apiHealth?.documents ?? [];
  const tableCounts = apiHealth?.tableCounts ?? {};
  const configuredPlatforms = uniqueStrings([
    ...(recruitmentLeadsData.strategy?.selectedPlatforms ?? []),
    ...(recruitmentLeadsData.strategy?.primaryPlatforms ?? []),
    ...(recruitmentLeadsData.strategy?.fallbackPlatforms ?? []),
    "BOSS直聘",
    "智联招聘",
    "小红书",
    "前程无忧",
  ]);
  const coverageMap = new Map(
    (recruitmentLeadsData.platformCoverage ?? [])
      .filter((item) => item?.platform)
      .map((item) => [item.platform, item])
  );
  const platformItems = configuredPlatforms.map((platform) => ({
    platform,
    ...(coverageMap.get(platform) ?? {}),
  }));
  const sourceItems = [
    {
      key: "report",
      title: t("sources.cards.report_title"),
      updatedAt: reportSource?.updatedAt ?? "",
      count: reportSource?.count ?? 0,
      detail: t("sources.cards.report_detail", { count: reportSource?.count ?? 0 }),
      apiPath: "/api/sales/intel",
      documentKey: "salesIntel",
    },
    {
      key: "recruitment",
      title: t("sources.cards.recruitment_title"),
      updatedAt: recruitmentSource?.updatedAt ?? "",
      count: recruitmentSource?.count ?? 0,
      detail: t("sources.cards.recruitment_detail", { count: recruitmentSource?.count ?? 0 }),
      apiPath: "/api/sales/intel",
      documentKey: "salesIntel",
    },
    {
      key: "competitor",
      title: t("sources.cards.competitor_title"),
      updatedAt: competitorData.updatedAt,
      count: competitorData.competitors.length,
      detail: t("sources.cards.competitor_detail", { count: competitorData.competitors.length }),
      apiPath: "/api/competitors",
      documentKey: "competitors",
    },
    {
      key: "followUp",
      title: t("sources.cards.follow_up_title"),
      updatedAt: followUpRecords[0]?.updatedAt ?? "",
      count: followUpRecords.length,
      detail: t("sources.cards.follow_up_detail", {
        count: followUpRecords.length,
      }),
      apiPath: "/api/follow-ups",
      documentKey: "follow_up_records",
    },
    {
      key: "search",
      title: t("sources.cards.search_title"),
      updatedAt: salesIntelData.updatedAt,
      count: salesIntelData.todaySearchItems?.length ?? 0,
      detail: salesIntelData.todaySearchItems?.length
        ? t("sources.cards.search_detail", {
            value: salesIntelData.todaySearchItems.join("、"),
          })
        : t("sources.cards.search_empty"),
      apiPath: "/api/sales/intel",
      documentKey: "salesIntel",
    },
  ];
  const normalCount = sourceItems.filter(
    (item) => getFreshnessStatus(item.updatedAt) === "normal"
  ).length;
  const sourceHealthPercent = sourceItems.length
    ? Math.round((normalCount / sourceItems.length) * 100)
    : 0;
  const databaseCounters = [
    {
      label: t("sources.tables.documents"),
      value: tableCounts.documents ?? healthDocuments.length,
    },
    {
      label: t("sources.tables.follow_up_records"),
      value: tableCounts.followUpRecords ?? followUpRecords.length,
    },
    {
      label: t("sources.tables.follow_up_events"),
      value: tableCounts.followUpEvents ?? 0,
    },
    {
      label: t("sources.tables.company_profiles"),
      value: tableCounts.companyProfiles ?? companyProfiles.length,
    },
    {
      label: t("sources.tables.competitor_master"),
      value: tableCounts.competitorMaster ?? competitorData.competitors.length,
    },
    {
      label: t("sources.tables.competitor_snapshots"),
      value: tableCounts.competitorSnapshots ?? 0,
    },
    {
      label: t("sources.tables.competitor_updates"),
      value: tableCounts.competitorUpdates ?? 0,
    },
  ];

  function renderFreshnessTag(value: string) {
    const status = getFreshnessStatus(value);

    if (status === "normal") {
      return <Tag color="green">{t("sources.status.normal")}</Tag>;
    }

    if (status === "stale") {
      return <Tag color="gold">{t("sources.status.stale")}</Tag>;
    }

    return <Tag>{t("sources.status.missing")}</Tag>;
  }

  function renderPlatformStatusTag(status: string) {
    const normalized = status.toLowerCase();

    if (["ok", "success", "completed"].includes(normalized)) {
      return <Tag color="green">{t("sources.platforms.status_ok")}</Tag>;
    }

    if (["failed", "error"].includes(normalized)) {
      return <Tag color="red">{t("sources.platforms.status_failed")}</Tag>;
    }

    if (["skipped", "disabled"].includes(normalized)) {
      return <Tag color="gold">{t("sources.platforms.status_skipped")}</Tag>;
    }

    return <Tag>{t("sources.platforms.status_waiting")}</Tag>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
        <Card title={t("sources.title")}>
          <Typography.Paragraph type="secondary">{t("sources.description")}</Typography.Paragraph>
          <div className="grid gap-3">
            {sourceItems.map((item) => (
              <div
                key={item.key}
                className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Typography.Text strong>{item.title}</Typography.Text>
                      {renderFreshnessTag(item.updatedAt)}
                    </div>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                      {item.detail}
                    </Typography.Paragraph>
                  </div>
                  <Statistic
                    title={t("sources.status.count")}
                    value={item.count}
                    className="shrink-0 text-right"
                  />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <Typography.Text type="secondary">
                    {t("sources.status.updated_at", {
                      value: item.updatedAt
                        ? formatDisplayUpdatedAt(item.updatedAt)
                        : t("sales_intel.not_synced"),
                    })}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {t("sources.status.api_path", { value: item.apiPath })}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {t("sources.status.document_key", { value: item.documentKey })}
                  </Typography.Text>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t("sources.health.summary_title")}>
          <Statistic
            title={t("sources.health.source_health")}
            value={sourceHealthPercent}
            suffix="%"
          />
          <Progress percent={sourceHealthPercent} showInfo={false} style={{ marginTop: 12 }} />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {t("sources.health.source_health_detail", {
              normal: normalCount,
              total: sourceItems.length,
            })}
          </Typography.Paragraph>
          <div className="mt-5 grid gap-3">
            <MetricCard
              label={t("sources.health.api_status")}
              value={apiHealth?.ok ? t("sources.health.online") : t("sources.health.unknown")}
              detail={
                apiHealth?.ok ? t("sources.health.api_ok") : t("sources.health.api_unknown")
              }
            />
            <MetricCard
              label={t("sources.health.server_time")}
              value={apiHealth?.timestamp ? formatDisplayUpdatedAt(apiHealth.timestamp) : "-"}
              detail={t("sources.health.server_time_detail")}
            />
          </div>
        </Card>
      </div>

      <Card
        title={t("sources.platforms.title")}
        extra={
          <Typography.Text type="secondary">
            {recruitmentLeadsData.updatedAt
              ? t("sources.platforms.updated_at", {
                  value: formatDisplayUpdatedAt(recruitmentLeadsData.updatedAt),
                })
              : t("sales_intel.not_synced")}
          </Typography.Text>
        }
      >
        <Typography.Paragraph type="secondary">
          {recruitmentLeadsData.status || t("sources.platforms.description")}
        </Typography.Paragraph>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          {platformItems.map((item) => (
            <div
              key={item.platform}
              className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Typography.Text strong>{item.platform}</Typography.Text>
                {renderPlatformStatusTag(item.status || "")}
              </div>
              <div className="mt-3 grid gap-2">
                <Typography.Text type="secondary">
                  {t("sources.platforms.effective_count", {
                    count: item.effectiveCompanyCount ?? 0,
                  })}
                </Typography.Text>
                <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {item.querySummary || t("sources.platforms.no_query")}
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {item.note || t("sources.platforms.no_note")}
                </Typography.Paragraph>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("sources.health.title")}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {databaseCounters.map((item) => (
            <MetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              detail={t("sources.tables.counter_detail")}
            />
          ))}
        </div>

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Typography.Text strong>{t("sources.health.documents_title")}</Typography.Text>
            <Tag>{t("sources.health.document_count_value", { count: healthDocuments.length })}</Tag>
          </div>
          <div className="divide-y divide-(--color-line) rounded-[1.2rem] border border-(--color-line) bg-white/60">
            {healthDocuments.length ? (
              healthDocuments.map((item) => (
                <div
                  key={`${item.key}-${item.source}`}
                  className="grid gap-2 px-4 py-3 first:pt-4 last:pb-4 md:grid-cols-[minmax(0,0.5fr)_minmax(0,0.65fr)_minmax(0,1fr)_auto]"
                >
                  <Typography.Text strong>{item.key}</Typography.Text>
                  <Typography.Text type="secondary">{item.source}</Typography.Text>
                  <Typography.Text type="secondary">
                    {formatDisplayUpdatedAt(item.updated_at)}
                  </Typography.Text>
                  {renderFreshnessTag(item.updated_at)}
                </div>
              ))
            ) : (
              <div className="p-6">
                <Empty description={t("sources.health.empty_documents")} />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) p-4">
          <Typography.Text strong>{t("sources.health.storage_title")}</Typography.Text>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Typography.Text type="secondary">
              {t("sources.health.data_dir", { value: apiHealth?.dataDir ?? "-" })}
            </Typography.Text>
            <Typography.Text type="secondary">
              {t("sources.health.db_path", { value: apiHealth?.dbPath ?? "-" })}
            </Typography.Text>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function RadarDashboardClient({ view }: { view: DashboardView }) {
  const { t } = useTranslation();
  const fallbackSalesIntelData = useMemo(() => createFallbackSalesIntelData(), []);
  const fallbackCompetitorData = useMemo(() => createFallbackCompetitorData(t), [t]);
  const fallbackRecruitmentLeadsData = useMemo(() => createFallbackRecruitmentLeadsData(), []);
  const [salesIntelData, setSalesIntelData] = useState<SalesIntelData>(fallbackSalesIntelData);
  const [competitorData, setCompetitorData] = useState<CompetitorData>(fallbackCompetitorData);
  const [recruitmentLeadsData, setRecruitmentLeadsData] = useState<RecruitmentLeadsPayload>(
    fallbackRecruitmentLeadsData
  );
  const [adminIndex, setAdminIndex] = useState<ChinaAdminIndex>(fallbackAdminIndex);
  const [followUpRecords, setFollowUpRecords] = useState<FollowUpRecord[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfileRecord[]>([]);
  const [apiHealth, setApiHealth] = useState<ApiHealthPayload | null>(null);
  const [selectedMapCompetitorKey, setSelectedMapCompetitorKey] = useState<string | null>(null);
  const [expandedCompetitorKey, setExpandedCompetitorKey] = useState<string | null>(null);
  const [priorityCompetitorKey, setPriorityCompetitorKey] = useState<string | null>(null);
  const [priorityCompetitorSignal, setPriorityCompetitorSignal] = useState(0);
  const [selectedCities, setSelectedCities] = useState<SelectedCity[]>([]);
  const [isCityFilterOpen, setIsCityFilterOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsInitialLoading(true);

        const [
          salesResult,
          competitorResult,
          adminIndexResult,
          followUpResult,
          companyProfilesResult,
          recruitmentLeadsResult,
          healthResult,
        ] = await Promise.allSettled([
            loadJsonWithFallback<SalesIntelData>(createRemoteOnlyDataSources("/api/sales/intel")),
            loadJsonWithFallback<CompetitorData>(
              createDataSources("/api/competitors", "/competitors.json")
          ),
          loadJsonWithFallback<ChinaAdminIndex>(
            createDataSources("/api/admin/divisions", "/china-admin-divisions.json")
          ),
            loadJsonWithFallback<FollowUpRecordsPayload>(
              createRemoteOnlyDataSources("/api/follow-ups")
            ),
            loadJsonWithFallback<CompanyProfilesPayload>(
              createRemoteOnlyDataSources("/api/company-profiles")
            ),
            view === "sources"
              ? loadJsonWithFallback<RecruitmentLeadsPayload>(
                  createRemoteOnlyDataSources("/api/recruitment/leads")
                )
              : Promise.resolve(fallbackRecruitmentLeadsData),
            view === "sources"
              ? loadJsonWithFallback<ApiHealthPayload>(createRemoteOnlyDataSources("/api/health"))
              : Promise.resolve(null),
        ]);

      if (!active) {
        return;
      }

      setSalesIntelData(
        salesResult.status === "fulfilled" ? salesResult.value : fallbackSalesIntelData
      );
      setCompetitorData(
        competitorResult.status === "fulfilled" ? competitorResult.value : fallbackCompetitorData
      );
      setAdminIndex(
        adminIndexResult.status === "fulfilled" ? adminIndexResult.value : fallbackAdminIndex
      );
        setFollowUpRecords(
          followUpResult.status === "fulfilled" && Array.isArray(followUpResult.value.items)
            ? followUpResult.value.items
            : []
        );
        setCompanyProfiles(
          companyProfilesResult.status === "fulfilled" &&
            Array.isArray(companyProfilesResult.value.items)
            ? companyProfilesResult.value.items
            : []
        );
        setRecruitmentLeadsData(
          recruitmentLeadsResult.status === "fulfilled"
            ? recruitmentLeadsResult.value
            : fallbackRecruitmentLeadsData
        );
        setApiHealth(healthResult.status === "fulfilled" ? (healthResult.value ?? null) : null);
      setIsInitialLoading(false);
    }

    loadData().catch(() => {
      if (!active) {
        return;
      }

      setSalesIntelData(fallbackSalesIntelData);
      setCompetitorData(fallbackCompetitorData);
        setAdminIndex(fallbackAdminIndex);
        setFollowUpRecords([]);
        setCompanyProfiles([]);
        setRecruitmentLeadsData(fallbackRecruitmentLeadsData);
        setApiHealth(null);
      setIsInitialLoading(false);
    });

    return () => {
      active = false;
    };
  }, [fallbackCompetitorData, fallbackRecruitmentLeadsData, fallbackSalesIntelData, view]);

  const visibleCompetitors = useMemo(() => {
    if (!selectedCities.length) {
      return competitorData.competitors;
    }

    return competitorData.competitors.filter((company) =>
      selectedCities.some((item) => item.cityName === company.city)
    );
  }, [competitorData.competitors, selectedCities]);
  const visibleCompetitorKeys = useMemo(
    () => new Set(visibleCompetitors.map((company) => getCompetitorKey(company))),
    [visibleCompetitors]
  );
  const activeSelectedMapCompetitorKey =
    selectedMapCompetitorKey && visibleCompetitorKeys.has(selectedMapCompetitorKey)
      ? selectedMapCompetitorKey
      : null;
  const activeExpandedCompetitorKey =
    expandedCompetitorKey && visibleCompetitorKeys.has(expandedCompetitorKey)
      ? expandedCompetitorKey
      : null;
  const activePriorityCompetitorKey =
    priorityCompetitorKey && visibleCompetitorKeys.has(priorityCompetitorKey)
      ? priorityCompetitorKey
      : null;
  const competitorStatus = useMemo(() => {
    if (selectedCities.length) {
      return t("city_filter.filtered_status", { count: visibleCompetitors.length });
    }

    return t("city_filter.synced_status", { count: competitorData.competitors.length });
  }, [competitorData.competitors.length, selectedCities.length, t, visibleCompetitors.length]);
  const competitorNote = useMemo(() => {
    if (selectedCities.length) {
      return t("city_filter.filtered_note");
    }

    return t("city_filter.default_note");
  }, [selectedCities.length, t]);
  const companyEntries = useMemo(
    () => buildCompanyLibraryEntries(salesIntelData.feed),
    [salesIntelData.feed]
  );
  const followUpCompanyEntries = useMemo<CompanyLibraryEntry[]>(() => {
    const existingCompanyIds = new Set(companyEntries.map((entry) => entry.id));
    const recordOnlyEntries = followUpRecords
      .filter((record) => !existingCompanyIds.has(record.companyId))
      .map((record) => ({
        id: record.companyId,
        companyName: record.companyName || record.companyId.split("::")[0] || record.companyId,
        city: record.city,
        latestRetrievedAt: record.lastFollowedAt || record.nextReminderAt || record.updatedAt,
        latestSummary: record.nextAction || record.note || t("follow_ups.record_only_summary"),
        sourcePlatforms: [],
        signalCount: 0,
        allJobsCount: 0,
        strongest: "",
        items: [],
      }));

    return [...companyEntries, ...recordOnlyEntries];
  }, [companyEntries, followUpRecords, t]);
  const heroMetrics = useMemo(
    () => [
      {
        label: t("metrics.sales_total"),
        value: salesIntelData.totals.overall,
        detail: t("metrics.sales_total_detail"),
      },
      {
        label: t("metrics.today_highlights"),
        value: salesIntelData.totals.todayHighlights,
        detail: t("metrics.today_highlights_detail"),
      },
      {
        label: t("metrics.report_items"),
        value: salesIntelData.totals.reportItems,
        detail: t("metrics.report_items_detail"),
      },
      {
        label: t("metrics.competitors"),
        value: visibleCompetitors.length,
        detail: t("metrics.competitors_detail"),
      },
    ],
    [
      salesIntelData.totals.overall,
      salesIntelData.totals.reportItems,
      salesIntelData.totals.todayHighlights,
      t,
      visibleCompetitors.length,
    ]
  );
  const viewConfig = {
    overview: {
      icon: <RadarChartOutlined />,
      eyebrow: t("views.overview.eyebrow"),
      title: t("views.overview.title"),
      description: t("views.overview.description"),
      note: t("views.overview.note"),
    },
    leads: {
      icon: <AlertOutlined />,
      eyebrow: t("views.leads.eyebrow"),
      title: t("views.leads.title"),
      description: t("views.leads.description"),
      note: t("views.leads.note"),
    },
    companies: {
      icon: <ApartmentOutlined />,
      eyebrow: t("views.companies.eyebrow"),
      title: t("views.companies.title"),
      description: t("views.companies.description"),
      note: t("views.companies.note"),
    },
    competitors: {
      icon: <RadarChartOutlined />,
      eyebrow: t("views.competitors.eyebrow"),
      title: t("views.competitors.title"),
      description: t("views.competitors.description"),
      note: t("views.competitors.note"),
    },
    "follow-ups": {
      icon: <AlertOutlined />,
      eyebrow: t("views.follow_ups.eyebrow"),
      title: t("views.follow_ups.title"),
      description: t("views.follow_ups.description"),
      note: t("views.follow_ups.note"),
    },
    sources: {
      icon: <DatabaseOutlined />,
      eyebrow: t("views.sources.eyebrow"),
      title: t("views.sources.title"),
      description: t("views.sources.description"),
      note: t("views.sources.note"),
    },
  }[view];

  if (isInitialLoading) {
    return <DashboardLoadingSkeleton view={view} />;
  }

  function renderContent() {
    switch (view) {
      case "overview":
        return (
          <OverviewCommandCenter
            salesIntelData={salesIntelData}
            competitorData={competitorData}
            companyEntries={companyEntries}
            visibleCompetitors={visibleCompetitors}
          />
        );
      case "leads":
        return (
          <>
            <SalesIntelFeedPanel data={salesIntelData} />
            <SalesIntelTodayPanel
              items={salesIntelData.todayHighlights}
              updatedAt={salesIntelData.updatedAt}
              searchItems={salesIntelData.todaySearchItems}
            />
          </>
        );
      case "companies":
        return (
          <CompanyLibraryPanel
            entries={followUpCompanyEntries}
            records={followUpRecords}
            profiles={companyProfiles}
          />
        );
      case "competitors":
        return (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="space-y-6">
              <CompetitorCompanyList
                companies={visibleCompetitors}
                priorityKey={activePriorityCompetitorKey}
                prioritySignal={priorityCompetitorSignal}
                selectedKey={activeExpandedCompetitorKey}
                selectedCities={selectedCities}
                pauseAutoScroll={isCityFilterOpen}
                onSelect={(key) => {
                  setExpandedCompetitorKey(key);
                  setPriorityCompetitorKey(null);
                  setPriorityCompetitorSignal(0);
                }}
              />
            </div>
            <div className="grid gap-4">
              <CompetitorCityFilter
                adminIndex={adminIndex}
                selectedCities={selectedCities}
                onChangeCities={setSelectedCities}
                onRemoveCity={(key) => {
                  setSelectedCities((current) => current.filter((item) => item.key !== key));
                }}
                onOpenChange={setIsCityFilterOpen}
              />
              <CompetitorMapPanel
                baseline={competitorData.baseline}
                adminIndex={adminIndex}
                companies={visibleCompetitors}
                status={competitorStatus}
                note={competitorNote}
                updatedAt={competitorData.updatedAt}
                selectedKey={activeSelectedMapCompetitorKey}
                onSelect={(key) => {
                  setSelectedMapCompetitorKey(key);
                  setExpandedCompetitorKey(key);
                  setPriorityCompetitorKey(key);
                  setPriorityCompetitorSignal((value) => value + 1);
                }}
              />
            </div>
          </div>
        );
      case "follow-ups":
        return (
          <FollowUpManagementPanel
            entries={followUpCompanyEntries}
            records={followUpRecords}
            onSaveRecord={(record) => {
              setFollowUpRecords((current) => {
                const exists = current.some((item) => item.companyId === record.companyId);

                if (!exists) {
                  return [record, ...current];
                }

                return current.map((item) => (item.companyId === record.companyId ? record : item));
              });
            }}
          />
        );
      case "sources":
        return (
            <SourcesPanel
              salesIntelData={salesIntelData}
              competitorData={competitorData}
              followUpRecords={followUpRecords}
              companyProfiles={companyProfiles}
              recruitmentLeadsData={recruitmentLeadsData}
              apiHealth={apiHealth}
            />
        );
      default:
        return (
          <Card>
            <Empty />
          </Card>
        );
    }
  }

  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-ink)">
      <div className="absolute inset-x-0 top-0 -z-10 h-136 bg-[radial-gradient(circle_at_top_left,rgba(182,107,58,0.24),transparent_48%),radial-gradient(circle_at_75%_18%,rgba(53,97,108,0.18),transparent_42%)]" />

      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        <section className="overflow-visible rounded-4xl border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,251,244,0.92),rgba(245,235,221,0.92))] p-6 shadow-[0_25px_70px_rgba(69,49,28,0.12)] sm:p-8 lg:p-10">
          <div className="space-y-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
              <div className="min-w-0 space-y-4">
                <Space align="center" size={10}>
                  <span className="text-(--color-accent)">{viewConfig.icon}</span>
                  <Typography.Text
                    className="tracking-[0.28em] uppercase"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {viewConfig.eyebrow}
                  </Typography.Text>
                </Space>
                <div className="space-y-2">
                  <Typography.Title level={1} style={{ marginBottom: 0 }}>
                    {viewConfig.title}
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 900 }}>
                    {viewConfig.description}
                  </Typography.Paragraph>
                </div>
                <RadarTopNavigation />
              </div>

              <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[27rem] xl:grid-cols-1">
                <LocationWeatherClock />
                <LanguageSwitcher />
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.06fr)_minmax(18rem,0.94fr)]">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {heroMetrics.map((item) => (
                  <MetricCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    detail={item.detail}
                  />
                ))}
              </div>
              <Card title={t("views.note_title")}>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {viewConfig.note}
                </Typography.Paragraph>
              </Card>
            </div>
          </div>
        </section>

        {renderContent()}
      </div>
    </main>
  );
}

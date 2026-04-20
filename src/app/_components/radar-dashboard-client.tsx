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
import { Button, Card, Empty, Space, Statistic, Tag, Typography } from "antd";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import "./i18n";
import {
  CompanyLibraryPanel,
  buildCompanyLibraryEntries,
  type CompanyLibraryEntry,
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

export type DashboardView =
  | "overview"
  | "leads"
  | "companies"
  | "competitors"
  | "follow-ups"
  | "sources";

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

function createDataSources(apiPath: string, staticPath: string) {
  return [apiPath, staticPath];
}

function createRemoteOnlyDataSources(apiPath: string) {
  return [apiPath];
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
  return value.replace(/\s*CST$/u, "");
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Card>
      <Statistic title={label} value={value} />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {detail}
      </Typography.Paragraph>
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(20rem,0.84fr)]">
        <SalesIntelTodayPanel
          items={salesIntelData.todayHighlights}
          updatedAt={salesIntelData.updatedAt}
          searchItems={salesIntelData.todaySearchItems}
        />
        <div className="grid gap-4">
          <OverviewStatusPanel salesIntelData={salesIntelData} competitorData={competitorData} />
          <Card title={t("overview.quick.title")}>
            <div className="grid gap-3">
              {quickCards.map((item) => (
                <OverviewActionCard key={item.href} {...item} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <OverviewLeadPreview items={salesIntelData.feed} />
        <OverviewCompanySnapshot entries={companyEntries} />
      </div>

      <OverviewCompetitorSnapshot companies={visibleCompetitors} />
    </div>
  );
}

function FollowUpPanel({
  items,
}: {
  items: Array<{ title: string; summary: string; meta: string }>;
}) {
  const { t } = useTranslation();

  return (
    <Card title={t("follow_ups.title")}>
      <Typography.Paragraph type="secondary">{t("follow_ups.description")}</Typography.Paragraph>
      {items.length ? (
        <div className="divide-y divide-(--color-line)">
          {items.map((item) => (
            <div key={`${item.title}-${item.meta}`} className="py-4 first:pt-0 last:pb-0">
              <Space orientation="vertical" size={4} style={{ display: "flex" }}>
                <Typography.Text strong>{item.title}</Typography.Text>
                <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {item.summary}
                </Typography.Paragraph>
                <Typography.Text type="secondary">{item.meta}</Typography.Text>
              </Space>
            </div>
          ))}
        </div>
      ) : (
        <Empty description={t("follow_ups.empty_description")} />
      )}
    </Card>
  );
}

function SourcesPanel({
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
  const items = [
    {
      title: t("sources.cards.report_title"),
      detail: reportSource?.updatedAt
        ? `${formatDisplayUpdatedAt(reportSource.updatedAt)} · ${t("sources.cards.report_detail", { count: reportSource.count })}`
        : t("sales_intel.not_synced"),
    },
    {
      title: t("sources.cards.recruitment_title"),
      detail: recruitmentSource?.updatedAt
        ? `${formatDisplayUpdatedAt(recruitmentSource.updatedAt)} · ${t("sources.cards.recruitment_detail", { count: recruitmentSource.count })}`
        : t("sales_intel.not_synced"),
    },
    {
      title: t("sources.cards.competitor_title"),
      detail: competitorData.updatedAt
        ? `${formatDisplayUpdatedAt(competitorData.updatedAt)} · ${t("sources.cards.competitor_detail", { count: competitorData.competitors.length })}`
        : t("sales_intel.not_synced"),
    },
    {
      title: t("sources.cards.search_title"),
      detail: salesIntelData.todaySearchItems?.length
        ? t("sources.cards.search_detail", {
            value: salesIntelData.todaySearchItems.join("、"),
          })
        : t("sources.cards.search_empty"),
    },
  ];

  return (
    <Card title={t("sources.title")}>
      <Typography.Paragraph type="secondary">{t("sources.description")}</Typography.Paragraph>
      <div className="divide-y divide-(--color-line)">
        {items.map((item) => (
          <div key={item.title} className="py-4 first:pt-0 last:pb-0">
            <Space orientation="vertical" size={4} style={{ display: "flex" }}>
              <Typography.Text strong>{item.title}</Typography.Text>
              <Typography.Text type="secondary">{item.detail}</Typography.Text>
            </Space>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RadarDashboardClient({ view }: { view: DashboardView }) {
  const { t } = useTranslation();
  const fallbackSalesIntelData = useMemo(() => createFallbackSalesIntelData(), []);
  const fallbackCompetitorData = useMemo(() => createFallbackCompetitorData(t), [t]);
  const [salesIntelData, setSalesIntelData] = useState<SalesIntelData>(fallbackSalesIntelData);
  const [competitorData, setCompetitorData] = useState<CompetitorData>(fallbackCompetitorData);
  const [adminIndex, setAdminIndex] = useState<ChinaAdminIndex>(fallbackAdminIndex);
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

      const [salesResult, competitorResult, adminIndexResult] = await Promise.allSettled([
        loadJsonWithFallback<SalesIntelData>(createRemoteOnlyDataSources("/api/sales/intel")),
        loadJsonWithFallback<CompetitorData>(
          createDataSources("/api/competitors", "/competitors.json")
        ),
        loadJsonWithFallback<ChinaAdminIndex>(
          createDataSources("/api/admin/divisions", "/china-admin-divisions.json")
        ),
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
      setIsInitialLoading(false);
    }

    loadData().catch(() => {
      if (!active) {
        return;
      }

      setSalesIntelData(fallbackSalesIntelData);
      setCompetitorData(fallbackCompetitorData);
      setAdminIndex(fallbackAdminIndex);
      setIsInitialLoading(false);
    });

    return () => {
      active = false;
    };
  }, [fallbackCompetitorData, fallbackSalesIntelData]);

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
  const followUpSuggestions = useMemo(
    () =>
      companyEntries.slice(0, 6).map((entry) => ({
        title: entry.companyName,
        summary: entry.latestSummary,
        meta: `${entry.city || t("companies.unknown_city")} · ${t("companies.signal_count", {
          count: entry.signalCount,
        })}`,
      })),
    [companyEntries, t]
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
        return <CompanyLibraryPanel entries={companyEntries} />;
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
        return <FollowUpPanel items={followUpSuggestions} />;
      case "sources":
        return <SourcesPanel salesIntelData={salesIntelData} competitorData={competitorData} />;
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

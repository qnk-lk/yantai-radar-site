"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./i18n";
import { CompetitorCityFilter, type SelectedCity } from "./competitor-city-filter";
import { CompetitorCompanyList } from "./competitor-company-list";
import { CompetitorMapPanel } from "./competitor-map-panel";
import { LanguageSwitcher } from "./language-switcher";
import { LocationWeatherClock } from "./location-weather-clock";
import { SalesIntelFeedPanel } from "./sales-intel-feed-panel";
import { SalesIntelTodayPanel } from "./sales-intel-today-panel";
import type { SalesIntelData } from "./sales-intel-types";
import { getCompetitorKey, type ChinaAdminIndex, type CompetitorData } from "./competitor-types";

const fallbackAdminIndex: ChinaAdminIndex = {};
const publicApiBaseUrl = process.env.NEXT_PUBLIC_RADAR_API_BASE_URL?.replace(/\/$/, "") ?? "";

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

function withApiBase(path: string) {
  return publicApiBaseUrl ? `${publicApiBaseUrl}${path}` : path;
}

function createDataSources(apiPath: string, staticPath: string) {
  if (!publicApiBaseUrl) {
    return [apiPath, staticPath];
  }

  return [withApiBase(apiPath), withApiBase(staticPath), apiPath, staticPath];
}

function createRemoteOnlyDataSources(apiPath: string, staticPath: string) {
  if (!publicApiBaseUrl) {
    return [apiPath, staticPath];
  }

  return [withApiBase(apiPath), withApiBase(staticPath)];
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

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-(--color-line) bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--color-muted)">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold leading-none text-(--color-ink)">{value}</p>
      <p className="mt-3 text-sm leading-7 text-(--color-muted)">{detail}</p>
    </div>
  );
}

export default function Home() {
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

  useEffect(() => {
    let active = true;

    async function loadData() {
      const [salesResult, competitorResult, adminIndexResult] = await Promise.allSettled([
        loadJsonWithFallback<SalesIntelData>(
          createRemoteOnlyDataSources("/api/sales/intel", "/sales-intel.json")
        ),
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
      setSelectedMapCompetitorKey(null);
      setExpandedCompetitorKey(null);
      setPriorityCompetitorKey(null);
      setPriorityCompetitorSignal(0);
      setIsCityFilterOpen(false);
    }

    loadData().catch(() => {
      if (!active) {
        return;
      }

      setSalesIntelData(fallbackSalesIntelData);
      setCompetitorData(fallbackCompetitorData);
      setAdminIndex(fallbackAdminIndex);
      setSelectedMapCompetitorKey(null);
      setExpandedCompetitorKey(null);
      setPriorityCompetitorKey(null);
      setPriorityCompetitorSignal(0);
      setIsCityFilterOpen(false);
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

  const heroMetrics = useMemo(
    () => [
      {
        label: t("metrics.sales_total"),
        value: String(salesIntelData.totals.overall),
        detail: t("metrics.sales_total_detail"),
      },
      {
        label: t("metrics.today_highlights"),
        value: String(salesIntelData.totals.todayHighlights),
        detail: t("metrics.today_highlights_detail"),
      },
      {
        label: t("metrics.report_items"),
        value: String(salesIntelData.totals.reportItems),
        detail: t("metrics.report_items_detail"),
      },
      {
        label: t("metrics.competitors"),
        value: String(visibleCompetitors.length),
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

  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-ink)">
      <div className="absolute inset-x-0 top-0 -z-10 h-136 bg-[radial-gradient(circle_at_top_left,rgba(182,107,58,0.24),transparent_48%),radial-gradient(circle_at_75%_18%,rgba(53,97,108,0.18),transparent_42%)]" />

      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        <section className="overflow-visible rounded-4xl border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,251,244,0.92),rgba(245,235,221,0.92))] p-6 shadow-[0_25px_70px_rgba(69,49,28,0.12)] sm:p-8 lg:p-10">
          <div className="mb-8 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
            <LocationWeatherClock />
            <LanguageSwitcher />
          </div>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-(--color-line) bg-white/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.3em] text-(--color-accent)">
                {t("chrome.badge")}
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
                  {t("chrome.hero_title")}
                </h1>
                <p className="max-w-3xl text-base leading-8 text-(--color-muted) sm:text-lg">
                  {salesIntelData.summary.focus || t("sales_intel.no_data")}
                </p>
              </div>

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
        </section>

        <SalesIntelFeedPanel data={salesIntelData} />
        <SalesIntelTodayPanel
          items={salesIntelData.todayHighlights}
          updatedAt={salesIntelData.updatedAt}
          searchItems={salesIntelData.todaySearchItems}
        />
      </div>
    </main>
  );
}

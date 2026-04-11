"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import "./i18n";
import { CompetitorCityFilter, type SelectedCity } from "./competitor-city-filter";
import { CompetitorCompanyList } from "./competitor-company-list";
import { CompetitorMapPanel } from "./competitor-map-panel";
import { LanguageSwitcher } from "./language-switcher";
import { LocationWeatherClock } from "./location-weather-clock";
import { getCompetitorKey, type ChinaAdminIndex, type CompetitorData } from "./competitor-types";

type RadarEntry = {
  title: string;
  source?: string;
  publishedAt?: string;
  location?: string;
  entity?: string;
  demand?: string;
  stage?: string;
  confidence?: string;
  score?: string;
  action?: string;
  reason?: string;
};

type RadarData = {
  updatedAt: string;
  summary: {
    focus: string;
    status: string;
    note: string;
  };
  highPriority: RadarEntry[];
  potentialLeads: RadarEntry[];
  watchItems: RadarEntry[];
  coverageGaps: string[];
  nextActions: string[];
  accounts: RadarEntry[];
};

const fallbackData: RadarData = {
  updatedAt: "等待首次自动同步",
  summary: {
    focus: "烟台优先，只看烟台和青岛，优先跟进制造业相关的 MES / WMS / QMS 信号。",
    status: "当前站点已就绪，等待 OpenClaw 每日任务产出。",
    note: "建议先把这页作为对外展示层，日报和潜在客户名单后续再自动落盘到 latest.json。",
  },
  highPriority: [],
  potentialLeads: [],
  watchItems: [],
  coverageGaps: [],
  nextActions: [
    "确认域名 DNS 指向新加坡服务器。",
    "将 GitHub Actions 的部署密钥和服务器目录配置完成。",
    "把 OpenClaw 日报结果转为 latest.json 并覆盖站点数据文件。",
  ],
  accounts: [],
};

const fallbackCompetitorData: CompetitorData = {
  updatedAt: "等待 OpenClaw 调研结果",
  status: "同行地图模块已就绪，等待首次 OpenClaw 产出同行数据。",
  note: "后续将按所选城市展示服务制造业客户的同行公司。",
  baseline: {
    companyName: "烟台利道科技有限公司",
    serviceScopeSummary: "将以该公司公开服务边界作为对标基准，只筛选与制造业数字化交付相关的同行。",
    evidence: [],
  },
  competitors: [],
};

const fallbackAdminIndex: ChinaAdminIndex = {};
const publicApiBaseUrl = process.env.NEXT_PUBLIC_RADAR_API_BASE_URL?.replace(/\/$/, "") ?? "";

function withApiBase(path: string) {
  return publicApiBaseUrl ? `${publicApiBaseUrl}${path}` : path;
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

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-(--color-accent)">
        {eyebrow}
      </p>
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-(--color-ink) sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-(--color-muted) sm:text-base">
          {description}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-(--color-line) bg-(--color-card-soft) px-5 py-6 text-sm leading-7 text-(--color-muted)">
      {label}
    </div>
  );
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

function EntryCard({ entry }: { entry: RadarEntry }) {
  const { t } = useTranslation();
  const tags = [
    entry.location,
    entry.entity,
    entry.demand,
    entry.stage,
    entry.confidence,
    entry.score,
  ].filter(Boolean);

  return (
    <article className="rounded-[1.75rem] border border-(--color-line) bg-(--color-card) p-5 shadow-[0_18px_50px_rgba(69,49,28,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="max-w-2xl text-lg font-semibold leading-8 text-(--color-ink)">
          {entry.title}
        </h3>
        {entry.action ? (
          <span className="rounded-full bg-(--color-accent)/10 px-3 py-1 text-xs font-semibold text-(--color-accent)">
            {entry.action}
          </span>
        ) : null}
      </div>

      {tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3 text-sm text-(--color-muted) sm:grid-cols-2">
        {entry.source ? (
          <div>
            <dt className="font-medium text-(--color-ink)">{t("entry.source")}</dt>
            <dd>{entry.source}</dd>
          </div>
        ) : null}
        {entry.publishedAt ? (
          <div>
            <dt className="font-medium text-(--color-ink)">{t("entry.published_at")}</dt>
            <dd>{entry.publishedAt}</dd>
          </div>
        ) : null}
      </dl>

      {entry.reason ? (
        <p className="mt-5 border-t border-(--color-line) pt-4 text-sm leading-7 text-(--color-ink)/80">
          {entry.reason}
        </p>
      ) : null}
    </article>
  );
}

function EntryGrid({ entries, emptyLabel }: { entries: RadarEntry[]; emptyLabel: string }) {
  if (!entries.length) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="grid gap-4">
      {entries.map((entry) => (
        <EntryCard key={`${entry.title}-${entry.source ?? "no-source"}`} entry={entry} />
      ))}
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const [data, setData] = useState<RadarData>(fallbackData);
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
      const [radarResult, competitorResult, adminIndexResult] = await Promise.allSettled([
        loadJsonWithFallback<RadarData>([withApiBase("/api/radar/latest"), "/latest.json"]),
        loadJsonWithFallback<CompetitorData>([
          withApiBase("/api/competitors"),
          "/competitors.json",
        ]),
        loadJsonWithFallback<ChinaAdminIndex>([
          withApiBase("/api/admin/divisions"),
          "/china-admin-divisions.json",
        ]),
      ]);

      if (!active) {
        return;
      }

      const nextRadar = radarResult.status === "fulfilled" ? radarResult.value : fallbackData;
      const nextCompetitors =
        competitorResult.status === "fulfilled" ? competitorResult.value : fallbackCompetitorData;
      const nextAdminIndex =
        adminIndexResult.status === "fulfilled" ? adminIndexResult.value : fallbackAdminIndex;

      setData(nextRadar);
      setCompetitorData(nextCompetitors);
      setAdminIndex(nextAdminIndex);
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

      setData(fallbackData);
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
  }, []);

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
        label: t("metrics.high_priority"),
        value: String(data.highPriority.length),
        detail: t("metrics.high_priority_detail"),
      },
      {
        label: t("metrics.potential_leads"),
        value: String(data.potentialLeads.length),
        detail: t("metrics.potential_leads_detail"),
      },
      {
        label: t("metrics.competitors"),
        value: String(visibleCompetitors.length),
        detail: t("metrics.competitors_detail"),
      },
      {
        label: t("metrics.next_actions"),
        value: String(data.nextActions.length),
        detail: t("metrics.next_actions_detail"),
      },
    ],
    [
      data.highPriority.length,
      data.nextActions.length,
      data.potentialLeads.length,
      t,
      visibleCompetitors.length,
    ]
  );

  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-ink)">
      <div className="absolute inset-x-0 top-0 -z-10 h-136 bg-[radial-gradient(circle_at_top_left,rgba(182,107,58,0.24),transparent_48%),radial-gradient(circle_at_75%_18%,rgba(53,97,108,0.18),transparent_42%)]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
        <section className="overflow-visible rounded-4xl border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,251,244,0.92),rgba(245,235,221,0.92))] p-6 shadow-[0_25px_70px_rgba(69,49,28,0.12)] sm:p-8 lg:p-10">
          <div className="mb-8 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
            <LocationWeatherClock />
            <LanguageSwitcher />
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-(--color-line) bg-white/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.3em] text-(--color-accent)">
                {t("chrome.badge")}
              </div>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
                  {t("chrome.hero_title")}
                </h1>
                <p className="max-w-3xl text-base leading-8 text-(--color-muted) sm:text-lg">
                  {t("chrome.hero_description")}
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
              <div>
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

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow={t("sections.priority_eyebrow")}
              title={t("sections.priority_title")}
              description={t("sections.priority_description")}
            />
            <EntryGrid entries={data.highPriority} emptyLabel={t("empty.priority")} />
          </div>

          <div className="space-y-6 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow={t("sections.pipeline_eyebrow")}
              title={t("sections.pipeline_title")}
              description={t("sections.pipeline_description")}
            />
            <div className="grid gap-3">
              {data.nextActions.length ? (
                data.nextActions.map((action) => (
                  <div
                    key={action}
                    className="rounded-[1.25rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-4 text-sm leading-7 text-(--color-ink)"
                  >
                    {action}
                  </div>
                ))
              ) : (
                <EmptyState label={t("empty.pipeline")} />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-2">
          <div className="space-y-5 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow={t("sections.potential_eyebrow")}
              title={t("sections.potential_title")}
              description={t("sections.potential_description")}
            />
            <EntryGrid entries={data.potentialLeads} emptyLabel={t("empty.potential")} />
          </div>

          <div className="space-y-5 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow={t("sections.watchlist_eyebrow")}
              title={t("sections.watchlist_title")}
              description={t("sections.watchlist_description")}
            />
            <EntryGrid entries={data.watchItems} emptyLabel={t("empty.watchlist")} />
          </div>
        </section>

        <section className="rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
          <SectionHeader
            eyebrow={t("sections.gaps_eyebrow")}
            title={t("sections.gaps_title")}
            description={t("sections.gaps_description")}
          />
          <div className="mt-6 grid gap-3">
            {data.coverageGaps.length ? (
              data.coverageGaps.map((gap) => (
                <div
                  key={gap}
                  className="rounded-[1.25rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-4 text-sm leading-7 text-(--color-ink)"
                >
                  {gap}
                </div>
              ))
            ) : (
              <EmptyState label={t("empty.gaps")} />
            )}
          </div>
        </section>

        <section className="rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
          <SectionHeader
            eyebrow={t("sections.accounts_eyebrow")}
            title={t("sections.accounts_title")}
            description={t("sections.accounts_description")}
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {data.accounts.length ? (
              data.accounts.map((account) => <EntryCard key={account.title} entry={account} />)
            ) : (
              <div className="lg:col-span-3">
                <EmptyState label={t("empty.accounts")} />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

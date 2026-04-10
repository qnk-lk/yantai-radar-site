"use client";

import { useEffect, useMemo, useState } from "react";

import { CompetitorCompanyList } from "./_components/competitor-company-list";
import { CompetitorMapPanel } from "./_components/competitor-map-panel";
import { type ChinaAdminIndex, type CompetitorData } from "./_components/competitor-types";

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
    focus: "烟台优先，向青岛、威海、潍坊扩展，再补山东重点制造城市。",
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
  status: "同行地图模块已就绪，等待首次 OpenClaw 产出烟台与青岛同行数据。",
  note: "后续只展示烟台本地与青岛范围内，服务制造业客户的同行公司。",
  baseline: {
    companyName: "烟台利道科技有限公司",
    serviceScopeSummary:
      "将以该公司公开服务边界作为对标基准，只筛选烟台与青岛范围内与制造业数字化交付相关的同行。",
    evidence: [],
  },
  competitors: [],
};

const fallbackAdminIndex: ChinaAdminIndex = {};

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
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent)]">
        {eyebrow}
      </p>
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--color-muted)] sm:text-base">
          {description}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[var(--color-line)] bg-[var(--color-card-soft)] px-5 py-6 text-sm leading-7 text-[var(--color-muted)]">
      {label}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--color-line)] bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold leading-none text-[var(--color-ink)]">{value}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{detail}</p>
    </div>
  );
}

function EntryCard({ entry }: { entry: RadarEntry }) {
  const tags = [
    entry.location,
    entry.entity,
    entry.demand,
    entry.stage,
    entry.confidence,
    entry.score,
  ].filter(Boolean);

  return (
    <article className="rounded-[1.75rem] border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_18px_50px_rgba(69,49,28,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="max-w-2xl text-lg font-semibold leading-8 text-[var(--color-ink)]">
          {entry.title}
        </h3>
        {entry.action ? (
          <span className="rounded-full bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-accent)]">
            {entry.action}
          </span>
        ) : null}
      </div>

      {tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3 text-sm text-[var(--color-muted)] sm:grid-cols-2">
        {entry.source ? (
          <div>
            <dt className="font-medium text-[var(--color-ink)]">来源</dt>
            <dd>{entry.source}</dd>
          </div>
        ) : null}
        {entry.publishedAt ? (
          <div>
            <dt className="font-medium text-[var(--color-ink)]">发布时间</dt>
            <dd>{entry.publishedAt}</dd>
          </div>
        ) : null}
      </dl>

      {entry.reason ? (
        <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-sm leading-7 text-[var(--color-ink)]/80">
          {entry.reason}
        </p>
      ) : null}
    </article>
  );
}

function EntryGrid({
  entries,
  emptyLabel,
}: {
  entries: RadarEntry[];
  emptyLabel: string;
}) {
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
  const [data, setData] = useState<RadarData>(fallbackData);
  const [competitorData, setCompetitorData] = useState<CompetitorData>(fallbackCompetitorData);
  const [adminIndex, setAdminIndex] = useState<ChinaAdminIndex>(fallbackAdminIndex);
  const [selectedCompetitorKey, setSelectedCompetitorKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      const [radarResult, competitorResult, adminIndexResult] = await Promise.allSettled([
        loadJsonWithFallback<RadarData>(["/api/radar/latest", "/latest.json"]),
        loadJsonWithFallback<CompetitorData>(["/api/competitors", "/competitors.json"]),
        loadJsonWithFallback<ChinaAdminIndex>([
          "/api/admin/divisions",
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
      setSelectedCompetitorKey(null);
    }

    loadData().catch(() => {
      if (!active) {
        return;
      }

      setData(fallbackData);
      setCompetitorData(fallbackCompetitorData);
      setAdminIndex(fallbackAdminIndex);
      setSelectedCompetitorKey(null);
    });

    return () => {
      active = false;
    };
  }, []);

  const heroMetrics = useMemo(
    () => [
      {
        label: "高优线索",
        value: String(data.highPriority.length),
        detail: "今天值得立刻跟进的对象数。",
      },
      {
        label: "潜在线索",
        value: String(data.potentialLeads.length),
        detail: "保留早期信号，便于持续跟进。",
      },
      {
        label: "同行公司",
        value: String(competitorData.competitors.length),
        detail: "只统计烟台与青岛范围内的同行样本。",
      },
      {
        label: "明日动作",
        value: String(data.nextActions.length),
        detail: "已转成下一步执行清单。",
      },
    ],
    [
      competitorData.competitors.length,
      data.highPriority.length,
      data.nextActions.length,
      data.potentialLeads.length,
    ]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(182,107,58,0.24),_transparent_48%),radial-gradient(circle_at_75%_18%,_rgba(53,97,108,0.18),_transparent_42%)]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
        <section className="overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[linear-gradient(135deg,rgba(255,251,244,0.92),rgba(245,235,221,0.92))] p-6 shadow-[0_25px_70px_rgba(69,49,28,0.12)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-[var(--color-line)] bg-white/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.3em] text-[var(--color-accent)]">
                Yantai Manufacturing Signal Room
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
                  烟台优先的制造业销售雷达
                  <span className="mt-2 block text-[0.66em] font-medium text-[var(--color-muted)]">
                    同时补一张“烟台 / 青岛同行地图”，让你知道谁在和你抢客户。
                  </span>
                </h1>
                <p className="max-w-3xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
                  这页不是新闻堆叠，而是把销售线索、同行公司、跟进动作和证据缺口放进同一个面板，让你先判断再行动。
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
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.5rem] border border-[var(--color-line)] bg-white/80 p-5">
                <p className="text-sm font-medium text-[var(--color-muted)]">当前焦点</p>
                <p className="mt-3 text-base leading-7 text-[var(--color-ink)]">{data.summary.focus}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--color-line)] bg-white/80 p-5">
                <p className="text-sm font-medium text-[var(--color-muted)]">今日状态</p>
                <p className="mt-3 text-base leading-7 text-[var(--color-ink)]">{data.summary.status}</p>
              </div>

              <CompetitorMapPanel
                adminIndex={adminIndex}
                companies={competitorData.competitors}
                status={competitorData.status}
                note={competitorData.note}
                updatedAt={competitorData.updatedAt}
                selectedKey={selectedCompetitorKey}
                onSelect={setSelectedCompetitorKey}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
          <SectionHeader
            eyebrow="Competitor Deck"
            title="烟台 / 青岛同行公司名片"
            description="地图负责空间感，右侧名片负责细节。默认收起，点箭头或点地图点位再展开。"
          />

          <div className="mt-6">
            <CompetitorCompanyList
              baseline={competitorData.baseline}
              companies={competitorData.competitors}
              selectedKey={selectedCompetitorKey}
              onSelect={setSelectedCompetitorKey}
            />
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow="Priority Leads"
              title="今日高优先级销售线索"
              description="优先展示有时间、主体、地区和动作证据的高价值对象。"
            />
            <EntryGrid
              entries={data.highPriority}
              emptyLabel="今天还没有同步到足够强的高优先级线索，等待自动化任务写入 latest.json。"
            />
          </div>

          <div className="space-y-6 rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow="Pipeline"
              title="明日跟进清单"
              description="把日报输出直接转成下一步动作，而不是停在摘要。"
            />
            <div className="grid gap-3">
              {data.nextActions.length ? (
                data.nextActions.map((action) => (
                  <div
                    key={action}
                    className="rounded-[1.25rem] border border-[var(--color-line)] bg-[var(--color-card-soft)] px-4 py-4 text-sm leading-7 text-[var(--color-ink)]"
                  >
                    {action}
                  </div>
                ))
              ) : (
                <EmptyState label="今日还没有写入下一步动作。" />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-2">
          <div className="space-y-5 rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow="Potential Accounts"
              title="潜在客户动态"
              description="这部分允许保留更早期的信号，但会带上阶段、可信度和处理建议。"
            />
            <EntryGrid
              entries={data.potentialLeads}
              emptyLabel="今日还没有同步到新的潜在客户动态。"
            />
          </div>

          <div className="space-y-5 rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
            <SectionHeader
              eyebrow="Watchlist"
              title="重点企业 / 竞对动作"
              description="适合放山东重点厂商、集成商、客户案例和区域活跃度变化。"
            />
            <EntryGrid
              entries={data.watchItems}
              emptyLabel="今日暂无新的重点企业或竞对动作。"
            />
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
          <SectionHeader
            eyebrow="Coverage Gaps"
            title="今日未覆盖 / 证据不足"
            description="把尚未核实完成的城市、主题和对象保留下来，方便第二天继续补查。"
          />
          <div className="mt-6 grid gap-3">
            {data.coverageGaps.length ? (
              data.coverageGaps.map((gap) => (
                <div
                  key={gap}
                  className="rounded-[1.25rem] border border-[var(--color-line)] bg-[var(--color-card-soft)] px-4 py-4 text-sm leading-7 text-[var(--color-ink)]"
                >
                  {gap}
                </div>
              ))
            ) : (
              <EmptyState label="今日暂无额外的未覆盖或证据不足项。" />
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
          <SectionHeader
            eyebrow="Account Deck"
            title="建议新增到潜在客户名单的对象"
            description="把日报里值得反复跟踪的企业、园区、厂商沉淀成长期资产。"
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {data.accounts.length ? (
              data.accounts.map((account) => <EntryCard key={account.title} entry={account} />)
            ) : (
              <div className="lg:col-span-3">
                <EmptyState label="今日暂无建议新增对象，后续可以把 OpenClaw 产出的名单型结果写入 latest.json。" />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

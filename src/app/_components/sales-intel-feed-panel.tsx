"use client";

import { Button, Select, Tag } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SalesIntelDetailModal } from "./sales-intel-detail-modal";
import type { CompanyProfileRecord } from "./company-library-panel";
import type { FollowUpRecord } from "./follow-up-types";
import type {
  LeadActionRecord,
  LeadActionStatus,
  SalesIntelData,
  SalesIntelItem,
} from "./sales-intel-types";

function sanitizeDisplayNote(value: string) {
  return value
    .replace(/已从 OpenClaw 最新日报自动同步，来源文件：[^。]*?\.jsonl/gu, "")
    .replace(
      /该数据由招聘平台统一调度器顺序执行生成；每日随机抽取平台，并在达到总线索阈值后停止/gu,
      ""
    )
    .replace(/^[，。；\s]+|[，。；\s]+$/gu, "");
}

function formatDisplayUpdatedAt(value: string) {
  return value.replace(/\s*CST$/u, "");
}

function compactText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveLeadCompanyName(item: SalesIntelItem) {
  return compactText(item.entity || item.title);
}

function resolveLeadCity(item: SalesIntelItem) {
  return compactText(
    item.location || item.matchedJobs?.find((job) => compactText(job.city))?.city || ""
  );
}

function getLeadPlatformValues(item: SalesIntelItem) {
  return [
    compactText(item.sourceLabel),
    ...(item.matchedJobs ?? []).map((job) => compactText(job.platform)),
    ...(item.allJobs ?? []).map((job) => compactText(job.platform)),
  ].filter(Boolean);
}

function getLeadCityValues(item: SalesIntelItem) {
  return [
    compactText(item.location),
    ...(item.matchedJobs ?? []).map((job) => compactText(job.city)),
    ...(item.allJobs ?? []).map((job) => compactText(job.city)),
  ].filter(Boolean);
}

function getLeadSearchValues(item: SalesIntelItem) {
  return [
    ...item.tags,
    item.category,
    item.title,
    item.subtitle,
    item.summary,
    item.actionText,
    ...(item.matchedJobs ?? []).flatMap((job) => [
      job.jobTitle,
      job.descriptionEvidence,
      ...(job.keywordHits ?? []),
    ]),
  ]
    .map(compactText)
    .filter(Boolean);
}

function resolveLeadCompanyId(item: SalesIntelItem) {
  const companyName = resolveLeadCompanyName(item);
  const city = resolveLeadCity(item) || "unknown";
  return `${companyName}::${city}`;
}

function getActionColor(status?: LeadActionStatus) {
  if (status === "useful" || status === "company" || status === "follow_up") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "invalid") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  return "bg-white/80 text-(--color-accent) border-(--color-line)";
}

function normalizePublishedAtCandidate(value: string) {
  return value
    .replace(/^更新于\s*/u, "")
    .replace(/\s*CST$/u, "")
    .trim();
}

function isDisplayPublishedAt(value: string) {
  if (!value) {
    return false;
  }

  return (
    /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/u.test(value) ||
    /^(?:今天|昨天|\d{1,2}月\d{1,2}日|\d+分钟前|\d+小时前|\d+天前)$/u.test(value)
  );
}

function getDisplayPublishedAt(item: SalesIntelItem) {
  const candidates = [item.publishedAt, ...(item.matchedJobs ?? []).map((job) => job.publishedAt)]
    .map((value) => normalizePublishedAtCandidate(value))
    .filter(Boolean);

  return candidates.find((value) => isDisplayPublishedAt(value)) || "";
}

function getDisplayRetrievedAt(retrievedAt?: string | null, fallbackRetrievedAt?: string | null) {
  const value = retrievedAt || fallbackRetrievedAt || "";
  return value ? formatDisplayUpdatedAt(value) : "";
}

type LeadActionFilter = "all" | "unhandled" | "handled" | LeadActionStatus;

type LeadFilters = {
  platforms: string[];
  cities: string[];
  strengths: string[];
  searchItems: string[];
  action: LeadActionFilter;
};

const defaultLeadFilters: LeadFilters = {
  platforms: [],
  cities: [],
  strengths: [],
  searchItems: [],
  action: "all",
};

function createSelectOptions(values: string[]) {
  return [...new Set(values.map(compactText).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
    .map((value) => ({ value, label: value }));
}

function hasAnySelectedValue(values: string[], selectedValues: string[]) {
  if (!selectedValues.length) {
    return true;
  }

  const normalizedValues = new Set(values.map((value) => compactText(value).toLowerCase()));
  return selectedValues.some((value) => normalizedValues.has(compactText(value).toLowerCase()));
}

function doesSearchItemMatch(item: SalesIntelItem, searchItems: string[]) {
  if (!searchItems.length) {
    return true;
  }

  const text = getLeadSearchValues(item).join(" ").toLowerCase();
  return searchItems.some((value) => text.includes(compactText(value).toLowerCase()));
}

function doesActionMatch(action: LeadActionRecord | undefined, filter: LeadActionFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "unhandled") {
    return !action?.status;
  }

  if (filter === "handled") {
    return Boolean(action?.status);
  }

  return action?.status === filter;
}

function areFiltersEmpty(filters: LeadFilters) {
  return (
    !filters.platforms.length &&
    !filters.cities.length &&
    !filters.strengths.length &&
    !filters.searchItems.length &&
    filters.action === "all"
  );
}

function FeedRow({
  item,
  fallbackRetrievedAt,
  serialNumber,
  action,
  onView,
  onAction,
}: {
  item: SalesIntelItem;
  fallbackRetrievedAt?: string;
  serialNumber: number;
  action?: LeadActionRecord;
  onView: (item: SalesIntelItem) => void;
  onAction: (item: SalesIntelItem, status: LeadActionStatus) => void;
}) {
  const { t } = useTranslation();
  const displayPublishedAt = getDisplayPublishedAt(item);
  const displayRetrievedAt = getDisplayRetrievedAt(item.retrievedAt, fallbackRetrievedAt);

  return (
    <article className="rounded-[1.5rem] border border-(--color-line) bg-(--color-card) px-5 py-5 shadow-[0_16px_40px_rgba(69,49,28,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-(--color-line) bg-white px-3 py-1 text-xs font-semibold text-(--color-ink)">
              {String(serialNumber).padStart(2, "0")}
            </span>
            <span className="rounded-full bg-(--color-accent) px-3 py-1 text-xs font-semibold text-white">
              {item.category}
            </span>
            {item.sourceLabel ? (
              <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                {item.sourceLabel}
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h4 className="text-lg font-semibold leading-7 text-(--color-ink)">{item.title}</h4>
              {displayPublishedAt ? (
                <span className="text-sm leading-7 text-(--color-muted)">
                  {t("entry.published_at")} {displayPublishedAt}
                </span>
              ) : null}
            </div>
            {item.subtitle ? (
              <p className="text-sm leading-7 text-(--color-muted)">{item.subtitle}</p>
            ) : null}
            <p className="text-sm leading-7 text-(--color-ink)/80">{item.summary}</p>
          </div>

          {item.tags.length || displayRetrievedAt ? (
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span
                  key={`${item.id}-${tag}`}
                  className="rounded-full bg-(--color-card-soft) px-3 py-1 text-xs font-medium text-(--color-ink)"
                >
                  {tag}
                </span>
              ))}
              {displayRetrievedAt ? (
                <span className="rounded-full bg-(--color-card-soft) px-3 py-1 text-xs font-medium text-(--color-ink)">
                  {t("entry.retrieved_at")} {displayRetrievedAt}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onView(item)}
          className="shrink-0 rounded-full border border-(--color-line) bg-white/80 px-4 py-2 text-sm font-semibold text-(--color-accent) hover:bg-white"
        >
          {t("sales_intel.view")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-(--color-line) pt-4">
        <div className="flex flex-wrap gap-2">
          {action?.status ? (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getActionColor(action.status)}`}
            >
              {t(`sales_intel.actions.statuses.${action.status}`)}
            </span>
          ) : (
            <span className="rounded-full border border-(--color-line) bg-white/70 px-3 py-1 text-xs font-semibold text-(--color-muted)">
              {t("sales_intel.actions.unhandled")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["useful", "invalid", "company", "follow_up"] as LeadActionStatus[]).map((status) => (
            <button
              key={`${item.id}-${status}`}
              type="button"
              onClick={() => onAction(item, status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:bg-white ${getActionColor(
                action?.status === status ? status : undefined
              )}`}
            >
              {t(`sales_intel.actions.${status}`)}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function SalesIntelFeedPanel({
  data,
  leadActions,
  onSaveLeadAction,
  onSaveFollowUpRecord,
  onSaveCompanyProfile,
}: {
  data: SalesIntelData;
  leadActions: LeadActionRecord[];
  onSaveLeadAction: (record: LeadActionRecord) => void;
  onSaveFollowUpRecord: (record: FollowUpRecord) => void;
  onSaveCompanyProfile: (profile: CompanyProfileRecord) => void;
}) {
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState<SalesIntelItem | null>(null);
  const [pendingActionId, setPendingActionId] = useState("");
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>(defaultLeadFilters);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loopBoundaryRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef(0);
  const feedItems = data.feed;
  const actionMap = useMemo(
    () => new Map(leadActions.map((action) => [action.itemId, action])),
    [leadActions]
  );
  const filterOptions = useMemo(
    () => ({
      platforms: createSelectOptions(feedItems.flatMap(getLeadPlatformValues)),
      cities: createSelectOptions(feedItems.flatMap(getLeadCityValues)),
      strengths: createSelectOptions(feedItems.map((item) => item.strength)),
      searchItems: createSelectOptions([
        ...(data.todaySearchItems ?? []),
        ...feedItems.flatMap((item) => item.tags),
      ]),
    }),
    [data.todaySearchItems, feedItems]
  );
  const filteredItems = useMemo(
    () =>
      feedItems.filter((item) => {
        const action = actionMap.get(item.id);

        return (
          hasAnySelectedValue(getLeadPlatformValues(item), filters.platforms) &&
          hasAnySelectedValue(getLeadCityValues(item), filters.cities) &&
          hasAnySelectedValue([item.strength], filters.strengths) &&
          doesSearchItemMatch(item, filters.searchItems) &&
          doesActionMatch(action, filters.action)
        );
      }),
    [actionMap, feedItems, filters]
  );
  const hasActiveFilters = !areFiltersEmpty(filters);
  const displayNote = sanitizeDisplayNote(data.summary.note || "");

  async function handleLeadAction(item: SalesIntelItem, status: LeadActionStatus) {
    const companyName = resolveLeadCompanyName(item);
    const city = resolveLeadCity(item);
    const companyId = resolveLeadCompanyId(item);

    setPendingActionId(`${item.id}:${status}`);
    try {
      if (status === "follow_up") {
        const followUpPayload = await requestJson<{ item: FollowUpRecord }>(
          `/api/follow-ups/${encodeURIComponent(companyId)}`,
          {
            companyName,
            city,
            stage: item.strength === "高" ? "priority" : "watch",
            contactResult: "not_contacted",
            nextAction: item.actionText || item.summary,
            dealStage: "lead",
            nextReminderAt: "",
            reminderStatus: "open",
            completedAt: "",
            note: item.summary,
            lastFollowedAt: "",
          }
        );

        if (followUpPayload.item) {
          onSaveFollowUpRecord(followUpPayload.item);
        }
      }

      if (status === "company") {
        const profilePayload = await requestJson<{ item: CompanyProfileRecord }>(
          `/api/company-profiles/${encodeURIComponent(companyId)}`,
          {
            companyName,
            city,
            industry: item.category,
            status: t("sales_intel.actions.company_profile_status"),
            tags: item.tags,
            note: item.summary,
          }
        );

        if (profilePayload.item) {
          onSaveCompanyProfile(profilePayload.item);
        }
      }

      const payload = await requestJson<{ item: LeadActionRecord }>(
        `/api/lead-actions/${encodeURIComponent(item.id)}`,
        {
          status,
          companyName,
          companyId,
          note: item.summary,
        }
      );

      onSaveLeadAction(payload.item);
    } finally {
      setPendingActionId("");
    }
  }

  const scrollingItems =
    filteredItems.length > 1
      ? [
          ...filteredItems.map((item, index) => ({ item, loop: 0, index })),
          ...filteredItems.map((item, index) => ({ item, loop: 1, index })),
        ]
      : filteredItems.map((item, index) => ({ item, loop: 0, index }));

  useEffect(() => {
    const container = containerRef.current;

    if (!container || filteredItems.length <= 1) {
      return;
    }

    scrollPositionRef.current = container.scrollTop;

    let animationFrameId = 0;
    let lastTimestamp = 0;

    function scrollFrame(timestamp: number) {
      const currentContainer = containerRef.current;

      if (!currentContainer) {
        animationFrameId = window.requestAnimationFrame(scrollFrame);
        return;
      }

      if (!isPointerInside && !activeItem) {
        const elapsed = lastTimestamp ? timestamp - lastTimestamp : 16;
        const loopBoundary =
          loopBoundaryRef.current?.offsetTop ?? Math.max(currentContainer.scrollHeight / 2, 1);

        let nextScrollTop = scrollPositionRef.current + elapsed * 0.036;

        if (nextScrollTop >= loopBoundary) {
          nextScrollTop -= loopBoundary;
        }

        scrollPositionRef.current = nextScrollTop;
        currentContainer.scrollTop = nextScrollTop;
      }

      lastTimestamp = timestamp;
      animationFrameId = window.requestAnimationFrame(scrollFrame);
    }

    animationFrameId = window.requestAnimationFrame(scrollFrame);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [activeItem, filteredItems.length, isPointerInside]);

  useEffect(() => {
    scrollPositionRef.current = 0;

    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [filters]);

  return (
    <>
      <section className="space-y-5 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-(--color-accent)">
              {t("sales_intel.feed_eyebrow")}
            </p>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-(--color-ink) sm:text-3xl">
                  {t("sales_intel.feed_title")}
                </h2>
                {data.updatedAt ? (
                  <span className="text-2xl font-semibold tracking-tight text-(--color-muted) sm:text-3xl">
                    {formatDisplayUpdatedAt(data.updatedAt)}
                  </span>
                ) : null}
              </div>
              {displayNote ? (
                <p className="max-w-3xl text-sm leading-7 text-(--color-muted) sm:text-base">
                  {displayNote}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-[1.5rem] border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,250,241,0.96),rgba(243,233,217,0.9))] px-5 py-4 whitespace-nowrap">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--color-muted)">
              {t("sales_intel.total_label")}
            </p>
            <p className="text-3xl font-semibold leading-none text-(--color-ink)">
              {hasActiveFilters ? `${filteredItems.length}/${data.totals.overall}` : data.totals.overall}
            </p>
          </div>
        </div>

        {feedItems.length ? (
          <div className="rounded-[1.5rem] border border-(--color-line) bg-(--color-card-soft) p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-(--color-ink)">
                  {t("sales_intel.filters.title")}
                </span>
                <Tag color={hasActiveFilters ? "orange" : "default"}>
                  {t("sales_intel.filters.result", {
                    count: filteredItems.length,
                    total: feedItems.length,
                  })}
                </Tag>
              </div>
              <Button
                size="small"
                disabled={!hasActiveFilters}
                onClick={() => setFilters(defaultLeadFilters)}
              >
                {t("sales_intel.filters.reset")}
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                placeholder={t("sales_intel.filters.platform")}
                value={filters.platforms}
                options={filterOptions.platforms}
                onChange={(value) => setFilters((current) => ({ ...current, platforms: value }))}
              />
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                placeholder={t("sales_intel.filters.city")}
                value={filters.cities}
                options={filterOptions.cities}
                onChange={(value) => setFilters((current) => ({ ...current, cities: value }))}
              />
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                placeholder={t("sales_intel.filters.strength")}
                value={filters.strengths}
                options={filterOptions.strengths}
                onChange={(value) => setFilters((current) => ({ ...current, strengths: value }))}
              />
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                placeholder={t("sales_intel.filters.search_item")}
                value={filters.searchItems}
                options={filterOptions.searchItems}
                onChange={(value) => setFilters((current) => ({ ...current, searchItems: value }))}
              />
              <Select
                value={filters.action}
                options={[
                  { value: "all", label: t("sales_intel.filters.action_all") },
                  { value: "unhandled", label: t("sales_intel.filters.action_unhandled") },
                  { value: "handled", label: t("sales_intel.filters.action_handled") },
                  { value: "follow_up", label: t("sales_intel.actions.statuses.follow_up") },
                  { value: "company", label: t("sales_intel.actions.statuses.company") },
                  { value: "useful", label: t("sales_intel.actions.statuses.useful") },
                  { value: "invalid", label: t("sales_intel.actions.statuses.invalid") },
                ]}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, action: value as LeadActionFilter }))
                }
              />
            </div>
          </div>
        ) : null}

        {filteredItems.length ? (
          <div
            ref={containerRef}
            onScroll={(event) => {
              scrollPositionRef.current = event.currentTarget.scrollTop;
            }}
            onMouseEnter={() => setIsPointerInside(true)}
            onMouseLeave={() => setIsPointerInside(false)}
            className="scrollbar-hidden h-[34rem] overflow-y-auto overscroll-y-contain pr-4 -mr-4"
          >
            <div className="space-y-3">
              {scrollingItems.map(({ item, loop, index }) => (
                <div
                  key={`${item.id}-${loop}-${index}`}
                  ref={loop === 1 && index === 0 ? loopBoundaryRef : null}
                >
                  <FeedRow
                    item={item}
                    fallbackRetrievedAt={data.updatedAt}
                    serialNumber={index + 1}
                    action={actionMap.get(item.id)}
                    onView={setActiveItem}
                    onAction={(targetItem, status) => {
                      if (!pendingActionId) {
                        void handleLeadAction(targetItem, status);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-(--color-line) bg-(--color-card-soft) px-5 py-10 text-center text-sm leading-7 text-(--color-muted)">
            {feedItems.length ? t("sales_intel.filters.empty") : t("sales_intel.empty_feed")}
          </div>
        )}
      </section>

      <SalesIntelDetailModal item={activeItem} onClose={() => setActiveItem(null)} />
    </>
  );
}

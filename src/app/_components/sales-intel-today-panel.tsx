"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SalesIntelDetailModal } from "./sales-intel-detail-modal";
import type { SalesIntelItem } from "./sales-intel-types";

function formatDisplayUpdatedAt(value: string) {
  return value.replace(/\s*CST$/u, "");
}

function normalizePublishedAtCandidate(value: string) {
  return value.replace(/^更新于\s*/u, "").replace(/\s*CST$/u, "").trim();
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
  const candidates = [
    item.publishedAt,
    ...item.matchedJobs.map((job) => job.publishedAt),
  ]
    .map((value) => normalizePublishedAtCandidate(value))
    .filter(Boolean);

  return candidates.find((value) => isDisplayPublishedAt(value)) || "";
}

function getDisplayRetrievedAt(
  retrievedAt?: string | null,
  fallbackRetrievedAt?: string | null
) {
  const value = retrievedAt || fallbackRetrievedAt || "";
  return value ? formatDisplayUpdatedAt(value) : "";
}

function uniqueItems(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function deriveSearchItems(items: SalesIntelItem[]) {
  return uniqueItems(
    items.flatMap((item) => [
      ...String(item.sourceLabel || "")
        .split(/[、,，]/u)
        .map((value) => value.trim())
        .filter(Boolean),
      ...item.matchedJobs.map((job) => String(job.platform || "").trim()).filter(Boolean),
    ])
  ).slice(0, 3);
}

function TodayCard({
  item,
  index,
  fallbackRetrievedAt,
  onView,
}: {
  item: SalesIntelItem;
  index: number;
  fallbackRetrievedAt?: string;
  onView: (item: SalesIntelItem) => void;
}) {
  const { t } = useTranslation();
  const displayPublishedAt = getDisplayPublishedAt(item);
  const displayRetrievedAt = getDisplayRetrievedAt(item.retrievedAt, fallbackRetrievedAt);

  return (
    <article className="rounded-[1.5rem] border border-(--color-line) bg-(--color-card) px-5 py-5 shadow-[0_16px_40px_rgba(69,49,28,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-(--color-accent) px-3 py-1 text-xs font-semibold text-white">
              #{index + 1}
            </span>
            {item.location ? (
              <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                {item.location}
              </span>
            ) : null}
            {item.strength ? (
              <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                {t("sales_intel.strength", { value: item.strength })}
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
    </article>
  );
}

export function SalesIntelTodayPanel({
  items,
  updatedAt,
  searchItems,
}: {
  items: SalesIntelItem[];
  updatedAt: string;
  searchItems?: string[];
}) {
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState<SalesIntelItem | null>(null);
  const displaySearchItems = uniqueItems(searchItems || []).length
    ? uniqueItems(searchItems || [])
    : deriveSearchItems(items);

  return (
    <>
      <section className="space-y-5 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-(--color-accent)">
              {t("sales_intel.today_eyebrow")}
            </p>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-(--color-ink) sm:text-3xl">
                  {t("sales_intel.today_title")}
                </h2>
                {updatedAt ? (
                  <span className="text-2xl font-semibold tracking-tight text-(--color-muted) sm:text-3xl">
                    {formatDisplayUpdatedAt(updatedAt)}
                  </span>
                ) : null}
                {displaySearchItems.length ? (
                  <span className="text-lg font-medium tracking-tight text-(--color-muted) sm:text-xl">
                    {t("sales_intel.today_search_items", {
                      value: displaySearchItems.join("、"),
                    })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {items.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item, index) => (
              <TodayCard
                key={item.id}
                item={item}
                index={index}
                fallbackRetrievedAt={updatedAt}
                onView={setActiveItem}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-(--color-line) bg-(--color-card-soft) px-5 py-10 text-center text-sm leading-7 text-(--color-muted)">
            {t("sales_intel.empty_today")}
          </div>
        )}
      </section>

      <SalesIntelDetailModal item={activeItem} onClose={() => setActiveItem(null)} />
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SalesIntelDetailModal } from "./sales-intel-detail-modal";
import type { SalesIntelData, SalesIntelItem } from "./sales-intel-types";

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

function FeedRow({
  item,
  fallbackRetrievedAt,
  serialNumber,
  onView,
}: {
  item: SalesIntelItem;
  fallbackRetrievedAt?: string;
  serialNumber: number;
  onView: (item: SalesIntelItem) => void;
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
    </article>
  );
}

export function SalesIntelFeedPanel({ data }: { data: SalesIntelData }) {
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState<SalesIntelItem | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loopBoundaryRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef(0);
  const feedItems = data.feed;
  const displayNote = sanitizeDisplayNote(data.summary.note || "");

  const scrollingItems =
    feedItems.length > 1
      ? [
          ...feedItems.map((item, index) => ({ item, loop: 0, index })),
          ...feedItems.map((item, index) => ({ item, loop: 1, index })),
        ]
      : feedItems.map((item, index) => ({ item, loop: 0, index }));

  useEffect(() => {
    const container = containerRef.current;

    if (!container || feedItems.length <= 1) {
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
  }, [activeItem, feedItems.length, isPointerInside]);

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
              {data.totals.overall}
            </p>
          </div>
        </div>

        {feedItems.length ? (
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
                    onView={setActiveItem}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-(--color-line) bg-(--color-card-soft) px-5 py-10 text-center text-sm leading-7 text-(--color-muted)">
            {t("sales_intel.empty_feed")}
          </div>
        )}
      </section>

      <SalesIntelDetailModal item={activeItem} onClose={() => setActiveItem(null)} />
    </>
  );
}

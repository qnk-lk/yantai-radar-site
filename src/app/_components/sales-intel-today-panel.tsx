"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SalesIntelDetailModal } from "./sales-intel-detail-modal";
import type { SalesIntelItem } from "./sales-intel-types";

function TodayCard({
  item,
  index,
  onView,
}: {
  item: SalesIntelItem;
  index: number;
  onView: (item: SalesIntelItem) => void;
}) {
  const { t } = useTranslation();

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
            <h4 className="text-lg font-semibold leading-7 text-(--color-ink)">{item.title}</h4>
            {item.subtitle ? (
              <p className="text-sm leading-7 text-(--color-muted)">{item.subtitle}</p>
            ) : null}
            <p className="text-sm leading-7 text-(--color-ink)/80">{item.summary}</p>
          </div>

          {item.tags.length ? (
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span
                  key={`${item.id}-${tag}`}
                  className="rounded-full bg-(--color-card-soft) px-3 py-1 text-xs font-medium text-(--color-ink)"
                >
                  {tag}
                </span>
              ))}
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
}: {
  items: SalesIntelItem[];
  updatedAt: string;
}) {
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState<SalesIntelItem | null>(null);

  return (
    <>
      <section className="space-y-5 rounded-4xl border border-(--color-line) bg-(--color-card) p-6 shadow-[0_20px_60px_rgba(69,49,28,0.08)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-(--color-accent)">
              {t("sales_intel.today_eyebrow")}
            </p>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-(--color-ink) sm:text-3xl">
                {t("sales_intel.today_title")}
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-(--color-muted) sm:text-base">
                {t("sales_intel.today_description", { updatedAt })}
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,250,241,0.96),rgba(243,233,217,0.9))] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--color-muted)">
              {t("sales_intel.today_count")}
            </p>
            <p className="mt-2 text-3xl font-semibold leading-none text-(--color-ink)">
              {items.length}
            </p>
          </div>
        </div>

        {items.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item, index) => (
              <TodayCard key={item.id} item={item} index={index} onView={setActiveItem} />
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

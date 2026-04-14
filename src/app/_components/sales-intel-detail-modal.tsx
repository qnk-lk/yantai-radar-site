"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { SalesIntelItem } from "./sales-intel-types";

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-(--color-accent)">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function SalesIntelDetailModal({
  item,
  onClose,
}: {
  item: SalesIntelItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!item) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [item, onClose]);

  if (!item) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(35,27,19,0.55)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-(--color-line) bg-[linear-gradient(180deg,rgba(255,251,244,0.98),rgba(246,237,224,0.98))] p-6 shadow-[0_30px_90px_rgba(52,38,24,0.24)] sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-(--color-accent) px-3 py-1 text-xs font-semibold text-white">
                {item.category}
              </span>
              {item.strength ? (
                <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                  {t("sales_intel.strength", { value: item.strength })}
                </span>
              ) : null}
              {item.sourceLabel ? (
                <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                  {item.sourceLabel}
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold leading-tight text-(--color-ink) sm:text-3xl">
                {item.title}
              </h3>
              {item.subtitle ? (
                <p className="text-sm leading-7 text-(--color-muted)">{item.subtitle}</p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-(--color-line) bg-white/80 text-xl text-(--color-ink) hover:bg-white"
            aria-label={t("sales_intel.close")}
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-[1.5rem] border border-(--color-line) bg-white/70 px-5 py-5 text-sm leading-8 text-(--color-ink)/85">
            {item.summary}
          </div>

          {item.detailRows.length ? (
            <DetailSection title={t("sales_intel.detail")}>
              <dl className="grid gap-3 sm:grid-cols-2">
                {item.detailRows.map((row) => (
                  <div
                    key={`${row.label}-${row.value}`}
                    className="rounded-[1.35rem] border border-(--color-line) bg-white/72 px-4 py-4"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-muted)">
                      {row.label}
                    </dt>
                    <dd className="mt-2 text-sm leading-7 text-(--color-ink)">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </DetailSection>
          ) : null}

          {item.matchedJobs.length ? (
            <DetailSection title={t("sales_intel.jobs")}>
              <div className="grid gap-3">
                {item.matchedJobs.map((job) => (
                  <article
                    key={`${job.platform}-${job.url}-${job.jobTitle}`}
                    className="rounded-[1.35rem] border border-(--color-line) bg-white/72 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <h4 className="text-base font-semibold text-(--color-ink)">
                          {job.jobTitle}
                        </h4>
                        <p className="text-sm leading-7 text-(--color-muted)">
                          {[job.platform, job.city, job.salary, job.publishedAt]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {job.url ? (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-(--color-line) px-3 py-2 text-sm font-medium text-(--color-accent) hover:bg-(--color-card-soft)"
                        >
                          {t("sales_intel.open_source")}
                        </a>
                      ) : null}
                    </div>

                    {job.keywordHits?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {job.keywordHits.map((keyword) => (
                          <span
                            key={`${job.jobTitle}-${keyword}`}
                            className="rounded-full bg-(--color-card-soft) px-3 py-1 text-xs font-medium text-(--color-ink)"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {job.descriptionEvidence ? (
                      <p className="mt-3 text-sm leading-7 text-(--color-ink)/80">
                        {job.descriptionEvidence}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </DetailSection>
          ) : null}

          {item.evidence.length ? (
            <DetailSection title={t("sales_intel.evidence")}>
              <div className="grid gap-3">
                {item.evidence.map((evidence) => (
                  <article
                    key={`${evidence.source}-${evidence.url}-${evidence.note}`}
                    className="rounded-[1.35rem] border border-(--color-line) bg-white/72 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-(--color-ink)">{evidence.source}</p>
                      {evidence.url ? (
                        <a
                          href={evidence.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-(--color-line) px-3 py-2 text-sm font-medium text-(--color-accent) hover:bg-(--color-card-soft)"
                        >
                          {t("sales_intel.open_source")}
                        </a>
                      ) : null}
                    </div>
                    {evidence.note ? (
                      <p className="mt-3 text-sm leading-7 text-(--color-ink)/80">
                        {evidence.note}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </DetailSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

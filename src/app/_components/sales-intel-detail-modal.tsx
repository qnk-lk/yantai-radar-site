"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { SalesIntelItem } from "./sales-intel-types";

const TAG_DETAIL_LABELS = new Set(["分类", "检索时间", "线索类型", "强度", "城市", "来源平台"]);
type SalesIntelJob = NonNullable<SalesIntelItem["matchedJobs"]>[number];

function buildSalesIntelDetailUrl(itemId: string) {
  return `/api/sales/intel/items/${itemId}`;
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
      <path
        d="M4.25 4.25l7.5 7.5m0-7.5l-7.5 7.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function buildJobHeadline(item: SalesIntelJob) {
  return [item.jobTitle, item.platform, item.city, item.salary, item.publishedAt]
    .filter(Boolean)
    .join(" · ");
}

function JobContentModal({
  job,
  title,
  openSourceLabel,
  closeLabel,
  onClose,
}: {
  job: SalesIntelJob | null;
  title: string;
  openSourceLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  if (!job) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(35,27,19,0.32)] p-4 backdrop-blur-[2px]"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-xl overflow-x-hidden rounded-[1.6rem] border border-(--color-line) bg-[linear-gradient(180deg,rgba(255,251,244,0.99),rgba(248,240,228,0.99))] p-5 shadow-[0_22px_60px_rgba(52,38,24,0.2)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--color-accent)">
              {title}
            </p>
            <h4 className="text-lg font-semibold leading-7 text-(--color-ink)">
              {buildJobHeadline(job)}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-(--color-line) bg-white/80 text-(--color-ink) hover:bg-white"
            aria-label={closeLabel}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-[1.2rem] border border-(--color-line) bg-white/72 px-4 py-4 text-sm leading-7 text-(--color-ink)/85">
            {job.descriptionEvidence}
          </div>

          {job.url ? (
            <div className="flex justify-end">
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-(--color-line) px-3 py-2 text-sm font-medium text-(--color-accent) hover:bg-(--color-card-soft)"
              >
                {openSourceLabel}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function JobList({
  jobs,
  emptyLabel,
  openSourceLabel,
  viewLabel,
  detailTitle,
  onViewContent,
}: {
  jobs: SalesIntelJob[];
  emptyLabel: string;
  openSourceLabel: string;
  viewLabel: string;
  detailTitle: string;
  onViewContent: (job: SalesIntelJob) => void;
}) {
  return (
    <div className="grid gap-3">
      {jobs.map((job) => (
        <article
          key={`${job.platform}-${job.url}-${job.jobTitle}`}
          className="overflow-hidden rounded-[1.35rem] border border-(--color-line) bg-white/72 px-4 py-4"
        >
          <div className="flex min-w-0 items-center justify-between gap-4">
            <p
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-(--color-ink)"
              title={buildJobHeadline(job)}
            >
              {buildJobHeadline(job)}
            </p>
            {job.url ? (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full border border-(--color-line) px-3 py-2 text-sm font-medium text-(--color-accent) hover:bg-(--color-card-soft)"
              >
                {openSourceLabel}
              </a>
            ) : null}
          </div>
          <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-12">
            <p
              className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-(--color-muted)"
              title={job.descriptionEvidence || ""}
            >
              {job.descriptionEvidence || emptyLabel}
            </p>
            <button
              type="button"
              onClick={() => onViewContent(job)}
              className="shrink-0 text-sm font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
              aria-label={`${viewLabel} ${detailTitle}`}
            >
              {viewLabel}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

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
  const [activeJob, setActiveJob] = useState<SalesIntelJob | null>(null);
  const [detailItem, setDetailItem] = useState<SalesIntelItem | null>(null);

  function handleClose() {
    setActiveJob(null);
    setDetailItem(null);
    onClose();
  }

  useEffect(() => {
    if (!item) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (activeJob) {
          setActiveJob(null);
          return;
        }

        setActiveJob(null);
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeJob, item, onClose]);

  useEffect(() => {
    if (!item || (item.detailRows && item.matchedJobs)) {
      return;
    }

    if (detailItem?.id === item.id) {
      return;
    }

    let active = true;

    fetch(buildSalesIntelDetailUrl(item.id), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load detail: ${response.status}`);
        }

        return (await response.json()) as SalesIntelItem;
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        setDetailItem(payload);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDetailItem({
          ...item,
          detailRows: [],
          evidence: [],
          matchedJobs: [],
          allJobs: [],
        });
      });

    return () => {
      active = false;
    };
  }, [detailItem?.id, item]);

  if (!item) {
    return null;
  }

  const resolvedItem = item.detailRows && item.matchedJobs ? item : detailItem ?? item;
  const isLoadingDetail = Boolean(item && !(item.detailRows && item.matchedJobs) && detailItem?.id !== item.id);
  const relatedJobs = (resolvedItem.matchedJobs ?? []).slice(0, 3);
  const allJobs =
    resolvedItem.allJobs && resolvedItem.allJobs.length
      ? resolvedItem.allJobs
      : (resolvedItem.matchedJobs ?? []);
  const detailRows = resolvedItem.detailRows ?? [];
  const detailTagRows = detailRows.filter((row) => TAG_DETAIL_LABELS.has(row.label));
  const remainingDetailRows = detailRows.filter((row) => !TAG_DETAIL_LABELS.has(row.label));
  const detailTagList = detailTagRows.length
    ? detailTagRows
    : [
        ["分类", resolvedItem.category],
        ["强度", resolvedItem.strength],
        ["城市", resolvedItem.location],
        ["来源平台", resolvedItem.sourceLabel],
      ]
        .map(([label, value]) => ({ label, value }))
        .filter((row) => row.value);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(35,27,19,0.55)] p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="scrollbar-hidden max-h-[92vh] w-full max-w-4xl overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-[2rem] border border-(--color-line) bg-[linear-gradient(180deg,rgba(255,251,244,0.98),rgba(246,237,224,0.98))] p-6 shadow-[0_30px_90px_rgba(52,38,24,0.24)] sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold leading-tight text-(--color-ink) sm:text-3xl">
                {resolvedItem.title}
              </h3>
              {detailTagList.length ? (
                <div className="flex flex-wrap gap-2">
                  {detailTagList.map((row) => (
                    <span
                      key={`${row.label}-${row.value}`}
                      className="max-w-full rounded-full bg-(--color-card-soft) px-3 py-1 text-xs font-medium text-(--color-ink)"
                      title={`${row.label}：${row.value}`}
                    >
                      <span className="text-(--color-muted)">{row.label}</span>
                      <span className="mx-1 text-(--color-muted)">·</span>
                      <span>{row.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--color-line) bg-white/80 text-(--color-ink) hover:bg-white"
            aria-label={t("sales_intel.close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-[1.5rem] border border-(--color-line) bg-white/70 px-5 py-5 text-sm leading-8 text-(--color-ink)/85">
            {resolvedItem.summary}
          </div>

          {isLoadingDetail ? (
            <div className="rounded-[1.35rem] border border-(--color-line) bg-white/72 px-4 py-6 text-sm leading-7 text-(--color-muted)">
              {t("sales_intel.detail_loading")}
            </div>
          ) : null}

          {!isLoadingDetail && remainingDetailRows.length ? (
            <DetailSection title={t("sales_intel.detail")}>
              <dl className="grid gap-3 sm:grid-cols-2">
                {remainingDetailRows.map((row) => (
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

          {!isLoadingDetail && relatedJobs.length ? (
            <DetailSection title={t("sales_intel.jobs")}>
              <JobList
                jobs={relatedJobs}
                emptyLabel={t("sales_intel.no_job_description")}
                openSourceLabel={t("sales_intel.open_source")}
                viewLabel={t("sales_intel.view")}
                detailTitle={t("sales_intel.job_detail")}
                onViewContent={setActiveJob}
              />
            </DetailSection>
          ) : null}

          {!isLoadingDetail && allJobs.length ? (
            <DetailSection title={t("sales_intel.all_jobs")}>
              <JobList
                jobs={allJobs}
                emptyLabel={t("sales_intel.no_job_description")}
                openSourceLabel={t("sales_intel.open_source")}
                viewLabel={t("sales_intel.view")}
                detailTitle={t("sales_intel.job_detail")}
                onViewContent={setActiveJob}
              />
            </DetailSection>
          ) : null}
        </div>
      </div>

      <JobContentModal
        job={activeJob}
        title={t("sales_intel.job_detail")}
        openSourceLabel={t("sales_intel.open_source")}
        closeLabel={t("sales_intel.close")}
        onClose={() => setActiveJob(null)}
      />
    </div>
  );
}

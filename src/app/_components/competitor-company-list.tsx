"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatAdminName, formatSelectedAreaName, getServiceFitLevel } from "./admin-labels";
import type { SelectedCity } from "./competitor-city-filter";
import {
  type CompetitorCompany,
  type CompetitorEvidence,
  getCompetitorKey,
} from "./competitor-types";

function EvidenceList({ evidence }: { evidence: CompetitorEvidence[] }) {
  if (!evidence.length) {
    return null;
  }

  return (
    <div className="space-y-3 border-t border-(--color-line) pt-4">
      {evidence.map((item) => (
        <div key={`${item.source}-${item.url}`} className="space-y-1 text-sm leading-7">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-(--color-accent) underline decoration-[0.08em] underline-offset-4"
          >
            {item.source}
          </a>
          <p className="text-(--color-muted)">{item.note}</p>
        </div>
      ))}
    </div>
  );
}

export function CompetitorCompanyList({
  companies,
  priorityKey,
  prioritySignal,
  selectedKey,
  selectedCities,
  pauseAutoScroll = false,
  onSelect,
}: {
  companies: CompetitorCompany[];
  priorityKey: string | null;
  prioritySignal: number;
  selectedKey: string | null;
  selectedCities: SelectedCity[];
  pauseAutoScroll?: boolean;
  onSelect: (key: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const resolvedLanguage = i18n.resolvedLanguage;
  const summaryItems = selectedCities.length
    ? selectedCities.map((city) => ({
        label: formatSelectedAreaName(city, resolvedLanguage),
        count: companies.filter((company) => company.city === city.cityName).length,
      }))
    : [{ label: t("city_filter.all_cities"), count: companies.length }];
  const orderedCompanies = [...companies].sort((left, right) => left.rank - right.rank);
  const prioritizedCompanies = priorityKey
    ? [
        ...orderedCompanies.filter((company) => getCompetitorKey(company) === priorityKey),
        ...orderedCompanies.filter((company) => getCompetitorKey(company) !== priorityKey),
      ]
    : orderedCompanies;
  const scrollingCompanies =
    prioritizedCompanies.length > 1
      ? [
          ...prioritizedCompanies.map((company, index) => ({ company, loop: 0, index })),
          ...prioritizedCompanies.map((company, index) => ({ company, loop: 1, index })),
        ]
      : prioritizedCompanies.map((company, index) => ({ company, loop: 0, index }));
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loopBoundaryRef = useRef<HTMLElement | null>(null);
  const programmaticScrollUntilRef = useRef(0);
  const [isPointerInside, setIsPointerInside] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container || prioritizedCompanies.length <= 1) {
      return;
    }

    let animationFrameId = 0;
    let lastTimestamp = 0;

    function scrollFrame(timestamp: number) {
      const currentContainer = scrollContainerRef.current;

      if (!currentContainer) {
        animationFrameId = window.requestAnimationFrame(scrollFrame);
        return;
      }

      const isAutoScrollPaused =
        pauseAutoScroll ||
        isPointerInside ||
        selectedKey !== null ||
        performance.now() < programmaticScrollUntilRef.current;

      if (!isAutoScrollPaused) {
        const elapsed = lastTimestamp ? timestamp - lastTimestamp : 16;
        const loopBoundary =
          loopBoundaryRef.current?.offsetTop ?? Math.max(currentContainer.scrollHeight / 2, 1);

        currentContainer.scrollTop += elapsed * 0.036;

        if (currentContainer.scrollTop >= loopBoundary) {
          currentContainer.scrollTop -= loopBoundary;
        }
      }

      lastTimestamp = timestamp;
      animationFrameId = window.requestAnimationFrame(scrollFrame);
    }

    animationFrameId = window.requestAnimationFrame(scrollFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isPointerInside, pauseAutoScroll, prioritizedCompanies.length, selectedKey]);

  useEffect(() => {
    if (!priorityKey || !scrollContainerRef.current) {
      return;
    }

    const currentContainer = scrollContainerRef.current;
    programmaticScrollUntilRef.current = performance.now() + 900;
    currentContainer.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [priorityKey, prioritySignal]);

  return (
    <div className="grid gap-6">
      <div className="scrollbar-hidden overflow-x-auto rounded-[1.35rem] border border-(--color-line) bg-[linear-gradient(90deg,rgba(255,250,241,0.95),rgba(243,233,217,0.92))]">
        <div className="flex min-w-max items-center px-2">
          {summaryItems.map((group) => (
            <div key={group.label} className="flex shrink-0 items-center gap-3 px-5 py-3">
              <span className="text-sm font-semibold tracking-[0.08em] text-(--color-ink)">
                {group.label}
              </span>
              <span className="text-(--color-muted)">-</span>
              <span className="text-sm font-semibold text-(--color-accent)">{group.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-(--color-line) bg-(--color-card-soft) p-3">
        <div className="overflow-hidden rounded-[1.35rem]">
          {orderedCompanies.length ? (
            <div
              ref={scrollContainerRef}
              onMouseEnter={() => setIsPointerInside(true)}
              onMouseLeave={() => setIsPointerInside(false)}
              className="competitor-card-marquee scrollbar-hidden h-136 overflow-y-auto overscroll-y-contain pr-4 -mr-4"
            >
              <div className="space-y-3">
                {scrollingCompanies.map(({ company, loop, index }) => {
                  const key = getCompetitorKey(company);
                  const isOpen = selectedKey === key && loop === 0;
                  const fitLevel = getServiceFitLevel(company.serviceFit);
                  const fitLabel =
                    fitLevel === "high"
                      ? t("deck.fit_levels.high")
                      : fitLevel === "medium"
                        ? t("deck.fit_levels.medium")
                        : fitLevel === "low"
                          ? t("deck.fit_levels.low")
                          : company.serviceFit;

                  return (
                    <article
                      key={`${key}-${loop}-${index}`}
                      ref={loop === 1 && index === 0 ? loopBoundaryRef : null}
                      className="rounded-3xl border border-(--color-line) bg-(--color-card) shadow-[0_16px_40px_rgba(69,49,28,0.08)]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(isOpen ? null : key)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-(--color-accent) px-3 py-1 text-xs font-semibold text-white">
                              #{company.rank}
                            </span>
                            <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                              {formatAdminName(company.city, resolvedLanguage)}
                            </span>
                            <span className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-muted)">
                              {t("deck.service_fit", {
                                fit: fitLabel,
                              })}
                            </span>
                          </div>
                          <h4 className="text-lg font-semibold leading-7 text-(--color-ink)">
                            {company.companyName}
                          </h4>
                          <p className="text-sm leading-7 text-(--color-muted)">
                            {company.manufacturingFocus}
                          </p>
                        </div>

                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-(--color-line) bg-white text-lg text-(--color-ink) transition ${
                            isOpen ? "rotate-90" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="space-y-4 border-t border-(--color-line) px-5 py-5">
                          <div className="flex flex-wrap gap-2">
                            {company.coreServices.map((service) => (
                              <span
                                key={service}
                                className="rounded-full bg-(--color-card-soft) px-3 py-1 text-xs font-medium text-(--color-ink)"
                              >
                                {service}
                              </span>
                            ))}
                          </div>

                          <p className="text-sm leading-7 text-(--color-ink)/80">
                            {company.whyRelevant}
                          </p>

                          <div className="grid gap-3 text-sm leading-7 text-(--color-muted) sm:grid-cols-2">
                            <div className="rounded-2xl border border-(--color-line) bg-white/70 px-4 py-3">
                              <p className="font-medium text-(--color-ink)">
                                {t("deck.manufacturing_focus")}
                              </p>
                              <p className="mt-1">{company.manufacturingFocus}</p>
                            </div>
                            <div className="rounded-2xl border border-(--color-line) bg-white/70 px-4 py-3">
                              <p className="font-medium text-(--color-ink)">
                                {t("deck.evidence_strength")}
                              </p>
                              <p className="mt-1">{company.evidenceStrength}</p>
                            </div>
                          </div>

                          <EvidenceList evidence={company.evidence} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-136 items-center justify-center rounded-[1.35rem] border border-dashed border-(--color-line) bg-(--color-card) px-6 text-center text-sm leading-7 text-(--color-muted)">
              {t("deck.empty_filtered")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

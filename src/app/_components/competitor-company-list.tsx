"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DISTANCE_LABELS,
  DISTANCE_ORDER,
  type CompetitorCompany,
  type CompetitorEvidence,
  getCompetitorKey,
} from "./competitor-types";

function EvidenceList({ evidence }: { evidence: CompetitorEvidence[] }) {
  if (!evidence.length) {
    return null;
  }

  return (
    <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
      {evidence.map((item) => (
        <div key={`${item.source}-${item.url}`} className="space-y-1 text-sm leading-7">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-accent)] underline decoration-[0.08em] underline-offset-4"
          >
            {item.source}
          </a>
          <p className="text-[var(--color-muted)]">{item.note}</p>
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
  onSelect,
}: {
  companies: CompetitorCompany[];
  priorityKey: string | null;
  prioritySignal: number;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const { t } = useTranslation();
  const grouped = DISTANCE_ORDER.map((tier) => ({
    tier,
    label: tier.includes("烟台") ? "烟台" : tier.includes("青岛") ? "青岛" : DISTANCE_LABELS[tier],
    items: companies
      .filter((company) => company.distanceTier === tier)
      .sort((left, right) => left.rank - right.rank),
  })).filter((group) => group.items.length);
  const orderedCompanies = grouped.flatMap((group) => group.items);
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

    const intervalId = window.setInterval(() => {
      const currentContainer = scrollContainerRef.current;

      if (!currentContainer) {
        return;
      }

      const isAutoScrollPaused =
        isPointerInside ||
        selectedKey !== null ||
        performance.now() < programmaticScrollUntilRef.current;

      if (isAutoScrollPaused) {
        return;
      }

      const loopBoundary =
        loopBoundaryRef.current?.offsetTop ?? Math.max(currentContainer.scrollHeight / 2, 1);

      currentContainer.scrollTop += 0.6;

      if (currentContainer.scrollTop >= loopBoundary) {
        currentContainer.scrollTop -= loopBoundary;
      }
    }, 16);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPointerInside, prioritizedCompanies.length, selectedKey]);

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
      <div className="scrollbar-hidden overflow-x-auto rounded-[1.35rem] border border-[var(--color-line)] bg-[linear-gradient(90deg,rgba(255,250,241,0.95),rgba(243,233,217,0.92))]">
        <div className="flex min-w-max items-center px-2">
          {grouped.map((group) => (
            <div
              key={group.tier}
              className="flex shrink-0 items-center gap-3 px-5 py-3"
            >
              <span className="text-sm font-semibold tracking-[0.08em] text-[var(--color-ink)]">
                {group.label}
              </span>
              <span className="text-[var(--color-muted)]">-</span>
              <span className="text-sm font-semibold text-[var(--color-accent)]">
                {group.items.length}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-[var(--color-line)] bg-[var(--color-card-soft)] p-3">
        <div className="overflow-hidden rounded-[1.35rem]">
          <div
            ref={scrollContainerRef}
            onMouseEnter={() => setIsPointerInside(true)}
            onMouseLeave={() => setIsPointerInside(false)}
            className="competitor-card-marquee scrollbar-hidden h-[34rem] overflow-y-auto overscroll-y-contain pr-4 -mr-4"
          >
          <div className="space-y-3">
            {scrollingCompanies.map(({ company, loop, index }) => {
              const key = getCompetitorKey(company);
              const isOpen = selectedKey === key && loop === 0;

                return (
                  <article
                    key={`${key}-${loop}-${index}`}
                    ref={loop === 1 && index === 0 ? loopBoundaryRef : null}
                    className="rounded-[1.5rem] border border-[var(--color-line)] bg-[var(--color-card)] shadow-[0_16px_40px_rgba(69,49,28,0.08)]"
                  >
                  <button
                    type="button"
                    onClick={() => onSelect(isOpen ? null : key)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-semibold text-white">
                          #{company.rank}
                        </span>
                        <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)]">
                          {company.city}
                        </span>
                        <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)]">
                          {t("deck.serviceFit", { fit: company.serviceFit })}
                        </span>
                      </div>
                      <h4 className="text-lg font-semibold leading-7 text-[var(--color-ink)]">
                        {company.companyName}
                      </h4>
                      <p className="text-sm leading-7 text-[var(--color-muted)]">
                        {company.manufacturingFocus}
                      </p>
                    </div>

                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-lg text-[var(--color-ink)] transition ${
                        isOpen ? "rotate-90" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="space-y-4 border-t border-[var(--color-line)] px-5 py-5">
                      <div className="flex flex-wrap gap-2">
                        {company.coreServices.map((service) => (
                          <span
                            key={service}
                            className="rounded-full bg-[var(--color-card-soft)] px-3 py-1 text-xs font-medium text-[var(--color-ink)]"
                          >
                            {service}
                          </span>
                        ))}
                      </div>

                      <p className="text-sm leading-7 text-[var(--color-ink)]/80">
                        {company.whyRelevant}
                      </p>

                      <div className="grid gap-3 text-sm leading-7 text-[var(--color-muted)] sm:grid-cols-2">
                        <div className="rounded-[1rem] border border-[var(--color-line)] bg-white/70 px-4 py-3">
                          <p className="font-medium text-[var(--color-ink)]">
                            {t("deck.manufacturingFocus")}
                          </p>
                          <p className="mt-1">{company.manufacturingFocus}</p>
                        </div>
                        <div className="rounded-[1rem] border border-[var(--color-line)] bg-white/70 px-4 py-3">
                          <p className="font-medium text-[var(--color-ink)]">
                            {t("deck.evidenceStrength")}
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
        </div>
      </div>
    </div>
  );
}

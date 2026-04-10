"use client";

import {
  DISTANCE_LABELS,
  DISTANCE_ORDER,
  type CompetitorBaseline,
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
  baseline,
  companies,
  selectedKey,
  onSelect,
}: {
  baseline: CompetitorBaseline;
  companies: CompetitorCompany[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const grouped = DISTANCE_ORDER.map((tier) => ({
    tier,
    items: companies
      .filter((company) => company.distanceTier === tier)
      .sort((left, right) => left.rank - right.rank),
  })).filter((group) => group.items.length);

  return (
    <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
      <div className="space-y-5">
        <div className="rounded-[1.75rem] border border-[var(--color-line)] bg-[var(--color-card-soft)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
            对标基准
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">
            {baseline.companyName}
          </h3>
          <p className="mt-4 text-sm leading-7 text-[var(--color-ink)]/80">
            {baseline.serviceScopeSummary}
          </p>
          <div className="mt-5">
            <EvidenceList evidence={baseline.evidence} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {grouped.map((group) => (
            <div
              key={group.tier}
              className="rounded-[1.2rem] border border-[var(--color-line)] bg-white px-4 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
                {DISTANCE_LABELS[group.tier]}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                {group.items.length}
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                {group.items.map((item) => item.companyName).join("、")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.tier} className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-[var(--color-ink)]">
                {DISTANCE_LABELS[group.tier]}
              </h3>
              <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)]">
                {group.items.length} 家
              </span>
            </div>

            <div className="space-y-3">
              {group.items.map((company) => {
                const key = getCompetitorKey(company);
                const isOpen = selectedKey === key;

                return (
                  <article
                    key={key}
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
                            匹配度 {company.serviceFit}
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
                            <p className="font-medium text-[var(--color-ink)]">制造业聚焦</p>
                            <p className="mt-1">{company.manufacturingFocus}</p>
                          </div>
                          <div className="rounded-[1rem] border border-[var(--color-line)] bg-white/70 px-4 py-3">
                            <p className="font-medium text-[var(--color-ink)]">证据强度</p>
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
          </section>
        ))}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

export type DashboardSkeletonView =
  | "overview"
  | "leads"
  | "companies"
  | "competitors"
  | "follow-ups"
  | "sources";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`radar-skeleton-shimmer ${className}`} />;
}

function SkeletonCard({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[1.5rem] border border-(--color-line) bg-(--color-card) p-5 shadow-[0_16px_44px_rgba(69,49,28,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-[1.15rem] border border-(--color-line) bg-white/55 px-4 py-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex gap-2">
                <SkeletonBlock className="h-6 w-16 rounded-full" />
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-5 w-7/12 rounded-full" />
              <SkeletonBlock className="h-4 w-full rounded-full" />
              <SkeletonBlock className="h-4 w-9/12 rounded-full" />
            </div>
            <SkeletonBlock className="h-9 w-16 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OverviewSkeletonContent() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(20rem,0.84fr)]">
        <SkeletonCard className="min-h-[28rem]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <SkeletonBlock className="h-7 w-48 rounded-full" />
            <SkeletonBlock className="h-8 w-24 rounded-full" />
          </div>
          <SkeletonRows count={5} />
        </SkeletonCard>

        <div className="grid gap-4">
          <SkeletonCard>
            <div className="space-y-4">
              <SkeletonBlock className="h-7 w-40 rounded-full" />
              <SkeletonRows count={3} />
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[1.15rem] border border-(--color-line) bg-white/50 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <SkeletonBlock className="h-11 w-11 rounded-2xl" />
                    <SkeletonBlock className="h-7 w-12 rounded-full" />
                  </div>
                  <SkeletonBlock className="mt-4 h-5 w-28 rounded-full" />
                  <SkeletonBlock className="mt-3 h-4 w-full rounded-full" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SkeletonCard>
          <SkeletonRows count={4} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonRows count={4} />
        </SkeletonCard>
      </div>
    </div>
  );
}

function LeadsSkeletonContent() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="min-h-[32rem]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <SkeletonBlock className="h-8 w-56 rounded-full" />
          <SkeletonBlock className="h-9 w-24 rounded-full" />
        </div>
        <SkeletonRows count={6} />
      </SkeletonCard>

      <SkeletonCard>
        <div className="mb-5 flex items-center justify-between gap-4">
          <SkeletonBlock className="h-8 w-48 rounded-full" />
          <SkeletonBlock className="h-7 w-32 rounded-full" />
        </div>
        <SkeletonRows count={4} />
      </SkeletonCard>
    </div>
  );
}

function CompaniesSkeletonContent() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(19rem,0.76fr)_minmax(0,1.24fr)]">
      <SkeletonCard>
        <div className="mb-5 flex items-center justify-between gap-4">
          <SkeletonBlock className="h-7 w-32 rounded-full" />
          <SkeletonBlock className="h-9 w-44 rounded-full" />
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} className="p-4 shadow-none">
              <SkeletonBlock className="h-4 w-20 rounded-full" />
              <SkeletonBlock className="mt-3 h-7 w-14 rounded-full" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonRows count={5} />
      </SkeletonCard>

      <div className="space-y-5">
        <SkeletonCard>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <SkeletonBlock className="h-6 w-16 rounded-full" />
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-9 w-72 max-w-full rounded-full" />
              <SkeletonBlock className="h-4 w-[28rem] max-w-full rounded-full" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} className="p-4 shadow-none">
                <SkeletonBlock className="h-4 w-24 rounded-full" />
                <SkeletonBlock className="mt-3 h-8 w-16 rounded-full" />
              </SkeletonCard>
            ))}
          </div>
        </SkeletonCard>
        <div className="grid gap-5 xl:grid-cols-2">
          <SkeletonCard>
            <SkeletonRows count={4} />
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonRows count={4} />
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

function CompetitorsSkeletonContent() {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
      <SkeletonCard>
        <div className="mb-5 flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        <SkeletonRows count={5} />
      </SkeletonCard>

      <div className="grid gap-4">
        <SkeletonCard>
          <SkeletonBlock className="h-12 w-full rounded-[1rem]" />
          <div className="mt-4 flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-8 w-24 shrink-0 rounded-full" />
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="relative h-[31rem] overflow-hidden rounded-[1.35rem] border border-(--color-line) bg-[linear-gradient(180deg,rgba(233,243,250,0.86),rgba(224,214,197,0.92))]">
            <SkeletonBlock className="absolute left-4 top-4 h-16 w-8 rounded-xl" />
            <SkeletonBlock className="absolute left-[46%] top-[38%] h-4 w-4 rounded-full" />
            <SkeletonBlock className="absolute left-[56%] top-[45%] h-4 w-4 rounded-full" />
            <SkeletonBlock className="absolute left-[51%] top-[56%] h-4 w-4 rounded-full" />
          </div>
          <SkeletonBlock className="mt-4 h-4 w-72 max-w-full rounded-full" />
        </SkeletonCard>
      </div>
    </div>
  );
}

function SimpleListSkeletonContent() {
  return (
    <SkeletonCard className="min-h-[24rem]">
      <div className="mb-5 space-y-3">
        <SkeletonBlock className="h-8 w-56 rounded-full" />
        <SkeletonBlock className="h-4 w-[32rem] max-w-full rounded-full" />
      </div>
      <SkeletonRows count={5} />
    </SkeletonCard>
  );
}

function DashboardSkeletonContent({ view }: { view: DashboardSkeletonView }) {
  switch (view) {
    case "overview":
      return <OverviewSkeletonContent />;
    case "leads":
      return <LeadsSkeletonContent />;
    case "companies":
      return <CompaniesSkeletonContent />;
    case "competitors":
      return <CompetitorsSkeletonContent />;
    case "follow-ups":
    case "sources":
    default:
      return <SimpleListSkeletonContent />;
  }
}

export function DashboardLoadingSkeleton({ view }: { view: DashboardSkeletonView }) {
  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-ink)">
      <div className="absolute inset-x-0 top-0 -z-10 h-136 bg-[radial-gradient(circle_at_top_left,rgba(182,107,58,0.24),transparent_48%),radial-gradient(circle_at_75%_18%,rgba(53,97,108,0.18),transparent_42%)]" />

      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        <section className="overflow-visible rounded-4xl border border-(--color-line) bg-[linear-gradient(135deg,rgba(255,251,244,0.92),rgba(245,235,221,0.92))] p-6 shadow-[0_25px_70px_rgba(69,49,28,0.12)] sm:p-8 lg:p-10">
          <div className="space-y-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
              <div className="min-w-0 space-y-4">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="h-7 w-7 rounded-full" />
                  <SkeletonBlock className="h-4 w-40 rounded-full" />
                </div>
                <div className="space-y-3">
                  <SkeletonBlock className="h-10 w-[32rem] max-w-full rounded-full" />
                  <SkeletonBlock className="h-5 w-[48rem] max-w-full rounded-full" />
                  <SkeletonBlock className="h-5 w-[36rem] max-w-full rounded-full" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-10 w-24 rounded-full" />
                  ))}
                </div>
              </div>

              <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[27rem] xl:grid-cols-1">
                <SkeletonCard className="p-4">
                  <SkeletonBlock className="h-5 w-48 rounded-full" />
                  <SkeletonBlock className="mt-3 h-4 w-32 rounded-full" />
                </SkeletonCard>
                <SkeletonBlock className="h-11 w-40 rounded-full" />
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.06fr)_minmax(18rem,0.94fr)]">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <SkeletonCard key={index}>
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                    <SkeletonBlock className="mt-4 h-9 w-16 rounded-full" />
                    <SkeletonBlock className="mt-4 h-4 w-full rounded-full" />
                    <SkeletonBlock className="mt-2 h-4 w-8/12 rounded-full" />
                  </SkeletonCard>
                ))}
              </div>
              <SkeletonCard>
                <SkeletonBlock className="h-6 w-28 rounded-full" />
                <SkeletonBlock className="mt-4 h-4 w-full rounded-full" />
                <SkeletonBlock className="mt-2 h-4 w-10/12 rounded-full" />
              </SkeletonCard>
            </div>
          </div>
        </section>

        <DashboardSkeletonContent view={view} />
      </div>
    </main>
  );
}

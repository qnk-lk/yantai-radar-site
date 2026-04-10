"use client";

import dynamic from "next/dynamic";

const HomePageClient = dynamic(() => import("./_components/home-page-client"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(182,107,58,0.24),_transparent_48%),radial-gradient(circle_at_75%_18%,_rgba(53,97,108,0.18),_transparent_42%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
        <section className="overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-[linear-gradient(135deg,rgba(255,251,244,0.92),rgba(245,235,221,0.92))] p-6 shadow-[0_25px_70px_rgba(69,49,28,0.12)] sm:p-8 lg:p-10">
          <div className="h-[18rem] animate-pulse rounded-[1.5rem] bg-white/60" />
        </section>
      </div>
    </main>
  ),
});

export default function Home() {
  return <HomePageClient />;
}

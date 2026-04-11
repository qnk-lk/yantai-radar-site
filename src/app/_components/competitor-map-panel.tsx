"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { formatAdminName } from "./admin-labels";
import i18n from "./i18n";
import {
  type CompetitorBaseline,
  type ChinaAdminIndex,
  type CompetitorCompany,
  getCompetitorKey,
} from "./competitor-types";

const CompetitorMapView = dynamic(
  () => import("./competitor-map-view").then((module) => module.CompetitorMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-124 items-center justify-center bg-[linear-gradient(180deg,#f6f1e7_0%,#ece0cf_100%)] text-sm text-(--color-muted)">
        {i18n.t("map.loading")}
      </div>
    ),
  }
);

function findAdminLocation(adminIndex: ChinaAdminIndex, cityName: string) {
  const cityCandidates = [cityName, `${cityName}市`];

  for (const [provinceName, cities] of Object.entries(adminIndex)) {
    for (const candidate of cityCandidates) {
      if (candidate in cities) {
        return {
          provinceName,
          cityName: candidate,
          counties: cities[candidate] ?? [],
        };
      }
    }
  }

  return null;
}

export function CompetitorMapPanel({
  baseline,
  adminIndex,
  companies,
  status,
  note,
  updatedAt,
  selectedKey,
  onSelect,
}: {
  baseline: CompetitorBaseline;
  adminIndex: ChinaAdminIndex;
  companies: CompetitorCompany[];
  status: string;
  note: string;
  updatedAt: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { t, i18n } = useTranslation();

  const selectedCompany = useMemo(
    () => companies.find((company) => getCompetitorKey(company) === selectedKey) ?? null,
    [companies, selectedKey]
  );

  const selectedLocation = useMemo(
    () => (selectedCompany ? findAdminLocation(adminIndex, selectedCompany.city) : null),
    [adminIndex, selectedCompany]
  );

  return (
    <div className="space-y-4 rounded-[1.7rem] border border-(--color-line) bg-white/82 p-5 shadow-[0_18px_50px_rgba(69,49,28,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-(--color-accent)">
            {t("map.competitor_map")}
          </p>
          <h3 className="text-xl font-semibold text-(--color-ink)">{t("map.title")}</h3>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[1.8rem] border border-(--color-line)">
        {!companies.length ? (
          <div className="pointer-events-none absolute left-4 top-4 z-500 rounded-full border border-white/70 bg-[rgba(255,250,241,0.94)] px-3 py-1 text-xs font-medium text-(--color-muted) shadow-[0_10px_24px_rgba(69,49,28,0.08)]">
            {t("map.no_coordinates")}
          </div>
        ) : null}
        <CompetitorMapView
          baseline={baseline}
          companies={companies}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      </div>

      <div className="grid gap-3">
        <div className="rounded-[1.2rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-3 text-sm leading-7 text-(--color-ink)/82">
          {selectedCompany
            ? t("map.linked_to", {
                name: selectedCompany.companyName,
                path: selectedLocation
                  ? `${formatAdminName(selectedLocation.provinceName, i18n.resolvedLanguage)} / ${formatAdminName(selectedLocation.cityName, i18n.resolvedLanguage)}`
                  : `${formatAdminName("中国", i18n.resolvedLanguage)} / ${formatAdminName(selectedCompany.city, i18n.resolvedLanguage)}`,
              })
            : companies.length
              ? status
              : t("map.no_data")}
        </div>

        <div className="rounded-[1.2rem] border border-(--color-line) bg-white px-4 py-3 text-xs leading-6 text-(--color-muted)">
          <p>{note}</p>
          <p className="mt-1">{t("map.updated_at", { value: updatedAt })}</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
      <div className="flex h-[31rem] items-center justify-center bg-[linear-gradient(180deg,#f6f1e7_0%,#ece0cf_100%)] text-sm text-[var(--color-muted)]">
        正在加载地图底图...
      </div>
    ),
  }
);

function countByCity(companies: CompetitorCompany[]) {
  return companies.reduce(
    (result, company) => {
      result[company.city] = (result[company.city] ?? 0) + 1;
      return result;
    },
    {} as Record<string, number>
  );
}

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
  const { t } = useTranslation();
  const cityCounts = useMemo(() => countByCity(companies), [companies]);

  const selectedCompany = useMemo(
    () => companies.find((company) => getCompetitorKey(company) === selectedKey) ?? null,
    [companies, selectedKey]
  );

  const selectedLocation = useMemo(
    () => (selectedCompany ? findAdminLocation(adminIndex, selectedCompany.city) : null),
    [adminIndex, selectedCompany]
  );

  return (
    <div className="space-y-4 rounded-[1.7rem] border border-[var(--color-line)] bg-white/82 p-5 shadow-[0_18px_50px_rgba(69,49,28,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)]">
            {t("map.competitorMap")}
          </p>
          <h3 className="text-xl font-semibold text-[var(--color-ink)]">{t("map.title")}</h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-card-soft)] px-3 py-2 text-xs font-medium text-[var(--color-muted)]">
            {t("map.yantaiCount", { count: cityCounts["烟台"] ?? 0 })}
          </div>
          <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-card-soft)] px-3 py-2 text-xs font-medium text-[var(--color-muted)]">
            {t("map.qingdaoCount", { count: cityCounts["青岛"] ?? 0 })}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[1.8rem] border border-[var(--color-line)]">
        {!companies.length ? (
          <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-full border border-white/70 bg-[rgba(255,250,241,0.94)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-[0_10px_24px_rgba(69,49,28,0.08)]">
            {t("map.noCoordinates")}
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
        <div className="rounded-[1.2rem] border border-[var(--color-line)] bg-[var(--color-card-soft)] px-4 py-3 text-sm leading-7 text-[var(--color-ink)]/82">
          {selectedCompany ? (
            t("map.linkedTo", {
                name: selectedCompany.companyName,
                path: selectedLocation
                  ? `${selectedLocation.provinceName} / ${selectedLocation.cityName}`
                  : `中国 / ${selectedCompany.city}`,
              })
          ) : companies.length ? (
            status
          ) : (
            t("map.noData")
          )}
        </div>

        <div className="rounded-[1.2rem] border border-[var(--color-line)] bg-white px-4 py-3 text-xs leading-6 text-[var(--color-muted)]">
          <p>{note}</p>
          <p className="mt-1">更新时间：{updatedAt}</p>
        </div>
      </div>
    </div>
  );
}

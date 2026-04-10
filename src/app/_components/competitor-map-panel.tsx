"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { ChinaData } from "china-map-geojson";
import type { EChartsOption } from "echarts";
import { MapChart, EffectScatterChart } from "echarts/charts";
import { GeoComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import {
  type ChinaAdminIndex,
  type CompetitorCompany,
  getCompetitorKey,
} from "./competitor-types";

const ReactECharts = dynamic(() => import("echarts-for-react/lib/core"), {
  ssr: false,
});

echarts.use([GeoComponent, TooltipComponent, MapChart, EffectScatterChart, CanvasRenderer]);

if (!echarts.getMap("china")) {
  echarts.registerMap("china", ChinaData as never);
}

type MapPoint = {
  key: string;
  name: string;
  value: [number, number, number];
  company: CompetitorCompany;
  provinceName: string | null;
  countyCount: number;
};

type MapViewCarrier = {
  getOption: () => {
    geo?: Array<{
      center?: [number, number];
      zoom?: number;
    }>;
  };
};

const CITY_COORDINATES: Record<string, { lon: number; lat: number }> = {
  烟台: { lon: 121.4479, lat: 37.4638 },
  青岛: { lon: 120.3826, lat: 36.0671 },
};

const CITY_OFFSETS: Record<string, Array<{ lon: number; lat: number }>> = {
  烟台: [
    { lon: 0, lat: 0 },
    { lon: 0.18, lat: -0.14 },
    { lon: -0.15, lat: 0.12 },
  ],
  青岛: [
    { lon: 0, lat: 0 },
    { lon: 0.18, lat: -0.12 },
    { lon: -0.16, lat: 0.14 },
    { lon: 0.15, lat: 0.18 },
    { lon: -0.15, lat: -0.14 },
    { lon: 0.28, lat: 0.04 },
  ],
};

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
  adminIndex,
  companies,
  status,
  note,
  updatedAt,
  selectedKey,
  onSelect,
}: {
  adminIndex: ChinaAdminIndex;
  companies: CompetitorCompany[];
  status: string;
  note: string;
  updatedAt: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [mapView, setMapView] = useState<{
    center: [number, number];
    zoom: number;
  }>({
    center: [104.5, 35.8],
    zoom: 1.05,
  });

  const cityCounts = useMemo(() => countByCity(companies), [companies]);

  const adminSummary = useMemo(() => {
    const provinces = Object.keys(adminIndex);
    const cities = provinces.reduce((count, provinceName) => {
      return count + Object.keys(adminIndex[provinceName] ?? {}).length;
    }, 0);
    const counties = provinces.reduce((count, provinceName) => {
      return (
        count +
        Object.values(adminIndex[provinceName] ?? {}).reduce((sum, items) => sum + items.length, 0)
      );
    }, 0);

    return {
      provinces: provinces.length,
      cities,
      counties,
    };
  }, [adminIndex]);

  const points = useMemo<MapPoint[]>(() => {
    const counters = new Map<string, number>();

    return companies.map((company) => {
      const city = company.city in CITY_COORDINATES ? company.city : "青岛";
      const base = CITY_COORDINATES[city];
      const index = counters.get(city) ?? 0;
      const offset = CITY_OFFSETS[city][index] ?? { lon: 0, lat: 0 };
      const location = findAdminLocation(adminIndex, company.city);
      counters.set(city, index + 1);

      return {
        key: getCompetitorKey(company),
        name: company.companyName,
        value: [base.lon + offset.lon, base.lat + offset.lat, company.rank],
        company,
        provinceName: location?.provinceName ?? null,
        countyCount: location?.counties.length ?? 0,
      };
    });
  }, [adminIndex, companies]);

  const selectedCompany = useMemo(
    () => companies.find((company) => getCompetitorKey(company) === selectedKey) ?? null,
    [companies, selectedKey]
  );

  const selectedLocation = useMemo(
    () => (selectedCompany ? findAdminLocation(adminIndex, selectedCompany.city) : null),
    [adminIndex, selectedCompany]
  );

  function syncMapView(chart: MapViewCarrier) {
    const option = chart.getOption();
    const geo = option.geo?.[0];

    const center = geo?.center;

    if (center && typeof geo.zoom === "number") {
      setMapView((currentView) => {
        const nextView = {
          center: [Number(center[0]), Number(center[1])] as [number, number],
          zoom: Number(geo.zoom),
        };

        if (
          currentView.center[0] === nextView.center[0] &&
          currentView.center[1] === nextView.center[1] &&
          currentView.zoom === nextView.zoom
        ) {
          return currentView;
        }

        return nextView;
      });
    }
  }

  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 500,
      animationEasing: "cubicOut",
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        enterable: false,
        backgroundColor: "rgba(17, 16, 15, 0.92)",
        borderWidth: 0,
        padding: [10, 14],
        textStyle: {
          color: "#fffaf1",
          fontSize: 12,
          fontWeight: 500,
        },
        formatter: (params) => {
          const data = (params as { data?: MapPoint }).data;
          if (!data) {
            const regionName = (params as { name?: string }).name;
            return regionName
              ? `<div style="white-space:nowrap;">${regionName}</div>`
              : "";
          }

          return `<div style="white-space:nowrap;">${data.company.companyName} · ${
            data.provinceName ?? "中国"
          } / ${data.company.city}市 · ${data.countyCount} 个区县</div>`;
        },
      },
      geo: {
        map: "china",
        roam: true,
        scaleLimit: {
          min: 1,
          max: 8,
        },
        center: mapView.center,
        zoom: mapView.zoom,
        layoutCenter: ["50%", "54%"],
        layoutSize: "112%",
        selectedMode: false,
        silent: false,
        itemStyle: {
          areaColor: "#f6ede0",
          borderColor: "#b8a286",
          borderWidth: 1,
          shadowColor: "rgba(104, 78, 47, 0.1)",
          shadowBlur: 12,
        },
        emphasis: {
          disabled: true,
          itemStyle: {
            areaColor: "#ead8be",
          },
        },
        regions: [
          {
            name: "山东",
            itemStyle: {
              areaColor: "#edc4af",
              borderColor: "#a24d29",
              borderWidth: 1.2,
            },
          },
        ],
      },
      series: [
        {
          name: "同行公司",
          type: "effectScatter",
          coordinateSystem: "geo",
          rippleEffect: {
            brushType: "stroke",
            scale: 4.2,
          },
          symbol: "circle",
          showEffectOn: "render",
          itemStyle: {
            color: "#cc3f25",
            shadowBlur: 18,
            shadowColor: "rgba(204, 63, 37, 0.35)",
          },
          emphasis: {
            scale: true,
            itemStyle: {
              color: "#a92212",
            },
          },
          symbolSize: (value, params) => {
            const data = params.data as MapPoint;
            return data.key === selectedKey ? 16 : 11;
          },
          data: points,
          zlevel: 3,
        },
      ],
    }),
    [mapView.center, mapView.zoom, points, selectedKey]
  );

  const events = useMemo(
    () => ({
      georoam: (
        _params: unknown,
        chart: unknown
      ) => {
        syncMapView(chart as MapViewCarrier);
      },
      click: (params: { data?: MapPoint }, chart: unknown) => {
        syncMapView(chart as MapViewCarrier);
        if (params.data?.key) {
          onSelect(params.data.key);
        }
      },
    }),
    [onSelect]
  );

  return (
    <div className="space-y-4 rounded-[1.7rem] border border-[var(--color-line)] bg-white/82 p-5 shadow-[0_18px_50px_rgba(69,49,28,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)]">
            Competitor Map
          </p>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-[var(--color-ink)]">烟台 / 青岛同行分布</h3>
            <p className="text-sm leading-7 text-[var(--color-muted)]">
              默认中国视角，滚轮放大到山东半岛，左键拖拽移动，悬浮红点查看一行信息。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-card-soft)] px-3 py-2 text-xs font-medium text-[var(--color-muted)]">
            烟台 {cityCounts["烟台"] ?? 0} 家
          </div>
          <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-card-soft)] px-3 py-2 text-xs font-medium text-[var(--color-muted)]">
            青岛 {cityCounts["青岛"] ?? 0} 家
          </div>
          <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-card-soft)] px-3 py-2 text-xs font-medium text-[var(--color-muted)]">
            行政区 JSON {adminSummary.provinces}/{adminSummary.cities}/{adminSummary.counties}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[1.8rem] border border-[var(--color-line)] bg-[linear-gradient(180deg,#eef5fa_0%,#ddeaf5_42%,#efe3d4_43%,#efe6d8_100%)]"
        onWheelCapture={(event) => {
          event.preventDefault();
        }}
      >
        <div className="pointer-events-none absolute" />
        <ReactECharts
          echarts={echarts}
          option={option}
          notMerge
          lazyUpdate
          onChartReady={(instance) => syncMapView(instance as unknown as MapViewCarrier)}
          onEvents={events}
          style={{ height: "31rem", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>

      <div className="grid gap-3">
        <div className="rounded-[1.2rem] border border-[var(--color-line)] bg-[var(--color-card-soft)] px-4 py-3 text-sm leading-7 text-[var(--color-ink)]/82">
          {selectedCompany ? (
            <>
              已联动到 <span className="font-semibold text-[var(--color-ink)]">{selectedCompany.companyName}</span>
              ，下方名片已展开；当前行政区路径为{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                {selectedLocation
                  ? `${selectedLocation.provinceName} / ${selectedLocation.cityName}`
                  : `中国 / ${selectedCompany.city}市`}
              </span>
              。
            </>
          ) : (
            status
          )}
        </div>
        <div className="rounded-[1.2rem] border border-[var(--color-line)] bg-white px-4 py-3 text-xs leading-6 text-[var(--color-muted)]">
          <p>
            本地 JSON：`/china-admin-divisions.json`，含 {adminSummary.provinces} 个省级、{" "}
            {adminSummary.cities} 个地级、{adminSummary.counties} 个区县级条目。
          </p>
          {selectedLocation ? (
            <p className="mt-1">
              {selectedLocation.cityName} 当前含 {selectedLocation.counties.length} 个区县级单元。
            </p>
          ) : null}
          <p>{note}</p>
          <p className="mt-1">更新时间：{updatedAt}</p>
        </div>
      </div>
    </div>
  );
}

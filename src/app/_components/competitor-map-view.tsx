"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import L, { type DivIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

import {
  type CompetitorBaseline,
  type CompetitorCompany,
  getCompetitorKey,
} from "./competitor-types";
import { formatAdminName, getServiceFitLevel } from "./admin-labels";

type CompanyMarker = {
  key: string;
  company: CompetitorCompany;
  lat: number;
  lon: number;
};

type BaselineMarker = {
  companyName: string;
  serviceScopeSummary: string;
  lat: number;
  lon: number;
};

const DEFAULT_CENTER: [number, number] = [35.8617, 104.1954];
const DEFAULT_ZOOM = 5;
const TILE_ERROR_THRESHOLD = 4;

const TILE_SOURCES = [
  {
    key: "amap-road",
    attribution:
      '&copy; <a href="https://www.amap.com/" target="_blank" rel="noreferrer">Amap</a>',
    url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    subdomains: ["1", "2", "3", "4"],
  },
  {
    key: "osm",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
  },
] as const;

const LIDAO_CITIC_TOWER_COORDINATES = {
  lat: 37.5635523,
  lon: 121.2373543,
};

function createCompanyIcon(selected: boolean): DivIcon {
  return L.divIcon({
    className: "competitor-marker-shell",
    html: `<span class="competitor-marker${selected ? " is-selected" : ""}"></span>`,
    iconSize: selected ? [24, 24] : [20, 20],
    iconAnchor: selected ? [12, 12] : [10, 10],
  });
}

function createBaselineIcon(): DivIcon {
  return L.divIcon({
    className: "competitor-marker-shell",
    html: '<span class="competitor-marker competitor-marker-baseline"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function normalizeCoordinate(value: number | string | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildMarkers(companies: CompetitorCompany[]) {
  return companies.flatMap((company) => {
    const lat = normalizeCoordinate(company.latitude);
    const lon = normalizeCoordinate(company.longitude);

    if (lat === null || lon === null) {
      return [];
    }

    return [
      {
        key: getCompetitorKey(company),
        company,
        lat,
        lon,
      },
    ];
  });
}

function buildBaselineMarker(baseline: CompetitorBaseline): BaselineMarker {
  return {
    companyName: baseline.companyName,
    serviceScopeSummary: baseline.serviceScopeSummary,
    lat: LIDAO_CITIC_TOWER_COORDINATES.lat,
    lon: LIDAO_CITIC_TOWER_COORDINATES.lon,
  };
}

function SelectedMarkerFollower({ marker }: { marker: CompanyMarker | null }) {
  const map = useMap();

  useEffect(() => {
    if (!marker) {
      return;
    }

    const currentZoom = map.getZoom();
    const targetZoom = currentZoom < 9 ? 9 : currentZoom;

    map.flyTo([marker.lat, marker.lon], targetZoom, {
      animate: true,
      duration: 0.65,
    });
  }, [map, marker]);

  return null;
}

function MapViewportRefresher() {
  const map = useMap();

  useEffect(() => {
    let frameId = 0;
    let followUpFrameId = 0;

    const invalidate = () => {
      map.invalidateSize({ pan: false, debounceMoveend: true });
    };

    frameId = window.requestAnimationFrame(() => {
      invalidate();
      followUpFrameId = window.requestAnimationFrame(invalidate);
    });

    const handleResize = () => invalidate();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        invalidate();
      }
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => invalidate())
        : null;

    resizeObserver?.observe(map.getContainer());

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(followUpFrameId);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver?.disconnect();
    };
  }, [map]);

  return null;
}

function MapInteractionTracker() {
  useMapEvents({
    click() {
      return;
    },
  });

  return null;
}

function ResilientTileLayer() {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [, setErrorCount] = useState(0);
  const source = TILE_SOURCES[sourceIndex] ?? TILE_SOURCES[0];

  return (
    <TileLayer
      key={source.key}
      attribution={source.attribution}
      url={source.url}
      subdomains={[...source.subdomains]}
      eventHandlers={{
        tileerror: () => {
          setErrorCount((current) => {
            const next = current + 1;

            if (next >= TILE_ERROR_THRESHOLD && sourceIndex < TILE_SOURCES.length - 1) {
              startTransition(() => {
                setSourceIndex((currentIndex) =>
                  Math.min(currentIndex + 1, TILE_SOURCES.length - 1)
                );
              });
              return 0;
            }

            return next;
          });
        },
        load: () => {
          setErrorCount(0);
        },
      }}
    />
  );
}

export function CompetitorMapView({
  baseline,
  companies,
  selectedKey,
  onSelect,
}: {
  baseline: CompetitorBaseline;
  companies: CompetitorCompany[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const markers = useMemo(() => buildMarkers(companies), [companies]);
  const baselineMarker = useMemo(() => buildBaselineMarker(baseline), [baseline]);
  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.key === selectedKey) ?? null,
    [markers, selectedKey]
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={4}
      maxZoom={18}
      zoomControl
      scrollWheelZoom
      doubleClickZoom
      dragging
      className="competitor-leaflet-map"
      preferCanvas={false}
    >
      <ResilientTileLayer />

      <MapInteractionTracker />
      <MapViewportRefresher />
      <SelectedMarkerFollower marker={selectedMarker} />

      <Marker position={[baselineMarker.lat, baselineMarker.lon]} icon={createBaselineIcon()}>
        <Tooltip
          direction="top"
          offset={[0, -10]}
          opacity={1}
          className="competitor-map-tooltip competitor-map-tooltip-baseline"
        >
          <span>
            {baselineMarker.companyName} · {t("map.baseline_marker")}
          </span>
        </Tooltip>
      </Marker>

      {markers.map((marker) => {
        const fitLevel = getServiceFitLevel(marker.company.serviceFit);
        const fitLabel =
          fitLevel === "high"
            ? t("deck.fit_levels.high")
            : fitLevel === "medium"
              ? t("deck.fit_levels.medium")
              : fitLevel === "low"
                ? t("deck.fit_levels.low")
                : marker.company.serviceFit;

        return (
          <Marker
            key={marker.key}
            position={[marker.lat, marker.lon]}
            icon={createCompanyIcon(marker.key === selectedKey)}
            eventHandlers={{
              click: () => onSelect(marker.key),
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -10]}
              opacity={1}
              className="competitor-map-tooltip"
            >
              <span>
                {t("map.competitor_tooltip", {
                  name: marker.company.companyName,
                  city: formatAdminName(marker.company.city, i18n.resolvedLanguage),
                  fit: fitLabel,
                })}
              </span>
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

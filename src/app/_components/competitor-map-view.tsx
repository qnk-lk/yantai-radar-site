"use client";

import { useEffect, useMemo } from "react";
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

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  烟台: { lat: 37.4638, lon: 121.4479 },
  青岛: { lat: 36.0671, lon: 120.3826 },
};

const LIDAO_CITIC_TOWER_COORDINATES = {
  lat: 37.5635523,
  lon: 121.2373543,
};

const CITY_OFFSETS: Record<string, Array<{ lat: number; lon: number }>> = {
  烟台: [
    { lat: 0, lon: 0 },
    { lat: -0.06, lon: 0.1 },
    { lat: 0.08, lon: -0.1 },
  ],
  青岛: [
    { lat: 0, lon: 0 },
    { lat: -0.07, lon: 0.1 },
    { lat: 0.08, lon: -0.08 },
    { lat: 0.12, lon: 0.06 },
    { lat: -0.11, lon: -0.09 },
    { lat: 0.02, lon: 0.18 },
  ],
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

function buildMarkers(companies: CompetitorCompany[]) {
  const cityCounters = new Map<string, number>();

  return companies.flatMap((company) => {
    const city = company.city in CITY_COORDINATES ? company.city : null;

    if (!city) {
      return [];
    }

    const base = CITY_COORDINATES[city];
    const index = cityCounters.get(city) ?? 0;
    const offset = CITY_OFFSETS[city][index] ?? { lat: 0, lon: 0 };

    cityCounters.set(city, index + 1);

    return [
      {
        key: getCompetitorKey(company),
        company,
        lat: base.lat + offset.lat,
        lon: base.lon + offset.lon,
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

function MapInteractionTracker() {
  useMapEvents({
    click() {
      return;
    },
  });

  return null;
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapInteractionTracker />
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

      {markers.map((marker) => (
        <Marker
          key={marker.key}
          position={[marker.lat, marker.lon]}
          icon={createCompanyIcon(marker.key === selectedKey)}
          eventHandlers={{
            click: () => onSelect(marker.key),
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1} className="competitor-map-tooltip">
            <span>
              {t("map.competitor_tooltip", {
                name: marker.company.companyName,
                city: formatAdminName(marker.company.city, i18n.resolvedLanguage),
                fit:
                  getServiceFitLevel(marker.company.serviceFit) !== null
                    ? t(`deck.fit_levels.${getServiceFitLevel(marker.company.serviceFit)}`)
                    : marker.company.serviceFit,
              })}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}

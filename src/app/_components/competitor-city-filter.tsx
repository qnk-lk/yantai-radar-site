"use client";

import { useMemo, useState } from "react";
import Cascader from "rc-cascader";
import { FiChevronDown, FiX } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import chinaProvinceCityAreas from "china-division/dist/pca.json";

import { formatAdminName, formatSelectedAreaName } from "./admin-labels";
import { type ChinaAdminIndex } from "./competitor-types";

type CityFilterOption = {
  key: string;
  label: string;
  value: string;
  children?: CityFilterOption[];
  provinceName?: string;
  cityName?: string;
  displayName?: string;
  selection?: SelectedCity;
  leafSelections?: SelectedCity[];
};

export type SelectedCity = {
  key: string;
  provinceName: string;
  cityName: string;
  displayName: string;
};

function normalizeProvinceName(value: string) {
  return value.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/u, "");
}

function normalizeCityName(value: string, provinceName: string) {
  if (value === "市辖区" || value === "县" || value === "省直辖县级行政区划") {
    return normalizeProvinceName(provinceName);
  }

  return value.replace(/(特别行政区|自治州|地区|盟|林区|新区|市)$/u, "");
}

function buildBaseCityIndex(adminIndex: ChinaAdminIndex) {
  const merged = new Map<string, Map<string, Set<string>>>();

  function appendSource(source: Record<string, Record<string, string[]>>) {
    for (const [provinceName, cities] of Object.entries(source)) {
      const provinceMap = merged.get(provinceName) ?? new Map<string, Set<string>>();

      for (const [rawCityName, rawDistricts] of Object.entries(cities)) {
        const cityName = normalizeCityName(rawCityName, provinceName);
        const districtSet = provinceMap.get(cityName) ?? new Set<string>();

        for (const districtName of rawDistricts) {
          districtSet.add(districtName);
        }

        provinceMap.set(cityName, districtSet);
      }

      merged.set(provinceName, provinceMap);
    }
  }

  appendSource(chinaProvinceCityAreas);
  appendSource(adminIndex);

  return merged;
}

function buildCityOptions(adminIndex: ChinaAdminIndex): CityFilterOption[] {
  return Array.from(buildBaseCityIndex(adminIndex).entries())
    .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"))
    .map(([provinceName, cities]) => {
      const provinceKey = provinceName;
      const cityOptions = Array.from(cities.entries())
        .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"))
        .map(([cityName, districts]) => {
          const cityKey = `${provinceKey}/${cityName}`;
          const districtOptions = Array.from(districts)
            .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
            .map((districtName) => {
              const districtKey = `${cityKey}/${districtName}`;

              return {
                key: districtKey,
                label: districtName,
                value: districtName,
                provinceName,
                cityName,
                displayName: districtName,
                selection: {
                  key: districtKey,
                  provinceName,
                  cityName,
                  displayName: districtName,
                },
              } satisfies CityFilterOption;
            });

          return {
            key: cityKey,
            label: cityName,
            value: cityName,
            provinceName,
            cityName,
            displayName: cityName,
            selection: {
              key: cityKey,
              provinceName,
              cityName,
              displayName: cityName,
            },
            children: districtOptions.length ? districtOptions : undefined,
            leafSelections: districtOptions.length
              ? districtOptions
                  .map((district) => district.selection)
                  .filter((district): district is SelectedCity => Boolean(district))
              : [
                  {
                    key: cityKey,
                    provinceName,
                    cityName,
                    displayName: cityName,
                  },
                ],
          } satisfies CityFilterOption;
        });

      return {
        key: provinceKey,
        label: provinceName,
        value: provinceName,
        provinceName,
        children: cityOptions,
        leafSelections: cityOptions.flatMap((city) => city.leafSelections ?? []),
      } satisfies CityFilterOption;
    });
}

function uniqueSelectedCities(cities: SelectedCity[]) {
  return Array.from(new Map(cities.map((city) => [city.key, city])).values());
}

export function CompetitorCityFilter({
  adminIndex,
  selectedCities,
  onChangeCities,
  onRemoveCity,
  onOpenChange,
}: {
  adminIndex: ChinaAdminIndex;
  selectedCities: SelectedCity[];
  onChangeCities: (cities: SelectedCity[]) => void;
  onRemoveCity: (key: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const resolvedLanguage = i18n.resolvedLanguage;
  const options = useMemo(() => buildCityOptions(adminIndex), [adminIndex]);
  const [isOpen, setIsOpen] = useState(false);
  const selectedValue = useMemo(
    () => selectedCities.map((city) => city.key.split("/")),
    [selectedCities]
  );
  const summaryCount = selectedCities.length;

  function openDropdown() {
    setIsOpen(true);
    onOpenChange?.(true);
  }

  function closeDropdown() {
    setIsOpen(false);
    onOpenChange?.(false);
  }

  function handleCascaderOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function getLeafSelections(option: CityFilterOption | undefined) {
    if (!option) {
      return [];
    }

    if (option.leafSelections?.length) {
      return option.leafSelections;
    }

    return option.selection ? [option.selection] : [];
  }

  function handleCascaderChange(_: string[][], optionPaths: CityFilterOption[][]) {
    const nextSelectedCities = uniqueSelectedCities(
      optionPaths.flatMap((optionPath) => getLeafSelections(optionPath.at(-1)))
    );

    onChangeCities(nextSelectedCities);
  }

  return (
    <div className="space-y-3 rounded-3xl border border-(--color-line) bg-white/80 p-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-(--color-muted)">{t("city_filter.label")}</p>

        <div className="relative min-w-0">
          <Cascader<CityFilterOption, "value", true>
            options={options}
            value={selectedValue}
            checkable
            open={isOpen}
            expandTrigger="click"
            showCheckedStrategy={Cascader.SHOW_CHILD}
            dropdownPrefixCls="competitor-city-cascader"
            dropdownClassName="competitor-city-cascader-popup"
            dropdownMenuColumnStyle={{}}
            placement="bottomRight"
            onOpenChange={handleCascaderOpenChange}
            onChange={handleCascaderChange}
            optionRender={(option) => formatAdminName(option.label, resolvedLanguage)}
            expandIcon={<span className="text-sm">&gt;</span>}
            getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
          >
            <button
              type="button"
              disabled={!options.length}
              onClick={() => {
                if (isOpen) {
                  closeDropdown();
                  return;
                }

                openDropdown();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-[1.15rem] border border-(--color-line) bg-(--color-card-soft) px-4 py-2.5 text-left text-sm text-(--color-ink) transition hover:border-(--color-accent)/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="truncate">
                {summaryCount
                  ? t("city_filter.checked_summary", { count: summaryCount })
                  : t("city_filter.placeholder")}
              </span>
              <FiChevronDown
                className={`shrink-0 text-base text-(--color-muted) transition ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </Cascader>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-(--color-muted)">{t("city_filter.selected")}</p>
        <div className="flex min-h-12 max-h-36 flex-wrap items-start gap-2 overflow-y-auto overscroll-y-contain rounded-[1.15rem] border border-(--color-line) bg-(--color-card-soft) px-3 py-2.5">
          {selectedCities.length ? (
            selectedCities.map((city) => (
              <button
                key={city.key}
                type="button"
                onClick={() => onRemoveCity(city.key)}
                className="inline-flex items-center gap-2 rounded-full border border-(--color-line) bg-white px-3 py-1.5 text-sm text-(--color-ink) transition hover:border-(--color-accent)/40 hover:text-(--color-accent)"
                aria-label={t("city_filter.remove_action", {
                  city: formatSelectedAreaName(city, resolvedLanguage),
                })}
              >
                <span>{formatSelectedAreaName(city, resolvedLanguage)}</span>
                <FiX className="text-sm" />
              </button>
            ))
          ) : (
            <span className="text-sm leading-6 text-(--color-muted)">{t("city_filter.empty")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

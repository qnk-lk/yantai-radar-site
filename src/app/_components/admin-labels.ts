"use client";

import { pinyin } from "pinyin-pro";

import type { SelectedCity } from "./competitor-city-filter";

function capitalizeWord(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isChineseLocale(language: string | undefined) {
  return !language || language.startsWith("zh");
}

export function formatAdminName(name: string, language: string | undefined) {
  if (!name || isChineseLocale(language)) {
    return name;
  }

  return pinyin(name, { toneType: "none", type: "array" })
    .map((part) => capitalizeWord(part))
    .join(" ");
}

export function formatSelectedAreaName(area: SelectedCity, language: string | undefined) {
  return formatAdminName(area.displayName, language);
}

export function getServiceFitLevel(value: string) {
  if (value.includes("高")) {
    return "high";
  }

  if (value.includes("中")) {
    return "medium";
  }

  if (value.includes("低")) {
    return "low";
  }

  return null;
}

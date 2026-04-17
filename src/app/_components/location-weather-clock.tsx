"use client";

import { useEffect, useState } from "react";

import {
  WiCloud,
  WiCloudy,
  WiDayCloudy,
  WiDaySunny,
  WiFog,
  WiNightAltCloudy,
  WiRain,
  WiShowers,
  WiSnow,
  WiThunderstorm,
} from "react-icons/wi";
import { useTranslation } from "react-i18next";

type WeatherState = {
  city: string;
  timezone: string;
  temperature: number | null;
  condition: string | null;
  reportTime: string;
};

const defaultWeather: WeatherState = {
  city: "",
  timezone: "Asia/Shanghai",
  temperature: null,
  condition: null,
  reportTime: "",
};
const WEATHER_REQUEST_TIMEOUT_MS = 3000;
const WEATHER_DEFER_DELAY_MS = 1200;

function getAbortSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

function buildTopbarContextUrl(latitude?: number, longitude?: number) {
  const url = new URL("/api/topbar/context", window.location.origin);

  if (typeof latitude === "number" && typeof longitude === "number") {
    url.searchParams.set("latitude", latitude.toString());
    url.searchParams.set("longitude", longitude.toString());
  }

  return url.toString();
}

async function loadWeatherSnapshot(latitude?: number, longitude?: number): Promise<WeatherState> {
  const response = await fetch(buildTopbarContextUrl(latitude, longitude), {
    cache: "no-store",
    signal: getAbortSignal(WEATHER_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Weather API failed: ${response.status}`);
  }

  const payload = (await response.json()) as Partial<WeatherState>;

  return {
    city: typeof payload.city === "string" ? payload.city : "",
    timezone: typeof payload.timezone === "string" ? payload.timezone : defaultWeather.timezone,
    temperature:
      typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
        ? payload.temperature
        : null,
    condition: typeof payload.condition === "string" ? payload.condition : null,
    reportTime: typeof payload.reportTime === "string" ? payload.reportTime : "",
  };
}

function getWeatherIcon(condition: string | null) {
  if (!condition) return "cloud";
  if (condition.includes("雷")) return "thunder";
  if (condition.includes("雪") || condition.includes("冰雹")) return "snow";
  if (condition.includes("阵雨") || condition.includes("暴雨")) return "showers";
  if (condition.includes("雨")) return "rain";
  if (condition.includes("雾") || condition.includes("霾")) return "fog";
  if (condition.includes("多云")) return "sun-cloud";
  if (condition.includes("阴")) return "cloudy";
  if (condition.includes("晴")) return "sun";
  return "night-cloud";
}

function WeatherStatusIcon({ condition }: { condition: string | null }) {
  const className = "text-3xl text-(--color-accent)";
  const iconType = getWeatherIcon(condition);

  switch (iconType) {
    case "sun":
      return <WiDaySunny className={className} />;
    case "sun-cloud":
      return <WiDayCloudy className={className} />;
    case "cloudy":
      return <WiCloudy className={className} />;
    case "fog":
      return <WiFog className={className} />;
    case "rain":
      return <WiRain className={className} />;
    case "showers":
      return <WiShowers className={className} />;
    case "snow":
      return <WiSnow className={className} />;
    case "thunder":
      return <WiThunderstorm className={className} />;
    case "night-cloud":
      return <WiNightAltCloudy className={className} />;
    default:
      return <WiCloud className={className} />;
  }
}

export function LocationWeatherClock() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"locating" | "ready" | "weather-error">("locating");
  const [weather, setWeather] = useState<WeatherState>(defaultWeather);

  useEffect(() => {
    let active = true;
    let deferredTimer = 0;

    function applyWeather(snapshot: WeatherState) {
      setWeather(snapshot);
      setStatus(snapshot.temperature === null && !snapshot.condition ? "weather-error" : "ready");
    }

    async function loadDefaultWeather() {
      try {
        const snapshot = await loadWeatherSnapshot();

        if (!active) {
          return;
        }

        applyWeather(snapshot);
      } catch {
        if (active) {
          setStatus("weather-error");
        }
      }
    }

    async function loadPreciseWeather(position: GeolocationPosition) {
      const { latitude, longitude } = position.coords;

      try {
        const snapshot = await loadWeatherSnapshot(latitude, longitude);

        if (!active) {
          return;
        }

        applyWeather(snapshot);
      } catch {
        if (active) {
          setStatus((current) => (current === "ready" ? current : "weather-error"));
        }
      }
    }

    loadDefaultWeather().catch(() => {
      if (active) {
        setStatus("weather-error");
      }
    });

    if (!navigator.geolocation) {
      return () => {
        active = false;
      };
    }

    const geolocation = navigator.geolocation;

    deferredTimer = window.setTimeout(() => {
      geolocation.getCurrentPosition(
        (position) => {
          loadPreciseWeather(position).catch(() => {
            if (active) {
              setStatus((current) => (current === "ready" ? current : "weather-error"));
            }
          });
        },
        () => undefined,
        {
          enableHighAccuracy: false,
          timeout: 6000,
          maximumAge: 300000,
        }
      );
    }, WEATHER_DEFER_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(deferredTimer);
    };
  }, []);

  let statusText = t("topbar.locating");

  if (status === "weather-error") {
    statusText = t("topbar.weather_unavailable");
  } else if (status === "ready") {
    statusText =
      weather.temperature === null
        ? weather.condition || t("topbar.weather_loading")
        : `${Math.round(weather.temperature)}°C ${weather.condition ?? ""}`.trim();
  }

  return (
    <div className="flex w-full max-w-96 items-center rounded-[1.25rem]">
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-(--color-muted)">
          {weather.city || t("topbar.default_location")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-(--color-ink)">
        <WeatherStatusIcon condition={weather.condition} />
        <span className="text-sm font-medium">{statusText}</span>
      </div>
    </div>
  );
}

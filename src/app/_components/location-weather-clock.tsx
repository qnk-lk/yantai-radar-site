"use client";

import { useEffect, useMemo, useState } from "react";

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
  weatherCode: number | null;
};

const defaultWeather: WeatherState = {
  city: "烟台开发区",
  timezone: "Asia/Shanghai",
  temperature: null,
  weatherCode: null,
};

function getWeatherIcon(code: number | null) {
  if (code === null) return "cloud";
  if (code === 0) return "sun";
  if ([1, 2].includes(code)) return "sun-cloud";
  if (code === 3) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65].includes(code)) return "rain";
  if ([66, 67, 80, 81, 82].includes(code)) return "showers";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunder";
  return "night-cloud";
}

function WeatherStatusIcon({ code }: { code: number | null }) {
  const className = "text-3xl text-[var(--color-accent)]";
  const iconType = getWeatherIcon(code);

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
  const { t, i18n } = useTranslation();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [status, setStatus] = useState<"locating" | "ready" | "denied" | "weather-error">(
    "locating"
  );
  const [weather, setWeather] = useState<WeatherState>(defaultWeather);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadWeather(position: GeolocationPosition) {
      const { latitude, longitude } = position.coords;

      try {
        const [weatherResponse, reverseResponse] = await Promise.all([
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`,
            { cache: "no-store" }
          ),
          fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10`,
            { cache: "no-store" }
          ),
        ]);

        if (!active) {
          return;
        }

        const weatherJson = await weatherResponse.json();
        const reverseJson = await reverseResponse.json();

        const address = reverseJson.address ?? {};
        const city =
          address.city ??
          address.town ??
          address.county ??
          address.state_district ??
          t("topbar.defaultLocation");

        setWeather({
          city,
          timezone: weatherJson.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          temperature: weatherJson.current?.temperature_2m ?? null,
          weatherCode: weatherJson.current?.weather_code ?? null,
        });
        setStatus("ready");
      } catch {
        if (!active) {
          return;
        }

        setStatus("weather-error");
      }
    }

    if (!navigator.geolocation) {
      const missingGeolocationTimer = window.setTimeout(() => {
        if (active) {
          setStatus("weather-error");
        }
      }, 0);

      return () => {
        active = false;
        window.clearTimeout(missingGeolocationTimer);
      };
    }

    const geolocation = navigator.geolocation;

    if (!geolocation) {
      return;
    }

    geolocation.getCurrentPosition(
      (position) => {
        loadWeather(position).catch(() => {
          if (active) {
            setStatus("weather-error");
          }
        });
      },
      () => {
        if (active) {
          setStatus("denied");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );

    return () => {
      active = false;
    };
  }, [t]);

  const timeText = useMemo(() => {
    if (!currentTime) {
      return "--:--:--";
    }

    const language = i18n.resolvedLanguage || "zh-CN";

    return new Intl.DateTimeFormat(language, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
      weekday: "short",
      timeZone: weather.timezone,
    }).format(currentTime);
  }, [currentTime, i18n.resolvedLanguage, weather.timezone]);

  let statusText = t("topbar.locating");

  if (status === "denied") {
    statusText = t("topbar.locationDenied");
  } else if (status === "weather-error") {
    statusText = t("topbar.weatherUnavailable");
  } else if (status === "ready") {
    statusText =
      weather.temperature === null ? t("topbar.weatherLoading") : `${Math.round(weather.temperature)}°C`;
  }

  return (
    <div className="min-w-[16rem] rounded-[1.25rem] border border-[var(--color-line)] bg-white/88 p-3 shadow-[0_14px_36px_rgba(69,49,28,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            {weather.city}
          </p>
          <p className="text-lg font-semibold text-[var(--color-ink)]" suppressHydrationWarning>
            {timeText}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-[var(--color-card-soft)] px-3 py-2 text-[var(--color-ink)]">
          <WeatherStatusIcon code={weather.weatherCode} />
          <span className="text-sm font-medium">{statusText}</span>
        </div>
      </div>
    </div>
  );
}

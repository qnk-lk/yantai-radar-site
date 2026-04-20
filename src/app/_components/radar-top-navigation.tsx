"use client";

import {
  AppstoreOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  NodeIndexOutlined,
  RadarChartOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { Menu } from "antd";
import type { MenuProps } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

function resolveSelectedKey(pathname: string) {
  if (pathname === "/") {
    return "/";
  }

  const topLevelPath = `/${pathname.split("/").filter(Boolean)[0]}`;
  return topLevelPath || "/";
}

export function RadarTopNavigation() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const items = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "/",
        icon: <AppstoreOutlined />,
        label: <Link href="/">{t("navigation.items.overview")}</Link>,
      },
      {
        key: "/leads",
        icon: <RadarChartOutlined />,
        label: <Link href="/leads">{t("navigation.items.leads")}</Link>,
      },
      {
        key: "/companies",
        icon: <NodeIndexOutlined />,
        label: <Link href="/companies">{t("navigation.items.companies")}</Link>,
      },
      {
        key: "/competitors",
        icon: <DeploymentUnitOutlined />,
        label: <Link href="/competitors">{t("navigation.items.competitors")}</Link>,
      },
      {
        key: "/follow-ups",
        icon: <ScheduleOutlined />,
        label: <Link href="/follow-ups">{t("navigation.items.follow_ups")}</Link>,
      },
      {
        key: "/sources",
        icon: <DatabaseOutlined />,
        label: <Link href="/sources">{t("navigation.items.sources")}</Link>,
      },
    ],
    [t]
  );

  return (
    <div className="scrollbar-hidden max-w-full overflow-x-auto rounded-[1.6rem] border border-(--color-line) bg-white/85 px-2 py-2">
      <Menu
        mode="horizontal"
        selectedKeys={[resolveSelectedKey(pathname)]}
        items={items}
        overflowedIndicator={null}
        style={{
          borderBottom: "none",
          background: "transparent",
          minWidth: "100%",
          width: "max-content",
        }}
      />
    </div>
  );
}

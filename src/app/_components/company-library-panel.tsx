"use client";

import { ClusterOutlined, GlobalOutlined, SearchOutlined } from "@ant-design/icons";
import { Card, Empty, Input, Space, Statistic, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SalesIntelItem } from "./sales-intel-types";

export type CompanyLibraryEntry = {
  id: string;
  companyName: string;
  city: string;
  latestRetrievedAt: string;
  latestSummary: string;
  sourcePlatforms: string[];
  signalCount: number;
  allJobsCount: number;
  strongest: string;
  items: SalesIntelItem[];
};

function compactText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSortKey(value: string) {
  const match = compactText(value).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/u);
  return match ? match.slice(1).join("") : "";
}

function compareTimestampDesc(left: string, right: string) {
  const leftKey = getSortKey(left);
  const rightKey = getSortKey(right);

  if (leftKey && rightKey) {
    return rightKey.localeCompare(leftKey);
  }

  if (rightKey) {
    return 1;
  }

  if (leftKey) {
    return -1;
  }

  return 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => compactText(item)).filter(Boolean))];
}

function splitSourceLabels(value: string) {
  return uniqueStrings(
    compactText(value)
      .split(/[、,，]/u)
      .map((item) => item.trim())
  );
}

function resolveCompanyName(item: SalesIntelItem) {
  return compactText(item.entity || item.title);
}

function resolveCity(item: SalesIntelItem) {
  return compactText(item.location || item.matchedJobs?.find((job) => compactText(job.city))?.city || "");
}

function strengthScore(value: string) {
  if (value === "高") {
    return 3;
  }

  if (value === "中") {
    return 2;
  }

  if (value === "低") {
    return 1;
  }

  return 0;
}

function formatDisplayUpdatedAt(value: string) {
  return compactText(value).replace(/\s*CST$/u, "");
}

export function buildCompanyLibraryEntries(items: SalesIntelItem[]) {
  const companyMap = new Map<string, CompanyLibraryEntry>();

  for (const item of items) {
    const companyName = resolveCompanyName(item);
    if (!companyName) {
      continue;
    }

    const city = resolveCity(item);
    const id = `${companyName}::${city || "unknown"}`;
    const sourcePlatforms = uniqueStrings([
      ...splitSourceLabels(item.sourceLabel),
      ...((item.matchedJobs ?? []).map((job) => compactText(job.platform)).filter(Boolean) || []),
      ...((item.allJobs ?? []).map((job) => compactText(job.platform)).filter(Boolean) || []),
    ]);
    const allJobsCount = uniqueStrings(
      (item.allJobs ?? item.matchedJobs ?? []).map(
        (job) => `${compactText(job.platform)}::${compactText(job.url)}::${compactText(job.jobTitle)}`
      )
    ).length;

    const current = companyMap.get(id);
    if (!current) {
      companyMap.set(id, {
        id,
        companyName,
        city,
        latestRetrievedAt: compactText(item.retrievedAt || item.publishedAt || ""),
        latestSummary: compactText(item.summary),
        sourcePlatforms,
        signalCount: 1,
        allJobsCount,
        strongest: compactText(item.strength),
        items: [item],
      });
      continue;
    }

    current.signalCount += 1;
    current.sourcePlatforms = uniqueStrings([...current.sourcePlatforms, ...sourcePlatforms]);
    current.items = [...current.items, item].sort((left, right) =>
      compareTimestampDesc(
        compactText(left.retrievedAt || left.publishedAt || ""),
        compactText(right.retrievedAt || right.publishedAt || "")
      )
    );
    current.allJobsCount = Math.max(
      current.allJobsCount,
      uniqueStrings(
        current.items.flatMap((signal) =>
          (signal.allJobs ?? signal.matchedJobs ?? []).map(
            (job) =>
              `${compactText(job.platform)}::${compactText(job.url)}::${compactText(job.jobTitle)}`
          )
        )
      ).length
    );

    const nextRetrievedAt = compactText(item.retrievedAt || item.publishedAt || "");
    if (compareTimestampDesc(current.latestRetrievedAt, nextRetrievedAt) > 0) {
      current.latestRetrievedAt = nextRetrievedAt;
      current.latestSummary = compactText(item.summary) || current.latestSummary;
    }

    if (strengthScore(item.strength) > strengthScore(current.strongest)) {
      current.strongest = compactText(item.strength);
    }
  }

  return [...companyMap.values()].sort((left, right) => {
    const retrievedOrder = compareTimestampDesc(left.latestRetrievedAt, right.latestRetrievedAt);
    if (retrievedOrder !== 0) {
      return retrievedOrder;
    }

    return right.signalCount - left.signalCount;
  });
}

export function CompanyLibraryPanel({
  entries,
}: {
  entries: CompanyLibraryEntry[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);

  const filteredEntries = useMemo(() => {
    if (!query.trim()) {
      return entries;
    }

    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) =>
      [entry.companyName, entry.city, ...entry.sourcePlatforms]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [entries, query]);

  const resolvedSelectedId =
    selectedId && filteredEntries.some((entry) => entry.id === selectedId)
      ? selectedId
      : (filteredEntries[0]?.id ?? null);
  const activeEntry = filteredEntries.find((entry) => entry.id === resolvedSelectedId) ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
      <Card
        title={t("companies.title")}
        extra={
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("companies.search_placeholder")}
            style={{ width: 260 }}
          />
        }
      >
        {filteredEntries.length ? (
          <div className="grid gap-3">
            {filteredEntries.map((entry) => (
                <Card
                  key={entry.id}
                  hoverable
                  size="small"
                  onClick={() => setSelectedId(entry.id)}
                  styles={{
                    body: {
                      border:
                        entry.id === resolvedSelectedId ? "1px solid rgba(150,81,38,0.35)" : undefined,
                      borderRadius: 12,
                    },
                  }}
                >
                  <Space orientation="vertical" size={10} style={{ display: "flex" }}>
                    <Space wrap size={[8, 8]}>
                      {entry.city ? <Tag>{entry.city}</Tag> : null}
                      {entry.strongest ? (
                        <Tag color="orange">{t("companies.strongest_signal", { value: entry.strongest })}</Tag>
                      ) : null}
                      <Tag icon={<ClusterOutlined />}>
                        {t("companies.signal_count", { count: entry.signalCount })}
                      </Tag>
                    </Space>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {entry.companyName}
                    </Typography.Title>
                    <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                      {entry.latestSummary}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary">
                      {entry.latestRetrievedAt
                        ? `${t("entry.retrieved_at")} ${formatDisplayUpdatedAt(entry.latestRetrievedAt)}`
                        : t("sales_intel.not_synced")}
                    </Typography.Text>
                  </Space>
                </Card>
            ))}
          </div>
        ) : (
          <Empty description={t("companies.empty")} />
        )}
      </Card>

      <Card title={activeEntry?.companyName || t("companies.title")}>
        {activeEntry ? (
          <Space orientation="vertical" size={20} style={{ display: "flex" }}>
            <Space wrap size={[8, 8]}>
              {activeEntry.city ? <Tag>{activeEntry.city}</Tag> : null}
              {activeEntry.sourcePlatforms.map((platform) => (
                <Tag key={`${activeEntry.id}-${platform}`} icon={<GlobalOutlined />}>
                  {platform}
                </Tag>
              ))}
            </Space>

            <div className="grid gap-3 md:grid-cols-3">
              <Card size="small">
                <Statistic title={t("companies.signal_metric")} value={activeEntry.signalCount} />
              </Card>
              <Card size="small">
                <Statistic title={t("companies.platform_metric")} value={activeEntry.sourcePlatforms.length} />
              </Card>
              <Card size="small">
                <Statistic title={t("companies.job_metric")} value={activeEntry.allJobsCount} />
              </Card>
            </div>

            <Card size="small" title={t("companies.recent_signals")}>
              <div className="divide-y divide-(--color-line)">
                {activeEntry.items.slice(0, 6).map((item) => (
                  <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                    <Space orientation="vertical" size={4} style={{ display: "flex" }}>
                      <Space wrap size={[8, 8]}>
                        <Tag color="blue">{item.category}</Tag>
                        {item.sourceLabel ? <Tag>{item.sourceLabel}</Tag> : null}
                      </Space>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                        {item.summary}
                      </Typography.Paragraph>
                      <Typography.Text type="secondary">
                        {item.retrievedAt
                          ? `${t("entry.retrieved_at")} ${formatDisplayUpdatedAt(item.retrievedAt)}`
                        : t("sales_intel.not_synced")}
                      </Typography.Text>
                    </Space>
                  </div>
                ))}
              </div>
            </Card>
          </Space>
        ) : (
          <Empty description={t("companies.empty")} />
        )}
      </Card>
    </div>
  );
}

"use client";

import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Statistic,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { CompanyLibraryEntry } from "./company-library-panel";
import {
  filterFollowUpEntries,
  getFollowUpFilterStats,
  getFollowUpOwners,
  type FollowUpFilterState,
  type FollowUpReminderState,
} from "./follow-up-filtering";
import type {
  FollowUpCommunicationMethod,
  FollowUpContactResult,
  FollowUpDealStage,
  FollowUpEvent,
  FollowUpRecord,
  FollowUpStage,
} from "./follow-up-types";

type FollowUpBoardEntry = CompanyLibraryEntry & {
  stage: FollowUpStage;
  evidenceScore: number;
  stageScore: number;
  suggestedAction: string;
  riskText: string;
  reasons: string[];
  followUpRecord?: FollowUpRecord;
};

type FollowUpFormValues = {
  stage: FollowUpStage;
  owner: string;
  communicationMethod: FollowUpCommunicationMethod;
  contactResult: FollowUpContactResult;
  nextAction: string;
  dealStage: FollowUpDealStage;
  nextReminderAt: string;
  note: string;
  lastFollowedAt: string;
};

const communicationMethodValues: FollowUpCommunicationMethod[] = [
  "phone",
  "wechat",
  "visit",
  "email",
  "other",
];
const contactResultValues: FollowUpContactResult[] = [
  "not_contacted",
  "connected",
  "interested",
  "no_need",
  "pending",
  "invalid",
];
const dealStageValues: FollowUpDealStage[] = [
  "lead",
  "qualified",
  "contacted",
  "proposal",
  "won",
  "lost",
];
const reminderStateValues: FollowUpReminderState[] = ["today", "overdue", "unset"];

function compactText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTimestampSortKey(value: string) {
  const match = compactText(value).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/u);
  return match ? match.slice(1).join("") : "";
}

function compareLatestTimeDesc(left: string, right: string) {
  const leftKey = getTimestampSortKey(left);
  const rightKey = getTimestampSortKey(right);

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

function formatDisplayUpdatedAt(value: string) {
  return compactText(value).replace(/\s*CST$/u, "");
}

function formatLocalDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace(/\//gu, "-");
}

function getStrengthScore(value: string) {
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

function resolveStage(entry: CompanyLibraryEntry): FollowUpStage {
  const strengthScore = getStrengthScore(entry.strongest);
  const hasRepeatedEvidence =
    entry.signalCount >= 2 || entry.allJobsCount >= 2 || entry.sourcePlatforms.length >= 2;

  if (
    (strengthScore >= 3 && hasRepeatedEvidence) ||
    entry.signalCount >= 3 ||
    entry.allJobsCount >= 5
  ) {
    return "priority";
  }

  if (strengthScore >= 3 || hasRepeatedEvidence) {
    return "watch";
  }

  return "screening";
}

function getEvidenceScore(entry: CompanyLibraryEntry) {
  const score =
    Math.min(entry.signalCount, 4) * 14 +
    Math.min(entry.sourcePlatforms.length, 3) * 12 +
    Math.min(entry.allJobsCount, 5) * 6 +
    getStrengthScore(entry.strongest) * 10 +
    (entry.city ? 6 : 0);

  return Math.min(100, Math.max(0, score));
}

function getStageWeight(stage: FollowUpStage) {
  if (stage === "priority") {
    return 300;
  }

  if (stage === "watch") {
    return 200;
  }

  return 100;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-4">
        <Statistic title={label} value={value} />
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--color-card-soft) text-lg text-(--color-accent)">
          {icon}
        </span>
      </div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {detail}
      </Typography.Paragraph>
    </Card>
  );
}

function renderEventTags(event: FollowUpEvent, t: ReturnType<typeof useTranslation>["t"]) {
  const tags = [
    event.stage ? t(`follow_ups.stages.${event.stage}`) : "",
    event.communicationMethod
      ? t(`follow_ups.communication_methods.${event.communicationMethod}`)
      : "",
    event.contactResult ? t(`follow_ups.contact_results.${event.contactResult}`) : "",
    event.dealStage ? t(`follow_ups.deal_stages.${event.dealStage}`) : "",
  ].filter(Boolean);

  return tags.map((tag) => <Tag key={`${event.id}-${tag}`}>{tag}</Tag>);
}

async function saveFollowUpRecord(entry: FollowUpBoardEntry, values: FollowUpFormValues) {
  const response = await fetch(`/api/follow-ups/${encodeURIComponent(entry.id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      companyName: entry.companyName,
      city: entry.city,
      stage: values.stage,
      owner: values.owner,
      communicationMethod: values.communicationMethod,
      contactResult: values.contactResult,
      nextAction: values.nextAction,
      dealStage: values.dealStage,
      nextReminderAt: values.nextReminderAt,
      note: values.note,
      lastFollowedAt: values.lastFollowedAt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save follow-up record: ${response.status}`);
  }

  const payload = (await response.json()) as { item?: FollowUpRecord };

  if (!payload.item) {
    throw new Error("Follow-up record response is empty");
  }

  return payload.item;
}

function FollowUpCompanyCard({
  entry,
  onSaveRecord,
}: {
  entry: FollowUpBoardEntry;
  onSaveRecord: (record: FollowUpRecord) => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<FollowUpFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const latestTime = formatDisplayUpdatedAt(entry.latestRetrievedAt);
  const record = entry.followUpRecord;
  const city = entry.city || t("companies.unknown_city");
  const sourcePlatforms = entry.sourcePlatforms.length
    ? entry.sourcePlatforms.join("、")
    : t("follow_ups.fields.no_platform");
  const historyEvents = record?.events?.slice(0, 5) ?? [];

  function openEditor() {
    form.setFieldsValue({
      stage: record?.stage ?? entry.stage,
      owner: record?.owner ?? "",
      communicationMethod: record?.communicationMethod ?? "",
      contactResult: record?.contactResult ?? "",
      nextAction: record?.nextAction ?? "",
      dealStage: record?.dealStage ?? "",
      nextReminderAt: record?.nextReminderAt ?? "",
      note: record?.note ?? "",
      lastFollowedAt: record?.lastFollowedAt ?? "",
    });
    setIsEditorOpen(true);
  }

  async function handleSubmit(values: FollowUpFormValues) {
    setIsSaving(true);
    try {
      const nextRecord = await saveFollowUpRecord(entry, values);
      onSaveRecord(nextRecord);
      setIsEditorOpen(false);
      messageApi.success(t("follow_ups.messages.saved"));
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : t("follow_ups.messages.save_failed")
      );
    } finally {
      setIsSaving(false);
    }
  }

  function markFollowedNow() {
    form.setFieldValue("lastFollowedAt", formatLocalDateTime());
  }

  return (
    <div className="rounded-[1.4rem] border border-(--color-line) bg-white/68 p-4 shadow-[0_14px_34px_rgba(69,49,28,0.08)]">
      {contextHolder}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Space wrap size={[8, 8]}>
            <Tag color={entry.stage === "priority" ? "orange" : "blue"}>
              {t(`follow_ups.stages.${entry.stage}`)}
            </Tag>
            <Tag>{city}</Tag>
            {entry.strongest ? (
              <Tag color={entry.strongest === "高" ? "red" : "default"}>
                {t("follow_ups.fields.strength", { value: entry.strongest })}
              </Tag>
            ) : null}
          </Space>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {entry.companyName}
          </Typography.Title>
        </div>

        <Space wrap size={[8, 8]}>
          <Button type="primary" onClick={openEditor}>
            {t("follow_ups.actions.edit")}
          </Button>
          <Link href={`/companies?company=${encodeURIComponent(entry.id)}`}>
            <Button type="link" style={{ paddingInline: 0 }}>
              {t("follow_ups.actions.open_profile")} <ArrowRightOutlined />
            </Button>
          </Link>
        </Space>
      </div>

      <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 10, marginBottom: 0 }}>
        {entry.latestSummary}
      </Typography.Paragraph>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Typography.Text type="secondary">{t("follow_ups.fields.signal_count")}</Typography.Text>
          <Typography.Text strong className="block">
            {t("follow_ups.values.signal_count", { count: entry.signalCount })}
          </Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">{t("follow_ups.fields.job_count")}</Typography.Text>
          <Typography.Text strong className="block">
            {t("follow_ups.values.job_count", { count: entry.allJobsCount })}
          </Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">{t("follow_ups.fields.latest_time")}</Typography.Text>
          <Typography.Text strong className="block">
            {latestTime || t("sales_intel.not_synced")}
          </Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">{t("follow_ups.fields.platforms")}</Typography.Text>
          <Typography.Text strong ellipsis title={sourcePlatforms} className="block">
            {sourcePlatforms}
          </Typography.Text>
        </div>
      </div>

      <div className="mt-4 rounded-[1rem] bg-(--color-card-soft) p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Typography.Text strong>{t("follow_ups.fields.evidence_score")}</Typography.Text>
          <Typography.Text>{entry.evidenceScore}%</Typography.Text>
        </div>
        <Progress percent={entry.evidenceScore} showInfo={false} size="small" />
        <div className="mt-2 flex flex-wrap gap-2">
          {entry.reasons.map((reason) => (
            <Tag key={`${entry.id}-${reason}`}>{reason}</Tag>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.88fr)]">
        <div className="rounded-[1rem] border border-(--color-line) bg-white/58 p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.next_action")}</Typography.Text>
          <Typography.Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
            {entry.suggestedAction}
          </Typography.Paragraph>
        </div>
        <div className="rounded-[1rem] border border-(--color-line) bg-white/58 p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.risk")}</Typography.Text>
          <Typography.Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
            {entry.riskText}
          </Typography.Paragraph>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.owner")}</Typography.Text>
          <Typography.Text strong className="block">
            {record?.owner || t("follow_ups.values.unassigned_owner")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.deal_stage")}</Typography.Text>
          <Typography.Text strong className="block">
            {record?.dealStage
              ? t(`follow_ups.deal_stages.${record.dealStage}`)
              : t("follow_ups.values.no_deal_stage")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">
            {t("follow_ups.fields.communication_method")}
          </Typography.Text>
          <Typography.Text strong className="block">
            {record?.communicationMethod
              ? t(`follow_ups.communication_methods.${record.communicationMethod}`)
              : t("follow_ups.values.no_communication_method")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">
            {t("follow_ups.fields.contact_result")}
          </Typography.Text>
          <Typography.Text strong className="block">
            {record?.contactResult
              ? t(`follow_ups.contact_results.${record.contactResult}`)
              : t("follow_ups.values.no_contact_result")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.next_reminder")}</Typography.Text>
          <Typography.Text strong className="block">
            {formatDisplayUpdatedAt(record?.nextReminderAt ?? "") ||
              t("follow_ups.values.no_reminder")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.last_followed")}</Typography.Text>
          <Typography.Text strong className="block">
            {formatDisplayUpdatedAt(record?.lastFollowedAt ?? "") ||
              t("follow_ups.values.not_followed")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3">
          <Typography.Text type="secondary">{t("follow_ups.fields.manual_note")}</Typography.Text>
          <Typography.Text strong ellipsis title={record?.note} className="block">
            {record?.note || t("follow_ups.values.no_note")}
          </Typography.Text>
        </div>
        <div className="rounded-[1rem] bg-(--color-card-soft) p-3 xl:col-span-2">
          <Typography.Text type="secondary">
            {t("follow_ups.fields.manual_next_action")}
          </Typography.Text>
          <Typography.Text strong ellipsis title={record?.nextAction} className="block">
            {record?.nextAction || t("follow_ups.values.no_next_action")}
          </Typography.Text>
        </div>
      </div>

      <div className="mt-4 rounded-[1rem] border border-(--color-line) bg-white/58 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Typography.Text strong>{t("follow_ups.history.title")}</Typography.Text>
          <Typography.Text type="secondary">
            {t("follow_ups.history.count", { count: historyEvents.length })}
          </Typography.Text>
        </div>
        {historyEvents.length ? (
          <Timeline
            items={historyEvents.map((event) => ({
              children: (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Typography.Text strong>
                      {formatDisplayUpdatedAt(event.followedAt || event.createdAt)}
                    </Typography.Text>
                    {event.owner ? <Tag color="blue">{event.owner}</Tag> : null}
                    {renderEventTags(event, t)}
                  </div>
                  {event.note ? (
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      {event.note}
                    </Typography.Paragraph>
                  ) : null}
                  {event.nextAction ? (
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {t("follow_ups.history.next_action", { value: event.nextAction })}
                    </Typography.Paragraph>
                  ) : null}
                </div>
              ),
            }))}
          />
        ) : (
          <Typography.Text type="secondary">{t("follow_ups.history.empty")}</Typography.Text>
        )}
      </div>

      <Modal
        title={t("follow_ups.editor.title", { company: entry.companyName })}
        open={isEditorOpen}
        okText={t("follow_ups.editor.save")}
        cancelText={t("follow_ups.editor.cancel")}
        confirmLoading={isSaving}
        onCancel={() => setIsEditorOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="stage"
            label={t("follow_ups.editor.stage")}
            rules={[{ required: true, message: t("follow_ups.editor.stage_required") }]}
          >
            <Select
              options={[
                { value: "priority", label: t("follow_ups.stages.priority") },
                { value: "watch", label: t("follow_ups.stages.watch") },
                { value: "screening", label: t("follow_ups.stages.screening") },
              ]}
            />
          </Form.Item>
          <Form.Item name="owner" label={t("follow_ups.editor.owner")}>
            <Input placeholder={t("follow_ups.editor.owner_placeholder")} />
          </Form.Item>
          <div className="grid gap-3 md:grid-cols-3">
            <Form.Item
              name="communicationMethod"
              label={t("follow_ups.editor.communication_method")}
            >
              <Select
                allowClear
                placeholder={t("follow_ups.editor.communication_method_placeholder")}
                options={communicationMethodValues.map((value) => ({
                  value,
                  label: t(`follow_ups.communication_methods.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item name="contactResult" label={t("follow_ups.editor.contact_result")}>
              <Select
                allowClear
                placeholder={t("follow_ups.editor.contact_result_placeholder")}
                options={contactResultValues.map((value) => ({
                  value,
                  label: t(`follow_ups.contact_results.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item name="dealStage" label={t("follow_ups.editor.deal_stage")}>
              <Select
                allowClear
                placeholder={t("follow_ups.editor.deal_stage_placeholder")}
                options={dealStageValues.map((value) => ({
                  value,
                  label: t(`follow_ups.deal_stages.${value}`),
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="nextReminderAt" label={t("follow_ups.editor.next_reminder")}>
            <Input placeholder={t("follow_ups.editor.time_placeholder")} />
          </Form.Item>
          <Form.Item name="nextAction" label={t("follow_ups.editor.next_action")}>
            <Input.TextArea rows={2} placeholder={t("follow_ups.editor.next_action_placeholder")} />
          </Form.Item>
          <Form.Item label={t("follow_ups.editor.last_followed")}>
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item name="lastFollowedAt" noStyle>
                <Input placeholder={t("follow_ups.editor.time_placeholder")} />
              </Form.Item>
              <Button type="default" onClick={markFollowedNow}>
                {t("follow_ups.editor.mark_now")}
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="note" label={t("follow_ups.editor.note")}>
            <Input.TextArea rows={4} placeholder={t("follow_ups.editor.note_placeholder")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function StageColumn({
  title,
  description,
  entries,
  onSaveRecord,
}: {
  title: string;
  description: string;
  entries: FollowUpBoardEntry[];
  onSaveRecord: (record: FollowUpRecord) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card
      title={title}
      extra={<Tag>{t("follow_ups.values.company_count", { count: entries.length })}</Tag>}
    >
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      {entries.length ? (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <FollowUpCompanyCard key={entry.id} entry={entry} onSaveRecord={onSaveRecord} />
          ))}
        </div>
      ) : (
        <Empty description={t("follow_ups.empty_stage")} />
      )}
    </Card>
  );
}

export function FollowUpManagementPanel({
  entries,
  records,
  onSaveRecord,
}: {
  entries: CompanyLibraryEntry[];
  records: FollowUpRecord[];
  onSaveRecord: (record: FollowUpRecord) => void;
}) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FollowUpFilterState>({
    reminderState: "all",
    owner: "",
    stage: "all",
    contactResult: "all",
  });
  const boardEntries = useMemo<FollowUpBoardEntry[]>(() => {
    const recordMap = new Map(records.map((record) => [record.companyId, record]));

    return entries
      .map((entry) => {
        const followUpRecord = recordMap.get(entry.id);
        const stage = followUpRecord?.stage ?? resolveStage(entry);
        const evidenceScore = getEvidenceScore(entry);
        const reasons = [
          getStrengthScore(entry.strongest) >= 3 ? t("follow_ups.reasons.high_strength") : null,
          entry.signalCount >= 2
            ? t("follow_ups.reasons.multiple_signals", { count: entry.signalCount })
            : null,
          entry.allJobsCount >= 2
            ? t("follow_ups.reasons.job_volume", { count: entry.allJobsCount })
            : null,
          entry.sourcePlatforms.length >= 2
            ? t("follow_ups.reasons.multi_platform", { count: entry.sourcePlatforms.length })
            : null,
          entry.latestRetrievedAt ? t("follow_ups.reasons.recent_signal") : null,
        ].filter((item): item is string => Boolean(item));

        const suggestedAction =
          stage === "priority"
            ? t("follow_ups.suggested_actions.priority")
            : stage === "watch"
              ? t("follow_ups.suggested_actions.watch")
              : t("follow_ups.suggested_actions.screening");
        const riskText =
          entry.signalCount <= 1
            ? t("follow_ups.risks.single_signal")
            : entry.sourcePlatforms.length <= 1
              ? t("follow_ups.risks.single_platform")
              : entry.allJobsCount === 0
                ? t("follow_ups.risks.no_jobs")
                : t("follow_ups.risks.normal");

        return {
          ...entry,
          stage,
          evidenceScore,
          stageScore: getStageWeight(stage) + evidenceScore,
          suggestedAction,
          riskText,
          reasons: reasons.length ? reasons : [t("follow_ups.reasons.basic_signal")],
          followUpRecord,
        };
      })
      .sort((left, right) => {
        const stageOrder = right.stageScore - left.stageScore;

        if (stageOrder !== 0) {
          return stageOrder;
        }

        return compareLatestTimeDesc(left.latestRetrievedAt, right.latestRetrievedAt);
      });
  }, [entries, records, t]);
  const ownerOptions = useMemo(() => getFollowUpOwners(boardEntries), [boardEntries]);
  const reminderStats = useMemo(() => getFollowUpFilterStats(boardEntries), [boardEntries]);
  const filteredEntries = useMemo(
    () => filterFollowUpEntries(boardEntries, filters),
    [boardEntries, filters]
  );
  const priorityEntries = filteredEntries.filter((entry) => entry.stage === "priority");
  const watchEntries = filteredEntries.filter((entry) => entry.stage === "watch");
  const screeningEntries = filteredEntries.filter((entry) => entry.stage === "screening");
  const unassignedCount = boardEntries.filter((entry) => !entry.followUpRecord?.owner).length;
  const assignedCount = records.filter((record) => record.owner).length;
  const hasFollowUpRecords = records.length > 0;
  const hasActiveFilters =
    filters.reminderState !== "all" ||
    filters.owner ||
    filters.stage !== "all" ||
    filters.contactResult !== "all";

  function updateFilter(nextFilters: Partial<FollowUpFilterState>) {
    setFilters((current) => ({
      ...current,
      ...nextFilters,
    }));
  }

  function resetFilters() {
    setFilters({
      reminderState: "all",
      owner: "",
      stage: "all",
      contactResult: "all",
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <Typography.Title level={3} style={{ margin: 0 }}>
              {t("follow_ups.title")}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t("follow_ups.description")}
            </Typography.Paragraph>
          </div>
          <Tag color={hasFollowUpRecords ? "green" : "gold"} className="w-fit">
            {hasFollowUpRecords
              ? t("follow_ups.manual_status_ready", {
                  count: records.length,
                  assigned: assignedCount,
                })
              : t("follow_ups.manual_status_pending")}
          </Tag>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<ClockCircleOutlined />}
          label={t("follow_ups.metrics.today")}
          value={reminderStats.today}
          detail={t("follow_ups.metrics.today_detail")}
        />
        <MetricCard
          icon={<ClockCircleOutlined />}
          label={t("follow_ups.metrics.overdue")}
          value={reminderStats.overdue}
          detail={t("follow_ups.metrics.overdue_detail")}
        />
        <MetricCard
          icon={<FireOutlined />}
          label={t("follow_ups.metrics.interested")}
          value={reminderStats.interested}
          detail={t("follow_ups.metrics.interested_detail")}
        />
        <MetricCard
          icon={<SafetyCertificateOutlined />}
          label={t("follow_ups.metrics.unassigned")}
          value={unassignedCount}
          detail={t("follow_ups.metrics.unassigned_detail")}
        />
      </div>

      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <Select
            value={filters.reminderState}
            onChange={(value) => updateFilter({ reminderState: value })}
            options={[
              { value: "all", label: t("follow_ups.filters.all_reminders") },
              ...reminderStateValues.map((value) => ({
                value,
                label: t(`follow_ups.filters.reminder_states.${value}`),
              })),
            ]}
          />
          <Select
            value={filters.owner}
            onChange={(value) => updateFilter({ owner: value })}
            options={[
              { value: "", label: t("follow_ups.filters.all_owners") },
              ...ownerOptions.map((owner) => ({ value: owner, label: owner })),
            ]}
          />
          <Select
            value={filters.stage}
            onChange={(value) => updateFilter({ stage: value })}
            options={[
              { value: "all", label: t("follow_ups.filters.all_stages") },
              { value: "priority", label: t("follow_ups.stages.priority") },
              { value: "watch", label: t("follow_ups.stages.watch") },
              { value: "screening", label: t("follow_ups.stages.screening") },
            ]}
          />
          <Select
            value={filters.contactResult}
            onChange={(value) => updateFilter({ contactResult: value })}
            options={[
              { value: "all", label: t("follow_ups.filters.all_contact_results") },
              ...contactResultValues.map((value) => ({
                value,
                label: t(`follow_ups.contact_results.${value}`),
              })),
            ]}
          />
          <Button onClick={resetFilters} disabled={!hasActiveFilters}>
            {t("follow_ups.filters.reset")}
          </Button>
        </div>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {t("follow_ups.filters.result", {
            count: filteredEntries.length,
            total: boardEntries.length,
          })}
        </Typography.Paragraph>
      </Card>

      {filteredEntries.length ? (
        <div className="grid gap-6">
          <StageColumn
            title={t("follow_ups.stage_sections.priority_title")}
            description={t("follow_ups.stage_sections.priority_description")}
            entries={priorityEntries}
            onSaveRecord={onSaveRecord}
          />
          <StageColumn
            title={t("follow_ups.stage_sections.watch_title")}
            description={t("follow_ups.stage_sections.watch_description")}
            entries={watchEntries}
            onSaveRecord={onSaveRecord}
          />
          <StageColumn
            title={t("follow_ups.stage_sections.screening_title")}
            description={t("follow_ups.stage_sections.screening_description")}
            entries={screeningEntries}
            onSaveRecord={onSaveRecord}
          />
        </div>
      ) : (
        <Card>
          <Empty
            description={
              boardEntries.length
                ? t("follow_ups.filters.empty")
                : t("follow_ups.empty_description")
            }
          />
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircleOutlined className="text-(--color-accent)" />
          <Typography.Text strong>{t("follow_ups.future_title")}</Typography.Text>
        </div>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {t("follow_ups.future_description")}
        </Typography.Paragraph>
      </Card>
    </div>
  );
}

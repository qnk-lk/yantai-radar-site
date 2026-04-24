import type {
  FollowUpContactResult,
  FollowUpRecord,
  FollowUpStage,
} from "./follow-up-types";

export type FollowUpReminderState = "all" | "today" | "overdue" | "unset";

export type FollowUpFilterState = {
  reminderState: FollowUpReminderState;
  owner: string;
  stage: FollowUpStage | "all";
  contactResult: FollowUpContactResult | "all";
};

export type FollowUpFilterEntry = {
  stage: FollowUpStage;
  followUpRecord?: FollowUpRecord;
};

export function parseFollowUpDateTime(value: string) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/u);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function getReminderState(record: FollowUpRecord | undefined, now = new Date()) {
  const reminderAt = parseFollowUpDateTime(record?.nextReminderAt ?? "");

  if (!reminderAt) {
    return "unset" satisfies FollowUpReminderState;
  }

  if (reminderAt.getTime() < now.getTime() && !isSameLocalDay(reminderAt, now)) {
    return "overdue" satisfies FollowUpReminderState;
  }

  if (isSameLocalDay(reminderAt, now)) {
    return "today" satisfies FollowUpReminderState;
  }

  return "all" satisfies FollowUpReminderState;
}

export function getFollowUpFilterStats(entries: FollowUpFilterEntry[], now = new Date()) {
  return entries.reduce(
    (stats, entry) => {
      const reminderState = getReminderState(entry.followUpRecord, now);

      if (reminderState === "today") {
        stats.today += 1;
      }

      if (reminderState === "overdue") {
        stats.overdue += 1;
      }

      if (!entry.followUpRecord?.owner) {
        stats.unassigned += 1;
      }

      if (entry.followUpRecord?.contactResult === "interested") {
        stats.interested += 1;
      }

      return stats;
    },
    {
      today: 0,
      overdue: 0,
      unassigned: 0,
      interested: 0,
    }
  );
}

export function filterFollowUpEntries<TEntry extends FollowUpFilterEntry>(
  entries: TEntry[],
  filters: FollowUpFilterState,
  now = new Date()
) {
  return entries.filter((entry) => {
    const record = entry.followUpRecord;

    if (filters.reminderState !== "all" && getReminderState(record, now) !== filters.reminderState) {
      return false;
    }

    if (filters.owner && record?.owner !== filters.owner) {
      return false;
    }

    if (filters.stage !== "all" && entry.stage !== filters.stage) {
      return false;
    }

    if (filters.contactResult !== "all" && record?.contactResult !== filters.contactResult) {
      return false;
    }

    return true;
  });
}

export function getFollowUpOwners(entries: FollowUpFilterEntry[]) {
  return Array.from(
    new Set(
      entries
        .map((entry) => entry.followUpRecord?.owner?.trim())
        .filter((owner): owner is string => Boolean(owner))
    )
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

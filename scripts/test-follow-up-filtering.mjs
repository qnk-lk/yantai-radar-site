import assert from "node:assert/strict";
import {
  filterFollowUpEntries,
  getFollowUpFilterStats,
  getFollowUpOwners,
  getReminderState,
} from "../src/app/_components/follow-up-filtering.ts";

const now = new Date(2026, 3, 24, 12, 0, 0);
const entries = [
  {
    stage: "priority",
    followUpRecord: {
      owner: "LK",
      reminderStatus: "open",
      nextReminderAt: "2026-04-24 09:30:00",
      contactResult: "interested",
    },
  },
  {
    stage: "watch",
    followUpRecord: {
      owner: "Ming",
      reminderStatus: "open",
      nextReminderAt: "2026-04-23 09:30:00",
      contactResult: "pending",
    },
  },
  {
    stage: "screening",
    followUpRecord: {
      owner: "",
      reminderStatus: "open",
      nextReminderAt: "",
      contactResult: "",
    },
  },
  {
    stage: "priority",
    followUpRecord: {
      owner: "LK",
      reminderStatus: "completed",
      nextReminderAt: "2026-04-23 09:30:00",
      contactResult: "connected",
    },
  },
];

assert.equal(getReminderState(entries[0].followUpRecord, now), "today");
assert.equal(getReminderState(entries[1].followUpRecord, now), "overdue");
assert.equal(getReminderState(entries[2].followUpRecord, now), "unset");

assert.deepEqual(getFollowUpFilterStats(entries, now), {
  today: 1,
  overdue: 1,
  unassigned: 1,
  interested: 1,
  completed: 1,
});

assert.deepEqual(getFollowUpOwners(entries), ["LK", "Ming"]);

assert.equal(
  filterFollowUpEntries(
    entries,
    {
      reminderState: "today",
      owner: "",
      stage: "all",
      contactResult: "all",
    },
    now
  ).length,
  1
);

assert.equal(
  filterFollowUpEntries(
    entries,
    {
      reminderState: "completed",
      owner: "",
      stage: "all",
      contactResult: "all",
    },
    now
  ).length,
  1
);

assert.equal(
  filterFollowUpEntries(
    entries,
    {
      reminderState: "all",
      owner: "Ming",
      stage: "watch",
      contactResult: "pending",
    },
    now
  ).length,
  1
);

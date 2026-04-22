export type FollowUpStage = "priority" | "watch" | "screening";

export type FollowUpRecord = {
  companyId: string;
  companyName: string;
  city: string;
  stage: FollowUpStage;
  owner: string;
  nextReminderAt: string;
  note: string;
  lastFollowedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpRecordsPayload = {
  items: FollowUpRecord[];
  totals?: {
    overall: number;
    assigned: number;
    unassigned: number;
  };
};

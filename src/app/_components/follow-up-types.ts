export type FollowUpStage = "priority" | "watch" | "screening";

export type FollowUpCommunicationMethod = "phone" | "wechat" | "visit" | "email" | "other" | "";

export type FollowUpContactResult =
  | "not_contacted"
  | "connected"
  | "interested"
  | "no_need"
  | "pending"
  | "invalid"
  | "";

export type FollowUpDealStage =
  | "lead"
  | "qualified"
  | "contacted"
  | "proposal"
  | "won"
  | "lost"
  | "";

export type FollowUpRecord = {
  companyId: string;
  companyName: string;
  city: string;
  stage: FollowUpStage;
  owner: string;
  communicationMethod: FollowUpCommunicationMethod;
  contactResult: FollowUpContactResult;
  nextAction: string;
  dealStage: FollowUpDealStage;
  nextReminderAt: string;
  note: string;
  lastFollowedAt: string;
  createdAt: string;
  updatedAt: string;
  events?: FollowUpEvent[];
};

export type FollowUpEvent = {
  id: number;
  companyId: string;
  companyName: string;
  city: string;
  stage: FollowUpStage;
  owner: string;
  communicationMethod: FollowUpCommunicationMethod;
  contactResult: FollowUpContactResult;
  nextAction: string;
  dealStage: FollowUpDealStage;
  nextReminderAt: string;
  note: string;
  followedAt: string;
  createdAt: string;
};

export type FollowUpRecordsPayload = {
  items: FollowUpRecord[];
  totals?: {
    overall: number;
    assigned: number;
    unassigned: number;
  };
};

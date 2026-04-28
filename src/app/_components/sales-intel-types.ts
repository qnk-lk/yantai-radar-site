export type SalesIntelEvidence = {
  source: string;
  url: string;
  note: string;
};

export type SalesIntelMatchedJob = {
  platform: string;
  jobTitle: string;
  city: string;
  salary: string;
  publishedAt: string;
  url: string;
  keywordHits?: string[];
  descriptionEvidence: string;
};

export type SalesIntelDetailRow = {
  label: string;
  value: string;
};

export type SalesIntelItem = {
  id: string;
  kind: "report" | "recruitment";
  retrievedAt?: string | null;
  category: string;
  title: string;
  subtitle: string;
  summary: string;
  sourceLabel: string;
  publishedAt: string;
  location: string;
  entity: string;
  strength: string;
  actionText: string;
  tags: string[];
  detailRows?: SalesIntelDetailRow[];
  evidence?: SalesIntelEvidence[];
  matchedJobs?: SalesIntelMatchedJob[];
  allJobs?: SalesIntelMatchedJob[];
};

export type SalesIntelData = {
  updatedAt: string;
  todaySearchItems?: string[];
  summary: {
    focus: string;
    status: string;
    note: string;
  };
  totals: {
    overall: number;
    reportItems: number;
    recruitmentItems: number;
    todayHighlights: number;
  };
  sourceBreakdown: Array<{
    kind: "report" | "recruitment";
    count: number;
    updatedAt: string;
  }>;
  feed: SalesIntelItem[];
  todayHighlights: SalesIntelItem[];
};

export type LeadActionStatus = "useful" | "invalid" | "follow_up" | "company";

export type LeadActionRecord = {
  itemId: string;
  status: LeadActionStatus;
  companyId: string;
  companyName: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadActionsPayload = {
  items: LeadActionRecord[];
  totals?: {
    overall: number;
  };
};

export type CompanyDuplicateCompany = {
  companyId: string;
  companyName: string;
  city: string;
  duplicateKey: string;
  latestRetrievedAt: string;
  signalCount: number;
  sourcePlatforms: string[];
  sampleTitle: string;
  sampleSummary: string;
};

export type CompanyDuplicateGroup = {
  id: string;
  duplicateKey: string;
  canonicalName: string;
  confidence: number;
  reasons: string[];
  companies: CompanyDuplicateCompany[];
};

export type CompanyDuplicatesPayload = {
  groups: CompanyDuplicateGroup[];
  totals?: {
    groups: number;
    companies: number;
  };
  updatedAt?: string;
};

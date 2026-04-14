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
  detailRows: SalesIntelDetailRow[];
  evidence: SalesIntelEvidence[];
  matchedJobs: SalesIntelMatchedJob[];
};

export type SalesIntelData = {
  updatedAt: string;
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

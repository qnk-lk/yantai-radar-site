export type CompetitorEvidence = {
  source: string;
  url: string;
  note: string;
};

export type CompetitorBaseline = {
  companyName: string;
  serviceScopeSummary: string;
  evidence: CompetitorEvidence[];
};

export type CompetitorCompany = {
  rank: number;
  companyName: string;
  city: string;
  province?: string;
  district?: string;
  location?: string;
  address?: string;
  poiName?: string;
  latitude?: number | null;
  longitude?: number | null;
  geocodeSource?: string;
  geocodeConfidence?: string;
  geocodedAt?: string;
  distanceTier: string;
  serviceFit: string;
  manufacturingFocus: string;
  coreServices: string[];
  whyRelevant: string;
  evidenceStrength: string;
  evidence: CompetitorEvidence[];
};

export type CompetitorData = {
  updatedAt: string;
  status: string;
  note: string;
  baseline: CompetitorBaseline;
  competitors: CompetitorCompany[];
};

export type ChinaAdminIndex = Record<string, Record<string, string[]>>;

export const DISTANCE_ORDER = ["烟台本地", "青岛重点"] as const;

export const DISTANCE_LABELS: Record<string, string> = {
  烟台本地: "烟台本地",
  青岛重点: "青岛重点",
};

export const CITY_ORDER = ["烟台", "青岛"] as const;

export const CITY_LABELS: Record<string, string> = {
  烟台: "烟台",
  青岛: "青岛",
};

export function getCompetitorKey(company: CompetitorCompany): string {
  return `${company.rank}-${company.companyName}`;
}

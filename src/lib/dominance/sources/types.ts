// 수집기가 내놓는 두 가지 모양. DB 표와 1:1 로 맞춘다.
//
// 라이선스 허용 목록 밖이면 수집기가 행을 만들지 않는다. DDL 의 CHECK 가
// 마지막 방어선이지만, 거기까지 보내지 않는 것이 먼저다.

export type PaperSource = "arxiv" | "medrxiv" | "biorxiv" | "europepmc";
export type Agency = "mohw" | "msit" | "kdca";
export type AllowedLicense = "cc0" | "cc_by" | "public_domain";

export type RawPaper = {
  source: PaperSource;
  external_id: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: string[];
  published_date: string | null;
  license: AllowedLicense;
  license_raw: string;
  landing_url: string;
  version: "preprint" | "published";
  raw_data?: unknown;
};

export type RawGovPress = {
  agency: Agency;
  external_id: string;
  title: string;
  body: string | null;
  published_date: string | null;
  landing_url: string;
  attribution: string;
};

export type CollectReport = {
  source: string;
  found: number;
  /** 라이선스 허용 목록 밖이라 버린 수. 0 이면 필터가 안 돌았는지 의심한다. */
  rejected: number;
  errors: string[];
};

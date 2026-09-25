// 라이선스 문자열을 허용 목록 세 가지로 옮긴다.
//
// 허용 목록은 cc0 · cc_by · public_domain 뿐이다.
// NC(비상업)·ND(변형금지)·SA(동일조건전파) 는 전부 밖이다. ND 를 빼는 이유는
// 우리가 논문을 한국어로 다시 쓰는데, 그것이 "변형" 으로 읽힐 수 있기 때문이다.
// SA 를 빼는 이유는 우리 레터 전체가 같은 조건으로 전파될 위험이 있기 때문이다.

import type { AllowedLicense } from "./types";

const PUBLIC_DOMAIN_HINTS = [
  "public domain",
  "publicdomain",
  "us government work",
  "u.s. government work",
  "no copyright",
];

/**
 * 허용 목록 안이면 코드를, 밖이거나 읽을 수 없으면 null 을 낸다.
 * null 은 "허락 없음" 이 아니라 "허락을 확인하지 못함" 이고, 둘 다 수집하지 않는다.
 */
export function normalizeLicense(raw: string | null | undefined): AllowedLicense | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[_\s]+/g, "-");

  // 먼저 거른다. cc-by-nc-nd 는 cc-by 를 포함하므로 순서가 중요하다.
  if (/\bnc\b|noncommercial|non-commercial/.test(s)) return null;
  if (/\bnd\b|noderiv/.test(s)) return null;
  if (/\bsa\b|sharealike|share-alike/.test(s)) return null;

  if (/cc-?0|cc-zero|zero-1\.0/.test(s)) return "cc0";
  if (PUBLIC_DOMAIN_HINTS.some((h) => s.includes(h.replace(/\s+/g, "-")))) {
    return "public_domain";
  }
  if (/cc-?by/.test(s)) return "cc_by";

  return null;
}

/** 공공누리 제1유형 의무 출처표시 문구. 수집 시점에 확정해 행에 저장한다. */
export function koglAttribution(agencyLabel: string, title: string): string {
  return `${agencyLabel}, "${title}", 공공누리 제1유형`;
}

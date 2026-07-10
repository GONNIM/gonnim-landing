import { FIELD_LIMITS, TOPIC_MIN_LENGTH } from "@/lib/contact-constants";
import { isValidCategorySlug } from "@/lib/inquiry-categories";

export type Region = "kr" | "intl";

export function normalizeRegion(raw: unknown): Region {
  return raw === "intl" ? "intl" : "kr";
}

export type ParsedForm = {
  region: Region;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  category: string;
  topic: string;
  honeypot: string;
};

// 국내: 한글 (완성형 + 자음/모음) + 영문 + 숫자 + 허용 기호 + 공백
// 해외: 영문 + 숫자 + 허용 기호 + 공백
// 허용 기호 13종: . , & ( ) - _ · ' / @ #
export const TEXT_REGEX_KR =
  /^[ㄱ-ㅣ가-힣a-zA-Z0-9\s.,&()\-_·'/@#]+$/;
export const TEXT_REGEX_INTL = /^[a-zA-Z0-9\s.,&()\-_·'/@#]+$/;

export const TEXT_SYMBOL_HINT = "공백 · . , & ( ) - _ · ' / @ #";

// 전화
export const PHONE_REGEX_KR = /^[0-9\-()\s]+$/;
export const PHONE_REGEX_INTL = /^\+[0-9\-()\s]+$/;
export const PHONE_DIGIT_MIN_KR = 9;
export const PHONE_DIGIT_MIN_INTL = 8;

// 이메일
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 임시 이메일 blacklist (자주 쓰이는 20종)
export const EMAIL_DOMAIN_BLACKLIST = new Set([
  "mailinator.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "throwaway.email",
  "yopmail.com",
  "getnada.com",
  "trashmail.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "spambox.us",
  "moakt.com",
  "mytemp.email",
  "emailondeck.com",
  "burnermail.io",
]);

export function normalize(value: string): string {
  return value.trim().normalize("NFC");
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function sanitizeTopic(value: string): {
  clean: string;
  error: string | null;
} {
  // HTML 태그 제거
  const stripped = value.replace(/<[^>]*>/g, "");
  // URL 최대 3개
  const urls = stripped.match(/https?:\/\/[^\s]+/gi) ?? [];
  if (urls.length > 3) {
    return {
      clean: stripped,
      error: "URL 은 최대 3개까지 포함할 수 있습니다.",
    };
  }
  return { clean: stripped, error: null };
}

/** 국내 전화 자동 하이픈: 010/070/02/031 등 대응 */
export function formatKRPhone(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length === 0) return "";
  // 서울 02: 2-3-4 or 2-4-4
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  // 010/070/031 등: 3-4-4
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

// ─── 필드별 실시간 검증 ────────────────────────────────────────
export type FieldError = string | null;

function checkText(
  value: string,
  region: Region,
  limit: number,
  fieldLabel: string,
): FieldError {
  if (!value) return `${fieldLabel}을(를) 입력해주세요.`;
  if (value.length > limit)
    return `${fieldLabel}은(는) ${limit}자 이하로 입력해주세요.`;
  const regex = region === "kr" ? TEXT_REGEX_KR : TEXT_REGEX_INTL;
  if (!regex.test(value)) {
    const langHint = region === "kr" ? "한글·영문·숫자" : "영문·숫자";
    return `${fieldLabel}은(는) ${langHint}·허용기호(${TEXT_SYMBOL_HINT})만 사용해주세요.`;
  }
  return null;
}

export function validateName(value: string, region: Region): FieldError {
  return checkText(value, region, FIELD_LIMITS.name, "이름");
}

export function validateCompany(value: string, region: Region): FieldError {
  return checkText(value, region, FIELD_LIMITS.company, "회사명");
}

/** 직책 · 선택 필드 · 값이 있을 때만 문자셋 검증 */
export function validateRole(value: string, region: Region): FieldError {
  if (!value) return null;
  if (value.length > FIELD_LIMITS.role)
    return `직책은 ${FIELD_LIMITS.role}자 이하로 입력해주세요.`;
  const regex = region === "kr" ? TEXT_REGEX_KR : TEXT_REGEX_INTL;
  if (!regex.test(value)) {
    const langHint = region === "kr" ? "한글·영문·숫자" : "영문·숫자";
    return `직책은(는) ${langHint}·허용기호(${TEXT_SYMBOL_HINT})만 사용해주세요.`;
  }
  return null;
}

export function validateEmail(value: string): FieldError {
  if (!value) return "이메일을 입력해주세요.";
  if (value.length > FIELD_LIMITS.email)
    return `이메일은 ${FIELD_LIMITS.email}자 이하로 입력해주세요.`;
  if (!EMAIL_REGEX.test(value))
    return "올바른 이메일 형식이 아닙니다.";
  const domain = value.split("@")[1]?.toLowerCase();
  if (domain && EMAIL_DOMAIN_BLACKLIST.has(domain)) {
    return "임시 이메일 도메인은 사용할 수 없습니다. 실 사용 이메일로 부탁드립니다.";
  }
  return null;
}

export function validatePhone(value: string, region: Region): FieldError {
  if (!value) return "전화번호를 입력해주세요.";
  if (value.length > FIELD_LIMITS.phone)
    return `전화번호는 ${FIELD_LIMITS.phone}자 이하로 입력해주세요.`;
  const regex = region === "kr" ? PHONE_REGEX_KR : PHONE_REGEX_INTL;
  if (!regex.test(value)) {
    return region === "kr"
      ? "국내 전화는 숫자·하이픈·괄호·공백만 사용해주세요 (예: 010-1234-5678)."
      : "해외 전화는 + 로 시작하고 숫자·하이픈·괄호·공백만 사용해주세요 (예: +82-10-1234-5678).";
  }
  const digits = value.replace(/\D/g, "");
  const minDigits =
    region === "kr" ? PHONE_DIGIT_MIN_KR : PHONE_DIGIT_MIN_INTL;
  if (digits.length < minDigits)
    return `전화번호 숫자가 최소 ${minDigits}자리 이상이어야 합니다.`;
  return null;
}

export function validateCategory(value: string): FieldError {
  if (!isValidCategorySlug(value)) return "문의 분야를 선택해주세요.";
  return null;
}

export function validateTopic(value: string): FieldError {
  if (!value) return "상담 주제를 입력해주세요.";
  if (value.length < TOPIC_MIN_LENGTH)
    return `상담 주제를 ${TOPIC_MIN_LENGTH}자 이상 입력해주세요.`;
  if (value.length > FIELD_LIMITS.topic)
    return `상담 주제는 ${FIELD_LIMITS.topic}자 이하로 입력해주세요.`;
  const { error: sanitizeError } = sanitizeTopic(value);
  if (sanitizeError) return sanitizeError;
  return null;
}

// ─── 서버 최종 검증 (전체) ────────────────────────────────────────
export function validate(parsed: ParsedForm): FieldError {
  const errors = [
    validateName(parsed.name, parsed.region),
    validateCompany(parsed.company, parsed.region),
    validateRole(parsed.role, parsed.region),
    validateEmail(parsed.email),
    validatePhone(parsed.phone, parsed.region),
    validateCategory(parsed.category),
    validateTopic(parsed.topic),
  ];
  const first = errors.find((e) => e !== null);
  return first ?? null;
}

// ─── FormData 파싱 (NFC 정규화 포함) ────────────────────────────────
export function parseForm(formData: FormData): ParsedForm {
  const get = (k: string) => normalize(String(formData.get(k) ?? ""));
  return {
    region: normalizeRegion(formData.get("region")),
    name: get("name"),
    company: get("company"),
    role: get("role"),
    email: get("email"),
    phone: get("phone"),
    category: get("category"),
    topic: get("topic"),
    honeypot: String(formData.get("website") ?? "").trim(),
  };
}

import { FIELD_LIMITS, TOPIC_MIN_LENGTH } from "@/lib/contact-constants";
import { isValidCategorySlug } from "@/lib/inquiry-categories";

export type ParsedForm = {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  category: string;
  topic: string;
  honeypot: string;
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[0-9+\-\s()]+$/;
export const PHONE_DIGIT_MIN = 9;

export function parseForm(formData: FormData): ParsedForm {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: get("name"),
    company: get("company"),
    role: get("role"),
    email: get("email"),
    phone: get("phone"),
    category: get("category"),
    topic: get("topic"),
    honeypot: get("website"),
  };
}

export function validate(parsed: ParsedForm): string | null {
  if (!parsed.name) return "이름을 입력해주세요.";
  if (parsed.name.length > FIELD_LIMITS.name)
    return `이름은 ${FIELD_LIMITS.name}자 이하로 입력해주세요.`;

  if (!parsed.company) return "회사명을 입력해주세요.";
  if (parsed.company.length > FIELD_LIMITS.company)
    return `회사명은 ${FIELD_LIMITS.company}자 이하로 입력해주세요.`;

  if (!parsed.role) return "직책을 입력해주세요.";
  if (parsed.role.length > FIELD_LIMITS.role)
    return `직책은 ${FIELD_LIMITS.role}자 이하로 입력해주세요.`;

  if (!parsed.email) return "이메일을 입력해주세요.";
  if (parsed.email.length > FIELD_LIMITS.email)
    return `이메일은 ${FIELD_LIMITS.email}자 이하로 입력해주세요.`;
  if (!EMAIL_REGEX.test(parsed.email))
    return "올바른 이메일 형식이 아닙니다.";

  if (!parsed.phone) return "전화번호를 입력해주세요.";
  if (parsed.phone.length > FIELD_LIMITS.phone)
    return `전화번호는 ${FIELD_LIMITS.phone}자 이하로 입력해주세요.`;
  if (!PHONE_REGEX.test(parsed.phone))
    return "전화번호는 숫자·하이픈·괄호·+ 만 허용됩니다.";
  const phoneDigits = parsed.phone.replace(/\D/g, "");
  if (phoneDigits.length < PHONE_DIGIT_MIN)
    return `전화번호 숫자가 최소 ${PHONE_DIGIT_MIN}자리 이상이어야 합니다 (예: 010-0000-0000).`;

  if (!isValidCategorySlug(parsed.category))
    return "문의 분야를 선택해주세요.";

  if (!parsed.topic) return "상담 주제를 입력해주세요.";
  if (parsed.topic.length < TOPIC_MIN_LENGTH)
    return `상담 주제를 ${TOPIC_MIN_LENGTH}자 이상 자세히 적어주세요.`;
  if (parsed.topic.length > FIELD_LIMITS.topic)
    return `상담 주제는 ${FIELD_LIMITS.topic}자 이하로 입력해주세요.`;

  return null;
}

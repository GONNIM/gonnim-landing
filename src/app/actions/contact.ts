"use server";

import { Resend } from "resend";
import {
  INQUIRY_CATEGORIES,
  isValidCategorySlug,
} from "@/lib/inquiry-categories";

const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL ?? "hi@gonnim.dev";
const TO_EMAIL = process.env.CONTACT_TO_EMAIL ?? "hi@gonnim.dev";

export type ContactState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldError?: string | null;
};

export const INITIAL_STATE: ContactState = {
  status: "idle",
  message: "",
  fieldError: null,
};

type ParsedForm = {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  category: string;
  topic: string;
};

function parseForm(formData: FormData): ParsedForm {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: get("name"),
    company: get("company"),
    role: get("role"),
    email: get("email"),
    phone: get("phone"),
    category: get("category"),
    topic: get("topic"),
  };
}

function validate(parsed: ParsedForm): string | null {
  if (!parsed.name) return "이름을 입력해주세요.";
  if (!parsed.company) return "회사명을 입력해주세요.";
  if (!parsed.role) return "직책을 입력해주세요.";
  if (!parsed.email) return "이메일을 입력해주세요.";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(parsed.email)) return "올바른 이메일 형식이 아닙니다.";
  if (!parsed.phone) return "전화번호를 입력해주세요.";
  if (!isValidCategorySlug(parsed.category)) {
    return "문의 분야를 선택해주세요.";
  }
  if (!parsed.topic || parsed.topic.length < 10) {
    return "상담 주제를 10자 이상 자세히 적어주세요.";
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categoryLabel(slug: string): string {
  const match = INQUIRY_CATEGORIES.find((c) => c.slug === slug);
  return match ? match.label : slug;
}

function renderHtml(parsed: ParsedForm): string {
  const rows: [string, string][] = [
    ["이름", parsed.name],
    ["회사", parsed.company],
    ["직책", parsed.role],
    ["이메일", parsed.email],
    ["전화번호", parsed.phone],
    ["문의 분야", categoryLabel(parsed.category)],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:120px;">${escapeHtml(label)}</td><td style="padding:8px 12px;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const topicHtml = escapeHtml(parsed.topic).replaceAll("\n", "<br />");
  return `<!doctype html><html><body style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;color:#0a0a0a;max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 8px 0;font-size:20px;">gonnim.dev · 새 상담 요청</h2>
    <p style="margin:0 0 20px 0;color:#71717a;font-size:14px;">사전 분석 문의 폼 접수 · 3영업일 이내 회신</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">${rowsHtml}</table>
    <h3 style="margin:24px 0 8px 0;font-size:16px;">상담 주제</h3>
    <div style="padding:12px;background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;font-size:14px;line-height:1.6;">${topicHtml}</div>
    <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:12px;">회신은 <a href="mailto:${escapeHtml(parsed.email)}" style="color:#0ea5e9;">${escapeHtml(parsed.email)}</a> 로 부탁드립니다.</p>
  </body></html>`;
}

export async function submitContact(
  _prevState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseForm(formData);
  const error = validate(parsed);
  if (error) {
    return { status: "error", message: error, fieldError: error };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[contact] RESEND_API_KEY 미설정 — 개발 모드 stub 응답. 프로덕션 배포 전 환경변수 설정 필요.",
    );
    return {
      status: "success",
      message:
        "요청이 접수되었습니다 (현재는 개발 stub · Resend 환경변수 설정 후 실 전송). 3영업일 이내 회신드리겠습니다.",
      fieldError: null,
    };
  }

  try {
    const resend = new Resend(apiKey);
    const label = categoryLabel(parsed.category);
    const { error: sendError } = await resend.emails.send({
      from: `gonnim.dev <${FROM_EMAIL}>`,
      to: [TO_EMAIL],
      replyTo: parsed.email,
      subject: `[상담 요청] ${label} · ${parsed.company}`,
      html: renderHtml(parsed),
    });
    if (sendError) {
      console.error("[contact] Resend 전송 실패", sendError);
      return {
        status: "error",
        message:
          "전송 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 hi@gonnim.dev 로 직접 연락 부탁드립니다.",
        fieldError: null,
      };
    }
    return {
      status: "success",
      message:
        "요청이 접수되었습니다. 3영업일 이내 회신드리겠습니다. 회신은 입력하신 이메일로 전달됩니다.",
      fieldError: null,
    };
  } catch (err) {
    console.error("[contact] Resend 예외", err);
    return {
      status: "error",
      message:
        "전송 중 문제가 발생했습니다. hi@gonnim.dev 로 직접 연락 부탁드립니다.",
      fieldError: null,
    };
  }
}

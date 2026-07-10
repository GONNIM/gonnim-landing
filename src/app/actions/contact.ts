"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import type { ContactState } from "@/lib/contact-state";
import {
  parseForm,
  sanitizeTopic,
  validate,
  type ParsedForm,
} from "@/lib/contact-validation";
import { INQUIRY_CATEGORIES } from "@/lib/inquiry-categories";
import { verifyEmailDomain } from "@/lib/mx-check";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL ?? "hi@gonnim.dev";
const TO_EMAIL = process.env.CONTACT_TO_EMAIL ?? "hi@gonnim.dev";

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

function regionLabel(region: ParsedForm["region"]): string {
  return region === "kr" ? "국내" : "해외";
}

function renderHtml(parsed: ParsedForm, cleanTopic: string): string {
  const rows: [string, string][] = [
    ["구분", regionLabel(parsed.region)],
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
  const topicHtml = escapeHtml(cleanTopic).replaceAll("\n", "<br />");
  return `<!doctype html><html><body style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;color:#0a0a0a;max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 8px 0;font-size:20px;">gonnim.dev · 새 상담 요청</h2>
    <p style="margin:0 0 20px 0;color:#71717a;font-size:14px;">사전 분석 문의 폼 접수 · 3영업일 이내 회신</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">${rowsHtml}</table>
    <h3 style="margin:24px 0 8px 0;font-size:16px;">상담 주제</h3>
    <div style="padding:12px;background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;font-size:14px;line-height:1.6;">${topicHtml}</div>
    <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:12px;">회신은 <a href="mailto:${escapeHtml(parsed.email)}" style="color:#0369a1;">${escapeHtml(parsed.email)}</a> 로 부탁드립니다.</p>
  </body></html>`;
}

async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
    const real = h.get("x-real-ip");
    if (real) return real.trim();
  } catch {
    // headers() 가 정적 렌더 시점에 호출되면 예외 · 무시
  }
  return "unknown";
}

const SUCCESS_MESSAGE =
  "요청이 접수되었습니다. 3영업일 이내 회신드리겠습니다. 회신은 입력하신 이메일로 전달됩니다.";

export async function submitContact(
  _prevState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseForm(formData);

  // 1. honeypot: 봇이 자동 채운 경우 성공처럼 응답하되 실 전송 안 함
  if (parsed.honeypot) {
    console.info("[contact] honeypot 감지 · 봇 의심 · silent reject");
    return { status: "success", message: SUCCESS_MESSAGE, fieldError: null };
  }

  const clientIp = await resolveClientIp();

  // 2. Turnstile (env 활성 시)
  const turnstileToken = String(
    formData.get("cf-turnstile-response") ?? "",
  ).trim();
  const turnstile = await verifyTurnstile(turnstileToken || null, clientIp);
  if (!turnstile.ok) {
    return {
      status: "error",
      message: turnstile.reason ?? "봇 방지 검증에 실패했습니다.",
      fieldError: null,
    };
  }

  // 3. Rate limit (env 활성 시 · IP 당 5분 3회)
  const rate = await checkRateLimit(clientIp);
  if (!rate.ok) {
    return {
      status: "error",
      message: rate.reason ?? "짧은 시간에 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      fieldError: null,
    };
  }

  // 4. 형식 검증
  const validationError = validate(parsed);
  if (validationError) {
    return {
      status: "error",
      message: validationError,
      fieldError: validationError,
    };
  }

  // 5. 이메일 도메인 MX 실 검증 (env 활성 시)
  const mx = await verifyEmailDomain(parsed.email);
  if (!mx.ok) {
    return {
      status: "error",
      message: mx.reason ?? "이메일 도메인 확인 실패.",
      fieldError: mx.reason ?? null,
    };
  }

  // 6. topic sanitize (HTML 태그 스트립 + URL 상한 재검증)
  const { clean: cleanTopic, error: sanitizeError } = sanitizeTopic(
    parsed.topic,
  );
  if (sanitizeError) {
    return {
      status: "error",
      message: sanitizeError,
      fieldError: sanitizeError,
    };
  }

  // 7. Resend 발신 (env 없으면 stub 안전 성공)
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[contact] RESEND_API_KEY 미설정 — 개발 모드 stub 응답",
    );
    return {
      status: "success",
      message:
        "요청이 접수되었습니다 (개발 stub · Resend 환경변수 설정 후 실 전송).",
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
      html: renderHtml(parsed, cleanTopic),
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
    return { status: "success", message: SUCCESS_MESSAGE, fieldError: null };
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

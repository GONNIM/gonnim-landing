"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  GROUP_LABELS,
  INQUIRY_CATEGORIES,
  isValidCategorySlug,
  type InquiryGroup,
} from "@/lib/inquiry-categories";

type Status = "idle" | "submitting" | "success" | "error";

type FieldName = "name" | "company" | "role" | "email" | "phone";

const FIELDS: {
  name: FieldName;
  label: string;
  type: "text" | "email" | "tel";
  placeholder: string;
  required: boolean;
  autoComplete?: string;
}[] = [
  {
    name: "name",
    label: "이름",
    type: "text",
    placeholder: "홍길동",
    required: true,
    autoComplete: "name",
  },
  {
    name: "company",
    label: "회사",
    type: "text",
    placeholder: "회사명",
    required: true,
    autoComplete: "organization",
  },
  {
    name: "role",
    label: "직책",
    type: "text",
    placeholder: "예: CTO · 개발팀장 · 기획",
    required: true,
    autoComplete: "organization-title",
  },
  {
    name: "email",
    label: "이메일",
    type: "email",
    placeholder: "hong@company.com",
    required: true,
    autoComplete: "email",
  },
  {
    name: "phone",
    label: "전화번호",
    type: "tel",
    placeholder: "010-0000-0000",
    required: true,
    autoComplete: "tel",
  },
];

const GROUP_ORDER: InquiryGroup[] = ["products", "services", "other"];

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("category");
    if (isValidCategorySlug(raw)) {
      setCategory(raw);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    // TODO(D-5+): 폼 백엔드 결정 후 실 전송 (Resend + Server Action 유력)
    // 현재는 UI 검증용 stub — 콘솔 로그 + 임시 성공 메시지
    try {
      // eslint-disable-next-line no-console
      console.info("[contact-form:stub] submitted", payload);
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStatus("success");
      setMessage(
        "요청이 접수되었습니다. 3영업일 이내 회신드리겠습니다. (현재는 UI 검증 단계 · 백엔드 연결 대기)",
      );
      event.currentTarget.reset();
      setCategory("");
    } catch {
      setStatus("error");
      setMessage(
        "전송 중 문제가 발생했습니다. hi@gonnim.dev 로 직접 연락 부탁드립니다.",
      );
    }
  }

  const isSubmitting = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label
            key={field.name}
            className="flex flex-col gap-1.5 text-sm"
            htmlFor={`contact-${field.name}`}
          >
            <span className="font-semibold text-[color:var(--color-foreground)]">
              {field.label}
              {field.required && (
                <span aria-hidden className="ml-1 text-[color:var(--color-accent)]">
                  *
                </span>
              )}
            </span>
            <input
              id={`contact-${field.name}`}
              name={field.name}
              type={field.type}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete={field.autoComplete}
              disabled={isSubmitting}
              className="h-11 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:border-[color:var(--color-accent)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        ))}
      </div>

      <label
        className="flex flex-col gap-1.5 text-sm"
        htmlFor="contact-category"
      >
        <span className="font-semibold text-[color:var(--color-foreground)]">
          문의 분야
          <span aria-hidden className="ml-1 text-[color:var(--color-accent)]">
            *
          </span>
          <span className="ml-2 text-xs font-normal text-[color:var(--color-muted)]">
            (해당 상품·서비스가 없으면 기타 선택 후 상담 주제에 자유롭게 기술)
          </span>
        </span>
        <select
          id="contact-category"
          name="category"
          required
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          disabled={isSubmitting}
          className="h-11 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 text-sm text-[color:var(--color-foreground)] focus:border-[color:var(--color-accent)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            문의 분야를 선택해주세요
          </option>
          {GROUP_ORDER.map((group) => {
            const items = INQUIRY_CATEGORIES.filter((c) => c.group === group);
            if (items.length === 0) return null;
            return (
              <optgroup key={group} label={GROUP_LABELS[group]}>
                {items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>

      <label
        className="flex flex-col gap-1.5 text-sm"
        htmlFor="contact-topic"
      >
        <span className="font-semibold text-[color:var(--color-foreground)]">
          상담 주제
          <span aria-hidden className="ml-1 text-[color:var(--color-accent)]">
            *
          </span>
        </span>
        <textarea
          id="contact-topic"
          name="topic"
          required
          rows={5}
          disabled={isSubmitting}
          placeholder="프로젝트 개요 · 현재 스택 · 해결하고 싶은 문제를 자유롭게 적어주세요."
          className="min-h-[120px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:border-[color:var(--color-accent)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] px-8 text-base font-semibold text-[color:var(--color-accent-foreground)] shadow-sm transition-transform hover:scale-[1.01] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "전송 중…" : "요청 보내기"}
        {!isSubmitting && <span aria-hidden>→</span>}
      </button>

      {status !== "idle" && message && (
        <p
          role="status"
          aria-live="polite"
          className={
            status === "success"
              ? "rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-foreground)]"
              : "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          }
        >
          {message}
        </p>
      )}
    </form>
  );
}

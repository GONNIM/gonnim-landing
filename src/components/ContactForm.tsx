"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitContact } from "@/app/actions/contact";
import {
  FIELD_LIMITS,
  TOPIC_MIN_LENGTH,
} from "@/lib/contact-constants";
import {
  INITIAL_STATE,
  type ContactState,
} from "@/lib/contact-state";
import {
  GROUP_LABELS,
  INQUIRY_CATEGORIES,
  isValidCategorySlug,
  type InquiryGroup,
} from "@/lib/inquiry-categories";

type FieldName = "name" | "company" | "role" | "email" | "phone";

const FIELDS: {
  name: FieldName;
  label: string;
  type: "text" | "email" | "tel";
  placeholder: string;
  required: boolean;
  autoComplete?: string;
  maxLength: number;
  pattern?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
}[] = [
  {
    name: "name",
    label: "이름",
    type: "text",
    placeholder: "홍길동",
    required: true,
    autoComplete: "name",
    maxLength: FIELD_LIMITS.name,
  },
  {
    name: "company",
    label: "회사",
    type: "text",
    placeholder: "회사명",
    required: true,
    autoComplete: "organization",
    maxLength: FIELD_LIMITS.company,
  },
  {
    name: "role",
    label: "직책",
    type: "text",
    placeholder: "예: CTO · 개발팀장 · 기획",
    required: true,
    autoComplete: "organization-title",
    maxLength: FIELD_LIMITS.role,
  },
  {
    name: "email",
    label: "이메일",
    type: "email",
    placeholder: "hong@company.com",
    required: true,
    autoComplete: "email",
    maxLength: FIELD_LIMITS.email,
  },
  {
    name: "phone",
    label: "전화번호",
    type: "tel",
    placeholder: "010-0000-0000",
    required: true,
    autoComplete: "tel",
    maxLength: FIELD_LIMITS.phone,
    pattern: "[0-9+\\-\\s()]{9,20}",
    inputMode: "tel",
  },
];

const GROUP_ORDER: InquiryGroup[] = ["products", "services", "other"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] px-8 text-base font-semibold text-[color:var(--color-accent-foreground)] shadow-sm transition-transform hover:scale-[1.01] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "전송 중…" : "요청 보내기"}
      {!pending && <span aria-hidden>→</span>}
    </button>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState<ContactState, FormData>(
    submitContact,
    INITIAL_STATE,
  );
  const [category, setCategory] = useState<string>("");
  const [topic, setTopic] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("category");
    if (isValidCategorySlug(raw)) {
      setCategory(raw);
    }
  }, []);

  useEffect(() => {
    if (state.status === "success" && typeof document !== "undefined") {
      const form = document.getElementById(
        "contact-form",
      ) as HTMLFormElement | null;
      form?.reset();
      setCategory("");
      setTopic("");
    }
  }, [state.status]);

  const topicLen = topic.length;
  const topicOK = topicLen >= TOPIC_MIN_LENGTH;
  const topicCountColor = topicOK
    ? "text-[color:var(--color-muted)]"
    : "text-[color:var(--color-accent)]";

  return (
    <form
      id="contact-form"
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
    >
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
              maxLength={field.maxLength}
              pattern={field.pattern}
              inputMode={field.inputMode}
              className="h-11 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:border-[color:var(--color-accent)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--color-accent)]"
            />
          </label>
        ))}
      </div>

      {/* honeypot: 봇 감지용 · sr-only + tabIndex=-1 + autoComplete=off · 사람은 안 보이고 봇은 채움 */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="contact-website">
          Website (leave blank)
          <input
            id="contact-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
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
          className="h-11 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 text-sm text-[color:var(--color-foreground)] focus:border-[color:var(--color-accent)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--color-accent)]"
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
        <span className="flex items-baseline justify-between font-semibold text-[color:var(--color-foreground)]">
          <span>
            상담 주제
            <span
              aria-hidden
              className="ml-1 text-[color:var(--color-accent)]"
            >
              *
            </span>
          </span>
          <span
            aria-live="polite"
            className={`text-xs font-normal ${topicCountColor}`}
          >
            {topicOK
              ? `${topicLen} / ${FIELD_LIMITS.topic}자`
              : `${topicLen} / ${TOPIC_MIN_LENGTH}자 이상 필요`}
          </span>
        </span>
        <textarea
          id="contact-topic"
          name="topic"
          required
          rows={5}
          minLength={TOPIC_MIN_LENGTH}
          maxLength={FIELD_LIMITS.topic}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder={`프로젝트 개요 · 현재 스택 · 해결하고 싶은 문제를 자유롭게 적어주세요. (최소 ${TOPIC_MIN_LENGTH}자 · 최대 ${FIELD_LIMITS.topic}자)`}
          className="min-h-[120px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:border-[color:var(--color-accent)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--color-accent)]"
        />
      </label>

      <SubmitButton />

      {state.status !== "idle" && state.message && (
        <p
          role="status"
          aria-live="polite"
          className={
            state.status === "success"
              ? "rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-foreground)]"
              : "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          }
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

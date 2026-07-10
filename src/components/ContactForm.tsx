"use client";

import Script from "next/script";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from "react";
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
  formatKRPhone,
  normalize,
  validateCategory,
  validateCompany,
  validateEmail,
  validateHumanCheck,
  validateName,
  validatePhone,
  validateRole,
  validateTopic,
  WORD_COUNT_MIN,
  type FieldError,
  type Region,
} from "@/lib/contact-validation";
import {
  GROUP_LABELS,
  INQUIRY_CATEGORIES,
  isValidCategorySlug,
  type InquiryGroup,
} from "@/lib/inquiry-categories";

type FieldName =
  | "name"
  | "company"
  | "role"
  | "email"
  | "phone"
  | "category"
  | "topic";

type Values = Record<FieldName, string>;
type Errors = Partial<Record<FieldName, FieldError>>;
type Touched = Partial<Record<FieldName, boolean>>;

const INITIAL_VALUES: Values = {
  name: "",
  company: "",
  role: "",
  email: "",
  phone: "",
  category: "",
  topic: "",
};

const GROUP_ORDER: InquiryGroup[] = ["products", "services", "other"];

const TEXT_FIELDS: {
  name: "name" | "company" | "role" | "email" | "phone";
  label: string;
  type: "text" | "email" | "tel";
  autoComplete: string;
  maxLength: number;
  inputMode?: "text" | "email" | "tel";
}[] = [
  {
    name: "name",
    label: "이름",
    type: "text",
    autoComplete: "name",
    maxLength: FIELD_LIMITS.name,
  },
  {
    name: "company",
    label: "회사",
    type: "text",
    autoComplete: "organization",
    maxLength: FIELD_LIMITS.company,
  },
  {
    name: "role",
    label: "직책",
    type: "text",
    autoComplete: "organization-title",
    maxLength: FIELD_LIMITS.role,
  },
  {
    name: "email",
    label: "이메일",
    type: "email",
    autoComplete: "email",
    maxLength: FIELD_LIMITS.email,
    inputMode: "email",
  },
  {
    name: "phone",
    label: "전화번호",
    type: "tel",
    autoComplete: "tel",
    maxLength: FIELD_LIMITS.phone,
    inputMode: "tel",
  },
];

/** region 별 placeholder 매핑 · 이름/회사/직책/이메일/전화 */
const PLACEHOLDER_MAP: Record<
  Region,
  Record<"name" | "company" | "role" | "email" | "phone", string>
> = {
  kr: {
    name: "홍길동",
    company: "예: 홍변컴퍼니 (주)",
    role: "예: CTO · 개발팀장 · 기획",
    email: "hong@company.co.kr",
    phone: "010-1234-5678",
  },
  intl: {
    name: "e.g. John Doe",
    company: "e.g. Acme Corp.",
    role: "e.g. CTO · Product Manager",
    email: "john@company.com",
    phone: "+82-10-1234-5678",
  },
};

function placeholderFor(
  field: "name" | "company" | "role" | "email" | "phone",
  region: Region,
): string {
  return PLACEHOLDER_MAP[region][field];
}

function runValidator(
  field: FieldName,
  value: string,
  region: Region,
): FieldError {
  const v = normalize(value);
  switch (field) {
    case "name":
      return validateName(v, region);
    case "company":
      return validateCompany(v, region);
    case "role":
      return validateRole(v, region);
    case "email":
      return validateEmail(v);
    case "phone":
      return validatePhone(v, region);
    case "category":
      return validateCategory(v);
    case "topic":
      return validateTopic(v);
  }
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] px-8 text-base font-semibold text-[color:var(--color-accent-foreground)] shadow-sm transition-transform hover:scale-[1.01] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
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

  const [region, setRegion] = useState<Region>("kr");
  const [values, setValues] = useState<Values>(INITIAL_VALUES);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Touched>({});
  const [humanCheck, setHumanCheck] = useState<boolean>(false);
  const [humanCheckTouched, setHumanCheckTouched] = useState<boolean>(false);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileEnabled = Boolean(turnstileSiteKey);

  // URL param category preselect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("category");
    if (isValidCategorySlug(raw)) {
      setValues((v) => ({ ...v, category: raw }));
    }
  }, []);

  // 성공 시 폼 리셋
  useEffect(() => {
    if (state.status === "success") {
      setValues(INITIAL_VALUES);
      setErrors({});
      setTouched({});
      setHumanCheck(false);
      setHumanCheckTouched(false);
    }
  }, [state.status]);

  // region 변경 시 이름·회사·직책·전화 재검증
  useEffect(() => {
    setErrors((prev) => {
      const next: Errors = { ...prev };
      (["name", "company", "role", "phone"] as const).forEach((f) => {
        if (touched[f]) {
          next[f] = runValidator(f, values[f], region);
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const setField = (name: FieldName, raw: string) => {
    let value = raw;
    if (name === "phone" && region === "kr") {
      value = formatKRPhone(raw);
    }
    setValues((v) => ({ ...v, [name]: value }));
    // 실시간 검증: onChange 매 순간 재계산 (touched 조건 제거)
    setErrors((e) => ({ ...e, [name]: runValidator(name, value, region) }));
  };

  const handleBlur =
    (name: FieldName) => (_e: FocusEvent<HTMLElement>) => {
      setTouched((t) => ({ ...t, [name]: true }));
      setErrors((prev) => ({
        ...prev,
        [name]: runValidator(name, values[name], region),
      }));
    };

  const handleChange =
    (name: FieldName) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setField(name, event.target.value);
    };

  const allValid = useMemo(() => {
    const fieldsToCheck: FieldName[] = [
      "name",
      "company",
      "role",
      "email",
      "phone",
      "category",
      "topic",
    ];
    const fieldsOk = fieldsToCheck.every(
      (f) => runValidator(f, values[f], region) === null,
    );
    return fieldsOk && validateHumanCheck(humanCheck) === null;
  }, [values, region, humanCheck]);

  const topicLen = values.topic.length;
  const topicWords = values.topic
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const topicOK =
    topicLen >= TOPIC_MIN_LENGTH && topicWords >= WORD_COUNT_MIN;
  const topicCountColor = topicOK
    ? "text-[color:var(--color-muted)]"
    : "text-[color:var(--color-accent)]";

  const topicCountText = topicOK
    ? `${topicLen} / ${FIELD_LIMITS.topic}자 · ${topicWords}어절`
    : `${topicLen}자 · ${topicWords}어절 (${TOPIC_MIN_LENGTH}자 · ${WORD_COUNT_MIN}어절 이상 필요)`;

  return (
    <>
      {turnstileEnabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          async
          defer
        />
      )}
      <form
        id="contact-form"
        action={formAction}
        noValidate
        className="flex flex-col gap-5"
      >
        {/* Region · 국내/해외 */}
        <fieldset className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 text-sm">
          <legend className="px-1 font-semibold text-[color:var(--color-foreground)]">
            문의 구분
            <span aria-hidden className="ml-1 text-[color:var(--color-accent)]">*</span>
          </legend>
          <div className="flex gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="region"
                value="kr"
                checked={region === "kr"}
                onChange={() => setRegion("kr")}
                className="h-4 w-4 accent-[color:var(--color-accent)]"
              />
              <span className="text-[color:var(--color-foreground)]">
                국내 (한글·영문·숫자·기호)
              </span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="region"
                value="intl"
                checked={region === "intl"}
                onChange={() => setRegion("intl")}
                className="h-4 w-4 accent-[color:var(--color-accent)]"
              />
              <span className="text-[color:var(--color-foreground)]">
                Overseas (English)
              </span>
            </label>
          </div>
        </fieldset>

        {/* 텍스트/이메일/전화 필드 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((field) => {
            // 실시간 검증 · 표시 조건: 값이 입력되었거나(dirty) 필드에서 벗어난 적 있으면(touched)
            const hasContent = values[field.name].length > 0;
            const err =
              hasContent || touched[field.name]
                ? errors[field.name] ?? null
                : null;
            const placeholder = placeholderFor(field.name, region);
            return (
              <label
                key={field.name}
                className="flex flex-col gap-1.5 text-sm"
                htmlFor={`contact-${field.name}`}
              >
                <span className="font-semibold text-[color:var(--color-foreground)]">
                  {field.label}
                  <span
                    aria-hidden
                    className="ml-1 text-[color:var(--color-accent)]"
                  >
                    *
                  </span>
                </span>
                <input
                  id={`contact-${field.name}`}
                  name={field.name}
                  type={field.type}
                  placeholder={placeholder}
                  required
                  autoComplete={field.autoComplete}
                  maxLength={field.maxLength}
                  inputMode={field.inputMode}
                  value={values[field.name]}
                  onChange={handleChange(field.name)}
                  onBlur={handleBlur(field.name)}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? `err-${field.name}` : undefined}
                  className={`h-11 rounded-lg border bg-[color:var(--color-background)] px-3 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:outline-2 focus:outline-offset-1 ${
                    err
                      ? "border-red-400 focus:outline-red-400"
                      : "border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] focus:outline-[color:var(--color-accent)]"
                  }`}
                />
                {err && (
                  <p
                    id={`err-${field.name}`}
                    role="alert"
                    aria-live="polite"
                    className="text-xs leading-relaxed text-red-600 dark:text-red-400"
                  >
                    {err}
                  </p>
                )}
              </label>
            );
          })}
        </div>

        {/* honeypot: 봇 감지용 */}
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

        {/* 문의 분야 */}
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
          {(() => {
            const hasContent = values.category.length > 0;
            const showErr = hasContent || touched.category;
            const err = showErr ? errors.category ?? null : null;
            return (
              <>
                <select
                  id="contact-category"
                  name="category"
                  required
                  value={values.category}
                  onChange={handleChange("category")}
                  onBlur={handleBlur("category")}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? "err-category" : undefined}
                  className={`h-11 rounded-lg border bg-[color:var(--color-background)] px-3 text-sm text-[color:var(--color-foreground)] focus:outline-2 focus:outline-offset-1 ${
                    err
                      ? "border-red-400 focus:outline-red-400"
                      : "border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] focus:outline-[color:var(--color-accent)]"
                  }`}
                >
                  <option value="" disabled>
                    문의 분야를 선택해주세요
                  </option>
                  {GROUP_ORDER.map((group) => {
                    const items = INQUIRY_CATEGORIES.filter(
                      (c) => c.group === group,
                    );
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
                {err && (
                  <p
                    id="err-category"
                    role="alert"
                    aria-live="polite"
                    className="text-xs leading-relaxed text-red-600 dark:text-red-400"
                  >
                    {err}
                  </p>
                )}
              </>
            );
          })()}
        </label>

        {/* 상담 주제 */}
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
              {topicCountText}
            </span>
          </span>
          {(() => {
            const hasContent = values.topic.length > 0;
            const showErr = hasContent || touched.topic;
            const err = showErr ? errors.topic ?? null : null;
            const topicPlaceholder =
              region === "kr"
                ? `프로젝트 개요 · 현재 스택 · 해결하고 싶은 문제를 자유롭게 적어주세요 (최소 ${TOPIC_MIN_LENGTH}자 · ${WORD_COUNT_MIN}어절).`
                : `Describe your project scope, current stack, and problem to solve (min ${TOPIC_MIN_LENGTH} chars / ${WORD_COUNT_MIN} words).`;
            return (
              <>
                <textarea
                  id="contact-topic"
                  name="topic"
                  required
                  rows={5}
                  minLength={TOPIC_MIN_LENGTH}
                  maxLength={FIELD_LIMITS.topic}
                  value={values.topic}
                  onChange={handleChange("topic")}
                  onBlur={handleBlur("topic")}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? "err-topic" : undefined}
                  placeholder={topicPlaceholder}
                  className={`min-h-[120px] rounded-lg border bg-[color:var(--color-background)] p-3 text-sm text-[color:var(--color-foreground)] placeholder:text-[color:var(--color-muted)] focus:outline-2 focus:outline-offset-1 ${
                    err
                      ? "border-red-400 focus:outline-red-400"
                      : "border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] focus:outline-[color:var(--color-accent)]"
                  }`}
                />
                {err && (
                  <p
                    id="err-topic"
                    role="alert"
                    aria-live="polite"
                    className="text-xs leading-relaxed text-red-600 dark:text-red-400"
                  >
                    {err}
                  </p>
                )}
              </>
            );
          })()}
        </label>

        {turnstileEnabled && (
          <div
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-theme="auto"
          />
        )}

        {/* 명시 봇 방어 · 사용자 체크 필수 */}
        {(() => {
          const err = humanCheckTouched
            ? validateHumanCheck(humanCheck)
            : null;
          return (
            <label
              htmlFor="contact-human-check"
              className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                err
                  ? "border-red-400 bg-red-50 dark:bg-red-950/20"
                  : humanCheck
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface)]"
                    : "border-[color:var(--color-border)] bg-[color:var(--color-background)]"
              }`}
            >
              <input
                id="contact-human-check"
                name="human_check"
                type="checkbox"
                checked={humanCheck}
                onChange={(e) => {
                  setHumanCheck(e.target.checked);
                  setHumanCheckTouched(true);
                }}
                onBlur={() => setHumanCheckTouched(true)}
                aria-invalid={Boolean(err)}
                aria-describedby={err ? "err-human-check" : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-accent)]"
              />
              <span className="flex-1 leading-relaxed text-[color:var(--color-foreground)]">
                <span className="font-semibold">저는 봇이 아니며</span>{" "}
                gonnim.dev 의 3영업일 이내 회신 정책에 동의합니다.
                <span
                  aria-hidden
                  className="ml-1 text-[color:var(--color-accent)]"
                >
                  *
                </span>
                {err && (
                  <span
                    id="err-human-check"
                    role="alert"
                    aria-live="polite"
                    className="mt-1 block text-xs text-red-600 dark:text-red-400"
                  >
                    {err}
                  </span>
                )}
              </span>
            </label>
          );
        })()}

        <SubmitButton disabled={!allValid} />

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
    </>
  );
}

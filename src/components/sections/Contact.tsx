import { ContactForm } from "@/components/ContactForm";

const EMAIL_PRIMARY = "hi@gonnim.dev";
const EMAIL_BACKUP = "suauncle@gmail.com";
const RESUME_URL = "#resume";

export function Contact() {
  return (
    <section
      id="contact"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-3xl text-center sm:mb-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          Contact
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          프로젝트 검토 요청
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg">
          사전 분석 후 3영업일 이내 개별 컨택드립니다.
        </p>
      </header>

      <article className="mb-8 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 sm:p-8">
        <header className="mb-6 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--color-muted)]">
            카드 1 · 권장
          </p>
          <h3 className="text-xl font-bold leading-tight text-[color:var(--color-foreground)] sm:text-2xl">
            상담 요청 · 사전 분석 문의
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
            요청 내용을 먼저 분석한 뒤 사용자 페이스로 개별 컨택드립니다. 규격화된
            30분 슬롯이 아닌 프로젝트 맞춤 대응입니다.
          </p>
        </header>
        <ContactForm />
      </article>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <article className="flex h-full flex-col justify-between rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 sm:p-8">
          <header>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-muted)]">
              카드 2
            </p>
            <h3 className="text-xl font-bold leading-tight text-[color:var(--color-foreground)]">
              이메일 직접
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
              텍스트 우선 · 즉시 문의. 문의 폼 없이 곧바로 대화 원할 때.
            </p>
          </header>
          <div className="mt-6 space-y-1 font-mono text-sm">
            <p className="text-[color:var(--color-foreground)]">
              {EMAIL_PRIMARY}
            </p>
            <p className="text-[color:var(--color-muted)]">
              (백업: {EMAIL_BACKUP})
            </p>
          </div>
          <a
            href={`mailto:${EMAIL_PRIMARY}`}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-6 text-sm font-semibold text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-foreground)]"
          >
            이메일 보내기
            <span aria-hidden>→</span>
          </a>
        </article>

        <article className="flex h-full flex-col justify-between rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 sm:p-8">
          <header>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-muted)]">
              카드 3
            </p>
            <h3 className="text-xl font-bold leading-tight text-[color:var(--color-foreground)]">
              자료 다운로드
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
              Resume PDF · 상세 프로필 · 프로젝트 사례집.
            </p>
          </header>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <a
              href={RESUME_URL}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-4 text-sm font-semibold text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-border)]"
            >
              Resume 다운로드
            </a>
            <span
              aria-disabled
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-dashed border-[color:var(--color-border)] px-4 text-sm font-medium text-[color:var(--color-muted)]"
            >
              사례집 (D-4)
            </span>
          </div>
        </article>
      </div>

      <p className="mt-10 text-center text-sm text-[color:var(--color-muted)]">
        평균 회신 시간: 3영업일 이내 · 사전 분석 기반 개별 컨택 · 규격화된 30분
        슬롯 아님
      </p>
    </section>
  );
}

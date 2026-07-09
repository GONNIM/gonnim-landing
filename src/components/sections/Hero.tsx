const CONTACT_ANCHOR = "#contact";
const RESUME_URL = "#resume";

export function Hero() {
  return (
    <section id="top" className="relative w-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(14,165,233,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(56,189,248,0.14),transparent_70%)]"
      />

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-6 pt-20 pb-20 text-center sm:pt-24 sm:pb-28 md:px-8">
        <p className="max-w-3xl text-balance text-lg font-semibold leading-relaxed tracking-tight text-[color:var(--color-accent)] sm:text-xl md:text-2xl">
          연 80억 원가 절감. SKT BMT 20,000 대리점.
          <br className="hidden sm:inline" />
          <span className="sm:hidden"> </span>
          AI 응답 정확도 25% 향상.
        </p>

        <h1 className="max-w-4xl text-balance text-3xl font-bold leading-[1.2] tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl md:leading-[1.15] lg:text-6xl">
          22년 풀사이클 시니어 엔지니어.
          <br />
          AI/RAG 실전.
        </h1>

        <p className="max-w-2xl text-balance text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg md:text-xl">
          당신 회사 데이터가 밖으로 나가지 않는{" "}
          <span className="whitespace-nowrap font-semibold text-[color:var(--color-foreground)]">
            로컬 AI
          </span>
          , 제가 만듭니다.
        </p>

        <div className="mt-4 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
          <a
            href={CONTACT_ANCHOR}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] px-8 text-base font-semibold text-[color:var(--color-accent-foreground)] shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            상담 요청
            <span aria-hidden>→</span>
          </a>
          <a
            href={RESUME_URL}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-8 text-base font-semibold text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-foreground)]"
          >
            소개서 다운로드
          </a>
        </div>

        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          3영업일 이내 회신 · 사전 분석 후 개별 컨택
        </p>
      </div>
    </section>
  );
}

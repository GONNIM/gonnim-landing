const CONTACT_ANCHOR = "#contact";
const RESUME_URL = "#resume";
const GITHUB_URL = "https://github.com/GONNIM";

function GitHubMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      aria-hidden="true"
      className="fill-current"
    >
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(14,165,233,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(56,189,248,0.14),transparent_70%)]"
      />

      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-6 pt-6 md:px-8">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GONNIM · GitHub 프로필 (새 탭)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-muted-foreground)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
        >
          <GitHubMark />
        </a>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-6 pt-12 pb-20 text-center sm:pt-16 sm:pb-28 md:px-8">
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

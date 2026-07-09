const YEAR = 2026;
const EMAIL = "hi@gonnim.dev";
const GITHUB_URL = "https://github.com/GONNIM";
const LINKEDIN_URL = "https://www.linkedin.com/in/gonnim";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 text-sm md:flex-row md:items-center md:justify-between md:px-8">
        <div className="space-y-1">
          <p className="font-semibold text-[color:var(--color-foreground)]">
            gonnim.dev · 홍해연
          </p>
          <p className="text-xs text-[color:var(--color-muted)]">
            22년차 풀사이클 시니어 엔지니어 · AI/RAG 실전 · Made with Next.js +
            Vercel
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <a
            href={`mailto:${EMAIL}`}
            className="font-mono text-xs text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)]"
          >
            {EMAIL}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)]"
          >
            GitHub
          </a>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)]"
          >
            LinkedIn
          </a>
        </div>
      </div>
      <div className="border-t border-[color:var(--color-border)]/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-xs text-[color:var(--color-muted)] md:px-8">
          <p>© {YEAR} 홍해연 · All rights reserved.</p>
          <p className="hidden sm:block">사업자 등록 (해당 시)</p>
        </div>
      </div>
    </footer>
  );
}

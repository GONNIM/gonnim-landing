const PARTNERS = [
  "삼성전자",
  "LS전선",
  "SKT",
  "SK플래닛",
  "한국마사회",
  "소프트뱅크 (일본)",
  "유저커넥트",
  "브레이니카드",
  "더코어",
];

type GrantProject = {
  name: string;
  org: string;
  outcome: string;
};

const GRANTS: GrantProject[] = [
  {
    name: "InterviewX",
    org: "유저커넥트 (2024)",
    outcome: "Local LLM(Llama3) + RAG · 응답 정확도 25% 향상",
  },
  {
    name: "FIVIS",
    org: "더코어 (2018~2020)",
    outcome: "웨어러블 IoT · 투자유치 3억",
  },
  {
    name: "C-Stream",
    org: "무한네트웍스 (2017)",
    outcome: "동시통역 시스템 · TTA 소프트웨어 품질인증",
  },
  {
    name: "리더스푼",
    org: "더그레잇 (2024)",
    outcome: "예비창업패키지 · 베타 전환율 20%",
  },
];

export function Testimonial() {
  return (
    <section
      id="testimonial"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          Trust
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          누구와 일했나
        </h2>
      </header>

      <div className="mb-14">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-[color:var(--color-muted)]">
          Partners
        </p>
        <ul className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-x-6">
          {PARTNERS.map((partner) => (
            <li
              key={partner}
              className="text-sm font-semibold text-[color:var(--color-muted-foreground)] sm:text-base"
            >
              {partner}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-[color:var(--color-muted)]">
          정부과제 완주 4건
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {GRANTS.map((grant) => (
            <article
              key={grant.name}
              className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 sm:p-6"
            >
              <h3 className="text-base font-bold text-[color:var(--color-foreground)] sm:text-lg">
                {grant.name}
              </h3>
              <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                {grant.org}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                {grant.outcome}
              </p>
            </article>
          ))}
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-[color:var(--color-muted)]">
        고객 리뷰 인용은 사전 동의 확보 후 게재 예정.
      </p>
    </section>
  );
}

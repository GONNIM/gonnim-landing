// 56차 D · 화면 · 서버 동작의 단계별 시간(ms).
//
// 쓰는 법: const t = timer("현황"); const rows = await t.step("글 목록", db.from(...)); t.log();
// - 로그: `[ds-timing] 현황 total=812 인증=40 글 목록=120 …` 한 줄(로컬 터미널 · Vercel 로그).
// - Server-Timing 헤더 값: t.header() (라우트 처리기만 붙일 수 있다 · 페이지는 헤더를 못 붙여 HTML 안 표로 남긴다).
// 같은 단계 이름이 두 번 나오면 시간을 더한다.

export type Mark = { name: string; ms: number };

export type Timer = {
  page: string;
  step<T>(name: string, work: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T>;
  marks(): Mark[];
  total(): number;
  header(): string;
  log(extra?: string): void;
};

export function timer(page: string): Timer {
  const t0 = performance.now();
  const acc = new Map<string, number>();
  return {
    page,
    async step<T>(name: string, work: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
      const s = performance.now();
      try {
        return await (typeof work === "function" ? work() : work);
      } finally {
        acc.set(name, (acc.get(name) ?? 0) + (performance.now() - s));
      }
    },
    marks: () => [...acc].map(([name, ms]) => ({ name, ms: Math.round(ms) })),
    total: () => Math.round(performance.now() - t0),
    header() {
      // Server-Timing 은 이름에 공백 · 한글을 쓸 수 없어 순번(s1…)과 desc 로 적는다
      const parts = [...acc].map(([name, ms], i) => `s${i + 1};desc="${encodeURIComponent(name)}";dur=${ms.toFixed(1)}`);
      return [...parts, `total;dur=${(performance.now() - t0).toFixed(1)}`].join(", ");
    },
    log(extra) {
      const body = [...acc].map(([n, ms]) => `${n}=${Math.round(ms)}`).join(" ");
      console.log(`[ds-timing] ${page} total=${Math.round(performance.now() - t0)} ${body}${extra ? ` ${extra}` : ""}`);
    },
  };
}

/** 단계 없이 쓰는 빈 타이머(측정하지 않는 곳) */
export const noTimer: Timer = {
  page: "",
  step: async (_n, w) => await (typeof w === "function" ? w() : w),
  marks: () => [],
  total: () => 0,
  header: () => "",
  log: () => {},
};

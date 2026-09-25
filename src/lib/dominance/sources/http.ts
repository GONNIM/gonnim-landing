// 바깥으로 나가는 요청을 한 곳으로 모은다.
//
// arXiv 약관은 3초당 1요청과 단일 커넥션을 요구한다. 호출부가 늘어나면 지키기
// 어려우므로 큐를 여기 하나만 둔다. 크론을 단일 잡으로 묶는 이유도 이것이다 —
// 잡이 병렬로 돌면 프로세스가 갈라져서 이 큐가 소용없어진다.

// 연락처는 실제로 메일을 받는 주소여야 한다. 원천이 차단을 걸기 전에 문의할
// 곳을 남기는 것이 이 문자열의 목적이고, 닿지 않는 주소는 목적을 잃는다.
const USER_AGENT =
  "dominance-sangsik/1.0 (+https://sangsik.gonnim.dev; hi@gonnim.dev)";

const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchText(
  url: string,
  init: { timeoutMs?: number; accept?: string } = {},
): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: init.accept ?? "*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`);
  return res.text();
}

export async function fetchJson<T>(
  url: string,
  init: { timeoutMs?: number } = {},
): Promise<T> {
  const text = await fetchText(url, {
    ...init,
    accept: "application/json",
  });
  return JSON.parse(text) as T;
}

const ARXIV_MIN_GAP_MS = 3000;

let arxivQueue: Promise<unknown> = Promise.resolve();
let arxivLastAt = 0;

/** arXiv 전용 직렬 큐. 동시 요청을 만들지 않고 요청 사이를 3초 이상 벌린다. */
export function arxivRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = arxivQueue.then(async () => {
    const wait = ARXIV_MIN_GAP_MS - (Date.now() - arxivLastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await task();
    } finally {
      arxivLastAt = Date.now();
    }
  });
  // 앞선 요청이 실패해도 큐가 멈추지 않게 한다.
  arxivQueue = run.catch(() => undefined);
  return run;
}

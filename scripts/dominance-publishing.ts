// 발행 시작 값 켜기 · 끄기 (D40 · 36차 B-4 · 런북 11).
//
//   pnpm exec tsx scripts/dominance-publishing.ts status              지금 값이 있는지만 본다
//   pnpm exec tsx scripts/dominance-publishing.ts on  --confirm       Production 에 DS_PUBLISHING_STARTED=1 → 다시 배포
//   pnpm exec tsx scripts/dominance-publishing.ts off --confirm       Production 에서 지운다 → 다시 배포
//
// 운영자가 "발행 시작" 이라고 말할 때만 Claude Code 가 on 을 돌린다. --confirm 이 없으면 아무것도 바꾸지 않는다.
// 다시 배포는 가장 최근 Production 배포를 그대로 다시 올린다(vercel redeploy). 지금 작업 폴더를 올리지 않는다.
// 값이 켜지면 [승인하고 날짜 확정] 이 열리고 "발행 예정 글 없음" 경보가 살아난다(publishing.ts).

import { execSync } from "node:child_process";

const NAME = "DS_PUBLISHING_STARTED";
const sh = (cmd: string, input?: string) =>
  execSync(cmd, { input, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function present(): boolean {
  return strip(sh("vercel env ls production 2>&1")).split("\n").some((l) => l.trim().startsWith(`${NAME} `));
}

function latestProductionUrl(): string {
  const line = strip(sh("vercel ls --prod 2>&1"))
    .split("\n")
    .find((l) => /https:\/\/\S+\.vercel\.app/.test(l) && /Ready/.test(l));
  const url = line?.match(/https:\/\/\S+\.vercel\.app/)?.[0];
  if (!url) throw new Error("최근 Production 배포를 찾지 못했습니다");
  return url;
}

function redeploy() {
  const url = latestProductionUrl();
  console.log(`다시 배포: ${url}`);
  console.log(strip(sh(`vercel redeploy ${url} --target production 2>&1`)).split("\n").slice(-3).join("\n"));
}

function main() {
  const [cmd, flag] = process.argv.slice(2);
  if (cmd === "status" || !cmd) {
    console.log(`${NAME}: ${present() ? "있음(발행 시작됨)" : "없음(발행 전 기간)"}`);
    return;
  }
  if (cmd !== "on" && cmd !== "off") throw new Error("사용: status | on --confirm | off --confirm");
  if (flag !== "--confirm") {
    console.log(`--confirm 이 없어 바꾸지 않았습니다. 지금: ${present() ? "있음" : "없음"}`);
    return;
  }
  if (cmd === "on") {
    if (present()) sh(`vercel env rm ${NAME} production -y 2>&1`);
    sh(`vercel env add ${NAME} production 2>&1`, "1\n");
    if (!present()) throw new Error("값을 넣지 못했습니다");
    console.log(`${NAME}=1 을 Production 에 넣었습니다`);
  } else {
    if (present()) sh(`vercel env rm ${NAME} production -y 2>&1`);
    if (present()) throw new Error("값을 지우지 못했습니다");
    console.log(`${NAME} 를 Production 에서 지웠습니다`);
  }
  redeploy();
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

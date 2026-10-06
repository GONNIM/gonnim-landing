// 운영 가이드 그림을 저장소 안의 화면 그림에서 만든다(44차 A-1 · 54차 E 다시 찍기).
//
//   pnpm exec tsx scripts/dominance-guide-images.mts
//
// 입력: Dominance-News/docs/06-analysis/54/screens/*.png 와 54/guide-jobs.json (이미 저장소에 있음)
// 출력: Dominance-News/docs/03-system/guide/img/*.jpg (품질 85 · 만들기 전에 폴더를 비운다)
// 표시: 요소 둘레 6px 여유를 둔 파란 둥근 네모(#0d59c4 · 3px · 모서리 6px) + 왼쪽 위 지름 36px 파란 원 안 흰 굵은 글자.
// 좌표는 모두 원본 그림 기준이다. 자른 뒤 위치는 이 스크립트가 옮긴다.

import sharp from "sharp";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const DOCS = "/Users/gonnim/GON-Dev/Dominance-News/docs";
const OUT = path.join(DOCS, "03-system/guide/img");
const BLUE = "#0d59c4";

/** at: "right" 이면 원을 네모 오른쪽 위 모서리에 둔다(왼쪽 위 글자를 가리지 않게) */
type Mark = { x: number; y: number; w: number; h: number; label: string; at?: "right" };
type Job = { out: string; src: string; crop: [number, number, number, number]; marks: Mark[]; width?: number };

// 54차 E · 자리 표는 촬영 스크립트(.scratch/shots54.mts)가 원본 그림과 함께 남긴 표를 읽는다.
// 원본은 docs/06-analysis/54/screens/*.png 이다. 손으로 고칠 때는 이 JSON 을 고친다.
const JOBS: Job[] = (JSON.parse(readFileSync(path.join(DOCS, "06-analysis/54/guide-jobs.json"), "utf8")) as Job[]).map((j) => ({
  ...j,
  crop: j.crop.map(Math.round) as Job["crop"],
}));

/** 자른 그림 위에 겹칠 SVG. 원은 네모 왼쪽 위 모서리에 중심을 두되 그림 밖으로 나가지 않게 민다. */
function overlay(w: number, h: number, marks: Mark[], ox: number, oy: number): Buffer {
  const pad = 6;
  const r = 18;
  const shapes = marks
    .map((k) => {
      const x = k.x - ox - pad;
      const y = k.y - oy - pad;
      const bw = k.w + pad * 2;
      const bh = k.h + pad * 2;
      const cx = Math.min(Math.max(k.at === "right" ? x + bw : x, r + 1), w - r - 1);
      const cy = Math.min(Math.max(y, r + 1), h - r - 1);
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" ry="6" fill="none" stroke="${BLUE}" stroke-width="3"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${BLUE}"/>
<text x="${cx}" y="${cy}" dy="0.36em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#ffffff">${k.label}</text>`;
    })
    .join("\n");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shapes}</svg>`);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const j of JOBS) {
    const [x0, y0, x1, y1] = j.crop;
    const w = x1 - x0;
    const h = y1 - y0;
    let img = sharp(path.join(DOCS, j.src)).extract({ left: x0, top: y0, width: w, height: h });
    if (j.marks.length) {
      const base = await img.png().toBuffer();
      img = sharp(base).composite([{ input: overlay(w, h, j.marks, x0, y0), left: 0, top: 0 }]);
    }
    if (j.width) img = sharp(await img.png().toBuffer()).resize({ width: j.width });
    const info = await img.jpeg({ quality: 85 }).toFile(path.join(OUT, j.out));
    console.log(`${j.out} · ${info.width}×${info.height} · ${Math.round(info.size / 1024)}KB · 표시 ${j.marks.map((k) => k.label).join(" ") || "없음"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

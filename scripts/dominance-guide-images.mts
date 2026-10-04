// 운영 가이드 그림 12장을 저장소 안의 화면 그림에서 만든다(44차 A-1).
//
//   pnpm exec tsx scripts/dominance-guide-images.mts
//
// 입력: Dominance-News/docs/06-analysis/39/screens/*.png · 42/*.png (이미 저장소에 있음)
// 출력: Dominance-News/docs/03-system/guide/img/*.jpg (품질 85)
// 표시: 요소 둘레 6px 여유를 둔 파란 둥근 네모(#0d59c4 · 3px · 모서리 6px) + 왼쪽 위 지름 36px 파란 원 안 흰 굵은 글자.
// 좌표는 모두 원본 그림 기준이다. 자른 뒤 위치는 이 스크립트가 옮긴다.

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DOCS = "/Users/gonnim/GON-Dev/Dominance-News/docs";
const OUT = path.join(DOCS, "03-system/guide/img");
const BLUE = "#0d59c4";

type Mark = { x: number; y: number; w: number; h: number; label: string };
type Job = { out: string; src: string; crop: [number, number, number, number]; marks: Mark[]; width?: number };

const m = (x: number, y: number, w: number, h: number, label: string): Mark => ({ x, y, w, h, label });

const JOBS: Job[] = [
  { out: "nav.jpg", src: "06-analysis/39/screens/03c-questions-exercise.png", crop: [60, 0, 1280, 62], marks: [] },
  { out: "a2-card.jpg", src: "06-analysis/42/42-questions-default.png", crop: [88, 570, 1192, 840], marks: [m(288, 739, 48, 14, "A")] },
  {
    out: "b-fact.jpg",
    src: "06-analysis/42/42-papago-link.png",
    crop: [0, 0, 1070, 210],
    marks: [m(975, 55, 85, 14, "B"), m(20, 80, 1030, 42, "C"), m(80, 142, 36, 22, "D")],
  },
  { out: "b-evtop.jpg", src: "06-analysis/42/42-evidence-top.png", crop: [0, 0, 1280, 260], marks: [] },
  { out: "c-edited.jpg", src: "06-analysis/39/screens/04b-evidence-fact.png", crop: [0, 0, 1070, 198], marks: [m(129, 123, 39, 22, "D"), m(176, 123, 86, 22, "E")] },
  {
    out: "d-letters.jpg",
    src: "06-analysis/39/screens/05-letters.png",
    crop: [60, 180, 1280, 520],
    marks: [m(157, 350, 300, 20, "A"), m(157, 403, 330, 20, "B"), m(157, 456, 260, 20, "C")],
  },
  { out: "e-editor.jpg", src: "06-analysis/39/screens/06-editor.png", crop: [60, 140, 1280, 1420], marks: [], width: 1000 },
  { out: "f-bottom.jpg", src: "06-analysis/39/screens/06b-editor-bottom.png", crop: [560, 700, 1280, 900], marks: [m(1091, 831, 84, 36, "A")] },
  {
    out: "g-review.jpg",
    src: "06-analysis/39/screens/08b-review-right.png",
    crop: [0, 30, 380, 1036],
    marks: [
      m(300, 527, 63, 26, "1"),
      m(17, 701, 14, 14, "2"),
      m(17, 728, 14, 14, "3"),
      m(17, 756, 14, 14, "4"),
      m(17, 785, 346, 30, "5"),
      m(17, 865, 346, 36, "6"),
      m(17, 951, 346, 30, "7"),
      m(17, 989, 346, 30, "8"),
    ],
  },
  { out: "h-buttons.jpg", src: "06-analysis/39/screens/03b-questions-new.png", crop: [60, 140, 1280, 290], marks: [m(328, 232, 124, 38, "A"), m(460, 232, 102, 38, "B")] },
  { out: "i-schedule.jpg", src: "06-analysis/39/screens/09-schedule.png", crop: [60, 140, 1280, 1050], marks: [], width: 1000 },
  { out: "j-reviewlist.jpg", src: "06-analysis/39/screens/07-review-list.png", crop: [60, 120, 1280, 520], marks: [] },
];

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
      const cx = Math.min(Math.max(x, r + 1), w - r - 1);
      const cy = Math.min(Math.max(y, r + 1), h - r - 1);
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" ry="6" fill="none" stroke="${BLUE}" stroke-width="3"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${BLUE}"/>
<text x="${cx}" y="${cy}" dy="0.36em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#ffffff">${k.label}</text>`;
    })
    .join("\n");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shapes}</svg>`);
}

async function main() {
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

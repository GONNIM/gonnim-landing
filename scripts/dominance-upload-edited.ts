// 편집본 파일(md)을 콘솔 글로 올린다(런북 6 · 22차부터 .scratch/saveedited*.mts 로 쓰던 것을 38차에 정식으로 둠).
//
//   pnpm exec tsx --env-file=.env.local scripts/dominance-upload-edited.ts <글 id> <04-letters 아래 md 경로> '<용어표 JSON>' <판 번호>
//
// 순서: 블록 7개로 나눔 → 파일 본문과 글자 대조 → 지금 글을 보관 파일로 남김 → 거절 필터를 다시 걸어 저장(쓰는 중일 때만)
//       → 초안 메타 갱신 → .blocks.json 을 md 옆에 씀 → **그 글의 질문을 「초안 있음」(drafted)으로 함께 옮김(38차 D)**.
// 글이 쓰는 중(draft)이 아니면 저장하지 않는다. 발행 · 발송과는 무관하다.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { flagBlocks } from "../src/lib/dominance/filters";
import { tagsIn } from "../src/lib/dominance/tags";
import { archiveDraft, readDraftMeta, writeDraftMeta, listArchives } from "../src/lib/dominance/draft-store";
import { markQuestionDrafted } from "../src/lib/dominance/question-sync";
import type { LetterBlock } from "../src/lib/dominance/types";

const LETTERS = "/Users/gonnim/GON-Dev/Dominance-News/docs/04-letters";
const KIND: Record<string, LetterBlock["kind"]> = { "3줄 요약": "summary", "훅": "hook", "1차 연구": "research", "메커니즘": "mechanism", "산업": "industry", "실천": "practice", "은유": "metaphor" };

async function main() {
  const [id, mdPath, glossJson, genStr] = process.argv.slice(2);
  if (!id || !mdPath || !glossJson || !genStr) throw new Error("사용: <글 id> <04-letters 아래 md 경로> '<용어표 JSON>' <판 번호>");
  const db = createClient(process.env.DS_SUPABASE_URL!, process.env.DS_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const md = readFileSync(`${LETTERS}/${mdPath}`, "utf8");
  const title = md.match(/^\*\*제목:\*\* (.+)$/m)?.[1];
  const summary = md.match(/^\*\*한 문장 요약:\*\* (.+)$/m)?.[1];
  if (!title || summary === undefined) throw new Error("**제목:** · **한 문장 요약:** 줄을 찾지 못했습니다");
  const body = md.slice(md.indexOf("--- 본문 시작 ---") + "--- 본문 시작 ---".length, md.indexOf("--- 본문 끝 ---"));
  const blocks = body
    .split(/^## /m)
    .slice(1)
    .map((p) => {
      const nl = p.indexOf("\n");
      const head = p.slice(0, nl).trim();
      const text = p.slice(nl + 1).trim().split(/\n\s*\n/).map((x) => x.trim()).join("\n");
      const tags = tagsIn(text);
      return { kind: KIND[head], text, sourceIds: tags.length ? tags : undefined } as LetterBlock;
    });
  const rebuilt = blocks
    .map((b) => `## ${Object.keys(KIND).find((k) => KIND[k] === b.kind)}\n\n${b.kind === "summary" ? b.text : b.text.split("\n").join("\n\n")}\n`)
    .join("\n");
  if (rebuilt.trim() !== body.trim()) throw new Error("블록으로 나눈 글이 파일 본문과 글자 그대로 같지 않습니다 · 저장하지 않습니다");

  const { data: cur } = await db.from("ds_letters").select("title, summary, blocks, status, revision_count").eq("id", id).single();
  if (!cur || cur.status !== "draft") throw new Error(`글이 쓰는 중(draft)이 아닙니다(${cur?.status ?? "없음"}) · 저장하지 않습니다`);
  const prevMeta = await readDraftMeta(db, id);
  const archived = await archiveDraft(db, id, { title: cur.title, summary: cur.summary, blocks: cur.blocks, meta: prevMeta } as never);
  const flagged = flagBlocks(blocks);
  const { error } = await db
    .from("ds_letters")
    .update({ title, summary, blocks: flagged, revision_count: (cur.revision_count ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw error;
  await writeDraftMeta(db, id, {
    ...(prevMeta as object),
    titles: [title],
    glossary: JSON.parse(glossJson),
    generation: Number(genStr),
    generatedAt: new Date().toISOString(),
    llmCalls: 0,
    editedBy: process.env.EDITED_BY ?? "Fable(상위 검토자)",
  } as never);
  writeFileSync(`${LETTERS}/${mdPath.replace(/\.md$/, ".blocks.json")}`, JSON.stringify(flagged, null, 1));
  const question = await markQuestionDrafted(db, id);
  console.log(JSON.stringify({ archived, archives: (await listArchives(db, id)).length, rev: (cur.revision_count ?? 0) + 1, flags: flagged.flatMap((b) => b.flags ?? []), question }, null, 1));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

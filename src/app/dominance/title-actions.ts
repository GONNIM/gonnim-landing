"use server";

// 48차 A · D51 · 제목 · 한 문장 요약 추천(50차부터 OpenAI)과 ④ 리뷰 화면의 제목 · 요약 저장.

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { suggestTitles, titleSummaryProblems, type TitleSuggestions } from "@/lib/dominance/title-suggest";

/** 「제목·요약 추천 받기」 · 결과는 meta.json 에도 남는다 */
export async function requestTitleSuggestions(letterId: string): Promise<{ error: string | null; result: TitleSuggestions | null }> {
  const { db } = await dominanceContext();
  try {
    return { error: null, result: await suggestTitles(db, letterId) };
  } catch (err) {
    return { error: suggestErrorText(err), result: null };
  }
}

/**
 * 51차 B · 추천 오류를 화면 글자로. 잔액(429 credit_balance_exhausted · credits/billing 이 든 402 · 429)과
 * 키 틀림(401)은 운영자가 할 일을 바로 적는다. 그 밖은 「추천 실패 · {상태 코드} {메시지 앞 80자}」.
 */
function suggestErrorText(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string };
  const msg = String(e?.message ?? err ?? "");
  if (e?.status === 401) return "OPENAI_API_KEY 가 틀립니다.";
  if (e?.code === "credit_balance_exhausted" || ((e?.status === 402 || e?.status === 429) && /credits|billing/i.test(msg))) {
    return "OpenAI 잔액이 없습니다. 충전한 뒤 다시 누르십시오.";
  }
  return `추천 실패 · ${e?.status ?? ""} ${msg.slice(0, 80)}`.replace(/\s+/g, " ").trim();
}

/**
 * ④ 리뷰 화면의 「제목·요약 저장」. 리뷰 대기 · 리뷰 통과 글의 두 칸만 바꾼다.
 * status · reviewed_at 은 건드리지 않는다. 거절 필터 · 범주 이름에 걸리면 저장하지 않는다. 감사 기록 title_edit.
 */
export async function saveTitleSummary(
  letterId: string,
  title: string,
  summary: string,
): Promise<{ error: string | null; problems: string[] }> {
  const { admin, db } = await dominanceContext();
  const t = title.trim();
  const s = summary.trim();
  if (!t) return { error: "제목이 비었습니다", problems: [] };
  const problems = titleSummaryProblems(t, s);
  if (problems.length) return { error: "저장하지 않았습니다 · 아래 이유를 고치십시오", problems };

  const { data: before } = await db.from("ds_letters").select("title, summary, status").eq("id", letterId).maybeSingle<{ title: string; summary: string | null; status: string }>();
  if (!before) return { error: "글을 찾지 못했습니다", problems: [] };
  if (!["review", "reviewed"].includes(before.status)) return { error: "리뷰 대기 · 리뷰 통과 글만 여기서 고칩니다", problems: [] };

  const { error } = await db
    .from("ds_letters")
    .update({ title: t, summary: s || null, updated_at: new Date().toISOString() })
    .eq("id", letterId)
    .in("status", ["review", "reviewed"]);
  if (error) return { error: error.message, problems: [] };

  await db.from("ds_letter_audit").insert({
    letter_id: letterId,
    event: "title_edit",
    model: null,
    passed: true,
    prompt_input: { before: { title: before.title, summary: before.summary }, after: { title: t, summary: s || null } },
    note: `${admin.email}: 제목 · 요약 고침(상태 그대로 · ${before.status})`,
  });
  revalidatePath(`/dominance/review/${letterId}`);
  revalidatePath(`/dominance/letters/${letterId}`);
  return { error: null, problems: [] };
}

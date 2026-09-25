// 발행 · 오늘(KST) 날짜가 붙은 승인된 글만 내보낸다.
//
// 읽는 조건이 `status='approved' AND scheduled_for = 오늘(KST)` 하나뿐이다.
// 다른 상태를 발행하는 경로는 여기에 없다 — 사람의 승인을 건너뛸 방법을 만들지 않는다.
//
// 순서가 중요하다. ① Storage JSON 을 먼저 올린다. 메일 안의 "웹에서 보기" 링크가
// 가리키는 곳이므로, 메일이 먼저 나가면 독자가 없는 주소를 누른다.
// ② 그다음 메일을 보낸다. ③ 메일이 나간 뒤에만 status 를 published 로 바꾼다.
// 반대로 하면 실패한 발행이 발행됨으로 남아 다시 보낼 수 없게 된다.

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendBroadcast, syncAudience } from "./broadcast";
import { dominanceLetterUrl } from "./db";
import { kstToday } from "./kst";
import { loadLetterSources } from "./letters";
import { toEmailHtml, toPayload, toPlainText } from "./render";
import type { LetterBlock } from "./types";

const BUCKET = "ds-letters";
const UNSUBSCRIBE_URL = "https://sangsik.gonnim.dev/unsubscribe";

export type PublishOutcome = {
  letterId: string;
  slug: string;
  title: string;
  ok: boolean;
  error: string | null;
};

export type PublishReport = {
  date: string;
  due: number;
  published: number;
  audienceCount: number;
  outcomes: PublishOutcome[];
  errors: string[];
};

type DueLetter = {
  id: string;
  candidate_id: string | null;
  slug: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
};

type CorrectionRow = {
  description: string;
  resolution: string | null;
  reported_at: string;
};

async function uploadPayload(
  db: SupabaseClient,
  slug: string,
  payload: unknown,
): Promise<void> {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(`${slug}.json`, JSON.stringify(payload), {
      contentType: "application/json; charset=utf-8",
      // 정정으로 다시 올리는 일이 있으므로 덮어쓰기를 허용한다.
      upsert: true,
    });

  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`);
}

/** 공개 웹을 다시 굽는다. 훅이 없으면 건너뛴다 — 메일은 이미 나갔으므로 실패로 보지 않는다. */
async function triggerPagesDeploy(): Promise<string | null> {
  const hook = process.env.CF_PAGES_DEPLOY_HOOK;
  if (!hook) return "CF_PAGES_DEPLOY_HOOK 없음 · 공개 웹을 다시 굽지 않았습니다";

  try {
    const res = await fetch(hook, { method: "POST" });
    if (!res.ok) return `Pages 배포 훅 ${res.status}`;
    return null;
  } catch (err) {
    return `Pages 배포 훅 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function publishOne(
  db: SupabaseClient,
  letter: DueLetter,
  audienceCount: number,
): Promise<PublishOutcome> {
  const base = { letterId: letter.id, slug: letter.slug, title: letter.title };

  try {
    const sources = await loadLetterSources(db, letter.id);

    const { data: corrections } = await db
      .from("ds_corrections")
      .select("description, resolution, reported_at")
      .eq("letter_id", letter.id)
      .eq("is_public", true)
      .order("reported_at", { ascending: true });

    const publishedAt = new Date().toISOString();

    const payload = toPayload({
      slug: letter.slug,
      title: letter.title,
      summary: letter.summary,
      publishedAt,
      blocks: letter.blocks,
      sources,
      corrections: ((corrections ?? []) as CorrectionRow[]).map((c) => ({
        description: c.description,
        resolution: c.resolution,
        at: c.reported_at,
      })),
    });

    await uploadPayload(db, letter.slug, payload);

    const broadcastId = await sendBroadcast({
      subject: letter.title,
      html: toEmailHtml(payload, {
        webUrl: dominanceLetterUrl(letter.slug),
        unsubscribeUrl: UNSUBSCRIBE_URL,
      }),
      text: toPlainText(payload),
    });

    const { error } = await db
      .from("ds_letters")
      .update({
        status: "published",
        published_at: publishedAt,
        resend_broadcast_id: broadcastId,
        // 보낸 대상 수다. Resend 가 큐를 처리한 결과가 아니다.
        sent_count: audienceCount,
        updated_at: publishedAt,
      })
      .eq("id", letter.id)
      .eq("status", "approved");

    if (error) throw new Error(`상태 변경 실패: ${error.message}`);

    if (letter.candidate_id) {
      await db
        .from("ds_candidates")
        .update({ state: "used" })
        .eq("id", letter.candidate_id);
    }

    return { ...base, ok: true, error: null };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function publishDue(
  db: SupabaseClient,
  date: string = kstToday(),
): Promise<PublishReport> {
  const errors: string[] = [];

  const { data, error } = await db
    .from("ds_letters")
    .select("id, candidate_id, slug, title, summary, blocks")
    .eq("scheduled_for", date)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`ds_letters 읽기 실패: ${error.message}`);

  const due = (data ?? []) as DueLetter[];
  if (due.length === 0) {
    return { date, due: 0, published: 0, audienceCount: 0, outcomes: [], errors };
  }

  // 명단 동기화가 실패하면 보내지 않는다. 탈퇴한 사람에게 가는 것보다 늦게 가는 편이 낫다.
  const audience = await syncAudience(db);
  errors.push(...audience.errors);

  const outcomes: PublishOutcome[] = [];
  for (const letter of due) {
    outcomes.push(await publishOne(db, letter, audience.count));
  }

  const published = outcomes.filter((o) => o.ok).length;
  if (published > 0) {
    const deployError = await triggerPagesDeploy();
    if (deployError) errors.push(deployError);
  }

  return {
    date,
    due: due.length,
    published,
    audienceCount: audience.count,
    outcomes,
    errors,
  };
}

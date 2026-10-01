// Resend · 구독자 동기화와 브로드캐스트 발송.
//
// 주소 목록은 우리 DB 가 원본이고 Resend 는 발송 도구다. 그래서 발송 직전에
// 확인을 마친 구독자만 밀어 넣고, 수신거부한 사람은 수신거부로 표시한다.
// 순서를 반대로 하면 탈퇴한 사람에게 한 통이 더 나간다.
//
// Resend SDK 6.17 실사 — Audience 는 Segment 로 바뀌었고 `audienceId` 는 폐기 표시가
// 붙었다. 그래서 `segmentId` 와 `segments: [{ id }]` 를 쓴다.
//
// 열람률은 이 SDK 로 읽을 수 없다. `broadcasts.get` 이 주는 것은 status 와 sent_at
// 뿐이고 sent_count · opened_count 필드가 아예 없다. 열람 · 클릭은 웹훅으로 센다
// (26차 · /api/sangsik/resend-webhook · reactions.ts) — 없는 값을 추측해서 넣지 않는다.

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

import { signLink } from "@/lib/sangsik/token";

/**
 * 반응 · 투표 링크의 구독자 몫을 담는 연락처 속성(26차 C-3). 브로드캐스트 본문의
 * {{{contact.ds_rk|web}}} 이 사람마다 이 값으로 바뀐다. 값은 서명 토큰이고 주소가 아니다.
 */
const READER_PROPERTY = "ds_rk";

async function ensureReaderProperty(resend: Resend, errors: string[]): Promise<void> {
  const list = await resend.contactProperties.list();
  if (list.error) {
    errors.push(`연락처 속성 목록: ${list.error.message}`);
    return;
  }
  if ((list.data?.data ?? []).some((p) => p.key === READER_PROPERTY)) return;
  const made = await resend.contactProperties.create({ key: READER_PROPERTY, type: "string", fallbackValue: "web" });
  if (made.error) errors.push(`연락처 속성 만들기: ${made.error.message}`);
}

// 기본값은 Resend 에서 인증이 끝난 도메인만 쓴다. mail.gonnim.dev 는 DNS 기록이
// 없어 발송이 거부된다 — 인증을 마치면 DS_FROM_EMAIL 로 그쪽을 가리키면 된다.
export function fromAddress(): string {
  return process.env.DS_FROM_EMAIL || "지배상식 <letter@gonnim.dev>";
}

function client(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY 없음");
  return new Resend(apiKey);
}

function segmentId(): string {
  const id = process.env.DS_RESEND_SEGMENT_ID;
  if (!id) throw new Error("DS_RESEND_SEGMENT_ID 없음 · Resend 세그먼트 ID 필요");
  return id;
}

type SubscriberRow = {
  id: string;
  email: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  resend_contact_id: string | null;
};

/**
 * 확인을 마친 구독자를 세그먼트에 채우고, 수신거부자는 수신거부로 표시한다.
 * 한 명이 실패해도 나머지는 계속 간다 — 한 주소 때문에 발행이 멈추지 않게 한다.
 *
 * 반환하는 count 는 이번에 살아 있다고 확인한 사람 수다. 실제 발송 수는
 * Resend 가 큐를 처리한 뒤에 정해지므로 같다고 볼 수는 없다.
 */
/**
 * Resend 쪽 수신거부를 원장으로 가져온다.
 *
 * 발행 메일의 수신거부 링크는 Resend 의 {{{RESEND_UNSUBSCRIBE_URL}}} 이다. 독자가 누르면
 * Resend 연락처만 unsubscribed 가 되고 원장(ds_subscribers)은 모른다. 그대로 두면 다음
 * syncAudience 가 그 사람을 "살아 있음" 으로 보고 unsubscribed:false 로 되살린다.
 * 그래서 명단을 밀어 넣기 전에, 그리고 매일 크론에서 먼저 당겨 온다.
 */
export async function pullResendUnsubscribes(
  db: SupabaseClient,
  resend: Resend = client(),
): Promise<{ checked: number; pulled: number; errors: string[] }> {
  const errors: string[] = [];

  const { data, error } = await db
    .from("ds_subscribers")
    .select("id, resend_contact_id")
    .is("unsubscribed_at", null)
    .not("resend_contact_id", "is", null);
  if (error) throw new Error(`ds_subscribers 읽기 실패: ${error.message}`);

  let pulled = 0;
  for (const s of (data ?? []) as { id: string; resend_contact_id: string }[]) {
    try {
      const res = await resend.contacts.get(s.resend_contact_id);
      if (res.error) throw new Error(res.error.message);
      if (res.data?.unsubscribed) {
        const up = await db
          .from("ds_subscribers")
          .update({ unsubscribed_at: new Date().toISOString() })
          .eq("id", s.id)
          .is("unsubscribed_at", null);
        if (up.error) throw new Error(up.error.message);
        pulled += 1;
      }
    } catch (err) {
      errors.push(`구독자 ${s.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked: (data ?? []).length, pulled, errors };
}

export async function syncAudience(
  db: SupabaseClient,
  // 시험에서 가짜 응답을 넣으려고 밖에서 받을 수 있게 둔다. 평소에는 비워 둔다.
  resend: Resend = client(),
): Promise<{ count: number; errors: string[] }> {
  const segment = segmentId();
  const errors: string[] = [];

  // Resend 에서 수신거부한 사람을 먼저 원장에 반영한다. 순서를 바꾸면 그 사람을 되살린다.
  const pulled = await pullResendUnsubscribes(db, resend);
  errors.push(...pulled.errors);

  const { data, error } = await db
    .from("ds_subscribers")
    .select("id, email, confirmed_at, unsubscribed_at, resend_contact_id");

  if (error) throw new Error(`ds_subscribers 읽기 실패: ${error.message}`);

  let count = 0;
  await ensureReaderProperty(resend, errors);

  for (const s of (data ?? []) as SubscriberRow[]) {
    const active = s.confirmed_at !== null && s.unsubscribed_at === null;

    try {
      if (active) {
        const contactId = await upsertContact(resend, s.email, segment, errors, s.id);
        count += 1;

        if (contactId && contactId !== s.resend_contact_id) {
          await db
            .from("ds_subscribers")
            .update({ resend_contact_id: contactId })
            .eq("id", s.id);
        }
      } else if (s.resend_contact_id) {
        // 지우지 않고 수신거부로 둔다. 지우면 억제 목록에서도 빠져
        // 같은 주소가 다시 들어올 때 메일이 갈 수 있다.
        const res = await resend.contacts.update({
          id: s.resend_contact_id,
          unsubscribed: true,
        });
        if (res.error) throw new Error(res.error.message);
      }
    } catch (err) {
      // 주소는 개인정보다. 오류에 주소를 남기지 않고 행 ID 앞자리만 남긴다.
      errors.push(
        `구독자 ${s.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { count, errors };
}

/**
 * 연락처를 만들거나, 이미 있으면 되살려 세그먼트에 넣는다. 연락처 id 를 돌려준다.
 *
 * 수신거부했다가 다시 가입한 사람은 Resend 에 이미 연락처가 있다. 그때 create 가 실패하면
 * 발송 수에서 빠진다. Resend 가 "이미 있음" 에 어떤 오류 코드를 주는지 SDK 목록에 없어서,
 * create 가 어떤 이유로든 실패하면 update(unsubscribed:false) → 세그먼트 추가로 넘어간다.
 * update 까지 실패하면 그때 오류로 던진다.
 */
async function upsertContact(
  resend: Resend,
  email: string,
  segment: string,
  errors: string[],
  rowId: string,
): Promise<string | null> {
  const properties = { [READER_PROPERTY]: signLink(rowId, "react") };
  const created = await resend.contacts.create({ email, unsubscribed: false, properties, segments: [{ id: segment }] });
  if (!created.error) return created.data?.id ?? null;

  const updated = await resend.contacts.update({ email, unsubscribed: false, properties });
  if (updated.error) {
    throw new Error(`create: ${created.error.message} · update: ${updated.error.message}`);
  }
  const added = await resend.contacts.segments.add({ email, segmentId: segment });
  if (added.error) {
    // 이미 세그먼트에 있으면 실패할 수 있다. 막지 않고 기록만 남긴다.
    errors.push(`구독자 ${rowId.slice(0, 8)}: 세그먼트 추가 ${added.error.message}`);
  }
  return updated.data?.id ?? null;
}

/** 브로드캐스트를 만들고 곧바로 보낸다. 발송 수는 이 시점에 알 수 없다. */
export async function sendBroadcast(input: {
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  const resend = client();

  const created = await resend.broadcasts.create({
    segmentId: segmentId(),
    from: fromAddress(),
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (created.error) {
    throw new Error(`브로드캐스트 생성 실패: ${created.error.message}`);
  }

  const id = created.data?.id;
  if (!id) throw new Error("브로드캐스트 ID 를 받지 못했습니다");

  const sent = await resend.broadcasts.send(id);
  if (sent.error) {
    throw new Error(`브로드캐스트 발송 실패: ${sent.error.message}`);
  }

  return id;
}

export type BroadcastState = {
  status: "draft" | "sent" | "queued";
  sentAt: string | null;
};

/** 어제 발행분이 실제로 나갔는지 확인한다. 열람률은 이 API 에 없다. */
export async function fetchBroadcastState(
  broadcastId: string,
): Promise<BroadcastState> {
  const res = await client().broadcasts.get(broadcastId);
  if (res.error) throw new Error(res.error.message);
  if (!res.data) throw new Error("브로드캐스트를 찾지 못했습니다");

  return { status: res.data.status, sentAt: res.data.sent_at };
}

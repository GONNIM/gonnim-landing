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
// 뿐이고 sent_count · opened_count 필드가 아예 없다. 열람률은 email.opened 웹훅을
// 받아야 하므로 2차로 미룬다 — 없는 값을 추측해서 넣지 않는다.

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

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
export async function syncAudience(
  db: SupabaseClient,
): Promise<{ count: number; errors: string[] }> {
  const resend = client();
  const segment = segmentId();
  const errors: string[] = [];

  const { data, error } = await db
    .from("ds_subscribers")
    .select("id, email, confirmed_at, unsubscribed_at, resend_contact_id");

  if (error) throw new Error(`ds_subscribers 읽기 실패: ${error.message}`);

  let count = 0;

  for (const s of (data ?? []) as SubscriberRow[]) {
    const active = s.confirmed_at !== null && s.unsubscribed_at === null;

    try {
      if (active) {
        const res = await resend.contacts.create({
          email: s.email,
          unsubscribed: false,
          segments: [{ id: segment }],
        });
        if (res.error) throw new Error(res.error.message);
        count += 1;

        const contactId = res.data?.id;
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

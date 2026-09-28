// 구독 원장(ds_subscribers)을 바꾸는 동작. 공개 API 와 확인 · 수신거부 화면이 같이 쓴다.
//
// 바깥에서 "이 주소가 등록되어 있는가" 를 알 수 없게 한다. 가입 · 수신거부 요청은
// 주소의 상태와 상관없이 같은 결과를 돌려준다. 결과 코드는 로그와 시험용이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { SANGSIK_BASE } from "./site";
import { signLink, verifyLink } from "./token";
import { sendConfirmMail, sendUnsubscribeLinkMail } from "./mail";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

type Row = {
  id: string;
  email: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  resend_contact_id: string | null;
};

const SELECT = "id, email, confirmed_at, unsubscribed_at, resend_contact_id";

export type SubscribeOutcome = "new" | "resent" | "resubscribed" | "already_active";

/**
 * 가입. 없으면 넣고, 수신거부했던 주소면 다시 확인을 받는다. 확인 메일을 보낸다.
 * 이미 확인된 주소면 아무것도 하지 않는다(메일도 보내지 않는다).
 */
export async function subscribe(
  db: SupabaseClient,
  email: string,
  ip: string | null,
): Promise<{ outcome: SubscribeOutcome; mailError: string | null }> {
  const now = new Date().toISOString();
  const { data: found, error } = await db.from("ds_subscribers").select(SELECT).eq("email", email).maybeSingle<Row>();
  if (error) throw new Error(`ds_subscribers 읽기 실패: ${error.message}`);

  let row: Row;
  let outcome: SubscribeOutcome;

  if (!found) {
    const ins = await db
      .from("ds_subscribers")
      .insert({ email, consent_at: now, consent_ip: ip })
      .select(SELECT)
      .single<Row>();
    if (ins.error || !ins.data) throw new Error(`ds_subscribers 저장 실패: ${ins.error?.message}`);
    row = ins.data;
    outcome = "new";
  } else if (found.unsubscribed_at) {
    // 다시 가입하면 수신거부를 지우고 확인을 새로 받는다. 옛 확인은 쓰지 않는다.
    const up = await db
      .from("ds_subscribers")
      .update({ unsubscribed_at: null, confirmed_at: null, consent_at: now, consent_ip: ip })
      .eq("id", found.id)
      .select(SELECT)
      .single<Row>();
    if (up.error || !up.data) throw new Error(`ds_subscribers 갱신 실패: ${up.error?.message}`);
    row = up.data;
    outcome = "resubscribed";
  } else if (found.confirmed_at) {
    return { outcome: "already_active", mailError: null };
  } else {
    row = found;
    outcome = "resent";
  }

  const link = `${SANGSIK_BASE}/confirm?t=${signLink(row.id, "confirm")}`;
  const mail = await sendConfirmMail(row.email, link);
  return { outcome, mailError: mail.error };
}

export type ConfirmOutcome = "confirmed" | "already" | "expired" | "invalid";

export async function confirmSubscription(db: SupabaseClient, token: string | undefined): Promise<ConfirmOutcome> {
  const v = verifyLink(token, "confirm");
  if (!v.ok) return v.reason;

  const { data: row } = await db.from("ds_subscribers").select(SELECT).eq("id", v.id).maybeSingle<Row>();
  if (!row) return "invalid";
  // 확인 링크를 받은 뒤 수신거부했다면 옛 링크로 되살리지 않는다. 다시 가입해야 한다.
  if (row.unsubscribed_at) return "invalid";
  if (row.confirmed_at) return "already";

  const { error } = await db
    .from("ds_subscribers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("confirmed_at", null);
  if (error) throw new Error(`ds_subscribers 확인 실패: ${error.message}`);
  return "confirmed";
}

export type UnsubscribeOutcome = "unsubscribed" | "already" | "invalid";

/** 한 번 누르면 끝난다. 확인 단계를 두지 않는다. Resend 쪽도 바로 수신거부로 둔다. */
export async function unsubscribeByToken(db: SupabaseClient, token: string | undefined): Promise<UnsubscribeOutcome> {
  const v = verifyLink(token, "unsubscribe");
  if (!v.ok) return "invalid";

  const { data: row } = await db.from("ds_subscribers").select(SELECT).eq("id", v.id).maybeSingle<Row>();
  if (!row) return "invalid";
  if (row.unsubscribed_at) return "already";

  const { error } = await db
    .from("ds_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(`ds_subscribers 수신거부 실패: ${error.message}`);

  if (row.resend_contact_id && process.env.RESEND_API_KEY) {
    // 실패해도 원장은 이미 수신거부다. 다음 발행 전 명단 동기화가 Resend 쪽을 다시 맞춘다.
    try {
      await new Resend(process.env.RESEND_API_KEY).contacts.update({ id: row.resend_contact_id, unsubscribed: true });
    } catch {
      /* 원장이 기준이다 */
    }
  }
  return "unsubscribed";
}

/** 토큰 없이 수신거부를 원할 때 · 등록된 활성 주소에만 링크 메일을 보낸다. 결과는 밖에 드러내지 않는다. */
export async function requestUnsubscribeLink(db: SupabaseClient, email: string): Promise<{ sent: boolean; mailError: string | null }> {
  const { data: row } = await db.from("ds_subscribers").select(SELECT).eq("email", email).maybeSingle<Row>();
  if (!row || row.unsubscribed_at) return { sent: false, mailError: null };
  const link = `${SANGSIK_BASE}/unsubscribe?t=${signLink(row.id, "unsubscribe")}`;
  const mail = await sendUnsubscribeLinkMail(row.email, link);
  return { sent: !mail.error, mailError: mail.error };
}

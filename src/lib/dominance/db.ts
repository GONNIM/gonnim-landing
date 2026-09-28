// sprint-dominance 전용 클라이언트 · 서버에서만 쓴다 (D22).
//
// ds_* 표는 gonnim-landing 이 아니라 별도 Supabase 프로젝트에 산다. 그 프로젝트에는
// RLS 정책이 하나도 없어서 service_role 만 닿는다 — 즉 이 클라이언트가 유일한 출입구다.
// 그래서 호출 전에 반드시 requireDominanceAdmin() 으로 세션을 확인한다 (guard.ts).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { letterPageUrl } from "@/lib/sangsik/site";

export function getDominanceClient(): SupabaseClient {
  const url = process.env.DS_SUPABASE_URL;
  const key = process.env.DS_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "지배상식 DB 환경변수 없음: DS_SUPABASE_URL / DS_SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 독자가 여는 글 페이지 주소(D38 · gonnim.dev/sangsik). 메일의 "웹에서 보기" 가 이것이다. */
export function dominanceLetterUrl(slug: string): string {
  return letterPageUrl(slug);
}

/** 공개 레터 JSON(Storage) 주소. 글 페이지가 이것을 읽는다. */
export function letterJsonUrl(slug: string): string {
  const url = process.env.DS_SUPABASE_URL;
  if (!url) throw new Error("DS_SUPABASE_URL 없음");
  return `${url}/storage/v1/object/public/ds-letters/${slug}.json`;
}

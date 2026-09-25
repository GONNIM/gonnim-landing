// 접근 경로 ① — gonnim-landing 세션 확인 + 관리자 허용 목록 확인.
//
// ds_* 표에는 RLS 정책이 하나도 없다(D22). DB 가 막아주지 않으므로 이 함수를 빼먹으면
// 인증이 통째로 사라진다. /dominance 아래 모든 서버 컴포넌트·서버 액션·라우트가 여기를 지난다.

import { redirect } from "next/navigation";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { getDominanceClient } from "./db";

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.RADAR_ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type DominanceAdmin = { id: string; email: string };

/** 로그인 + 허용 목록을 통과한 사용자를 돌려준다. 아니면 로그인 화면으로 보낸다. */
export async function requireDominanceAdmin(): Promise<DominanceAdmin> {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  if (!user || !email) redirect("/radar/login?next=/dominance");

  const allowed = allowedEmails();
  // 허용 목록이 비면 열지 않는다. 설정 누락이 전체 공개로 이어지면 안 된다.
  if (!allowed.has(email)) redirect("/radar/login?error=not-allowed");

  return { id: user.id, email };
}

/** 세션 확인과 DB 연결을 한 번에. 서버 컴포넌트에서 가장 많이 쓰는 형태다. */
export async function dominanceContext() {
  const admin = await requireDominanceAdmin();
  return { admin, db: getDominanceClient() };
}

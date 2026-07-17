// Server-side signup for Sprint Radar admin(s).
// Uses Supabase Admin API (`auth.admin.createUser`) so no email confirmation
// round-trip is required. Restricted to emails on RADAR_ADMIN_EMAILS allow-list.
//
// Docs: https://supabase.com/docs/reference/javascript/auth-admin-createuser

import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getAllowedEmails(): Set<string> {
  const raw = process.env.RADAR_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "email과 password가 필요합니다" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "비밀번호는 8자 이상이어야 합니다" },
      { status: 400 },
    );
  }

  const allowed = getAllowedEmails();
  if (allowed.size === 0) {
    return NextResponse.json(
      {
        error:
          "signup 비활성 · RADAR_ADMIN_EMAILS 환경 변수를 .env.local 에 등록하세요",
      },
      { status: 503 },
    );
  }
  if (!allowed.has(email)) {
    return NextResponse.json(
      { error: "허용된 관리자 이메일이 아닙니다" },
      { status: 403 },
    );
  }

  const supabase = getServiceRoleClient();

  // 1) Try createUser (immediate confirm)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!createErr && created?.user) {
    return NextResponse.json({
      created: true,
      userId: created.user.id,
      email: created.user.email,
    });
  }

  // 2) If user already exists, patch password via updateUserById
  const alreadyExists = createErr?.message?.toLowerCase().includes("already");
  if (!alreadyExists) {
    return NextResponse.json(
      { error: createErr?.message ?? "createUser 실패" },
      { status: 500 },
    );
  }

  const { data: page, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  const match = page.users.find((u) => u.email?.toLowerCase() === email);
  if (!match) {
    return NextResponse.json(
      { error: "기존 유저 조회 실패 · 페이지 확장 필요" },
      { status: 500 },
    );
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(match.id, {
    password,
    email_confirm: true,
  });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    created: false,
    updated: true,
    userId: match.id,
    email: match.email,
  });
}

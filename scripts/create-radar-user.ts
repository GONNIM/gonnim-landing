// Admin-side Supabase user creation (bypasses Dashboard UI + email rate limit).
// Docs: https://supabase.com/docs/reference/javascript/auth-admin-createuser
//
// Usage:
//   npx tsx scripts/create-radar-user.ts <email> <password>
//
// Example:
//   npx tsx scripts/create-radar-user.ts hi@gonnim.dev 'MyStrongPassword!'
//
// Notes:
//   - Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only)
//   - Sets email_confirm: true so the user can sign in immediately
//   - If the email already exists, Supabase returns an error — use
//     `updateUserById` instead (documented below)

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-radar-user.ts <email> <password>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  // Step 1 · Try to create the user.
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no email confirmation loop
  });

  if (!createErr && created?.user) {
    console.log(`✓ user created · id=${created.user.id.slice(0, 8)}... · email=${email}`);
    console.log(`  → /radar/login 에서 '비밀번호' 탭으로 로그인 가능`);
    return;
  }

  // Step 2 · If the user already exists, patch the password via updateUserById.
  if (createErr?.message?.toLowerCase().includes("already")) {
    // Find existing user by listing (Admin API doesn't expose findByEmail directly).
    const { data: page, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      console.error(`✗ listUsers failed: ${listErr.message}`);
      process.exit(1);
    }
    const match = page.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!match) {
      console.error(`✗ 이미 존재한다는데 목록(page 1)에서 못 찾음. 페이지 확장 필요.`);
      process.exit(1);
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(match.id, {
      password,
      email_confirm: true,
    });
    if (updateErr) {
      console.error(`✗ 비밀번호 갱신 실패: ${updateErr.message}`);
      process.exit(1);
    }
    console.log(`✓ 기존 사용자 비밀번호 갱신 · id=${match.id.slice(0, 8)}... · email=${email}`);
    console.log(`  → /radar/login 에서 '비밀번호' 탭으로 로그인 가능`);
    return;
  }

  console.error(`✗ createUser 실패: ${createErr?.message ?? "unknown"}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

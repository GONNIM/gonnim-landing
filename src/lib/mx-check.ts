/**
 * 이메일 도메인 MX 레코드 실 조회 (Node dns.resolveMx).
 * env `CONTACT_VERIFY_MX=true` 인 경우에만 실행 (기본 skip · 지연 방지).
 */

import { promises as dns } from "node:dns";

type MxResult = {
  ok: boolean;
  reason?: string;
};

export async function verifyEmailDomain(email: string): Promise<MxResult> {
  const flag = process.env.CONTACT_VERIFY_MX;
  if (flag !== "true") {
    return { ok: true, reason: "skip (CONTACT_VERIFY_MX 미활성)" };
  }
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { ok: false, reason: "이메일 도메인 파싱 실패." };
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return {
        ok: false,
        reason: "이메일 도메인 MX 레코드가 없습니다. 실 사용 이메일 도메인을 사용해주세요.",
      };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[mx-check] resolveMx 실패", domain, err);
    return {
      ok: false,
      reason: "이메일 도메인을 확인할 수 없습니다. 도메인을 다시 확인해주세요.",
    };
  }
}

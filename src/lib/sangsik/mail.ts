// 확인 메일 · 수신거부 안내 메일. 경보 메일과 같은 규칙으로 만든다:
// table 레이아웃 · 인라인 CSS · 텍스트 대체본 · 폭 600px (좁은 화면에서는 100%).

import { Resend } from "resend";
import { fromAddress } from "@/lib/dominance/broadcast";
import { SANGSIK_BASE, SENDER_LINE } from "./site";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function frame(input: { title: string; lines: string[]; button: { href: string; label: string }; note: string }): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
    <tr><td style="padding:28px 24px 8px 24px;">
      <div style="font-size:13px;color:#6b7280;">지배상식</div>
      <div style="margin-top:6px;font-size:20px;font-weight:700;color:#111827;line-height:1.4;">${escapeHtml(input.title)}</div>
    </td></tr>
    <tr><td style="padding:8px 24px 0 24px;">
      ${input.lines.map((l) => `<div style="margin:0 0 10px 0;font-size:15px;line-height:1.7;color:#1f2328;">${escapeHtml(l)}</div>`).join("")}
    </td></tr>
    <tr><td style="padding:12px 24px 20px 24px;">
      <a href="${escapeHtml(input.button.href)}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(input.button.label)}</a>
      <div style="margin-top:12px;font-size:12px;line-height:1.6;color:#6b7280;word-break:break-all;">버튼이 눌리지 않으면 이 주소를 여십시오: ${escapeHtml(input.button.href)}</div>
    </td></tr>
    <tr><td style="padding:16px 24px 24px 24px;border-top:1px solid #e5e7eb;">
      <div style="font-size:12px;line-height:1.7;color:#9ca3af;">${escapeHtml(input.note)}<br>${escapeHtml(SENDER_LINE)} · <a href="${SANGSIK_BASE}/unsubscribe" style="color:#6b7280;">수신거부</a></div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<{ id: string | null; error: string | null }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { id: null, error: "RESEND_API_KEY 없음" };
  try {
    const { data, error } = await new Resend(key).emails.send({ from: fromAddress(), to, subject, html, text });
    return { id: data?.id ?? null, error: error?.message ?? null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function confirmMail(link: string) {
  const title = "구독을 확인해 주십시오";
  const lines = [
    "지배상식 구독 신청을 받았습니다.",
    "아래 버튼을 눌러야 구독이 시작됩니다. 링크는 7일 동안 쓸 수 있습니다.",
    "직접 신청하지 않았다면 이 메일을 무시하십시오. 아무것도 시작되지 않습니다.",
  ];
  const note = "이 주소는 레터 발송에만 씁니다.";
  return {
    subject: "[지배상식] 구독 확인",
    html: frame({ title, lines, button: { href: link, label: "구독 확인" }, note }),
    text: `${title}\n\n${lines.join("\n")}\n\n구독 확인: ${link}\n\n${note}\n${SENDER_LINE}: ${SANGSIK_BASE}/unsubscribe\n`,
  };
}

export function unsubscribeLinkMail(link: string) {
  const title = "수신거부 링크";
  const lines = [
    "지배상식 수신거부를 요청하셨습니다.",
    "아래 버튼을 한 번 누르면 바로 수신거부됩니다. 다른 확인 단계는 없습니다.",
    "직접 요청하지 않았다면 이 메일을 무시하십시오. 구독은 그대로 유지됩니다.",
  ];
  const note = "수신거부 뒤에는 레터가 가지 않습니다.";
  return {
    subject: "[지배상식] 수신거부 링크",
    html: frame({ title, lines, button: { href: link, label: "수신거부" }, note }),
    text: `${title}\n\n${lines.join("\n")}\n\n수신거부: ${link}\n\n${note}\n${SENDER_LINE}\n`,
  };
}

export async function sendConfirmMail(to: string, link: string) {
  const m = confirmMail(link);
  return send(to, m.subject, m.html, m.text);
}

export async function sendUnsubscribeLinkMail(to: string, link: string) {
  const m = unsubscribeLinkMail(link);
  return send(to, m.subject, m.html, m.text);
}

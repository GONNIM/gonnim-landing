// [증거 모으기] 네 단계를 차례로 부른다. 단계마다 서버 액션이 따로여서 한 번에 300초를 넘지 않는다.
// 증거 표 화면의 버튼과, 이슈 고르기 화면의 [채택] 직후 자동 실행(D26 ①)이 함께 쓴다.

import { PHASES, PHASE_LABEL, type EvidenceRun } from "@/lib/dominance/collect-types";
import { collectPhaseAction } from "./[id]/evidence/actions";

export async function runCollect(
  id: string,
  onStep: (text: string) => void,
): Promise<{ run: EvidenceRun | null; error: string | null }> {
  let run: EvidenceRun | null = null;
  for (const [i, p] of PHASES.entries()) {
    onStep(`${i + 1}/${PHASES.length} ${PHASE_LABEL[p]} …`);
    const r = await collectPhaseAction(id, p);
    if (!r.ok) return { run, error: r.error };
    run = r.run;
  }
  return { run, error: null };
}

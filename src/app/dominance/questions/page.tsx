// ① 이슈 고르기 · 제안 → 검증 → 채택이 이 화면 안에서 끝난다 (D40 완성 기준 1).
//
// 순서는 사람이 정한다(D39). 정렬은 계열 · 영역 · V5 · 만든 날뿐이고, 검증 점수로 줄 세우지 않는다.

import { dominanceContext } from "@/lib/dominance/guard";
import { loadQuestions } from "@/lib/dominance/questions";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import { QuestionBoard } from "./QuestionBoard";

export const dynamic = "force-dynamic";
// [검증] 은 Europe PMC 5~10회와 LLM 1~3회를 부른다. 서버 액션의 시간 상한을 이 페이지에서 올린다.
export const maxDuration = 300;

export default async function QuestionsPage() {
  const { db } = await dominanceContext();
  const { questions, extColumns, error } = await loadQuestions(db);

  if (error) {
    return (
      <div className="space-y-6">
        <Heading />
        {isMissingSchema(error as never) ? (
          <SchemaNotice file="db/2026-09-28-dominance-questions.sql" hint="" />
        ) : (
          <p className="text-sm text-red-300">질문을 읽지 못했습니다: {error.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Heading />
      {!extColumns && (
        <p className="rounded-lg border border-dashed border-amber-500/40 p-3 text-xs text-muted-foreground">
          4단계 SQL(<code>db/2026-09-30-dominance-stage4.sql</code>)을 아직 실행하지 않았습니다. 영역 · 입력 방식 ·
          원래 입력 · V2 근거는 메모 칸 끝에 임시로 적습니다. SQL 을 실행하면 제자리로 옮겨집니다(런북 10번).
        </p>
      )}
      <QuestionBoard questions={questions} />
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">① 이슈 고르기</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        제안 → 검증 → 채택. 목록에 없으면 [이슈 만들기]로 만드십시오. 채택은 사람이 합니다. 순서도 사람이 정합니다.
      </p>
    </section>
  );
}
